/**
 * Self-contained page for the reference-tracing WebView. Mirrors the web
 * DocumentPagePreview: pdf.js renders PDFs, docx-preview renders Word files,
 * and an issue target paints a severity box (or margin band) and scrolls to it.
 *
 * Messages in (injected JS): PP.begin(kind), PP.chunk(base64), PP.end(), PP.trace(target)
 * Messages out (postMessage JSON): booted | ready | error
 */

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
const JSZIP = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
const DOCX_PREVIEW = "https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js";

const SCRIPT = String.raw`
(function () {
  var HIT = {
    critical: { bg: "rgba(244, 63, 94, 0.42)", edge: "#e11d48" },
    moderate: { bg: "rgba(249, 115, 22, 0.42)", edge: "#ea580c" },
    minor: { bg: "rgba(251, 191, 36, 0.55)", edge: "#d97706" }
  };
  var scroller = document.getElementById("scroller");
  var pagesEl = document.getElementById("pages");
  var docxHost = document.getElementById("docx-host");
  var statusEl = document.getElementById("status");
  var state = { kind: "", parts: [], pdf: null, specs: [], lineYs: {}, ready: false, pending: null, docxSections: [] };

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function fail(reason) {
    statusEl.style.display = "none";
    post({ type: "error", reason: String(reason || "render") });
  }
  function hitPaint(sev) {
    return HIT[String(sev || "").toLowerCase()] || HIT.minor;
  }
  function marginSide(text) {
    var v = String(text || "").toLowerCase();
    if (v.indexOf("right margin") >= 0) return "right";
    if (v.indexOf("left margin") >= 0) return "left";
    if (v.indexOf("top margin") >= 0) return "top";
    if (v.indexOf("bottom margin") >= 0) return "bottom";
    return "";
  }
  function isMarginTarget(t) {
    return String(t.section || "").toLowerCase() === "margins";
  }
  function marginRegion(side) {
    if (side === "bottom") return { start: 0.93, size: 0.07 };
    if (side === "top") return { start: 0, size: 0.07 };
    return { start: 0, size: 1 };
  }
  function centeredScrollTop(markTop, markHeight, viewHeight, maxScroll) {
    var view = Math.max(1, viewHeight);
    var h = Math.max(0, markHeight || 0);
    var raw = h >= view ? markTop - 16 : markTop - (view - h) / 2;
    return Math.max(0, Math.min(maxScroll, raw));
  }
  function scrollMarkIntoView(markTop, markHeight) {
    var maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTo({
      top: centeredScrollTop(markTop, markHeight, scroller.clientHeight, maxScroll),
      behavior: "smooth"
    });
  }
  function elementTopIn(el, delta) {
    var c = scroller.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return r.top - c.top + scroller.scrollTop + (delta || 0);
  }
  function scrollToPageRegion(pageEl, side) {
    var region = marginRegion(side);
    var h = pageEl.getBoundingClientRect().height;
    scrollMarkIntoView(elementTopIn(pageEl) + region.start * h, region.size * h);
  }
  function clearMarks() {
    document.querySelectorAll(".pp-issue-margin, .pp-issue-box").forEach(function (el) { el.remove(); });
  }
  function paintMargin(pageEl, side, severity) {
    var paint = hitPaint(severity);
    var band = document.createElement("div");
    band.className = "pp-issue-margin";
    band.style.setProperty("--pp-hit-bg", paint.bg);
    band.style.setProperty("--pp-hit-edge", paint.edge);
    var thick = "7%";
    if (side === "right") { band.style.top = "0"; band.style.right = "0"; band.style.bottom = "0"; band.style.width = thick; }
    else if (side === "left") { band.style.top = "0"; band.style.left = "0"; band.style.bottom = "0"; band.style.width = thick; }
    else if (side === "top") { band.style.top = "0"; band.style.left = "0"; band.style.right = "0"; band.style.height = thick; }
    else if (side === "bottom") { band.style.bottom = "0"; band.style.left = "0"; band.style.right = "0"; band.style.height = thick; }
    else { band.style.inset = "0"; band.style.background = "transparent"; band.style.boxShadow = "inset 0 0 0 4px " + paint.edge; }
    if (getComputedStyle(pageEl).position === "static") pageEl.style.position = "relative";
    pageEl.appendChild(band);
  }
  function paintBox(parent, box, severity) {
    var paint = hitPaint(severity);
    var el = document.createElement("div");
    el.className = "pp-issue-box";
    el.style.setProperty("--pp-hit-bg", paint.bg);
    el.style.setProperty("--pp-hit-edge", paint.edge);
    el.style.top = box.top;
    el.style.left = box.left;
    el.style.width = box.width;
    el.style.height = box.height;
    parent.appendChild(el);
  }
  function clusterLineYs(ys, tol) {
    var sorted = ys.filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; });
    var lines = [];
    sorted.forEach(function (y) {
      var last = lines[lines.length - 1];
      if (last != null && Math.abs(y - last) <= tol) return;
      lines.push(y);
    });
    return lines;
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  function joinParts(parts) {
    var total = parts.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }
  function boxWidth() {
    return Math.max(200, scroller.clientWidth - 16);
  }

  /* ---------------- PDF ---------------- */
  var observer = null;
  function renderPdfPage(spec) {
    if (spec.canvas || spec.rendering) return;
    spec.rendering = true;
    state.pdf.getPage(spec.pageNumber).then(function (page) {
      var viewport = page.getViewport({ scale: spec.scale });
      var canvas = document.createElement("canvas");
      var outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      spec.el.insertBefore(canvas, spec.el.firstChild);
      spec.canvas = canvas;
      var transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      return page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: viewport, transform: transform }).promise;
    }).catch(function () {}).then(function () { spec.rendering = false; });
  }
  function releasePdfPage(spec) {
    if (!spec.canvas || spec.rendering) return;
    spec.canvas.width = 0;
    spec.canvas.height = 0;
    spec.canvas.remove();
    spec.canvas = null;
  }
  function openPdf(data) {
    var lib = window.pdfjsLib;
    if (!lib) return fail("pdfjs");
    return fetch("${PDFJS}/pdf.worker.min.js")
      .then(function (res) { return res.text(); })
      .then(function (src) {
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      })
      .catch(function () {
        lib.GlobalWorkerOptions.workerSrc = "${PDFJS}/pdf.worker.min.js";
      })
      .then(function () { return lib.getDocument({ data: data }).promise; })
      .then(function (pdf) {
        state.pdf = pdf;
        var width = boxWidth();
        var chain = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n += 1) {
          (function (pageNumber) {
            chain = chain.then(function () { return pdf.getPage(pageNumber); }).then(function (page) {
              var base = page.getViewport({ scale: 1 });
              var scale = Math.max(0.2, width / base.width);
              var el = document.createElement("div");
              el.className = "pp-page";
              el.dataset.page = String(pageNumber);
              el.style.width = Math.floor(base.width * scale) + "px";
              el.style.height = Math.floor(base.height * scale) + "px";
              pagesEl.appendChild(el);
              state.specs.push({ pageNumber: pageNumber, scale: scale, el: el, canvas: null, rendering: false });
            });
          })(n);
        }
        return chain;
      })
      .then(function () {
        observer = new IntersectionObserver(function (items) {
          items.forEach(function (item) {
            var spec = state.specs[Number(item.target.dataset.page) - 1];
            if (!spec) return;
            if (item.isIntersecting) renderPdfPage(spec);
            else releasePdfPage(spec);
          });
        }, { root: scroller, rootMargin: "1200px 0px" });
        state.specs.forEach(function (spec) { observer.observe(spec.el); });
        statusEl.style.display = "none";
        state.ready = true;
        post({ type: "ready", pages: state.specs.length });
        if (state.pending) trace(state.pending);
      })
      .catch(function (err) { fail(err && err.message); });
  }
  function pdfLineYs(spec) {
    if (state.lineYs[spec.pageNumber]) return Promise.resolve(state.lineYs[spec.pageNumber]);
    return state.pdf.getPage(spec.pageNumber).then(function (page) {
      var viewport = page.getViewport({ scale: spec.scale });
      return page.getTextContent().then(function (text) {
        var ys = [];
        (text.items || []).forEach(function (item) {
          if (!item || !item.str || !String(item.str).trim()) return;
          var pt = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          var fontHeight = Math.hypot(item.transform[2], item.transform[3]) * viewport.scale;
          ys.push(pt[1] - fontHeight);
        });
        var lines = clusterLineYs(ys, Math.max(2, viewport.height * 0.004));
        state.lineYs[spec.pageNumber] = lines;
        return lines;
      });
    });
  }
  function tracePdf(t) {
    var pageNumber = Math.min(state.specs.length, Math.max(1, Number(t.page) || 1));
    var spec = state.specs[pageNumber - 1];
    if (!spec) return;
    var pageEl = spec.el;
    var pageHeight = pageEl.clientHeight;
    clearMarks();
    if (isMarginTarget(t)) {
      var side = marginSide(t.finding);
      paintMargin(pageEl, side, t.severity);
      scrollToPageRegion(pageEl, side);
      return;
    }
    var bbox = t.bbox;
    if (bbox && isFinite(Number(bbox.y))) {
      var h = Math.max(0.012, Number(bbox.h) || 0.025);
      paintBox(pageEl, {
        top: Number(bbox.y) * 100 + "%",
        left: Number(bbox.x) * 100 + "%",
        width: Math.max(0.02, Number(bbox.w) || 0.84) * 100 + "%",
        height: h * 100 + "%"
      }, t.severity);
      scrollMarkIntoView(elementTopIn(pageEl, Number(bbox.y) * pageHeight), h * pageHeight);
      return;
    }
    pdfLineYs(spec).then(function (ys) {
      var line = Number(t.line) || 0;
      var y = line && ys[line - 1] != null ? ys[line - 1] : 0;
      var next = ys[line];
      var markHeight = next != null && next > y ? Math.max(14, next - y) : Math.max(18, pageHeight * 0.03);
      clearMarks();
      paintBox(pageEl, { top: y + "px", left: "8%", width: "84%", height: markHeight + "px" }, t.severity);
      scrollMarkIntoView(elementTopIn(pageEl, y), markHeight);
    });
  }

  /* ---------------- DOCX ---------------- */
  function docxBody(section) {
    return section.querySelector(":scope > article") || section;
  }
  function normalizeNeedle(v) {
    return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function normalizedIndex(raw) {
    var src = String(raw || "");
    var text = "";
    var map = [];
    var prevSpace = true;
    for (var i = 0; i < src.length; i += 1) {
      var ch = src[i];
      if (/\s/.test(ch)) {
        if (prevSpace) continue;
        text += " ";
        map.push(i);
        prevSpace = true;
      } else {
        text += ch.toLowerCase();
        map.push(i);
        prevSpace = false;
      }
    }
    return { text: text, map: map };
  }
  function excerptNeedles(excerpt) {
    var full = normalizeNeedle(excerpt);
    if (full.length < 8) return [];
    var needles = [full];
    if (full.length > 48) {
      needles.push(full.slice(0, 40).trim());
      needles.push(full.slice(-40).trim());
    }
    return needles.filter(function (v, i, list) { return v.length >= 8 && list.indexOf(v) === i; });
  }
  function pagesByDistance(page, total) {
    var count = Math.max(0, total);
    var start = Math.min(count, Math.max(1, page || 1));
    var order = [];
    for (var step = 0; order.length < count; step += 1) {
      var after = start + step;
      var before = start - step;
      if (after <= count && order.indexOf(after) < 0) order.push(after);
      if (step && before >= 1 && order.indexOf(before) < 0) order.push(before);
      if (step > count) break;
    }
    return order;
  }
  function mergeLineRects(rects) {
    var lines = [];
    rects.filter(function (r) { return r && r.width > 1 && r.height > 1; })
      .sort(function (a, b) { return a.top - b.top || a.left - b.left; })
      .forEach(function (r) {
        var last = lines[lines.length - 1];
        if (last && Math.abs(last.top - r.top) <= 3) {
          var right = Math.max(last.left + last.width, r.left + r.width);
          last.left = Math.min(last.left, r.left);
          last.width = right - last.left;
          last.height = Math.max(last.height, r.height);
          return;
        }
        lines.push({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    return lines;
  }
  function contentBox(rect) {
    var frame = scroller.getBoundingClientRect();
    return {
      top: rect.top - frame.top + scroller.scrollTop,
      left: rect.left - frame.left + scroller.scrollLeft,
      width: rect.width,
      height: rect.height
    };
  }
  function readDocxBlocks(section) {
    return Array.prototype.map.call(docxBody(section).querySelectorAll("p"), function (el) {
      var style = getComputedStyle(el);
      var fontSize = parseFloat(style.fontSize) || 16;
      var lineHeight = style.lineHeight === "normal" ? fontSize * 1.15 : parseFloat(style.lineHeight) || fontSize * 1.15;
      var mt = parseFloat(style.marginTop) || 0;
      var mb = parseFloat(style.marginBottom) || 0;
      return {
        el: el,
        lineHeight: lineHeight,
        height: el.offsetHeight || lineHeight,
        leadingLines: Math.max(0, Math.round(mt / Math.max(lineHeight, 1))),
        trailingLines: Math.max(0, Math.round(mb / Math.max(lineHeight, 1)))
      };
    });
  }
  function visualLineTarget(blocks, lineNumber) {
    if (!blocks.length) return { index: -1, delta: 0 };
    var remaining = Math.max(1, Math.round(Number(lineNumber) || 1));
    for (var i = 0; i < blocks.length; i += 1) {
      var b = blocks[i];
      var lh = Math.max(1, b.lineHeight);
      var leading = b.leadingLines;
      if (remaining <= leading) return { index: i, delta: -(leading - remaining + 1) * lh };
      remaining -= leading;
      var height = b.height || lh;
      var lines = Math.max(1, Math.round(height / lh));
      if (remaining <= lines) return { index: i, delta: (remaining - 1) * lh };
      remaining -= lines;
      var trailing = b.trailingLines;
      if (remaining <= trailing) return { index: i, delta: height + (remaining - 1) * lh };
      remaining -= trailing;
    }
    return { index: blocks.length - 1, delta: 0 };
  }
  function lineCountBox(section, line) {
    var blocks = readDocxBlocks(section);
    if (!blocks.length) return null;
    var hit = visualLineTarget(blocks, line || 1);
    var block = blocks[hit.index];
    if (!block) return null;
    var rect = block.el.getBoundingClientRect();
    var scale = block.el.offsetHeight ? rect.height / block.el.offsetHeight : 1;
    var base = contentBox(rect);
    var top = base.top + hit.delta * scale;
    var height = Math.max(12, block.lineHeight * scale);
    return { rects: [{ top: top, left: base.left, width: base.width, height: height }], top: top, height: height };
  }
  function textRangesIn(section, needle) {
    var ranges = [];
    docxBody(section).querySelectorAll("p").forEach(function (paragraph) {
      var walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      var nodes = [];
      var raw = "";
      while (walker.nextNode()) {
        var node = walker.currentNode;
        nodes.push({ node: node, start: raw.length });
        raw += node.nodeValue || "";
      }
      if (!raw.trim()) return;
      var idx = normalizedIndex(raw);
      var index = idx.text.indexOf(needle);
      if (index < 0) return;
      var startRaw = idx.map[index];
      var endRaw = idx.map[index + needle.length - 1] + 1;
      function locate(rawIndex, isEnd) {
        for (var i = nodes.length - 1; i >= 0; i -= 1) {
          var within = isEnd ? rawIndex > nodes[i].start : rawIndex >= nodes[i].start;
          if (within) return [nodes[i].node, Math.min(nodes[i].node.nodeValue.length, rawIndex - nodes[i].start)];
        }
        return [nodes[0].node, 0];
      }
      var range = document.createRange();
      var s = locate(startRaw, false);
      var e = locate(endRaw, true);
      range.setStart(s[0], s[1]);
      range.setEnd(e[0], e[1]);
      ranges.push(range);
    });
    return ranges;
  }
  function locateDocxBox(sections, pageNumber, line, excerpt) {
    var reported = sections[pageNumber - 1];
    var estimate = reported ? lineCountBox(reported, line) : null;
    var needles = excerptNeedles(excerpt);
    for (var n = 0; n < needles.length; n += 1) {
      var order = pagesByDistance(pageNumber, sections.length);
      for (var p = 0; p < order.length; p += 1) {
        var ranges = textRangesIn(sections[order[p] - 1], needles[n]);
        if (!ranges.length) continue;
        var candidates = ranges.map(function (range) {
          return mergeLineRects(Array.prototype.map.call(range.getClientRects(), contentBox));
        }).filter(function (rects) { return rects.length; });
        if (!candidates.length) continue;
        var best = estimate
          ? candidates.reduce(function (a, b) {
              return Math.abs(a[0].top - estimate.top) <= Math.abs(b[0].top - estimate.top) ? a : b;
            })
          : candidates[0];
        var last = best[best.length - 1];
        return { rects: best, top: best[0].top, height: last.top + last.height - best[0].top };
      }
    }
    return estimate;
  }
  function fitDocx() {
    var wrapper = docxHost.querySelector(".docx-wrapper");
    var page = docxHost.querySelector(".docx-wrapper > section");
    if (!wrapper || !page) return;
    wrapper.style.transform = "";
    wrapper.style.width = "";
    var pageWidth = page.offsetWidth || page.scrollWidth;
    var scale = boxWidth() / Math.max(1, pageWidth);
    // transform (not CSS zoom) keeps getClientRects in on-screen pixels on every engine.
    wrapper.style.transformOrigin = "0 0";
    wrapper.style.width = docxHost.clientWidth / scale + "px";
    wrapper.style.transform = "scale(" + scale + ")";
    docxHost.style.height = Math.ceil(wrapper.offsetHeight * scale) + "px";
  }
  function openDocx(data) {
    if (!window.docx || !window.docx.renderAsync) return fail("docx-preview");
    var blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    return window.docx.renderAsync(blob, docxHost, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true
    }).then(function () {
      fitDocx();
      state.docxSections = Array.prototype.slice.call(docxHost.querySelectorAll(".docx-wrapper > section"));
      state.docxSections.forEach(function (s, i) { s.dataset.page = String(i + 1); });
      if (!state.docxSections.length) return fail("empty");
      statusEl.style.display = "none";
      state.ready = true;
      post({ type: "ready", pages: state.docxSections.length });
      if (state.pending) trace(state.pending);
    }).catch(function (err) { fail(err && err.message); });
  }
  function traceDocx(t) {
    var sections = state.docxSections;
    if (!sections.length) return;
    clearMarks();
    var pageNumber = Math.min(sections.length, Math.max(1, Number(t.page) || 1));
    if (isMarginTarget(t)) {
      var pageEl = sections[pageNumber - 1];
      var side = marginSide(t.finding);
      paintMargin(pageEl, side, t.severity);
      scrollToPageRegion(pageEl, side);
      return;
    }
    var box = locateDocxBox(sections, pageNumber, t.line, t.excerpt);
    if (!box) return;
    box.rects.forEach(function (r) {
      paintBox(docxLayer, {
        top: r.top - 2 + "px",
        left: r.left - 3 + "px",
        width: r.width + 6 + "px",
        height: r.height + 4 + "px"
      }, t.severity);
    });
    scrollMarkIntoView(box.top, box.height);
  }
  var docxLayer = document.getElementById("docx-layer");

  /* ---------------- API ---------------- */
  function trace(t) {
    if (!t || (t.page == null && t.line == null)) return;
    if (!state.ready) { state.pending = t; return; }
    state.pending = null;
    if (state.kind === "pdf") tracePdf(t);
    else if (state.kind === "docx") traceDocx(t);
  }
  window.PP = {
    begin: function (kind) { state.kind = kind; state.parts = []; },
    chunk: function (b64) {
      try { state.parts.push(b64ToBytes(b64)); } catch (e) { fail("decode"); }
    },
    end: function () {
      var data = joinParts(state.parts);
      state.parts = [];
      if (state.kind === "pdf") openPdf(data);
      else if (state.kind === "docx") openDocx(data);
      else fail("kind");
    },
    trace: trace
  };
  post({ type: "booted" });
})();
`;

export const TRACE_VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #e8ecf1; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  #scroller { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
  #content { position: relative; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 0 24px; }
  .pp-page { position: relative; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); }
  .pp-page canvas { display: block; }
  #docx-host { width: 100%; overflow: hidden; }
  #docx-host .docx-wrapper { background: transparent !important; padding: 8px 0 !important; }
  #docx-host .docx-wrapper > section { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); margin: 0 auto 1.25rem !important; }
  #docx-layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
  .pp-issue-box { position: absolute; z-index: 5; pointer-events: none; border-radius: 3px; background: var(--pp-hit-bg); box-shadow: inset 0 0 0 2px var(--pp-hit-edge); mix-blend-mode: multiply; }
  .pp-issue-margin { position: absolute; z-index: 4; pointer-events: none; background: var(--pp-hit-bg); box-shadow: inset 0 0 0 2px var(--pp-hit-edge); }
  #status { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #64748b; font-size: 12px; }
  .spin { width: 22px; height: 22px; border-radius: 50%; border: 3px solid rgba(22, 191, 168, 0.25); border-top-color: #16bfa8; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
<script src="${JSZIP}"></script>
<script src="${DOCX_PREVIEW}"></script>
<script src="${PDFJS}/pdf.min.js"></script>
</head>
<body>
  <div id="scroller">
    <div id="content">
      <div id="pages"></div>
      <div id="docx-host"></div>
      <div id="docx-layer"></div>
    </div>
  </div>
  <div id="status"><div class="spin"></div><div>Opening original document…</div></div>
  <script>${SCRIPT}</script>
</body>
</html>`;
