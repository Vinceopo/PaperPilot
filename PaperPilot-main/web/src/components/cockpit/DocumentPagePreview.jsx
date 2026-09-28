/**
 * Shows the original uploaded PDF/DOCX or Cloudinary URL.
 * Extracted text is a fallback when the source file is not available.
 *
 * `paged` keeps the window exactly one page tall, starting on page 1,
 * and scrolls through every later page. A trace target moves that window
 * to the matching page and line.
 */

import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Spinner from "../Spinner.jsx";
import {
  centeredScrollTop,
  clusterLineYs,
  excerptNeedles,
  fitPageScale,
  hitPaint,
  onePageHeight,
  marginRegion,
  marginSide,
  mergeLineRects,
  normalizedIndex,
  pagesByDistance,
  visualLineTarget,
} from "../../lib/documentPreviewLocate.js";

function fileKind(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  return "";
}

function urlKind(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes(".pdf") || value.includes("/pdf/")) return "pdf";
  if (value.includes(".docx") || value.includes("wordprocessingml")) return "docx";
  return value ? "pdf" : "";
}

function pagesFromPreview(preview) {
  if (!preview) return [];
  if (Array.isArray(preview.pages) && preview.pages.length) {
    return preview.pages
      .map((page, index) => ({
        pageIndex: page.page_index ?? index,
        text: String(page.text || "").trim(),
      }))
      .filter((page) => page.text);
  }
  const fallback = String(preview.text_preview || preview.extracted_text || "").trim();
  return fallback ? [{ pageIndex: 0, text: fallback }] : [];
}

function pageNumberFromIndex(pageIndex, fallbackIndex) {
  const raw = pageIndex ?? fallbackIndex;
  return Math.max(1, Number(raw) + 1);
}

function targetFrom(scrollTarget, highlight) {
  return {
    page: scrollTarget?.page ?? highlight?.page ?? null,
    line: scrollTarget?.line ?? highlight?.line ?? null,
    bbox: scrollTarget?.bbox || highlight?.bbox || null,
    excerpt: String(scrollTarget?.excerpt || highlight?.excerpt || "").trim(),
    severity: scrollTarget?.severity || highlight?.severity || "minor",
    finding: String(scrollTarget?.finding || highlight?.finding || ""),
    section: String(scrollTarget?.section || highlight?.section || ""),
    token: scrollTarget?.token ?? highlight?.token ?? 0,
  };
}

function clearIssueMarks(root) {
  if (!root) return;
  root.querySelectorAll(".pp-issue-hit").forEach((el) => {
    el.classList.remove("pp-issue-hit");
    el.style.removeProperty("--pp-hit-bg");
    el.style.removeProperty("--pp-hit-edge");
  });
  root.querySelectorAll(".pp-issue-margin, .pp-issue-box").forEach((el) => el.remove());
}

function paintMarginHit(pageEl, side, severity) {
  if (!pageEl) return;
  const paint = hitPaint(severity);
  const band = document.createElement("div");
  band.className = "pp-issue-margin";
  band.style.setProperty("--pp-hit-bg", paint.bg);
  band.style.setProperty("--pp-hit-edge", paint.edge);
  const thick = "7%";
  if (side === "right") {
    band.style.top = "0";
    band.style.right = "0";
    band.style.bottom = "0";
    band.style.width = thick;
  } else if (side === "left") {
    band.style.top = "0";
    band.style.left = "0";
    band.style.bottom = "0";
    band.style.width = thick;
  } else if (side === "top") {
    band.style.top = "0";
    band.style.left = "0";
    band.style.right = "0";
    band.style.height = thick;
  } else if (side === "bottom") {
    band.style.bottom = "0";
    band.style.left = "0";
    band.style.right = "0";
    band.style.height = thick;
  } else {
    band.style.inset = "0";
    band.style.background = "transparent";
    band.style.boxShadow = `inset 0 0 0 4px ${paint.edge}`;
  }
  const positioned = getComputedStyle(pageEl).position;
  if (positioned === "static") pageEl.style.position = "relative";
  pageEl.appendChild(band);
}

function IssueMark({ mark }) {
  if (!mark) return null;
  const paint = hitPaint(mark.severity);
  if (mark.kind === "margin") {
    const style = {
      background: paint.bg,
      boxShadow: `inset 0 0 0 2px ${paint.edge}`,
    };
    if (mark.side === "right") Object.assign(style, { top: 0, right: 0, bottom: 0, width: "7%" });
    else if (mark.side === "left") Object.assign(style, { top: 0, left: 0, bottom: 0, width: "7%" });
    else if (mark.side === "top") Object.assign(style, { top: 0, left: 0, right: 0, height: "7%" });
    else if (mark.side === "bottom") Object.assign(style, { bottom: 0, left: 0, right: 0, height: "7%" });
    else Object.assign(style, { inset: 0, background: "transparent", boxShadow: `inset 0 0 0 4px ${paint.edge}` });
    return <div className="pp-issue-margin" style={style} />;
  }
  return (
    <div
      className="pointer-events-none absolute z-[4] rounded-sm"
      style={{
        top: mark.top,
        left: mark.left,
        width: mark.width,
        height: mark.height,
        background: paint.bg,
        boxShadow: `inset 0 0 0 2px ${paint.edge}`,
      }}
    />
  );
}

function scrollMarkIntoView(container, markTop, markHeight) {
  if (!container) return;
  const frame = container.getBoundingClientRect();
  if (frame.top < 0 || frame.top > window.innerHeight * 0.5) {
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTo({
    top: centeredScrollTop({
      markTop,
      markHeight,
      viewHeight: container.clientHeight,
      maxScroll,
    }),
    behavior: "smooth",
  });
}

function isMarginTarget(target) {
  return String(target.section || "").toLowerCase() === "margins";
}

function scrollToPageRegion(container, pageEl, side) {
  const region = marginRegion(side);
  const pageTop = elementTopIn(container, pageEl);
  const pageHeight = pageEl.getBoundingClientRect().height;
  scrollMarkIntoView(container, pageTop + region.start * pageHeight, region.size * pageHeight);
}

function elementTopIn(container, element, delta = 0) {
  const cRect = container.getBoundingClientRect();
  const tRect = element.getBoundingClientRect();
  return tRect.top - cRect.top + container.scrollTop + delta;
}

function PdfFrame({ src, page, frameHeight = 0 }) {
  const base = String(src || "").split("#")[0];
  const iframeSrc =
    page != null
      ? `${base}#page=${page}`
      : `${base}#toolbar=0&navpanes=0&scrollbar=1`;
  const height = frameHeight > 40 ? frameHeight : undefined;

  return (
    <div className="w-full" style={height ? { height } : undefined}>
      <iframe
        title="Document PDF preview"
        src={iframeSrc}
        className={
          height
            ? "h-full w-full border-0 bg-white"
            : "h-[min(34rem,68vh)] min-h-[22rem] w-full border-0 bg-white"
        }
      />
    </div>
  );
}

function PdfFilePreview({ file, scrollTarget, highlight, paged }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const blob =
      file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
        <Spinner className="h-4 w-4 text-[#16bfa8]" />
        Opening original PDF…
      </div>
    );
  }

  if (paged) {
    return (
      <PdfPagedPreview
        source={url}
        scrollTarget={scrollTarget}
        highlight={highlight}
      />
    );
  }

  return <PdfFrame src={url} page={scrollTarget?.page ?? highlight?.page} />;
}

function PdfPagedPreview({ source, scrollTarget, highlight }) {
  const scrollerRef = useRef(null);
  const pdfRef = useRef(null);
  const lineYsRef = useRef(new Map());
  const [pages, setPages] = useState([]);
  const [frameHeight, setFrameHeight] = useState(0);
  const [linesReady, setLinesReady] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [mark, setMark] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    async function open() {
      setBusy(true);
      setError("");
      setPages([]);
      setFrameHeight(0);
      setLinesReady(0);
      lineYsRef.current = new Map();
      pdfRef.current = null;
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const width = await waitForWidth(scrollerRef.current);
        if (cancelled) return;
        loadingTask = pdfjs.getDocument(
          typeof source === "string" ? { url: source } : { data: source }
        );
        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        const specs = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(
            0.2,
            fitPageScale({
              pageWidth: base.width,
              pageHeight: base.height,
              boxWidth: width - 8,
              maxHeight: onePageHeight(window.innerHeight),
              allowUpscale: true,
            })
          );
          const viewport = page.getViewport({ scale });
          const text = await page.getTextContent();
          const ys = [];
          for (const item of text.items || []) {
            if (!item?.str || !String(item.str).trim()) continue;
            const [, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            const fontHeight = Math.hypot(item.transform[2], item.transform[3]) * viewport.scale;
            ys.push(vy - fontHeight);
          }
          lineYsRef.current.set(
            pageNumber,
            clusterLineYs(ys, Math.max(2, viewport.height * 0.004))
          );
          specs.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            scale,
          });
        }
        if (!specs.length || cancelled) return;
        setPages(specs);
        setFrameHeight(Math.round(specs[0].height));
        setLinesReady(1);
        setBusy(false);
      } catch {
        if (!cancelled) {
          setError("preview");
          setBusy(false);
        }
      }
    }

    void open();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [source]);

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !pages.length) return undefined;
    let cancelled = false;

    async function paint() {
      for (const spec of pages) {
        if (cancelled) return;
        const page = await pdf.getPage(spec.pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: spec.scale });
        const canvas = scrollerRef.current?.querySelector(
          `canvas[data-canvas="${spec.pageNumber}"]`
        );
        if (!canvas) continue;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const task = page.render({ canvasContext: context, viewport, transform });
        try {
          await task.promise;
        } catch {
          if (cancelled) return;
        }
      }
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !pages.length) return;
    const target = targetFrom(scrollTarget, highlight);
    if (target.page == null && target.line == null) return;
    const pageNumber = Math.min(pages.length, Math.max(1, Number(target.page) || 1));
    const pageEl = scroller.querySelector(`[data-page="${pageNumber}"]`);
    if (!pageEl) return;
    const ys = lineYsRef.current.get(pageNumber) || [];
    const bbox = target.bbox;
    let y = 0;
    if (bbox && Number.isFinite(Number(bbox.y))) {
      y = Number(bbox.y) * pageEl.clientHeight;
    } else if (target.line && ys[Number(target.line) - 1] != null) {
      y = ys[Number(target.line) - 1];
    }
    const pageHeight = pageEl.clientHeight;
    if (isMarginTarget(target)) {
      const side = marginSide(target.finding);
      setMark({
        page: pageNumber,
        kind: "margin",
        side,
        severity: target.severity,
      });
      scrollToPageRegion(scroller, pageEl, side);
      return;
    }
    let markHeight;
    if (bbox && Number.isFinite(Number(bbox.y))) {
      markHeight = Math.max(0.012, Number(bbox.h) || 0.025) * pageHeight;
      setMark({
        page: pageNumber,
        kind: "box",
        severity: target.severity,
        top: `${Number(bbox.y) * 100}%`,
        left: `${Number(bbox.x) * 100}%`,
        width: `${Math.max(0.02, Number(bbox.w) || 0.84) * 100}%`,
        height: `${Math.max(0.012, Number(bbox.h) || 0.025) * 100}%`,
      });
    } else {
      const next = ys[Number(target.line)];
      markHeight = next != null && next > y ? Math.max(14, next - y) : Math.max(18, pageHeight * 0.03);
      setMark({
        page: pageNumber,
        kind: "box",
        severity: target.severity,
        top: `${y}px`,
        left: "8%",
        width: "84%",
        height: `${markHeight}px`,
      });
    }
    scrollMarkIntoView(scroller, elementTopIn(scroller, pageEl, y), markHeight);
  }, [scrollTarget, highlight, pages, linesReady, frameHeight]);

  if (error) {
    return (
      <PdfFrame
        src={typeof source === "string" ? source : ""}
        page={scrollTarget?.page ?? highlight?.page}
        frameHeight={frameHeight || Math.round((scrollerRef.current?.clientWidth || 640) * (11 / 8.5))}
      />
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="pp-scroll relative mx-auto w-full overflow-x-hidden overflow-y-auto overscroll-contain"
      style={{ height: frameHeight || "70vh" }}
    >
      {busy && !pages.length ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Spinner className="h-4 w-4 text-[#16bfa8]" />
          Opening original PDF…
        </div>
      ) : null}
      <div className="mx-auto flex w-full flex-col items-center gap-5">
        {pages.map((page) => (
          <div
            key={page.pageNumber}
            data-page={page.pageNumber}
            className="relative bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
            style={{ width: page.width, height: page.height }}
          >
            <canvas data-canvas={page.pageNumber} className="block" />
            {mark?.page === page.pageNumber ? <IssueMark mark={mark} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function waitForWidth(element) {
  return new Promise((resolve) => {
    let frames = 0;
    const check = () => {
      frames += 1;
      const width = element?.clientWidth || 0;
      if (width > 40 || frames > 30) resolve(width > 40 ? width : 640);
      else requestAnimationFrame(check);
    };
    check();
  });
}

function docxBody(section) {
  return section.querySelector(":scope > article") || section;
}

function readDocxBlocks(section) {
  return [...docxBody(section).querySelectorAll("p")].map((el) => {
    const style = getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize) || 16;
    const lineHeight =
      style.lineHeight === "normal" ? fontSize * 1.15 : parseFloat(style.lineHeight) || fontSize * 1.15;
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    return {
      el,
      lineHeight,
      height: el.offsetHeight || lineHeight,
      leadingLines: Math.max(0, Math.round(marginTop / Math.max(lineHeight, 1))),
      trailingLines: Math.max(0, Math.round(marginBottom / Math.max(lineHeight, 1))),
    };
  });
}

function contentBox(scroller, rect) {
  const frame = scroller.getBoundingClientRect();
  return {
    top: rect.top - frame.top + scroller.scrollTop,
    left: rect.left - frame.left + scroller.scrollLeft,
    width: rect.width,
    height: rect.height,
  };
}

function textRangesIn(section, needle) {
  const ranges = [];
  docxBody(section)
    .querySelectorAll("p")
    .forEach((paragraph) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let raw = "";
      while (walker.nextNode()) {
        const node = walker.currentNode;
        nodes.push({ node, start: raw.length });
        raw += node.nodeValue || "";
      }
      if (!raw.trim()) return;
      const { text, map } = normalizedIndex(raw);
      const index = text.indexOf(needle);
      if (index < 0) return;
      const startRaw = map[index];
      const endRaw = map[index + needle.length - 1] + 1;
      const locate = (rawIndex, isEnd) => {
        for (let i = nodes.length - 1; i >= 0; i -= 1) {
          const { node, start } = nodes[i];
          const within = isEnd ? rawIndex > start : rawIndex >= start;
          if (within) return [node, Math.min(node.nodeValue.length, rawIndex - start)];
        }
        return [nodes[0].node, 0];
      };
      const range = document.createRange();
      const [startNode, startOffset] = locate(startRaw, false);
      const [endNode, endOffset] = locate(endRaw, true);
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      ranges.push(range);
    });
  return ranges;
}

function lineCountBox(section, line, scroller) {
  const blocks = readDocxBlocks(section);
  if (!blocks.length) return null;
  const hit = visualLineTarget(blocks, line || 1);
  const block = blocks[hit.index];
  if (!block) return null;
  const rect = block.el.getBoundingClientRect();
  const scale = block.el.offsetHeight ? rect.height / block.el.offsetHeight : 1;
  const base = contentBox(scroller, rect);
  const top = base.top + hit.delta * scale;
  const height = Math.max(12, block.lineHeight * scale);
  return { rects: [{ top, left: base.left, width: base.width, height }], top, height };
}

/**
 * Where an issue really sits in the rendered Word pages. The scanner's
 * excerpt is matched first (nearest page to the reported one wins); line
 * counting is only a fallback for scans saved before excerpts existed.
 */
function locateDocxBox(sections, pageNumber, line, excerpt, scroller) {
  const reported = sections[pageNumber - 1];
  const estimate = reported ? lineCountBox(reported, line, scroller) : null;
  for (const needle of excerptNeedles(excerpt)) {
    for (const page of pagesByDistance(pageNumber, sections.length)) {
      const ranges = textRangesIn(sections[page - 1], needle);
      if (!ranges.length) continue;
      const candidates = ranges
        .map((range) => mergeLineRects([...range.getClientRects()].map((r) => contentBox(scroller, r))))
        .filter((rects) => rects.length);
      if (!candidates.length) continue;
      const best = estimate
        ? candidates.reduce((a, b) =>
            Math.abs(a[0].top - estimate.top) <= Math.abs(b[0].top - estimate.top) ? a : b
          )
        : candidates[0];
      const top = best[0].top;
      const last = best[best.length - 1];
      return { rects: best, top, height: last.top + last.height - top };
    }
  }
  return estimate;
}

function paintBoxes(scroller, rects, severity) {
  const paint = hitPaint(severity);
  rects.forEach((rect) => {
    const box = document.createElement("div");
    box.className = "pp-issue-box";
    box.style.setProperty("--pp-hit-bg", paint.bg);
    box.style.setProperty("--pp-hit-edge", paint.edge);
    box.style.top = `${rect.top - 2}px`;
    box.style.left = `${rect.left - 3}px`;
    box.style.width = `${rect.width + 6}px`;
    box.style.height = `${rect.height + 4}px`;
    scroller.appendChild(box);
  });
}

function DocxFilePreview({ file, scrollTarget, highlight, paged }) {
  const hostRef = useRef(null);
  const scrollRef = useRef(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [frameHeight, setFrameHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let observer;

    async function render() {
      setBusy(true);
      setError("");
      setFrameHeight(0);
      try {
        if (!hostRef.current) return;
        hostRef.current.innerHTML = "";
        await renderAsync(file, hostRef.current, undefined, {
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
          useBase64URL: true,
        });
        if (cancelled || !hostRef.current) return;

        const fit = () => {
          const host = hostRef.current;
          const wrapper = host?.querySelector(".docx-wrapper");
          const page = host?.querySelector(".docx-wrapper > section");
          if (!wrapper || !page || !host.clientWidth) return;
          const pageWidth = page.offsetWidth || page.scrollWidth;
          const sheetHeight = parseFloat(getComputedStyle(page).minHeight) || 0;
          const pageHeight = sheetHeight > 40 ? sheetHeight : pageWidth * (11 / 8.5);
          const zoom = paged
            ? fitPageScale({
                pageWidth,
                pageHeight,
                boxWidth: host.clientWidth,
                maxHeight: onePageHeight(window.innerHeight),
              })
            : Math.min(1, host.clientWidth / Math.max(1, pageWidth));
          if (Math.abs((parseFloat(wrapper.style.zoom) || 1) - zoom) > 0.001) {
            wrapper.style.zoom = String(zoom);
          }
          const sections = host.querySelectorAll(".docx-wrapper > section");
          sections.forEach((section, index) => {
            section.dataset.page = String(index + 1);
          });
          if (paged && pageHeight > 40) {
            const height = Math.round(pageHeight * zoom);
            setFrameHeight((current) => (Math.abs(current - height) > 1 ? height : current));
          }
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(hostRef.current);
        onResize = fit;
        window.addEventListener("resize", onResize);
      } catch {
        if (!cancelled) setError("Could not render this Word document as originally laid out.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    let onResize = null;
    void render();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [file, paged]);

  useEffect(() => {
    const root = hostRef.current;
    const scroller = scrollRef.current;
    if (!root || !scroller || busy) return;
    const target = targetFrom(scrollTarget, highlight);
    if (target.page == null && target.line == null) return;
    const sections = [...root.querySelectorAll(".docx-wrapper > section")];
    if (!sections.length) return;
    clearIssueMarks(scroller);
    const pageNumber = Math.min(sections.length, Math.max(1, Number(target.page) || 1));

    if (isMarginTarget(target)) {
      const pageEl = sections[pageNumber - 1];
      const side = marginSide(target.finding);
      paintMarginHit(pageEl, side, target.severity);
      if (paged) scrollToPageRegion(scroller, pageEl, side);
      else pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const box = locateDocxBox(sections, pageNumber, target.line, target.excerpt, scroller);
    if (!box) return;
    paintBoxes(scroller, box.rects, target.severity);
    if (paged) {
      scrollMarkIntoView(scroller, box.top, box.height);
      return;
    }
    scroller.querySelector(".pp-issue-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollTarget, highlight, busy, frameHeight, paged]);

  return (
    <div className="relative min-h-[12rem]">
      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#e8ecf1]/80 text-xs text-slate-500">
          <Spinner className="h-4 w-4 text-[#16bfa8]" />
          Opening original document…
        </div>
      )}
      {error ? (
        <p className="rounded-lg bg-white px-4 py-3 text-xs text-rose-500 shadow-sm">{error}</p>
      ) : null}
      <div
        ref={scrollRef}
        className={
          paged
            ? "pp-scroll relative mx-auto w-full overflow-x-hidden overflow-y-auto overscroll-contain"
            : "relative"
        }
        style={paged ? { height: frameHeight || "70vh" } : undefined}
      >
        <div ref={hostRef} className={paged ? "pp-docx-host pp-docx-host--paged" : "pp-docx-host"} />
      </div>
    </div>
  );
}

function TextPagesPreview({ pages, scrollTarget, highlight, emptyLabel, paged }) {
  const lineRefs = useRef(new Map());
  const scrollerRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(0);

  useEffect(() => {
    if (!paged) return;
    const page = scrollerRef.current?.querySelector("article[data-page]");
    if (!page) return;
    const height = Math.round(page.getBoundingClientRect().height);
    if (height > 40) setFrameHeight(Math.min(height, onePageHeight(window.innerHeight)));
  }, [paged, pages]);

  useEffect(() => {
    const target = targetFrom(scrollTarget, highlight);
    if (target.page == null && target.line == null) return;
    const key = `${target.page ?? ""}:${target.line ?? ""}`;
    const node =
      (target.line != null ? lineRefs.current.get(key) : null) ||
      scrollerRef.current?.querySelector(`article[data-page="${target.page}"]`);
    const scroller = scrollerRef.current;
    const pageEl = scroller?.querySelector(`article[data-page="${target.page}"]`);
    if (paged && scroller && pageEl && isMarginTarget(target)) {
      scrollToPageRegion(scroller, pageEl, marginSide(target.finding));
      return;
    }
    if (paged && scroller && node) {
      scrollMarkIntoView(scroller, elementTopIn(scroller, node), node.getBoundingClientRect().height);
      return;
    }
    if (node?.scrollIntoView) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollTarget, highlight, paged, frameHeight, pages]);

  if (!pages.length) {
    return <p className="px-2 text-center text-xs text-slate-500">{emptyLabel}</p>;
  }

  const traced = targetFrom(scrollTarget, highlight);
  const marginTrace = String(traced.section || "").toLowerCase() === "margins";
  const articles = pages.map((page, index) => {
    const pageNum = pageNumberFromIndex(page.pageIndex, index);
    const lines = page.text.split(/\n/);
    const showMargin = marginTrace && traced.page === pageNum;
    return (
      <article
        key={`${page.pageIndex}-${index}`}
        data-page={pageNum}
        className="relative mx-auto min-h-[28rem] w-full max-w-[460px] bg-white px-[11%] py-[10%] shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70"
      >
        {showMargin ? (
          <IssueMark
            mark={{
              kind: "margin",
              side: marginSide(traced.finding),
              severity: traced.severity,
            }}
          />
        ) : null}
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Page {pageNum}
        </p>
        <div className="space-y-0.5">
          {lines.map((lineText, lineIdx) => {
            const lineNum = lineIdx + 1;
            const refKey = `${pageNum}:${lineNum}`;
            const lineHit = !marginTrace && traced.page === pageNum && traced.line === lineNum;
            const paint = lineHit ? hitPaint(traced.severity) : null;
            return (
              <p
                key={refKey}
                ref={(el) => {
                  if (el) lineRefs.current.set(refKey, el);
                  else lineRefs.current.delete(refKey);
                }}
                data-page={pageNum}
                data-line={lineNum}
                className={`whitespace-pre-wrap text-left font-['Times_New_Roman',Georgia,'Times',serif] text-[11px] leading-[1.7] text-[#1a1a1a] sm:text-[12px] ${
                  lineHit ? "pp-issue-hit" : ""
                }`}
                style={
                  paint
                    ? { "--pp-hit-bg": paint.bg, "--pp-hit-edge": paint.edge }
                    : undefined
                }
              >
                {lineText || "\u00a0"}
              </p>
            );
          })}
        </div>
      </article>
    );
  });

  if (paged) {
    return (
      <div
        ref={scrollerRef}
        className="pp-scroll mx-auto w-full overflow-y-auto overscroll-contain"
        style={{ height: frameHeight || "70vh" }}
      >
        <div className="flex flex-col gap-5">{articles}</div>
      </div>
    );
  }

  return (
    <div ref={scrollerRef} className="pp-scroll mx-auto flex max-h-[min(34rem,68vh)] w-full max-w-[460px] flex-col gap-5 overflow-y-auto">
      {articles}
    </div>
  );
}

function DocxUrlPreview({ url, name, scrollTarget, highlight, paged }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError("");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("fetch");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        setFile(
          new File([blob], name || "document.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          })
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not open the saved document.");
      });
    return () => {
      cancelled = true;
    };
  }, [url, name]);

  if (error) {
    return <p className="rounded-lg bg-white px-4 py-3 text-xs text-rose-500 shadow-sm">{error}</p>;
  }
  if (!file) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
        <Spinner className="h-4 w-4 text-[#16bfa8]" />
        Opening saved document…
      </div>
    );
  }
  return (
    <DocxFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} paged={paged} />
  );
}

export default function DocumentPagePreview({
  file = null,
  documentUrl = "",
  documentName = "",
  preview,
  scrollTarget = null,
  highlight = null,
  emptyLabel = "No preview available yet.",
  paged = false,
}) {
  const kind = fileKind(file) || fileKind({ name: documentName }) || urlKind(documentUrl);

  if (kind === "pdf" && file) {
    return (
      <PdfFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} paged={paged} />
    );
  }
  if (kind === "pdf" && documentUrl) {
    if (paged) {
      return (
        <PdfPagedPreview
          source={documentUrl}
          scrollTarget={scrollTarget}
          highlight={highlight}
        />
      );
    }
    return <PdfFrame src={documentUrl} page={scrollTarget?.page ?? highlight?.page} />;
  }
  if (kind === "docx" && file) {
    return (
      <DocxFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} paged={paged} />
    );
  }
  if (kind === "docx" && documentUrl) {
    return (
      <DocxUrlPreview
        url={documentUrl}
        name={documentName}
        scrollTarget={scrollTarget}
        highlight={highlight}
        paged={paged}
      />
    );
  }

  const pages = pagesFromPreview(preview);
  return (
    <TextPagesPreview
      pages={pages}
      scrollTarget={scrollTarget}
      highlight={highlight}
      emptyLabel={emptyLabel}
      paged={paged}
    />
  );
}
