/**
 * Manuscript preview with issue list — click an issue to scroll and highlight in the document.
 */

import { useCallback, useMemo, useState } from "react";
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
  onBack,
  onViewFullResult,
}) {
  const [activeIssueId, setActiveIssueId] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const [highlight, setHighlight] = useState(null);

  const { entries } = useMemo(
    () => normalizeDetectedIssues(result?.formatChecks || [], result?.pageCount || 0),
    [result]
  );

  const resolveLocation = useCallback(
    (entry) => {
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
      setHighlight({ id: entry.id, ...loc });
      setScrollTarget({ ...loc, token: Date.now() });
    },
    [resolveLocation]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center text-xs font-semibold text-slate-500 transition hover:text-[#172033]"
          >
            ← Back to summary
          </button>
          <h2 className="mt-1 text-lg font-bold text-[#172033]">Reference tracing</h2>
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
            documentUrl={result?.cloudinaryUrl || ""}
            preview={result?.documentPreview}
            scrollTarget={scrollTarget}
            highlight={highlight}
            emptyLabel="Document preview will appear when Cloudinary URL or upload is available."
          />
        </div>

        <aside className="flex max-h-[min(42rem,78vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-[#f8fffd] px-4 py-3">
            <p className="text-sm font-bold text-slate-800">
              {entries.length} issue{entries.length === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-slate-500">Soft red highlight + underline on the matched span.</p>
          </div>
          <ul className="pp-scroll min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {entries.map((entry) => {
              const active = entry.id === activeIssueId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSelectIssue(entry)}
                    className={`w-full px-4 py-3 text-left transition ${
                      active ? "bg-rose-50/90 ring-1 ring-inset ring-rose-200" : "hover:bg-slate-50"
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
