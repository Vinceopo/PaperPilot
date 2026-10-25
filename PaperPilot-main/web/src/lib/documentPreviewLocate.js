/** Pure helpers for placing a one-page preview window on an issue. */

export const ISSUE_HIT = {
  critical: { bg: "rgba(244, 63, 94, 0.42)", edge: "#e11d48" },
  moderate: { bg: "rgba(249, 115, 22, 0.42)", edge: "#ea580c" },
  minor: { bg: "rgba(251, 191, 36, 0.55)", edge: "#d97706" },
};

export function hitPaint(severity) {
  const key = String(severity || "").toLowerCase();
  return ISSUE_HIT[key] || ISSUE_HIT.minor;
}

/**
 * Which page edge a margin (or pagination) highlight should paint.
 * Prefer explicit scanner fields so we never guess from the wrong body line.
 */
export function marginSide(text, extras = {}) {
  const explicit = String(extras.margin_side || extras.marginSide || "").toLowerCase();
  if (explicit === "top" || explicit === "bottom" || explicit === "left" || explicit === "right") {
    return explicit;
  }
  const issueType = String(extras.issue_type || extras.issueType || "").toLowerCase();
  const fromType = issueType.match(/^(top|bottom|left|right)_margin$/);
  if (fromType) return fromType[1];
  const value = String(text || "").toLowerCase();
  if (value.includes("right margin")) return "right";
  if (value.includes("left margin")) return "left";
  if (value.includes("top margin")) return "top";
  if (value.includes("bottom margin")) return "bottom";
  return "";
}

/** Header/footer band for pagination issues when no page-number bbox exists. */
export function pageRegion(target = {}) {
  const explicit = String(target.page_region || target.pageRegion || "").toLowerCase();
  if (explicit === "top" || explicit === "bottom") return explicit;
  const text = `${target.finding || ""} ${target.recommendation || ""} ${target.explanation || ""}`.toLowerCase();
  if (/\bbottom\b/.test(text)) return "bottom";
  if (/\btop\b/.test(text)) return "top";
  return "top";
}

export function isMarginTarget(target = {}) {
  return String(target.section || "").toLowerCase() === "margins";
}

export function isPaginationTarget(target = {}) {
  return String(target.section || "").toLowerCase() === "pagination";
}

/** Tallest a single page may be drawn so the whole page fits on screen. */
export function onePageHeight(viewportHeight) {
  const vh = Number(viewportHeight) || 900;
  return Math.round(Math.max(360, Math.min(vh - 170, 1100)));
}

/** Zoom that fits one whole page inside both the available width and one-page height. */
export function fitPageScale({ pageWidth, pageHeight, boxWidth, maxHeight, allowUpscale = false }) {
  const w = Math.max(1, Number(pageWidth) || 1);
  const h = Math.max(1, Number(pageHeight) || 1);
  const byWidth = Math.max(0.05, (Number(boxWidth) || w) / w);
  const byHeight = Math.max(0.05, (Number(maxHeight) || h) / h);
  const scale = Math.min(byWidth, byHeight);
  return allowUpscale ? scale : Math.min(1, scale);
}

/** Vertical slice of the page (0–1) that a margin mark covers. */
export function marginRegion(side) {
  if (side === "bottom") return { start: 0.93, size: 0.07 };
  if (side === "top") return { start: 0, size: 0.07 };
  return { start: 0, size: 1 };
}

/** Scroll position that puts a mark in the middle of the window. */
export function centeredScrollTop({ markTop, markHeight = 0, viewHeight, maxScroll = Infinity }) {
  const view = Math.max(1, Number(viewHeight) || 1);
  const height = Math.max(0, Number(markHeight) || 0);
  const raw = height >= view ? Number(markTop) - 16 : Number(markTop) - (view - height) / 2;
  const capped = Number.isFinite(maxScroll) ? Math.min(maxScroll, raw) : raw;
  return Math.max(0, capped);
}

export function frameScrollTop({ elementTop, padding = 16, maxScroll = Infinity }) {
  const raw = Number(elementTop) - padding;
  const capped = Math.min(Number.isFinite(maxScroll) ? maxScroll : raw, raw);
  return Math.max(0, capped);
}

/**
 * Walk rendered blocks the way the scanner counts lines on one page.
 * `leadingLines` / `trailingLines` are blank gaps — never paint those for
 * text issues; snap onto the paragraph's first/last content line instead.
 */
export function visualLineTarget(blocks, lineNumber) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) return { index: -1, delta: 0 };
  let remaining = Math.max(1, Math.round(Number(lineNumber) || 1));
  for (let index = 0; index < list.length; index += 1) {
    const block = list[index] || {};
    const lineHeight = Math.max(1, Number(block.lineHeight) || 1);
    const leading = Math.max(0, Math.round(Number(block.leadingLines) || 0));
    if (remaining <= leading) {
      // Blank gap above the paragraph → highlight the first content line.
      return { index, delta: 0 };
    }
    remaining -= leading;
    const height = Number(block.height) || lineHeight;
    const lines = Math.max(1, Math.round(height / lineHeight));
    if (remaining <= lines) {
      return { index, delta: (remaining - 1) * lineHeight };
    }
    remaining -= lines;
    const trailing = Math.max(0, Math.round(Number(block.trailingLines) || 0));
    if (remaining <= trailing) {
      // Blank gap below → highlight the last content line, not empty space.
      return { index, delta: Math.max(0, lines - 1) * lineHeight };
    }
    remaining -= trailing;
  }
  return { index: list.length - 1, delta: 0 };
}

export function normalizeNeedle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Lowercase + collapse whitespace, remembering where each kept character
 * came from so a match can be mapped back onto the original text nodes.
 */
export function normalizedIndex(raw) {
  const source = String(raw || "");
  let text = "";
  const map = [];
  let prevSpace = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
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
  return { text, map };
}

/** Search strings to try, longest first. Short titles (e.g. "By:") still locate. */
export function excerptNeedles(excerpt) {
  const full = normalizeNeedle(excerpt);
  if (full.length < 2) return [];
  const needles = [full];
  if (full.length > 48) {
    needles.push(full.slice(0, 40).trim());
    needles.push(full.slice(-40).trim());
  }
  if (full.length >= 12) {
    const words = full.split(" ").filter(Boolean);
    if (words.length >= 3) needles.push(words.slice(0, 3).join(" "));
  }
  return needles.filter((value, index, list) => value.length >= 2 && list.indexOf(value) === index);
}

/**
 * Pick the excerpt hit closest to the scanner line estimate.
 * Always prefer line when both exist — a unique excerpt on the page must not
 * steal highlights from other issues on different lines.
 */
export function pickBestRects(candidates, estimateTop = null) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(
    (rects) => Array.isArray(rects) && rects.length && Number.isFinite(Number(rects[0]?.top))
  );
  if (!list.length) return null;
  if (!Number.isFinite(Number(estimateTop))) return list[0];
  const target = Number(estimateTop);
  return list.reduce((best, rects) =>
    Math.abs(Number(rects[0].top) - target) <= Math.abs(Number(best[0].top) - target) ? rects : best
  );
}

/**
 * Resolve a DOCX highlight from excerpt candidates + line estimate.
 * When `line` is set, line estimate always disambiguates — even for a single hit.
 */
export function resolveDocxHighlight({
  candidateGroups = [],
  estimateTop = null,
  line = null,
} = {}) {
  const hasLine = line != null && line !== "" && Number.isFinite(Number(line));
  const flat = [];
  for (const group of candidateGroups) {
    const page = Number(group?.page) || 0;
    for (const rects of group?.candidates || []) {
      if (Array.isArray(rects) && rects.length) flat.push({ page, rects });
    }
  }
  if (!flat.length) return null;
  if (hasLine && Number.isFinite(Number(estimateTop))) {
    const best = pickBestRects(
      flat.map((item) => item.rects),
      estimateTop
    );
    return best;
  }
  // No line pin: prefer first candidate on the reported page, else first overall.
  return flat[0].rects;
}

/**
 * PDF / canvas Y for an issue. Prefer scanner line when available so adjacent
 * lines (13, 14, 15) never collapse onto one shared bbox.
 */
export function resolvePdfMarkY({ line, ys = [], bboxY = null, pageHeight = 0 } = {}) {
  const rows = Array.isArray(ys) ? ys : [];
  const lineNum = Number(line);
  const hasLine = Number.isFinite(lineNum) && lineNum >= 1;
  const lineY =
    hasLine && rows.length
      ? rows[Math.min(rows.length, Math.max(1, Math.round(lineNum))) - 1]
      : null;
  const hasBbox = Number.isFinite(Number(bboxY));
  if (lineY != null && Number.isFinite(Number(lineY))) {
    if (!hasBbox) return Number(lineY);
    const bbox = Number(bboxY);
    const tolerance = Math.max(12, (Number(pageHeight) || 0) * 0.02);
    // Shared/coarse bboxes must not override a precise line pin.
    return Math.abs(bbox - Number(lineY)) > tolerance ? Number(lineY) : bbox;
  }
  return hasBbox ? Number(bboxY) : 0;
}

/** Page numbers ordered by distance from the reported page: p, p+1, p-1, p+2, … */
export function pagesByDistance(page, total, maxDistance = Infinity) {
  const count = Math.max(0, Number(total) || 0);
  const start = Math.min(count, Math.max(1, Number(page) || 1));
  const limit = Number.isFinite(Number(maxDistance)) ? Math.max(0, Number(maxDistance)) : count;
  const order = [];
  for (let step = 0; order.length < count; step += 1) {
    if (step > limit || step > count) break;
    const after = start + step;
    const before = start - step;
    if (after <= count && !order.includes(after)) order.push(after);
    if (step && before >= 1 && !order.includes(before)) order.push(before);
  }
  return order;
}

/** Merge per-text-node rectangles into one box per visual line. */
export function mergeLineRects(rects, tolerance = 3) {
  const lines = [];
  (Array.isArray(rects) ? rects : [])
    .filter((rect) => rect && rect.width > 1 && rect.height > 1)
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .forEach((rect) => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - rect.top) <= tolerance) {
        const right = Math.max(last.left + last.width, rect.left + rect.width);
        last.left = Math.min(last.left, rect.left);
        last.width = right - last.left;
        last.height = Math.max(last.height, rect.height);
        return;
      }
      lines.push({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    });
  return lines;
}

/** Collapse nearby text-item tops into one row per visual line, top to bottom. */
export function clusterLineYs(ys, tolerance = 4) {
  const sorted = (Array.isArray(ys) ? ys : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const lines = [];
  sorted.forEach((y) => {
    const last = lines[lines.length - 1];
    if (last != null && Math.abs(y - last) <= tolerance) return;
    lines.push(y);
  });
  return lines;
}
