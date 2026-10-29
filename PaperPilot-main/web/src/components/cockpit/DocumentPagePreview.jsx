/**
 * Shows the original uploaded PDF/DOCX or its public document URL.
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
  isMarginTarget,
  onePageHeight,
  marginRegion,
  marginSide,
  mergeLineRects,
  normalizedIndex,
  normalizeNeedle,
  pageAlign,
  pageRegion,
  pagesByDistance,
  pickBestRects,
  resolvePdfMarkY,
  shouldUsePaginationEdge,
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

function sectionPageHeight(page) {
  const styles = getComputedStyle(page);
  const pageWidth = page.offsetWidth || page.scrollWidth || 816;
  const declaredHeight = parseFloat(styles.minHeight) || parseFloat(styles.height) || 0;
  return declaredHeight > 40 ? declaredHeight : pageWidth * (11 / 8.5);
}

/** Split one tall Word section into letter-sized pages by block height. */
function splitOversizedSection(wrapper, page) {
  const pageHeight = sectionPageHeight(page);
  if (page.scrollHeight <= pageHeight * 1.2) return false;
  const kids = [...page.children];
  if (kids.length < 2) return false;
  const heights = kids.map((el) => el.getBoundingClientRect().height || el.offsetHeight || 0);
  if (heights.reduce((sum, value) => sum + value, 0) <= pageHeight * 1.2) return false;

  let current = page;
  let used = 0;
  kids.forEach((child, index) => {
    const height = heights[index];
    if (used > 0 && used + height > pageHeight * 0.98 && height > 8) {
      const next = document.createElement("section");
      next.className = page.className;
      next.style.cssText = page.style.cssText;
      next.style.minHeight = `${Math.round(pageHeight)}px`;
      // Insert after the section we are filling so order stays correct.
      current.after(next);
      current = next;
      used = 0;
    }
    current.appendChild(child);
    used += height;
  });
  return true;
}

/**
 * Revised DOCX files often lose Word's lastRenderedPageBreak markers, so docx-preview
 * emits one (or a few) tall sections. Split every oversized section into letter pages
 * so issue page N maps to preview section N — never clamp page 12 onto page 2.
 */
function paginateOversizedDocxSection(host) {
  const wrapper = host?.querySelector(".docx-wrapper");
  if (!wrapper) return;
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const sections = [...wrapper.querySelectorAll(":scope > section")];
    const oversized = sections.find((section) => {
      const pageHeight = sectionPageHeight(section);
      return section.scrollHeight > pageHeight * 1.25;
    });
    if (!oversized) break;
    if (!splitOversizedSection(wrapper, oversized)) break;
  }
  [...wrapper.querySelectorAll(":scope > section")].forEach((section, index) => {
    section.dataset.page = String(index + 1);
  });
}

/**
 * Map a scanner page onto a rendered DOCX section.
 * Never silently clamp a high page onto the last preview sheet — that painted
 * page-12 pagination chips on page 2. Prefer exact index, then excerpt search.
 */
function resolveDocxPageIndex(sections, target, pageCountHint = 0) {
  const wanted = Math.round(Number(target.page));
  if (!Number.isFinite(wanted) || wanted < 1 || !sections.length) return null;
  if (wanted <= sections.length) {
    return { index: wanted - 1, pageNumber: wanted };
  }

  const needles = excerptNeedles(target.excerpt || target.finding || "");
  if (needles.length) {
    let best = null;
    for (let i = 0; i < sections.length; i += 1) {
      const text = normalizeNeedle(sections[i].innerText || "");
      for (const needle of needles) {
        if (!text.includes(needle)) continue;
        const score = needle.length;
        if (!best || score > best.score) best = { index: i, pageNumber: i + 1, score };
      }
    }
    if (best) return { index: best.index, pageNumber: best.pageNumber };
  }

  // Last resort: proportional map using the scan's page count (still better than clamp-to-end).
  const span = Math.max(sections.length, Math.round(Number(pageCountHint) || 0), wanted);
  if (span <= 1) return { index: 0, pageNumber: 1 };
  const mapped = Math.min(
    sections.length,
    Math.max(1, Math.round(((wanted - 1) / Math.max(1, span - 1)) * (sections.length - 1)) + 1)
  );
  return { index: mapped - 1, pageNumber: mapped };
}

function targetFrom(scrollTarget, highlight) {
  const merged = { ...(highlight || {}), ...(scrollTarget || {}) };
  const section = String(merged.section || "").trim();
  const pagination = String(section).toLowerCase() === "pagination";
  return {
    page: merged.page ?? null,
    // Pagination is page-level — never pin to body line 1 (that over-highlights).
    line: pagination ? null : merged.line ?? null,
    bbox: pagination ? null : merged.bbox || null,
    excerpt: pagination ? "" : String(merged.excerpt || "").trim(),
    severity: merged.severity || "minor",
    finding: String(merged.finding || merged.summary || merged.name || "").trim(),
    section,
    issue_type: String(merged.issue_type || merged.issueType || "").trim(),
    margin_side: merged.margin_side || merged.marginSide || "",
    page_region: merged.page_region || merged.pageRegion || "",
    page_align: merged.page_align || merged.pageAlign || "",
    recommendation: String(merged.recommendation || "").trim(),
    explanation: String(merged.explanation || "").trim(),
    token: merged.token ?? 0,
  };
}

function resolveEdgeSide(target) {
  return (
    marginSide(target.finding, target) ||
    marginSide(`${target.finding} ${target.recommendation}`, target) ||
    pageRegion(target)
  );
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

function edgeBandStyle(side, align = "") {
  const thick = "7%";
  const chipW = "30%";
  const chipH = "8%";
  // Pagination: small header/footer chip at the expected page-number corner.
  if (align === "left" || align === "right" || align === "center") {
    const style = { height: chipH, width: chipW };
    if (side === "bottom") Object.assign(style, { bottom: 0, top: "auto" });
    else Object.assign(style, { top: 0 });
    if (align === "left") Object.assign(style, { left: 0, right: "auto" });
    else if (align === "right") Object.assign(style, { right: 0, left: "auto" });
    else Object.assign(style, { left: "35%", right: "auto" });
    return style;
  }
  if (side === "right") return { top: 0, right: 0, bottom: 0, width: thick };
  if (side === "left") return { top: 0, left: 0, bottom: 0, width: thick };
  if (side === "top") return { top: 0, left: 0, right: 0, height: thick };
  if (side === "bottom") return { bottom: 0, left: 0, right: 0, height: thick };
  return null;
}

function paintMarginHit(pageEl, side, severity, align = "") {
  if (!pageEl) return;
  const paint = hitPaint(severity);
  const band = document.createElement("div");
  band.className = "pp-issue-margin";
  band.style.setProperty("--pp-hit-bg", paint.bg);
  band.style.setProperty("--pp-hit-edge", paint.edge);
  const style = edgeBandStyle(side, align);
  if (!style) {
    // Unknown side — outline only, never flood the whole page.
    band.style.inset = "0";
    band.style.background = "transparent";
    band.style.boxShadow = `inset 0 0 0 4px ${paint.edge}`;
  } else {
    Object.assign(band.style, style);
  }
  const positioned = getComputedStyle(pageEl).position;
  if (positioned === "static") pageEl.style.position = "relative";
  pageEl.appendChild(band);
}

function IssueMark({ mark }) {
  if (!mark) return null;
  const paint = hitPaint(mark.severity);
  if (mark.kind === "margin" || mark.kind === "pagination") {
    const style = {
      background: paint.bg,
      boxShadow: `inset 0 0 0 2px ${paint.edge}`,
    };
    const band = edgeBandStyle(mark.side, mark.align || "");
    if (band) Object.assign(style, band);
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

/** Reuse blob URLs across remounts so reopening the same File does not reload the PDF. */
const pdfBlobUrlCache = new WeakMap();

function blobUrlForPdfFile(file) {
  if (!file) return "";
  const cached = pdfBlobUrlCache.get(file);
  if (cached) return cached;
  const blob =
    file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  pdfBlobUrlCache.set(file, url);
  return url;
}

function PdfFrame({ src, page, frameHeight = 0 }) {
  const iframeRef = useRef(null);
  const base = String(src || "").split("#")[0];
  // Stable src — changing #page= reloads the entire embedded PDF in most browsers.
  const iframeSrc = `${base}#toolbar=1&navpanes=0&scrollbar=1`;
  const height = frameHeight > 40 ? frameHeight : undefined;

  useEffect(() => {
    if (page == null || !base) return;
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      // Prefer in-place hash navigation so the PDF is not fetched again.
      const next = `${base}#page=${page}`;
      if (frame.contentWindow?.location) {
        frame.contentWindow.location.replace(next);
      } else if (frame.src !== next) {
        frame.src = next;
      }
    } catch {
      // Cross-origin blob frames can block contentWindow; hash-only src update is a fallback.
      const next = `${base}#page=${page}`;
      if (frame.getAttribute("src") !== next) frame.setAttribute("src", next);
    }
  }, [base, page]);

  return (
    <div className="w-full" style={height ? { height } : undefined}>
      <iframe
        ref={iframeRef}
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
  const [url, setUrl] = useState(() => blobUrlForPdfFile(file));

  useEffect(() => {
    setUrl(blobUrlForPdfFile(file));
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
    // Never invent page 1 when the issue has no page pin.
    if (target.page == null) return;
    const wanted = Math.round(Number(target.page));
    if (!Number.isFinite(wanted) || wanted < 1) return;
    // Prefer the exact scanner page — do not clamp a high page onto the last sheet.
    let pageNumber = wanted;
    let pageEl = scroller.querySelector(`[data-page="${pageNumber}"]`);
    if (!pageEl && pages.length) {
      // PDF page count should match; if not, stay on the closest existing page only as fallback.
      pageNumber = Math.min(pages.length, wanted);
      pageEl = scroller.querySelector(`[data-page="${pageNumber}"]`);
    }
    if (!pageEl) return;
    const ys = lineYsRef.current.get(pageNumber) || [];
    const bbox = target.bbox;
    const pageHeight = pageEl.clientHeight;
    const bboxY =
      bbox && Number.isFinite(Number(bbox.y)) ? Number(bbox.y) * pageHeight : null;
    // Line number wins over a shared/coarse bbox so lines 13/14/15 stay distinct.
    const y = resolvePdfMarkY({
      line: target.line,
      ys,
      bboxY,
      pageHeight,
    });
    if (isMarginTarget(target) || shouldUsePaginationEdge(target)) {
      const side = isMarginTarget(target) ? resolveEdgeSide(target) : pageRegion(target);
      const align = shouldUsePaginationEdge(target) ? pageAlign(target) : "";
      setMark({
        page: pageNumber,
        kind: shouldUsePaginationEdge(target) ? "pagination" : "margin",
        side,
        align,
        severity: target.severity,
      });
      scrollToPageRegion(scroller, pageEl, side);
      return;
    }
    const lineIdx = Number(target.line);
    const usedLine =
      Number.isFinite(lineIdx) &&
      lineIdx >= 1 &&
      ys[Math.min(ys.length, Math.max(1, Math.round(lineIdx))) - 1] != null &&
      Math.abs(y - Number(ys[Math.min(ys.length, Math.max(1, Math.round(lineIdx))) - 1])) < 1;
    let markHeight;
    if (bbox && Number.isFinite(Number(bbox.y)) && !usedLine) {
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
      const row = Math.min(ys.length, Math.max(1, Math.round(Number(target.line) || 1))) - 1;
      const next = ys[row + 1];
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
  // Include headings/lists — scanner line counts cover those blocks, not only <p>.
  return [...docxBody(section).querySelectorAll("p, h1, h2, h3, h4, h5, h6, li")].map((el) => {
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

function rangeToRects(range, scroller) {
  const client = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  if (client.length) {
    return mergeLineRects(client.map((r) => contentBox(scroller, r)));
  }
  // Zoom/transform engines sometimes yield empty client rects; use the host element.
  const node = range.startContainer?.nodeType === 1 ? range.startContainer : range.startContainer?.parentElement;
  const el = node?.closest?.("p, h1, h2, h3, h4, h5, h6, li, td, th, div") || node;
  if (!el?.getBoundingClientRect) return [];
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return [];
  return [contentBox(scroller, rect)];
}

function textRangesIn(section, needle) {
  const ranges = [];
  if (!needle) return ranges;
  docxBody(section)
    .querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, td, th")
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
      const locate = (rawIndex, isEnd) => {
        for (let i = nodes.length - 1; i >= 0; i -= 1) {
          const { node, start } = nodes[i];
          const within = isEnd ? rawIndex > start : rawIndex >= start;
          if (within) return [node, Math.min(node.nodeValue.length, rawIndex - start)];
        }
        return [nodes[0].node, 0];
      };
      // Collect every occurrence — adjacent issues often share a short needle.
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const index = text.indexOf(needle, searchFrom);
        if (index < 0 || map[index] == null) break;
        const startRaw = map[index];
        const endRaw = (map[index + needle.length - 1] ?? startRaw) + 1;
        const range = document.createRange();
        const [startNode, startOffset] = locate(startRaw, false);
        const [endNode, endOffset] = locate(endRaw, true);
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        ranges.push(range);
        searchFrom = index + Math.max(1, needle.length);
      }
    });
  return ranges;
}

function lineCountBox(section, line, scroller) {
  const blocks = readDocxBlocks(section);
  if (!blocks.length) return null;
  const hit = visualLineTarget(blocks, line || 1);
  let index = hit.index;
  if (index < 0) return null;
  // Prefer a paragraph that still has visible text (never paint a blank spacer).
  const hasText = (block) => Boolean(String(block?.el?.textContent || "").trim());
  if (!hasText(blocks[index])) {
    let found = -1;
    for (let step = 0; step < blocks.length; step += 1) {
      const after = index + step;
      const before = index - step;
      if (after < blocks.length && hasText(blocks[after])) {
        found = after;
        break;
      }
      if (step && before >= 0 && hasText(blocks[before])) {
        found = before;
        break;
      }
    }
    if (found < 0) return null;
    index = found;
  }
  const block = blocks[index];
  const rect = block.el.getBoundingClientRect();
  const scale = block.el.offsetHeight ? rect.height / block.el.offsetHeight : 1;
  const base = contentBox(scroller, rect);
  const delta = index === hit.index ? hit.delta : 0;
  const top = base.top + Math.max(0, delta) * scale;
  const height = Math.max(12, Math.min(block.lineHeight * scale, base.height || block.lineHeight * scale));
  return { rects: [{ top, left: base.left, width: Math.max(base.width, 24), height }], top, height };
}

/**
 * Where an issue really sits in the rendered Word pages.
 * When a scanner line is present, that line always disambiguates excerpt hits
 * so issues on lines 13 / 14 / 15 never collapse onto one highlight.
 */
function locateDocxBox(sections, pageNumber, line, excerpt, scroller, { searchRadius = 2 } = {}) {
  const reported = sections[pageNumber - 1];
  const estimate = reported ? lineCountBox(reported, line, scroller) : null;
  const needles = excerptNeedles(excerpt);
  const hasLine = line != null && line !== "" && Number.isFinite(Number(line));

  const pack = (rects) => {
    if (!rects?.length) return null;
    const last = rects[rects.length - 1];
    return { rects, top: rects[0].top, height: last.top + last.height - rects[0].top };
  };

  const allCandidates = [];
  const radius = Math.max(1, Math.min(sections.length, Number(searchRadius) || 2));
  for (const needle of needles) {
    for (const page of pagesByDistance(pageNumber, sections.length, radius)) {
      const ranges = textRangesIn(sections[page - 1], needle);
      if (!ranges.length) continue;
      const candidates = ranges
        .map((range) => rangeToRects(range, scroller))
        .filter((rects) => rects.length);
      for (const rects of candidates) {
        allCandidates.push({ page, rects, needleLen: needle.length });
      }
    }
  }

  // If the reported page is out of sync, search the whole document once.
  if (!allCandidates.length && needles.length && sections.length > radius * 2) {
    for (const needle of needles) {
      for (let page = 1; page <= sections.length; page += 1) {
        const ranges = textRangesIn(sections[page - 1], needle);
        for (const range of ranges) {
          const rects = rangeToRects(range, scroller);
          if (rects.length) allCandidates.push({ page, rects, needleLen: needle.length });
        }
      }
    }
  }

  if (allCandidates.length) {
    // Prefer longer needle matches on the reported page, then disambiguate by line.
    const reportedHits = allCandidates.filter((item) => item.page === pageNumber);
    const pool = reportedHits.length ? reportedHits : allCandidates;
    const maxLen = Math.max(...pool.map((item) => item.needleLen));
    const bestNeedle = pool.filter((item) => item.needleLen === maxLen);
    const best =
      hasLine && estimate
        ? pickBestRects(
            bestNeedle.map((item) => item.rects),
            estimate.top
          )
        : bestNeedle[0].rects;
    const boxed = pack(best);
    if (boxed) {
      // Line pin wins when excerpt still lands far from the estimated line.
      if (hasLine && estimate && Math.abs(boxed.top - estimate.top) > Math.max(28, estimate.height * 2)) {
        return estimate;
      }
      return boxed;
    }
  }
  return estimate;
}

/** Always leave a visible mark on the target page when line/excerpt locate fails. */
function fallbackDocxBox(pageEl, line, scroller) {
  if (!pageEl) return null;
  const byLine = lineCountBox(pageEl, line, scroller);
  if (byLine) return byLine;
  const body = docxBody(pageEl);
  const rect = body.getBoundingClientRect();
  const base = contentBox(scroller, rect);
  // Thin band near the top of the page body — never flood the whole sheet.
  const height = Math.max(18, Math.min(36, base.height * 0.04 || 24));
  return {
    rects: [{ top: base.top + 8, left: base.left, width: Math.max(base.width, 24), height }],
    top: base.top + 8,
    height,
  };
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

function DocxFilePreview({ file, scrollTarget, highlight, paged, pageCountHint = 0 }) {
  const hostRef = useRef(null);
  const scrollRef = useRef(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [frameHeight, setFrameHeight] = useState(0);
  const [pagesReady, setPagesReady] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let observer;

    async function render() {
        setBusy(true);
        setError("");
        setFrameHeight(0);
        setPagesReady(0);
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
        // Let layout settle, then recover pages when Word soft-breaks were stripped on re-save.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (cancelled || !hostRef.current) return;
        paginateOversizedDocxSection(hostRef.current);
        // If the scan saw many more pages than docx-preview emitted, split again after paint.
        const hint = Math.max(0, Math.round(Number(pageCountHint) || 0));
        if (hint > 0) {
          const count = hostRef.current.querySelectorAll(".docx-wrapper > section").length;
          if (count > 0 && count < hint * 0.6) {
            paginateOversizedDocxSection(hostRef.current);
          }
        }
        setPagesReady(hostRef.current.querySelectorAll(".docx-wrapper > section").length);

        const fit = () => {
          const host = hostRef.current;
          const wrapper = host?.querySelector(".docx-wrapper");
          const page = host?.querySelector(".docx-wrapper > section");
          if (!wrapper || !page || !host.clientWidth) return;
          // Clear prior scale so measurements are in unscaled layout pixels.
          wrapper.style.zoom = "";
          wrapper.style.transform = "";
          wrapper.style.transformOrigin = "0 0";
          wrapper.style.width = "";
          host.style.height = "";
          const pageWidth = page.offsetWidth || page.scrollWidth;
          const sheetHeight = parseFloat(getComputedStyle(page).minHeight) || 0;
          const pageHeight = sheetHeight > 40 ? sheetHeight : pageWidth * (11 / 8.5);
          const scale = paged
            ? fitPageScale({
                pageWidth,
                pageHeight,
                boxWidth: host.clientWidth,
                maxHeight: onePageHeight(window.innerHeight),
              })
            : Math.min(1, host.clientWidth / Math.max(1, pageWidth));
          // transform (not CSS zoom) keeps getClientRects in on-screen pixels for tracing.
          wrapper.style.transformOrigin = "0 0";
          wrapper.style.width = `${host.clientWidth / Math.max(scale, 0.05)}px`;
          wrapper.style.transform = `scale(${scale})`;
          host.style.height = `${Math.ceil(wrapper.scrollHeight * scale)}px`;
          const sections = host.querySelectorAll(".docx-wrapper > section");
          sections.forEach((section, index) => {
            section.dataset.page = String(index + 1);
          });
          if (paged && pageHeight > 40) {
            const height = Math.round(pageHeight * scale);
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
  }, [file, paged, pageCountHint]);

  useEffect(() => {
    const root = hostRef.current;
    const scroller = scrollRef.current;
    if (!root || !scroller || busy) return;
    const target = targetFrom(scrollTarget, highlight);
    // Never invent page 1 when the issue has no page pin.
    if (target.page == null) return;
    const sections = [...root.querySelectorAll(".docx-wrapper > section")];
    if (!sections.length) return;
    clearIssueMarks(scroller);
    const resolved = resolveDocxPageIndex(sections, target, pageCountHint || pagesReady);
    if (!resolved) return;
    const { index, pageNumber } = resolved;
    const pageEl = sections[index];
    if (!pageEl) return;

    if (isMarginTarget(target) || shouldUsePaginationEdge(target)) {
      const side = isMarginTarget(target) ? resolveEdgeSide(target) : pageRegion(target);
      // Default pagination chip to the right when mechanics say "top right" or omit align.
      const align = shouldUsePaginationEdge(target)
        ? pageAlign(target) || "right"
        : "";
      paintMarginHit(pageEl, side, target.severity, align);
      if (paged) scrollToPageRegion(scroller, pageEl, side);
      else pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const searchRadius =
      sections.length < Math.max(8, Number(pageCountHint) || 0) * 0.7 ? sections.length : 3;
    const box =
      locateDocxBox(sections, pageNumber, target.line, target.excerpt || target.finding, scroller, {
        searchRadius,
      }) || fallbackDocxBox(pageEl, target.line, scroller);
    if (!box) return;
    paintBoxes(scroller, box.rects, target.severity);
    if (paged) {
      scrollMarkIntoView(scroller, box.top, box.height);
      return;
    }
    scroller.querySelector(".pp-issue-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollTarget, highlight, busy, frameHeight, paged, pageCountHint, pagesReady]);

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
    // Never invent page 1 when the issue has no page pin.
    if (target.page == null) return;
    const key = `${target.page}:${target.line ?? ""}`;
    const node =
      (target.line != null ? lineRefs.current.get(key) : null) ||
      scrollerRef.current?.querySelector(`article[data-page="${target.page}"]`);
    const scroller = scrollerRef.current;
    const pageEl = scroller?.querySelector(`article[data-page="${target.page}"]`);
    if (paged && scroller && pageEl && (isMarginTarget(target) || shouldUsePaginationEdge(target))) {
      const side = isMarginTarget(target) ? resolveEdgeSide(target) : pageRegion(target);
      scrollToPageRegion(scroller, pageEl, side);
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
  const marginTrace = isMarginTarget(traced);
  const paginationBand = shouldUsePaginationEdge(traced);
  const previewPageNums = pages.map((page, index) => pageNumberFromIndex(page.pageIndex, index));
  // Exact page only — never paint page-99 issues onto page 2.
  const tracedPage =
    traced.page != null && previewPageNums.includes(Number(traced.page))
      ? Number(traced.page)
      : null;
  const articles = pages.map((page, index) => {
    const pageNum = previewPageNums[index];
    const lines = page.text.split(/\n/);
    const showEdge = (marginTrace || paginationBand) && tracedPage === pageNum;
    const edgeSide = marginTrace ? resolveEdgeSide(traced) : pageRegion(traced);
    const edgeAlign = paginationBand ? pageAlign(traced) || "right" : "";
    return (
      <article
        key={`${page.pageIndex}-${index}`}
        data-page={pageNum}
        className="relative mx-auto min-h-[28rem] w-full max-w-[460px] bg-white px-[11%] py-[10%] shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70"
      >
        {showEdge ? (
          <IssueMark
            mark={{
              kind: paginationBand ? "pagination" : "margin",
              side: edgeSide,
              align: edgeAlign,
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
            const lineHit =
              !marginTrace &&
              !paginationBand &&
              tracedPage === pageNum &&
              traced.line === lineNum;
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

function DocxUrlPreview({ url, name, scrollTarget, highlight, paged, pageCountHint = 0 }) {
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
    <DocxFilePreview
      file={file}
      scrollTarget={scrollTarget}
      highlight={highlight}
      paged={paged}
      pageCountHint={pageCountHint}
    />
  );
}

function isPresignedUploadUrl(url) {
  // Presigned PUT URLs must never be used as iframe/src or fetch targets for preview.
  // A browser GET against them returns SignatureDoesNotMatch XML.
  return /[?&]X-Amz-Signature=/i.test(String(url || ""));
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
  loading = false,
  pageCountHint = 0,
}) {
  const safeDocumentUrl = isPresignedUploadUrl(documentUrl) ? "" : documentUrl;
  const kind = fileKind(file) || fileKind({ name: documentName }) || urlKind(safeDocumentUrl);

  if (loading && !file) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
        <Spinner className="h-4 w-4 text-[#16bfa8]" />
        Opening saved document…
      </div>
    );
  }

  if (kind === "pdf" && file) {
    return (
      <PdfFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} paged={paged} />
    );
  }
  if (kind === "pdf" && safeDocumentUrl) {
    if (paged) {
      return (
        <PdfPagedPreview
          source={safeDocumentUrl}
          scrollTarget={scrollTarget}
          highlight={highlight}
        />
      );
    }
    return <PdfFrame src={safeDocumentUrl} page={scrollTarget?.page ?? highlight?.page} />;
  }
  if (kind === "docx" && file) {
    return (
      <DocxFilePreview
        file={file}
        scrollTarget={scrollTarget}
        highlight={highlight}
        paged={paged}
        pageCountHint={pageCountHint}
      />
    );
  }
  if (kind === "docx" && safeDocumentUrl) {
    return (
      <DocxUrlPreview
        url={safeDocumentUrl}
        name={documentName}
        scrollTarget={scrollTarget}
        highlight={highlight}
        paged={paged}
        pageCountHint={pageCountHint}
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
