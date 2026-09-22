/**
 * Shows the original uploaded PDF/DOCX. Extracted text is only a fallback
 * when the source file is not available.
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

function PdfFilePreview({ file }) {
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
    <iframe
      title="Original PDF preview"
      src={`${url}#toolbar=0&navpanes=0&scrollbar=1`}
      className="h-[min(34rem,68vh)] min-h-[22rem] w-full border-0 bg-white"
    />
  );
}

function DocxFilePreview({ file }) {
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
    </div>
  );
}

export default function DocumentPagePreview({
  file = null,
  preview,
  emptyLabel = "No preview available yet.",
}) {
  const kind = fileKind(file);
  if (kind === "pdf") return <PdfFilePreview file={file} />;
  if (kind === "docx") return <DocxFilePreview file={file} />;

  const pages = pagesFromPreview(preview);
  if (!pages.length) {
    return <p className="px-2 text-center text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-5">
      {pages.map((page, index) => (
        <article
          key={`${page.pageIndex}-${index}`}
          className="relative mx-auto min-h-[28rem] w-full bg-white px-[11%] py-[10%] shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70"
        >
          <p className="whitespace-pre-wrap text-left font-['Times_New_Roman',Georgia,'Times',serif] text-[11px] leading-[1.7] text-[#1a1a1a] sm:text-[12px]">
            {page.text}
          </p>
        </article>
      ))}
    </div>
  );
}
