/**
 * Issue Tracing + XAI — document preview with clickable findings.
 * Reuses ReferenceTracing highlight/scroll logic and IssuesDetectedPanel issue data.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import { normalizeDetectedIssues } from "./IssuesDetectedPanel.jsx";
import { normalizeIssueLocation } from "../../lib/scanMapper.js";

const SEVERITY = {
  minor: {
    label: "Minor",
    tag: "bg-amber-100 text-amber-700 border-amber-200",
    active: "bg-amber-50/90 ring-1 ring-inset ring-amber-300",
  },
  moderate: {
    label: "Moderate",
    tag: "bg-orange-100 text-orange-700 border-orange-200",
    active: "bg-orange-50/90 ring-1 ring-inset ring-orange-300",
  },
  critical: {
    label: "Critical",
    tag: "bg-rose-100 text-rose-700 border-rose-200",
    active: "bg-rose-50/90 ring-1 ring-inset ring-rose-300",
  },
};

function formatLocation(entry) {
  const parts = [];
  if (entry.page != null) parts.push(`Page ${entry.page}`);
  if (entry.line != null) parts.push(`Line ${entry.line}`);
  return parts.length ? parts.join(", ") : "Document";
}

function distinctText(primary, secondary) {
  const a = String(primary || "").trim();
  const b = String(secondary || "").trim();
  if (!b) return "";
  if (!a) return b;
  if (a.toLowerCase() === b.toLowerCase()) return "";
  if (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())) {
    return a.length >= b.length ? "" : b;
  }
  return b;
}

/** One concise XAI block per issue — no repeated finding / why / fix copy. */
function consolidateXai(entry) {
  const finding = String(entry.finding || "").trim() || "Formatting discrepancy detected";
  const why = distinctText(finding, entry.explanation);
  const fix = distinctText(finding, distinctText(why, entry.recommendation));
  const rule = String(entry.section || "").trim();
  return { finding, why, fix, rule };
}

export default function IssueTracingSection({
  result,
  file = null,
  documentLoading = false,
}) {
  const [activeIssueId, setActiveIssueId] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const openedOnRef = useRef("");

  const formatChecks = result?.formatChecks || [];
  const pageCount = result?.pageCount || 0;
  const paginationNote = result?.pagination?.note || "";

  const { entries, hiddenLocations } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCount),
    [formatChecks, pageCount]
  );

  const resolveLocation = useCallback(
    (entry) => {
      if (entry.location) {
        const own = normalizeIssueLocation(entry.location);
        if (
          own.page != null ||
          own.line != null ||
          own.bbox ||
          own.excerpt ||
          own.margin_side ||
          own.page_region
        ) {
          return own;
        }
      }
      for (const check of formatChecks) {
        // Match the same rule — do not reuse another category's highlight at the same page/line.
        if (entry.issue_type && check.issue_type && entry.issue_type !== check.issue_type) continue;
        if (entry.section && check.section && entry.section !== check.section) continue;
        for (const loc of check.locations || []) {
          const samePage = loc.page === entry.page;
          const sameLine =
            entry.line == null
              ? loc.line == null || loc.line === undefined
              : loc.line === entry.line;
          if (samePage && sameLine) {
            return loc;
          }
        }
      }
      return normalizeIssueLocation({
        page: entry.page,
        line: entry.line,
        section: entry.section,
        margin_side: entry.margin_side,
        page_region: entry.page_region,
      });
    },
    [formatChecks]
  );

  const onSelectIssue = useCallback(
    (entry) => {
      const loc = resolveLocation(entry);
      // Pin only when we have a real page — never invent page 1 from a missing pin.
      const canLocate =
        loc.page != null &&
        (loc.line != null ||
          loc.bbox ||
          loc.excerpt ||
          loc.margin_side ||
          loc.page_region ||
          entry.section);
      setActiveIssueId(entry.id);
      const marked = {
        ...loc,
        severity: entry.severity,
        finding: entry.finding || entry.title || "",
        explanation: entry.explanation || loc.explanation || "",
        recommendation: entry.recommendation || loc.recommendation || "",
        section: entry.section || loc.section,
        issue_type: entry.issue_type || "",
        margin_side: loc.margin_side || loc.marginSide || "",
        page_region: loc.page_region || loc.pageRegion || "",
      };
      setHighlight({ id: entry.id, ...marked });
      if (canLocate) {
        setScrollTarget({ ...marked, token: Date.now() });
      } else {
        setScrollTarget(null);
      }
    },
    [resolveLocation]
  );

  useEffect(() => {
    const first = entries[0];
    if (!first || openedOnRef.current === first.id) return;
    openedOnRef.current = first.id;
    onSelectIssue(first);
  }, [entries, onSelectIssue]);

  const hasPreview = Boolean(
    file || documentLoading || result?.cloudinaryUrl || result?.documentPreview
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-[#f8fffd] px-5 py-3">
        <h3 className="text-sm font-bold text-slate-800">Issue tracing &amp; XAI</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          Select an issue to highlight it in the manuscript. Each card includes location, why it was
          flagged, the formatting rule, and the recommended fix.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </p>
        {paginationNote ? (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{paginationNote}</p>
        ) : null}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="min-h-[20rem] border-b border-slate-100 bg-[#e8ecf1] p-3 lg:border-b-0 lg:border-r">
          {hasPreview ? (
            <DocumentPagePreview
              file={file}
              loading={documentLoading}
              documentUrl={result?.cloudinaryUrl || ""}
              documentName={result?.documentName || ""}
              preview={result?.documentPreview}
              scrollTarget={scrollTarget}
              highlight={highlight}
              emptyLabel="Preview unavailable for this version."
              paged
            />
          ) : (
            <div className="grid h-full min-h-[16rem] place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 text-center text-sm text-slate-500">
              Document preview will appear when the manuscript file or document URL is available.
            </div>
          )}
        </div>

        <aside className="flex max-h-[min(42rem,78vh)] flex-col bg-white">
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">
              {entries.length} issue{entries.length === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-slate-500">
              Click to jump to the matching page and line when location data is available.
            </p>
          </div>

          <ul className="pp-scroll min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {entries.map((entry) => {
              const active = entry.id === activeIssueId;
              const tone = SEVERITY[entry.severity] || SEVERITY.minor;
              const xai = consolidateXai(entry);
              const loc = resolveLocation(entry);
              const canLocate = loc.page != null || loc.line != null || loc.bbox || loc.excerpt;

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSelectIssue(entry)}
                    className={`w-full px-4 py-3.5 text-left transition ${
                      active ? tone.active : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#16bfa8]">
                        {formatLocation(entry)}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.tag}`}
                      >
                        {tone.label}
                      </span>
                      {!canLocate ? (
                        <span className="text-[10px] font-semibold text-slate-400">
                          Location unavailable
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-slate-800">{xai.finding}</p>

                    {xai.rule ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-600">Rule · </span>
                        {xai.rule}
                      </p>
                    ) : null}

                    {xai.why ? (
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-700">Why · </span>
                        {xai.why}
                      </p>
                    ) : null}

                    {xai.fix ? (
                      <p className="mt-2 rounded-lg border border-[#16bfa8]/25 bg-[#f0fdfb] px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-[#0d7a6a]">
                        <span className="font-bold">Fix · </span>
                        {xai.fix}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}

            {!entries.length ? (
              <li className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">No formatting issues detected</p>
                <p className="mt-1 text-xs text-slate-400">
                  All formatting checks passed against the confirmed mechanics.
                </p>
              </li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
