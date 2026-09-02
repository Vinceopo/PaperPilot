import { useMemo, useState } from "react";

const ORDER = { critical: 0, moderate: 1, minor: 2 };
const STYLES = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  moderate: "border-amber-200 bg-amber-50 text-amber-700",
  minor: "border-sky-200 bg-sky-50 text-sky-700",
};

function IssueCard({ issue, premium }) {
  const [open, setOpen] = useState(false);
  const severity = String(issue.severity || "minor").toLowerCase();
  const locations = issue.locations || [];
  const pages = [...new Set(locations.map((location) => location.page).filter(Boolean))];

  return (
    <article className="rounded-xl border border-slate-200 bg-[#fafbfc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STYLES[severity]}`}>
            {severity}
          </span>
          <h4 className="mt-2 font-semibold text-slate-800">{issue.title || issue.summary || issue.issue_type}</h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{issue.summary}</p>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
          {issue.count || locations.length || 1} instance{(issue.count || locations.length) === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Why it was flagged</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{issue.explanation || "The document differs from the selected mechanics."}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">How to fix it</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{issue.recommendation || "Update the formatting to match the selected mechanics."}</p>
        </div>
      </div>

      {pages.length ? (
        <div className="mt-3">
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-medium text-[#16a994] hover:text-[#118c7b]">
            {open ? "Hide" : "Show"} exact locations · page{pages.length === 1 ? "" : "s"} {pages.join(", ")}
          </button>
          {open && (
            <ul className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-500">
              {locations.map((location, index) => (
                <li key={`${location.page}-${location.line}-${index}`}>
                  Page {location.page}, line {location.line || "—"}
                  {location.section ? ` · ${location.section}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {!premium && issue.premium_detail_available ? (
        <p className="mt-3 text-xs text-violet-300">Premium includes deeper AI reasoning for this issue.</p>
      ) : null}
    </article>
  );
}

export default function ScanResults({ result, tier }) {
  const issues = useMemo(
    () => [...(result?.issues || [])].sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3)),
    [result]
  );
  if (!result) return null;
  const sections = result.sections || result.section_checks || [];
  const score = Number(result.formatting_score ?? result.overall_score ?? 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#16bfa8]">Compliance results</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-800">Formatting scan complete</h2>
          <p className="mt-1 text-sm text-slate-400">Issues are grouped and prioritized by impact.</p>
        </div>
        <div className="grid h-24 w-24 place-items-center rounded-full border-8 border-emerald-100 bg-[#f7fcfc]">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{score.toFixed(2)}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">score</p>
          </div>
        </div>
      </div>

      {sections.length ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">Section breakdown</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section, index) => (
              <div key={section.section || section.name || index} className="rounded-xl border border-slate-200 bg-[#fafbfc] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-slate-600">{section.section || section.name}</p>
                  <p className="font-semibold text-emerald-600">{Number(section.formatting_score ?? section.score ?? 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Prioritized issues</h3>
          <span className="text-xs text-slate-500">{issues.length} grouped finding{issues.length === 1 ? "" : "s"}</span>
        </div>
        {issues.length ? (
          <div className="mt-3 space-y-3">
            {issues.map((issue, index) => (
              <IssueCard key={`${issue.severity}-${issue.issue_type}-${index}`} issue={issue} premium={tier === "premium"} />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-200">
            No formatting deviations were detected against the selected mechanics.
          </div>
        )}
      </div>
    </section>
  );
}
