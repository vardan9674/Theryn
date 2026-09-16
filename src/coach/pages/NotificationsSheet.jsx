import React from "react";
import { Sheet, Icon, Avatar, Empty } from "../ui/primitives.jsx";
import { groupByDay } from "../lib/notifications.js";
import { relativeTime } from "../lib/format.js";

/** The bell in the header. */
export function NotificationsButton({ unread, onClick, size }) {
  return (
    <button type="button" className="cx-bell" onClick={onClick} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
      <Icon.Bell size={size || 20} />
      {unread > 0 && <span className="cx-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}

/**
 * The notification centre: workouts ticked off through a link, measurements
 * sent, and workouts logged in the app, newest first. Tapping one opens that
 * client on the right tab. Everything is marked seen when the sheet opens.
 */
export default function NotificationsSheet({ open, onClose, items, loading, onOpenItem }) {
  const groups = React.useMemo(() => groupByDay(items || []), [items]);
  return (
    <Sheet open={open} onClose={onClose} title="Notifications" subtitle="What your clients sent, newest first.">
      {loading && (!items || items.length === 0) ? (
        <div className="cx-col"><span className="cx-skel" style={{ height: 56 }} /><span className="cx-skel" style={{ height: 56 }} /><span className="cx-skel" style={{ height: 56 }} /></div>
      ) : !items || items.length === 0 ? (
        <Empty title="Nothing yet">When a client ticks off a workout or sends measurements, it shows up here.</Empty>
      ) : (
        <div className="cx-col" style={{ gap: 14 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="cx-small cx-muted" style={{ marginBottom: 6, fontWeight: 600 }}>{g.label}</div>
              <div className="cx-card">
                {g.items.map((it) => (
                  <button key={it.id} type="button" className={`cx-notif ${it.unread ? "unread" : ""}`} onClick={() => onOpenItem?.(it)}>
                    <Avatar name={it.clientName} size="sm" />
                    <span className="cx-col" style={{ gap: 2, minWidth: 0, flex: 1, textAlign: "left" }}>
                      <span className="cx-row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: it.unread ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                        <span className="cx-small cx-muted" style={{ flexShrink: 0 }}>{relativeTime(it.at)}</span>
                      </span>
                      <span className="cx-small" style={{ color: "var(--cx-tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.body}</span>
                    </span>
                    {it.unread && <span className="cx-dot" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
