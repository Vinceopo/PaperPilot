/**
 * Shows the original uploaded PDF/DOCX or Cloudinary URL.
 * Extracted text is a fallback when the source file is not available.
 * Supports scroll-to-line highlighting for reference tracing.
 */

import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import Spinner from "../Spinner.jsx";

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

function PdfFrame({ src, page, highlight }) {
  const base = String(src || "").split("#")[0];
  const iframeSrc =
    page != null
      ? `${base}#page=${page}`
      : `${base}#toolbar=0&navpanes=0&scrollbar=1`;

  return (
    <div className="relative min-h-[22rem] w-full">
      <iframe
        title="Document PDF preview"
        src={iframeSrc}
        className="h-[min(34rem,68vh)] min-h-[22rem] w-full border-0 bg-white"
      />
      {highlight?.bbox ? (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div
            className="absolute rounded-sm bg-rose-300/45 ring-1 ring-rose-400/80 underline decoration-rose-600 decoration-2"
            style={{
              left: `${highlight.bbox.x * 100}%`,
              top: `${highlight.bbox.y * 100}%`,
              width: `${highlight.bbox.w * 100}%`,
              height: `${Math.max(highlight.bbox.h * 100, 1.5)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PdfFilePreview({ file, scrollTarget, highlight }) {
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

  return (
    <PdfFrame
      src={url}
      page={scrollTarget?.page ?? highlight?.page}
      highlight={highlight}
    />
  );
}

function DocxFilePreview({ file, scrollTarget, highlight }) {
  const hostRef = useRef(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let observer;

    async function render() {
      setBusy(true);
      setError("");
      try {
        if (!hostRef.current) return;
        hostRef.current.innerHTML = "";
        await renderAsync(file, hostRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        });
        if (cancelled || !hostRef.current) return;

        const fit = () => {
          const wrapper = hostRef.current?.querySelector(".docx-wrapper");
          const page = hostRef.current?.querySelector("section");
          if (!wrapper || !page || !hostRef.current.clientWidth) return;
          wrapper.style.zoom = String(Math.min(1, hostRef.current.clientWidth / page.scrollWidth));
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(hostRef.current);
      } catch {
        if (!cancelled) setError("Could not render this Word document as originally laid out.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [file]);

  useEffect(() => {
    if (!hostRef.current || busy) return;
    const page = scrollTarget?.page ?? highlight?.page;
    const line = scrollTarget?.line ?? highlight?.line;
    if (page == null && line == null) return;

    hostRef.current.querySelectorAll(".pp-docx-hit").forEach((node) => {
      node.classList.remove("pp-docx-hit");
    });

    const paragraphs = [...hostRef.current.querySelectorAll("p")];
    if (!paragraphs.length) return;

    // Approximate page/line landing: pack ~28 paragraphs per "page", then line within that pack.
    const perPage = 28;
    const pageIndex = Math.max(0, (Number(page) || 1) - 1);
    const lineIndex = Math.max(0, (Number(line) || 1) - 1);
    const targetIndex = Math.min(paragraphs.length - 1, pageIndex * perPage + lineIndex);
    const target = paragraphs[targetIndex];
    if (!target) return;
    target.classList.add("pp-docx-hit");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollTarget, highlight, busy]);

  return (
    <div className="relative min-h-[22rem]">
      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#e8ecf1]/80 text-xs text-slate-500">
          <Spinner className="h-4 w-4 text-[#16bfa8]" />
          Opening original document…
        </div>
      )}
      {error ? (
        <p className="rounded-lg bg-white px-4 py-3 text-xs text-rose-500 shadow-sm">{error}</p>
      ) : null}
      <div ref={hostRef} className="pp-docx-host" />
      <style>{`
        .pp-docx-hit {
          background: rgba(254, 205, 211, 0.85) !important;
          outline: 2px solid rgba(244, 63, 94, 0.65);
          text-decoration: underline;
          text-decoration-color: #e11d48;
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

function TextPagesPreview({ pages, scrollTarget, highlight, emptyLabel }) {
  const lineRefs = useRef(new Map());

  useEffect(() => {
    if (!scrollTarget?.page && !scrollTarget?.line) return;
    const key = `${scrollTarget.page ?? ""}:${scrollTarget.line ?? ""}`;
    const node = lineRefs.current.get(key);
    if (node?.scrollIntoView) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollTarget]);

  if (!pages.length) {
    return <p className="px-2 text-center text-xs text-slate-500">{emptyLabel}</p>;
  }

  const activePage = highlight?.page ?? scrollTarget?.page;
  const activeLine = highlight?.line ?? scrollTarget?.line;

  return (
    <div className="pp-scroll mx-auto flex max-h-[min(34rem,68vh)] w-full max-w-[460px] flex-col gap-5 overflow-y-auto">
      {pages.map((page, index) => {
        const pageNum = pageNumberFromIndex(page.pageIndex, index);
        const lines = page.text.split(/\n/);
        return (
          <article
            key={`${page.pageIndex}-${index}`}
            data-page={pageNum}
            className="relative mx-auto min-h-[28rem] w-full bg-white px-[11%] py-[10%] shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70"
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Page {pageNum}
            </p>
            <div className="space-y-0.5">
              {lines.map((lineText, lineIdx) => {
                const lineNum = lineIdx + 1;
                const refKey = `${pageNum}:${lineNum}`;
                const isActive =
                  activePage === pageNum &&
                  (activeLine == null || activeLine === lineNum);
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
                      isActive
                        ? "rounded-sm bg-rose-100/90 underline decoration-rose-500 decoration-2 ring-1 ring-rose-200/80"
                        : ""
                    }`}
                  >
                    {lineText || "\u00a0"}
                  </p>
                );
              })}
            </div>
            {highlight?.bbox && activePage === pageNum ? (
              <div
                className="pointer-events-none absolute rounded-sm bg-rose-200/40 ring-1 ring-rose-300"
                style={{
                  left: `${11 + highlight.bbox.x * 78}%`,
                  top: `${10 + highlight.bbox.y * 75}%`,
                  width: `${highlight.bbox.w * 78}%`,
                  height: `${Math.max(highlight.bbox.h * 75, 2)}%`,
                }}
                aria-hidden="true"
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function DocumentPagePreview({
  file = null,
  documentUrl = "",
  preview,
  scrollTarget = null,
  highlight = null,
  emptyLabel = "No preview available yet.",
}) {
  const kind = fileKind(file) || urlKind(documentUrl);

  if (kind === "pdf" && file) {
    return <PdfFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} />;
  }
  if (kind === "pdf" && documentUrl) {
    return (
      <PdfFrame
        src={documentUrl}
        page={scrollTarget?.page ?? highlight?.page}
        highlight={highlight}
      />
    );
  }
  if (kind === "docx" && file) {
    return <DocxFilePreview file={file} scrollTarget={scrollTarget} highlight={highlight} />;
  }

  const pages = pagesFromPreview(preview);
  return (
    <TextPagesPreview
      pages={pages}
      scrollTarget={scrollTarget}
      highlight={highlight}
      emptyLabel={emptyLabel}
    />
  );
}
