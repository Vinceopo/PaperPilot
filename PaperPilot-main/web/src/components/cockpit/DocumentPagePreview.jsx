/**
 * Letter-page document viewer used for manuscript + mechanics upload previews.
 */

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

function looksLikeTitlePage(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const shortLines = lines.filter((line) => line.length <= 90).length;
  return shortLines / lines.length >= 0.7 && lines.length <= 28;
}

function CornerMarks() {
  const arm = "pointer-events-none absolute h-3 w-3 border-slate-300";
  return (
    <>
      <span className={`${arm} left-3 top-3 border-l border-t`} />
      <span className={`${arm} right-3 top-3 border-r border-t`} />
      <span className={`${arm} bottom-3 left-3 border-b border-l`} />
      <span className={`${arm} bottom-3 right-3 border-b border-r`} />
    </>
  );
}

export default function DocumentPagePreview({
  preview,
  emptyLabel = "No preview available yet.",
  preferCentered = false,
  centerFirstPage = true,
}) {
  const pages = pagesFromPreview(preview);
  if (!pages.length) {
    return <p className="px-2 text-center text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-5">
      {pages.map((page, index) => {
        const centered =
          preferCentered ||
          (centerFirstPage && index === 0) ||
          looksLikeTitlePage(page.text);
        return (
          <article
            key={`${page.pageIndex}-${index}`}
            className="relative mx-auto aspect-[8.5/11] w-full bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/70"
          >
            <CornerMarks />
            <div
              className={`h-full overflow-hidden px-[11%] py-[10%] font-['Times_New_Roman',Georgia,'Times',serif] text-[11px] leading-[1.85] text-[#1a1a1a] sm:text-[12px] ${
                centered ? "text-center" : "text-left"
              }`}
            >
              <p className="whitespace-pre-wrap">{page.text}</p>
            </div>
            <p className="absolute bottom-2 left-0 right-0 text-center text-[9px] font-sans tracking-wide text-slate-400">
              {page.pageIndex + 1}
            </p>
          </article>
        );
      })}
    </div>
  );
}
