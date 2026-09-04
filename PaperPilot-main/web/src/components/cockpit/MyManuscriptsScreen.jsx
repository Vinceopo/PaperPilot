import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Lock,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { manuscriptSummary } from "../../lib/scoreBand.js";
import ManuscriptDetailModal from "./ManuscriptDetailModal.jsx";

const PAGE_SIZE = 8;
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "compliant", label: "Compliant" },
  { id: "needs_revision", label: "Needs Revision" },
  { id: "critical", label: "Critical" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums text-[#0F1729] ${accent || ""}`}>{value}</p>
      {sub ? <p className={`mt-1 text-[11px] font-medium ${sub.className}`}>{sub.text}</p> : null}
    </div>
  );
}

/**
 * My Manuscripts — checker/viewer only (no content editing).
 * Only manuscripts the user has scanned appear here (no demo seed data).
 */
export default function MyManuscriptsScreen({
  items: itemsProp = [],
  onItemsChange,
  tier = "free",
  onUpgrade,
  onUploadNew,
}) {
  const items = Array.isArray(itemsProp) ? itemsProp : [];
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  function setItems(updater) {
    const next = typeof updater === "function" ? updater(items) : updater;
    onItemsChange?.(next);
  }

  const summaries = useMemo(() => items.map(manuscriptSummary), [items]);

  const stats = useMemo(() => {
    const total = summaries.length;
    const underReview = summaries.filter((m) => m.status === "needs_revision").length;
    const compliant = summaries.filter((m) => m.status === "compliant").length;
    const critical = summaries.filter((m) => m.status === "critical").length;
    const addedThisMonth = items.filter((m) => m.createdThisMonth).length;
    return { total, underReview, compliant, critical, addedThisMonth };
  }, [summaries, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summaries.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      return (m.title || "").toLowerCase().includes(q);
    });
  }, [summaries, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const viewing = items.find((m) => m.id === viewId) || null;
  const pendingDelete = items.find((m) => m.id === deleteId) || null;

  function confirmDelete() {
    if (!deleteId) return;
    setItems((prev) => prev.filter((m) => m.id !== deleteId));
    if (viewId === deleteId) setViewId(null);
    setDeleteId(null);
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Manuscripts"
          value={stats.total}
          sub={{
            text: `+${stats.addedThisMonth} this month`,
            className: "text-emerald-600",
          }}
        />
        <StatCard
          label="Under Review"
          value={stats.underReview}
          accent="text-amber-600"
          sub={{ text: "Needs attention", className: "text-amber-600" }}
        />
        <StatCard
          label="Compliant"
          value={stats.compliant}
          accent="text-emerald-600"
          sub={{ text: "≥80 score", className: "text-emerald-600" }}
        />
        <StatCard
          label="Critical Issues"
          value={stats.critical}
          accent="text-rose-600"
          sub={{ text: "Requires fix", className: "text-rose-600" }}
        />
      </div>

      {/* Search + filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search manuscripts..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-[#16bfa8] focus:ring-2 focus:ring-[#16bfa8]/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Filter className="h-3.5 w-3.5" />
              {STATUS_FILTERS.find((f) => f.id === statusFilter)?.label || "All"}
            </button>
            {filterOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close filter" onClick={() => setFilterOpen(false)} />
                <ul className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {STATUS_FILTERS.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`block w-full px-4 py-2 text-left text-xs font-medium ${
                          statusFilter === f.id ? "bg-[#F5F6F8] text-[#0F1729]" : "text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          setStatusFilter(f.id);
                          setFilterOpen(false);
                          setPage(1);
                        }}
                      >
                        {f.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onUploadNew}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F1729] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1E293B]"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload New
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-4 py-3 whitespace-nowrap">Scanned</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                    {items.length === 0
                      ? "No manuscripts yet. Upload and analyse a document to see it here."
                      : "No manuscripts match your search or filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="relative px-5 py-4">
                      <span className={`absolute inset-y-2 left-0 w-1 rounded-r ${row.band.barClass}`} />
                      <p className="font-bold text-[#0F1729]">{row.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {row.institution} · {row.citationStyle}
                        {row.versionCount > 0
                          ? ` · ${row.versionCount} version${row.versionCount === 1 ? "" : "s"} (${row.latestVersionLabel})`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500">{formatDate(row.scannedDate)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${row.band.pillClass}`}>
                        {row.latestScore}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${row.band.pillClass}`}>
                        {row.band.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewId(row.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#0F1729]"
                          aria-label={`View ${row.title}`}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(row.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete ${row.title}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: count, pagination, legend */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-slate-500">
          Showing {pageRows.length} of {filtered.length} manuscripts
          {filtered.length !== items.length ? ` (filtered from ${items.length})` : ""}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-semibold ${
                n === safePage ? "bg-[#0F1729] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Compliant ≥80
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Needs revision 50–79
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Critical &lt;50
          </span>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This system is a checker only. Documents cannot be edited here.
      </p>

      {viewing && (
        <ManuscriptDetailModal
          manuscript={viewing}
          tier={tier}
          onUpgrade={onUpgrade}
          onClose={() => setViewId(null)}
        />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div role="alertdialog" aria-labelledby="del-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="del-title" className="text-base font-bold text-[#0F1729]">
              Delete manuscript?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              “{pendingDelete.title}” and all of its versions will be removed from this list. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
