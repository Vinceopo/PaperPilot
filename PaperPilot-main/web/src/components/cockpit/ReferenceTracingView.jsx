/**
 * Manuscript preview with issue list — click an issue to scroll and highlight in the document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import { normalizeDetectedIssues } from "./IssuesDetectedPanel.jsx";
import { normalizeIssueLocation } from "../../lib/scanMapper.js";

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

  const resolveLocation = useCallback(
    (entry) => {
      if (entry.location) {
        const own = normalizeIssueLocation(entry.location);
        if (own.page != null || own.line != null) return own;
      }
      for (const check of result?.formatChecks || []) {
        for (const loc of check.locations || []) {
          // Locations are already normalized by scanMapper.
          if (loc.page === entry.page && (entry.line == null || loc.line === entry.line)) {
            return loc;
          }
        }
      }
      return normalizeIssueLocation({
        page: entry.page,
        line: entry.line,
        section: entry.section,
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
        finding: entry.finding,
        section: entry.section || loc.section,
      };
      setHighlight({ id: entry.id, ...marked });
      setScrollTarget({ ...marked, token: Date.now() });
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
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#16bfa8] bg-white px-3.5 py-2 text-sm font-semibold text-[#109b89] shadow-sm transition hover:bg-[#eefbf8]"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
              <path
                d="M10.5 3.5 6 8l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to summary
          </button>
          <h2 className="mt-3 text-lg font-bold text-[#172033]">Reference tracing</h2>
          <p className="text-xs text-slate-500">
            Click an issue to jump to the matching page and line in your document.
          </p>
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
            emptyLabel="Document preview will appear when Cloudinary URL or upload is available."
            paged
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
