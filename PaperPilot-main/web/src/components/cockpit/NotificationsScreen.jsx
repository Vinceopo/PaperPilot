/**
 * NotificationsScreen — Recent Activity feed matching the Notifications mockup.
 */

import { useEffect, useState } from "react";
import { groupNotifications, relativeTime } from "../../lib/notifications.js";

function TypeIcon({ type }) {
  const wrap = "grid h-10 w-10 shrink-0 place-items-center rounded-full";
  if (type === "scan_complete") {
    return (
      <span className={`${wrap} bg-emerald-100 text-emerald-600`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    );
  }
  if (type === "scan_fail") {
    return (
      <span className={`${wrap} bg-rose-100 text-rose-500`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  if (type === "scan_review") {
    return (
      <span className={`${wrap} bg-amber-100 text-amber-600`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3 2.5 20h19L12 3Z" />
        </svg>
      </span>
    );
  }
  if (type === "payment") {
    return (
      <span className={`${wrap} bg-teal-100 text-teal-600`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
          <path strokeLinecap="round" d="M2.5 10h19M7 15h3" />
        </svg>
      </span>
    );
  }
  if (type === "password") {
    return (
      <span className={`${wrap} bg-slate-100 text-slate-500`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3" />
          <rect x="5" y="10.5" width="14" height="9" rx="2" />
        </svg>
      </span>
    );
  }
  if (type === "upload") {
    return (
      <span className={`${wrap} bg-slate-100 text-slate-500`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 9.75 12 5.25m0 0 4.5 4.5M12 5.25v12" />
        </svg>
      </span>
    );
  }
  return <span className={`${wrap} bg-slate-100 text-slate-400`}>•</span>;
}

function NotificationRow({ item, open, onToggle, onDelete }) {
  const body = item.body || "";
  const canFold = body.length > 90;
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-[#fafbfc]">
      <span className="mt-3.5 w-2 shrink-0">
        {!item.read && (
          <span className="block h-2 w-2 rounded-full bg-[#16bfa8]" aria-label="Unread" />
        )}
      </span>
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-expanded={open}
      >
        <TypeIcon type={item.type} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <p
              className={`text-[13px] leading-snug ${
                item.read ? "font-medium text-slate-600" : "font-semibold text-[#1a2333]"
              }`}
            >
              {item.title}
            </p>
            <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
          </div>
          <p className={`mt-1 text-xs leading-relaxed text-slate-500 ${open ? "" : "line-clamp-2"}`}>
            {body}
          </p>
          {canFold && (
            <span className="mt-1 inline-block text-[11px] font-semibold text-[#109b89]">
              {open ? "See less" : "See more"}
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        aria-label="Delete notification"
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

function Section({ label, items, openId, onToggle, onDelete }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="bg-[#fbfbfc] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <div>
        {items.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            open={openId === item.id}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export default function NotificationsScreen({
  items = [],
  unread = 0,
  onMarkAllRead,
  onMarkRead,
  onDelete,
}) {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const visible = filter === "unread" ? items.filter((item) => !item.read) : items;
  const previewLimit = 10;
  const listed = showAll ? visible : visible.slice(0, previewLimit);
  const hasMore = visible.length > previewLimit;
  const groups = groupNotifications(listed);

  useEffect(() => {
    setShowAll(false);
  }, [filter]);

  function toggle(id) {
    setOpenId((current) => (current === id ? null : id));
    onMarkRead?.(id);
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-[#1a2333]">Notifications</h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unread === 0}
          className="text-xs font-semibold text-[#109b89] underline-offset-2 hover:underline disabled:cursor-default disabled:text-slate-300 disabled:no-underline"
        >
          Mark all as read
        </button>
      </div>
      <div className="flex gap-2 border-b border-slate-100 px-4 py-2">
        {[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === tab.id ? "bg-[#e7f8f5] text-[#0f766e]" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pp-scroll max-h-[min(32rem,70vh)] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold text-slate-600">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Scan results, uploads, and subscription updates will show up here.
            </p>
          </div>
        ) : (
          <>
            <Section label="New" items={groups.today} openId={openId} onToggle={toggle} onDelete={onDelete} />
            <Section label="Yesterday" items={groups.yesterday} openId={openId} onToggle={toggle} onDelete={onDelete} />
            <Section label="Earlier" items={groups.earlier} openId={openId} onToggle={toggle} onDelete={onDelete} />
          </>
        )}
      </div>
      {hasMore && !showAll ? (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full rounded-lg py-2 text-xs font-semibold text-[#109b89] hover:bg-[#f3fbf9]"
          >
            Show All
          </button>
        </div>
      ) : null}
    </section>
  );
}
