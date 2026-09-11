/**
 * IssuesDetectedPanel
 *
 * Shows every detected formatting issue with an explicit "Page X, Line Y"
 * location label.  Lines are per-page (the PDF parser resets line_index per
 * page; DOCX uses document-level lines when page info is unavailable).
 *
 * Severity pills are clickable filters.
 */

import { useEffect, useMemo, useState } from "react";

// ── Severity config ──────────────────────────────────────────────────────────

const SEVERITY = {
  minor: {
    label: "Minor",
    pill: "bg-amber-100 text-amber-800 border-amber-200",
    pillActive: "bg-amber-200 text-amber-900 border-amber-400 ring-2 ring-amber-300/70",
    badge: "bg-amber-400 text-white",
    border: "border-l-amber-400",
    rowBg: "bg-amber-50/40",
    text: "text-amber-700",
    tag: "bg-amber-100 text-amber-700 border-amber-200",
    iconBg: "bg-amber-100 text-amber-600",
  },
  moderate: {
    label: "Moderate",
    pill: "bg-orange-100 text-orange-800 border-orange-200",
    pillActive: "bg-orange-200 text-orange-900 border-orange-400 ring-2 ring-orange-300/70",
    badge: "bg-orange-500 text-white",
    border: "border-l-orange-400",
    rowBg: "bg-orange-50/40",
    text: "text-orange-700",
    tag: "bg-orange-100 text-orange-700 border-orange-200",
    iconBg: "bg-orange-100 text-orange-600",
  },
  critical: {
    label: "Critical",
    pill: "bg-rose-100 text-rose-800 border-rose-200",
    pillActive: "bg-rose-200 text-rose-900 border-rose-400 ring-2 ring-rose-300/70",
    badge: "bg-rose-500 text-white",
    border: "border-l-rose-500",
    rowBg: "bg-rose-50/40",
    text: "text-rose-700",
    tag: "bg-rose-100 text-rose-700 border-rose-200",
    iconBg: "bg-rose-100 text-rose-600",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSeverity(raw, result) {
  const v = String(raw || "").toLowerCase();
  if (v === "critical" || v === "major") return "critical";
  if (v === "moderate" || v === "warning") return "moderate";
  if (v === "minor") return "minor";
  if (result === "FAIL") return "critical";
  if (result === "REVIEW") return "moderate";
  return "minor";
}

function severityRank(s) {
  return s === "critical" ? 3 : s === "moderate" ? 2 : 1;
}

function worstSeverity(list) {
  return list.reduce(
    (best, item) => (severityRank(item.severity) > severityRank(best) ? item.severity : best),
    "minor"
  );
}

/**
 * Expand formatChecks into flat location entries.
 * Each entry = one {page, line} pair  +  the issue details.
 * If a check has no location info, it gets a document-level entry (page=null, line=null).
 */
export function normalizeDetectedIssues(formatChecks = [], pageCountHint = 0) {
  const entries = [];
  let maxPage = Math.max(0, Number(pageCountHint) || 0);

  formatChecks.forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const rawLocs = Array.isArray(check.locations) && check.locations.length
      ? check.locations
      : [{ page: null, line: null, section: check.section || "General" }];

    rawLocs.forEach((loc, locIdx) => {
      const page = loc?.page == null || loc.page === "" ? null : Number(loc.page);
      const line = loc?.line == null || loc.line === "" ? null : Number(loc.line);
      if (page != null && !Number.isNaN(page)) maxPage = Math.max(maxPage, page);
      entries.push({
        id: `${check.id || check.issue_type || "chk"}-${checkIdx}-${locIdx}`,
        page,
        line: line != null && !Number.isNaN(line) ? line : null,
        section: loc?.section || check.section || "General",
        severity,
        title: check.name || check.title || check.issue_type || "Formatting issue",
        finding:
          check.finding || check.details || check.description || check.name ||
          "Formatting discrepancy detected",
        explanation:
          check.explanation || check.details || check.description ||
          "This formatting rule does not match the confirmed mechanics.",
        recommendation: check.recommendation || "",
        result: check.result,
      });
    });
  });

  // Sort: page asc, line asc, severity desc
  entries.sort((a, b) => {
    const pa = a.page ?? 999999, pb = b.page ?? 999999;
    if (pa !== pb) return pa - pb;
    const la = a.line ?? 999999, lb = b.line ?? 999999;
    if (la !== lb) return la - lb;
    return severityRank(b.severity) - severityRank(a.severity);
  });

  return {
    entries,
    pageCount: maxPage,   // real max page found in locations; sidebar only shows pages WITH issues
  };
}

// ── Location badge ────────────────────────────────────────────────────────────

function LocationBadge({ page, line }) {
  const pageStr = page != null ? `Page ${page}` : "Doc";
  const lineStr = line != null ? `, Line ${line}` : "";
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 shadow-sm">
      {pageStr}
      {lineStr && <span className="ml-0.5 text-[#16bfa8]">{lineStr}</span>}
    </span>
  );
}

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity, className = "h-4 w-4" }) {
  if (severity === "minor") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    );
  }
  if (severity === "moderate") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v5m0 3h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v6m0 3h.01" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IssuesDetectedPanel({ formatChecks = [], pageCount: pageCountProp = 0 }) {
  // ── State (must come before any useMemo that references these) ────────────
  const [severityFilter, setSeverityFilter] = useState(null);
  const [selectedPage, setSelectedPage] = useState("all");
  const [reviewed, setReviewed] = useState(() => new Set());
  const [expandedXai, setExpandedXai] = useState(() => new Set());

  // ── Derived data ──────────────────────────────────────────────────────────
  const { entries, pageCount } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCountProp),
    [formatChecks, pageCountProp]
  );

  const counts = useMemo(() => {
    const c = { minor: 0, moderate: 0, critical: 0 };
    entries.forEach((e) => { c[e.severity] = (c[e.severity] || 0) + 1; });
    return c;
  }, [entries]);

  // Only pages that actually have at least one issue (respects active severity filter).
  // A 200-page thesis with issues on pp. 3, 47, 89 shows only those 3 pages.
  const pages = useMemo(() => {
    const sourceEntries = severityFilter
      ? entries.filter((e) => e.severity === severityFilter)
      : entries;
    return [
      ...new Set(sourceEntries.map((e) => e.page).filter((p) => p != null)),
    ].sort((a, b) => a - b);
  }, [entries, severityFilter]);

  // Reset when new scan arrives
  useEffect(() => {
    setSeverityFilter(null);
    setSelectedPage("all");
    setReviewed(new Set());
    setExpandedXai(new Set());
  }, [formatChecks]);

  // When filter changes, jump to All so results are visible
  useEffect(() => {
    if (severityFilter) setSelectedPage("all");
  }, [severityFilter]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (severityFilter) list = list.filter((e) => e.severity === severityFilter);
    if (selectedPage !== "all") {
      const n = Number(selectedPage);
      list = list.filter((e) => e.page === n);
    }
    return list;
  }, [entries, severityFilter, selectedPage]);

  const entriesByPage = useMemo(() => {
    const map = new Map();
    const filtered = severityFilter ? entries.filter((e) => e.severity === severityFilter) : entries;
    filtered.forEach((e) => {
      const key = e.page ?? "all";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries, severityFilter]);

  const isReviewed = reviewed.has(String(selectedPage));

  function toggleReviewed() {
    setReviewed((prev) => {
      const next = new Set(prev);
      const key = String(selectedPage);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleXai(id) {
    setExpandedXai((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSeverity(key) {
    setSeverityFilter((cur) => (cur === key ? null : key));
  }

  const totalVisible = severityFilter ? counts[severityFilter] : entries.length;

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-700">No formatting issues detected</p>
        <p className="mt-1 text-xs text-slate-400">
          All formatting checks passed against the confirmed mechanics.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

      {/* ── Severity filter pills ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
        {[["minor", counts.minor], ["moderate", counts.moderate], ["critical", counts.critical]].map(
          ([key, count]) => {
            const s = SEVERITY[key];
            const active = severityFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSeverity(key)}
                aria-pressed={active}
                title={active ? `Clear ${s.label} filter` : `Show only ${key} issues`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${
                  active ? s.pillActive : s.pill
                } ${count === 0 ? "opacity-40" : ""}`}
              >
                <SeverityIcon severity={key} className="h-3.5 w-3.5" />
                {count} {s.label}
              </button>
            );
          }
        )}
        {severityFilter ? (
          <button
            type="button"
            onClick={() => setSeverityFilter(null)}
            className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Clear filter ×
          </button>
        ) : (
          <p className="ml-auto hidden text-[11px] text-slate-400 sm:block">
            Click a severity to filter · checked page by page · line by line
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">

        {/* ── Pages sidebar — only pages with issues are listed ────────── */}
        <aside className="border-b border-slate-100 bg-[#fafbfc] lg:border-b-0 lg:border-r">
          <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Pages with issues
          </p>
          <nav className="space-y-0.5 px-2 pb-3" aria-label="Issue pages">

            {/* All-issues summary row */}
            <button
              type="button"
              onClick={() => setSelectedPage("all")}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                selectedPage === "all"
                  ? "bg-slate-200/80 font-bold text-slate-800"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="font-medium">All issues</span>
              {totalVisible > 0 && (
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                    severityFilter
                      ? SEVERITY[severityFilter].badge
                      : SEVERITY[worstSeverity(entries)].badge
                  }`}
                >
                  {totalVisible}
                </span>
              )}
            </button>

            {/* Only pages that have at least one issue */}
            {pages.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No page-level issues.</p>
            )}
            {pages.map((page) => {
              const pageEntries = entriesByPage.get(page) || [];
              const count = pageEntries.length;
              const active = selectedPage === page;
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => setSelectedPage(page)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "bg-slate-200/80 font-bold text-slate-800"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Page {page}</span>
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                      SEVERITY[worstSeverity(pageEntries)].badge
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main findings pane ─────────────────────────────────────────── */}
        <section className="min-w-0 p-5 md:p-6">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {selectedPage === "all"
                  ? severityFilter
                    ? `All ${SEVERITY[severityFilter].label} issues`
                    : "All pages"
                  : `Page ${selectedPage}`}
                <span className="ml-1 font-normal text-slate-400">
                  · {visibleEntries.length} issue{visibleEntries.length !== 1 ? "s" : ""}
                </span>
              </h3>
              {isReviewed && (
                <p className="mt-0.5 text-[11px] font-semibold text-emerald-600">✓ Marked as reviewed</p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleReviewed}
              className="shrink-0 text-sm font-semibold text-[#16bfa8] underline-offset-2 hover:underline"
            >
              {isReviewed ? "Undo reviewed" : "Mark reviewed"}
            </button>
          </div>

          {visibleEntries.length === 0 ? (
            <p className="mt-8 text-sm text-slate-400">No issues found here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleEntries.map((entry) => {
                const s = SEVERITY[entry.severity] || SEVERITY.minor;
                const xaiOpen = expandedXai.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 ${s.border} ${s.rowBg} transition`}
                  >
                    {/* Location + issue row */}
                    <button
                      type="button"
                      onClick={() => toggleXai(entry.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left"
                      aria-expanded={xaiOpen}
                    >
                      {/* Location badge */}
                      <LocationBadge page={entry.page} line={entry.line} />

                      {/* Issue text */}
                      <p className="min-w-0 flex-1 pt-0.5 text-sm font-semibold text-slate-700">
                        {entry.finding}
                      </p>

                      {/* Severity tag + expand chevron */}
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`hidden rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline-block ${s.tag}`}
                        >
                          {s.label}
                        </span>
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${xaiOpen ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </button>

                    {/* XAI explanation — collapsible */}
                    {xaiOpen && (
                      <div className="border-t border-slate-200/80 bg-white px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                          XAI explanation
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          {entry.explanation}
                        </p>
                        {entry.recommendation && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#16bfa8]/30 bg-[#f0fdfb] px-3 py-2">
                            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[#16bfa8]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs font-medium text-[#0d7a6a]">
                              {entry.recommendation}
                            </p>
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-slate-400">
                          {entry.page != null ? `Page ${entry.page}` : "Document-level"}
                          {entry.line != null ? `, Line ${entry.line}` : ""}
                          {entry.section ? ` · ${entry.section}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
