/**
 * Manuscript preview with issue list — click an issue to scroll and highlight in the document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BackToDashboardButton from "../BackToDashboardButton.jsx";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import { normalizeDetectedIssues } from "./IssuesDetectedPanel.jsx";
import { normalizeIssueLocation } from "../../lib/scanMapper.js";
import { isApproximateTracing } from "../../lib/documentPreviewLocate.js";

function formatLocation(entry) {
  const parts = [];
  if (entry.page != null) parts.push(`Page ${entry.page}`);
  if (entry.line != null) parts.push(`Line ${entry.line}`);
  return parts.length ? parts.join(", ") : "Document";
}

export default function ReferenceTracingView({
  result,
  file = null,
  documentLoading = false,
  onBack,
  onViewFullResult,
}) {
  const [activeIssueId, setActiveIssueId] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const openedOnRef = useRef("");

  const { entries } = useMemo(
    () => normalizeDetectedIssues(result?.formatChecks || [], result?.pageCount || 0),
    [result]
  );
  const approximateTrace = isApproximateTracing(result?.pagination);

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
      for (const check of result?.formatChecks || []) {
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
    [result]
  );

  const onSelectIssue = useCallback(
    (entry) => {
      const loc = resolveLocation(entry);
      setActiveIssueId(entry.id);
      const marked = {
        ...loc,
        severity: entry.severity,
        finding: entry.finding || entry.title || "",
        explanation: entry.explanation || loc.explanation || "",
        recommendation: entry.recommendation || loc.recommendation || "",
        section: entry.section || loc.section,
        issue_type: entry.issue_type || "",
        margin_side: loc.margin_side || loc.marginSide || entry.margin_side || "",
        page_region: loc.page_region || loc.pageRegion || entry.page_region || "",
      };
      setHighlight({ id: entry.id, ...marked });
      // Pin only when we have a real page (or bbox/excerpt on that page) — never invent page 1.
      const canLocate =
        loc.page != null ||
        loc.bbox ||
        loc.excerpt ||
        loc.margin_side ||
        loc.page_region;
      if (canLocate && loc.page != null) {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackToDashboardButton onClick={onBack} label="Back to summary" />
          <h2 className="mt-3 text-lg font-bold text-[#172033]">Reference tracing</h2>
          <p className="text-xs text-slate-500">
            Click an issue to jump to the matching page and line in your document.
          </p>
          {approximateTrace ? (
            <p className="mt-2 max-w-xl rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900">
              Approximate locations — Word page breaks were estimated. For precise tracing, upload a
              PDF of the same manuscript.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onViewFullResult}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
        >
          View Full Result
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#e8ecf1] p-3 shadow-sm">
          <DocumentPagePreview
            file={file}
            loading={documentLoading}
            documentUrl={result?.cloudinaryUrl || ""}
            documentName={result?.documentName || ""}
            preview={result?.documentPreview}
            scrollTarget={scrollTarget}
            highlight={highlight}
            emptyLabel="Document preview will appear when a document URL or upload is available."
            paged
            pageCountHint={result?.pageCount || 0}
          />
        </div>

        <aside className="flex max-h-[min(42rem,78vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-[#f8fffd] px-4 py-3">
            <p className="text-sm font-bold text-slate-800">
              {entries.length} issue{entries.length === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-slate-500">Select an issue to jump to that page.</p>
          </div>
          <ul className="pp-scroll min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {entries.map((entry) => {
              const active = entry.id === activeIssueId;
              const activeTone =
                entry.severity === "critical"
                  ? "bg-rose-50/90 ring-1 ring-inset ring-rose-300"
                  : entry.severity === "moderate"
                    ? "bg-orange-50/90 ring-1 ring-inset ring-orange-300"
                    : "bg-amber-50/90 ring-1 ring-inset ring-amber-300";
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSelectIssue(entry)}
                    className={`w-full px-4 py-3 text-left transition ${
                      active ? activeTone : "hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#16bfa8]">
                      {formatLocation(entry)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{entry.finding}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{entry.section}</p>
                  </button>
                </li>
              );
            })}
            {!entries.length ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">No issues to trace.</li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
