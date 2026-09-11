/**
 * NotificationsScreen — Recent Activity feed matching the Notifications mockup.
 */

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

function NotificationRow({ item, onRead }) {
  return (
    <button
      type="button"
      onClick={() => onRead?.(item.id)}
      className="flex w-full items-start gap-3 border-b border-slate-100 px-5 py-4 text-left transition last:border-0 hover:bg-[#fafbfc]"
    >
      <span className="mt-3.5 w-2 shrink-0">
        {!item.read && (
          <span className="block h-2 w-2 rounded-full bg-[#16bfa8]" aria-label="Unread" />
        )}
      </span>
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
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
      </div>
    </button>
  );
}

function Section({ label, items, onRead }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="bg-[#fbfbfc] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <div>
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} onRead={onRead} />
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
}) {
  const groups = groupNotifications(items);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-[15px] font-bold text-[#1a2333]">Recent Activity</h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unread === 0}
          className="text-xs font-semibold text-[#16bfa8] underline-offset-2 hover:underline disabled:cursor-default disabled:text-slate-300 disabled:no-underline"
        >
          Mark all as read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-sm font-semibold text-slate-600">No notifications yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Scan results, uploads, and subscription updates will show up here.
          </p>
        </div>
      ) : (
        <>
          <Section label="Today" items={groups.today} onRead={onMarkRead} />
          <Section label="Yesterday" items={groups.yesterday} onRead={onMarkRead} />
          <Section label="Earlier" items={groups.earlier} onRead={onMarkRead} />
        </>
      )}
    </section>
  );
}
