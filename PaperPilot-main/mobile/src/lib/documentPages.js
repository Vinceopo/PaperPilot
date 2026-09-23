/**
 * Build scrollable document pages for reference tracing (text fallback on RN).
 */

export function pagesFromPreview(preview) {
  if (!preview) return [];
  if (Array.isArray(preview.pages) && preview.pages.length) {
    return preview.pages.map((page, index) => {
      const pageIndex = page.page_index ?? index;
      const text = String(page.text || "").trim();
      const lines = text ? text.split(/\n/) : [];
      return {
        page: Number(page.page ?? pageIndex + 1) || pageIndex + 1,
        pageIndex,
        lines: lines.length ? lines : text ? [text] : [],
        text,
      };
    });
  }
  const fallback = String(preview.text_preview || preview.extracted_text || preview.preview || "").trim();
  if (!fallback) return [];
  const lines = fallback.split(/\n/);
  return [{ page: 1, pageIndex: 0, lines, text: fallback }];
}

export function buildDocumentPages({ preview, pageCount = 0, formatChecks = [] }) {
  const fromPreview = pagesFromPreview(preview);
  if (fromPreview.length) return fromPreview;

  let maxPage = Math.max(0, Number(pageCount) || 0);
  (formatChecks || []).forEach((check) => {
    (check.locations || []).forEach((loc) => {
      const p = Number(loc?.page ?? loc?.page_index);
      if (!Number.isNaN(p) && p > 0) maxPage = Math.max(maxPage, loc.page_index != null ? p + 1 : p);
    });
  });

  if (maxPage <= 0) return [];

  return Array.from({ length: maxPage }, (_, index) => ({
    page: index + 1,
    pageIndex: index,
    lines: ["(Page text preview is unavailable on mobile — tap issues to jump to page/line markers.)"],
    text: "",
  }));
}

export function lineMatchesHighlight(page, line, highlight) {
  if (!highlight || highlight.page == null) return false;
  if (Number(highlight.page) !== Number(page)) return false;
  if (highlight.line == null) return true;
  return Number(highlight.line) === Number(line);
}
