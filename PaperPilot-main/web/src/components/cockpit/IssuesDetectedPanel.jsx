/**
 * IssuesDetectedPanel
 *
 * Lists every detected formatting issue in one place so authors can fix them
 * together. Severity pills are optional filters — default view is ALL issues.
 */

import { useEffect, useMemo, useState } from "react";

const SEVERITY = {
  minor: {
    label: "Minor",
    pill: "bg-amber-100 text-amber-800 border-amber-200",
    pillActive: "bg-amber-200 text-amber-900 border-amber-400 ring-2 ring-amber-300/70",
    badge: "bg-amber-400 text-white",
    border: "border-l-amber-400",
    rowBg: "bg-amber-50/40",
    tag: "bg-amber-100 text-amber-700 border-amber-200",
  },
  moderate: {
    label: "Moderate",
    pill: "bg-orange-100 text-orange-800 border-orange-200",
    pillActive: "bg-orange-200 text-orange-900 border-orange-400 ring-2 ring-orange-300/70",
    badge: "bg-orange-500 text-white",
    border: "border-l-orange-400",
    rowBg: "bg-orange-50/40",
    tag: "bg-orange-100 text-orange-700 border-orange-200",
  },
  critical: {
    label: "Critical",
    pill: "bg-rose-100 text-rose-800 border-rose-200",
    pillActive: "bg-rose-200 text-rose-900 border-rose-400 ring-2 ring-rose-300/70",
    badge: "bg-rose-500 text-white",
    border: "border-l-rose-500",
    rowBg: "bg-rose-50/40",
    tag: "bg-rose-100 text-rose-700 border-rose-200",
  },
};

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

export function normalizeDetectedIssues(formatChecks = [], pageCountHint = 0) {
  const entries = [];
  let maxPage = Math.max(0, Number(pageCountHint) || 0);
  let hiddenLocations = 0;

  formatChecks.forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const rawLocs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ page: null, line: null, section: check.section || "General" }];
    const reported = Number(check.count);
    if (Number.isFinite(reported) && reported > rawLocs.length) {
      hiddenLocations += reported - rawLocs.length;
    }

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
        finding:
          check.finding ||
          check.details ||
          check.description ||
          check.name ||
          "Formatting discrepancy detected",
        explanation:
          check.explanation ||
          check.details ||
          check.description ||
          "This formatting rule does not match the confirmed mechanics.",
        recommendation: check.recommendation || "",
        result: check.result,
      });
    });
  });

  entries.sort((a, b) => {
    const pa = a.page ?? 999999;
    const pb = b.page ?? 999999;
    if (pa !== pb) return pa - pb;
    const la = a.line ?? 999999;
    const lb = b.line ?? 999999;
    if (la !== lb) return la - lb;
    return severityRank(b.severity) - severityRank(a.severity);
  });

  return { entries, pageCount: maxPage, hiddenLocations };
}

function LocationBadge({ page, line }) {
  const pageStr = page != null ? `Page ${page}` : "Doc";
  const lineStr = line != null ? `, Line ${line}` : "";
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 shadow-sm">
      {pageStr}
      {lineStr ? <span className="ml-0.5 text-[#16bfa8]">{lineStr}</span> : null}
    </span>
  );
}

function SeverityIcon({ severity, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
      />
    </svg>
  );
}

export default function IssuesDetectedPanel({
  formatChecks = [],
  pageCount: pageCountProp = 0,
  pagination = null,
}) {
  const [severityFilter, setSeverityFilter] = useState(null);
  const [selectedPage, setSelectedPage] = useState("all");
  const [reviewed, setReviewed] = useState(() => new Set());

  const { entries, pageCount, hiddenLocations } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCountProp),
    [formatChecks, pageCountProp]
  );

  const counts = useMemo(() => {
    const c = { minor: 0, moderate: 0, critical: 0 };
    entries.forEach((e) => {
      c[e.severity] = (c[e.severity] || 0) + 1;
    });
    return c;
  }, [entries]);

  const pages = useMemo(() => {
    const fromIssues = entries.map((e) => e.page).filter((p) => p != null);
    const total = Math.max(Number(pageCountProp) || 0, pageCount, ...fromIssues, 0);
    if (total > 0) return Array.from({ length: total }, (_, i) => i + 1);
    return [...new Set(fromIssues)].sort((a, b) => a - b);
  }, [entries, pageCount, pageCountProp]);

  useEffect(() => {
    setSeverityFilter(null);
    setSelectedPage("all");
    setReviewed(new Set());
  }, [formatChecks]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (severityFilter) list = list.filter((e) => e.severity === severityFilter);
    if (selectedPage !== "all") {
      const n = Number(selectedPage);
      list = list.filter((e) => e.page === n);
    }
    return list;
  }, [entries, severityFilter, selectedPage]);

  const issueBlocks = useMemo(() => {
    const map = new Map();
    visibleEntries.forEach((entry) => {
      const key = `${entry.page ?? "doc"}`;
      if (!map.has(key)) map.set(key, { key, page: entry.page, items: [] });
      map.get(key).items.push(entry);
    });
    return [...map.values()]
      .map((block) => ({
        ...block,
        severity: worstSeverity(block.items),
        items: [...block.items].sort((a, b) => {
          const lineA = a.line == null ? Number.MAX_SAFE_INTEGER : Number(a.line);
          const lineB = b.line == null ? Number.MAX_SAFE_INTEGER : Number(b.line);
          if (lineA !== lineB) return lineA - lineB;
          return severityRank(b.severity) - severityRank(a.severity);
        }),
      }))
      .sort((a, b) => {
        const pageA = a.page == null ? Number.MAX_SAFE_INTEGER : Number(a.page);
        const pageB = b.page == null ? Number.MAX_SAFE_INTEGER : Number(b.page);
        return pageA - pageB;
      });
  }, [visibleEntries]);

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
  const totalVisible = severityFilter ? counts[severityFilter] : entries.length;
  const paginationNote = pagination?.note || "";

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
      <div className="border-b border-slate-100 bg-[#f8fffd] px-5 py-3">
        <p className="text-sm font-bold text-slate-800">
          All {entries.length} finding{entries.length === 1 ? "" : "s"} listed below
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {counts.critical} critical · {counts.moderate} moderate · {counts.minor} minor.
          Leave severity pills unselected to fix everything together in one pass.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </p>
        {paginationNote ? (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{paginationNote}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
        {[["minor", counts.minor], ["moderate", counts.moderate], ["critical", counts.critical]].map(
          ([key, count]) => {
            const s = SEVERITY[key];
            const active = severityFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSeverityFilter((cur) => (cur === key ? null : key));
                  setSelectedPage("all");
                }}
                aria-pressed={active}
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
            className="text-[11px] font-semibold text-[#0d9488] underline-offset-2 hover:underline"
          >
            Show all issues ×
          </button>
        ) : (
          <p className="ml-auto hidden text-[11px] text-slate-400 sm:block">
            Optional filter only — default is every issue
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="flex max-h-[min(40rem,78vh)] flex-col border-b border-slate-100 bg-[#fafbfc] lg:border-b-0 lg:border-r">
          <p className="shrink-0 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Pages
          </p>
          <nav className="pp-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" aria-label="Issue pages">
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
              {totalVisible > 0 ? (
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                    severityFilter
                      ? SEVERITY[severityFilter].badge
                      : SEVERITY[worstSeverity(entries)].badge
                  }`}
                >
                  {totalVisible}
                </span>
              ) : null}
            </button>
            {pages.map((page) => {
              const pageEntries = entriesByPage.get(page) || [];
              const count = pageEntries.length;
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => setSelectedPage(page)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    selectedPage === page
                      ? "bg-slate-200/80 font-bold text-slate-800"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>Page {page}</span>
                  {count > 0 ? (
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                        SEVERITY[worstSeverity(pageEntries)].badge
                      }`}
                    >
                      {count}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-300">0</span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex max-h-[min(40rem,78vh)] min-w-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-5 pb-0 pt-5 md:px-6 md:pt-6">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {selectedPage === "all"
                  ? severityFilter
                    ? `All ${SEVERITY[severityFilter].label} issues`
                    : "All issues (every severity)"
                  : `Page ${selectedPage}`}
                <span className="ml-1 font-normal text-slate-400">
                  · {visibleEntries.length} issue{visibleEntries.length !== 1 ? "s" : ""}
                </span>
              </h3>
              {isReviewed ? (
                <p className="mt-0.5 text-[11px] font-semibold text-emerald-600">✓ Marked as reviewed</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setReviewed((prev) => {
                  const next = new Set(prev);
                  const key = String(selectedPage);
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                });
              }}
              className="shrink-0 text-sm font-semibold text-[#16bfa8] underline-offset-2 hover:underline"
            >
              {isReviewed ? "Undo reviewed" : "Mark reviewed"}
            </button>
          </div>

          {visibleEntries.length === 0 ? (
            <p className="mt-8 px-5 text-sm text-slate-400 md:px-6">No issues found here.</p>
          ) : (
            <div className="pp-scroll mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5 md:px-6 md:pb-6">
              {issueBlocks.map((block) => {
                const s = SEVERITY[block.severity] || SEVERITY.minor;
                const lines = [
                  ...new Set(block.items.map((item) => item.line).filter((line) => line != null)),
                ].sort((a, b) => a - b);
                return (
                  <div
                    key={block.key}
                    className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 ${s.border} ${s.rowBg}`}
                  >
                    <div className="border-b border-slate-200/70 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <LocationBadge page={block.page} line={lines.length === 1 ? lines[0] : null} />
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.tag}`}
                        >
                          {block.items.length} on this page
                        </span>
                      </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          On each page, line 1 is the first typeable/visible line; numbers restart at 1
                        </p>
                    </div>

                    <ul className="divide-y divide-slate-200/70">
                      {block.items.map((entry) => {
                        const entrySeverity = SEVERITY[entry.severity] || SEVERITY.minor;
                        return (
                          <li key={entry.id} className="bg-white/70 px-4 py-4">
                            <div className="flex flex-wrap items-start gap-3">
                              {entry.line != null ? (
                                <span className="mt-0.5 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-[#0d9488]">
                                  Line {entry.line}
                                </span>
                              ) : (
                                <span className="mt-0.5 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-400">
                                  Page
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${entrySeverity.tag}`}
                                  >
                                    {entrySeverity.label}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-400">
                                    {entry.section}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm font-semibold text-slate-800">{entry.finding}</p>
                                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                  XAI explanation
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                  {entry.explanation}
                                </p>
                                {entry.recommendation ? (
                                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#16bfa8]/30 bg-[#f0fdfb] px-3 py-2">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="mt-0.5 h-4 w-4 shrink-0 text-[#16bfa8]"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      aria-hidden="true"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <p className="text-xs font-medium text-[#0d7a6a]">{entry.recommendation}</p>
                                  </div>
                                ) : null}
                                <p className="mt-2 text-[11px] text-slate-400">
                                  {entry.page != null ? `Page ${entry.page}` : "Document-level"}
                                  {entry.line != null ? `, Line ${entry.line}` : ""}
                                  {entry.section ? ` · ${entry.section}` : ""}
                                </p>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
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
