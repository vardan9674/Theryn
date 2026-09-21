import React from "react";
import { Sheet, Icon, Avatar, Empty, Button } from "../ui/primitives.jsx";
import { groupByDay } from "../lib/notifications.js";
import { relativeTime } from "../lib/format.js";
import { getPushState, enablePush, disablePush } from "../../lib/webPush.ts";

/**
 * "Tell me on this device when a client checks in." One line at the top of the
 * centre: a button while off, a quiet line with Turn off while on, and a short
 * why-not when the browser can't or won't.
 */
function PushOptIn({ userId }) {
  const [state, setState] = React.useState(null); // null = checking
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { let live = true; getPushState().then((s) => { if (live) setState(s); }); return () => { live = false; }; }, []);
  if (!state || state === "unsupported") return null;
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { setState(await fn()); } catch (e) { setError(e?.message || "Couldn't change that. Try again."); } finally { setBusy(false); }
  };
  if (state === "on") return (
    <div className="cx-row cx-small cx-muted" style={{ justifyContent: "space-between", gap: 8 }}>
      <span className="cx-row" style={{ gap: 6 }}><Icon.Bell size={14} />Check-in alerts are on for this device.</span>
      <Button size="sm" variant="soft" disabled={busy} onClick={() => run(disablePush)}>Turn off</Button>
    </div>
  );
  return (
    <div className="cx-card cx-card-pad cx-col" style={{ gap: 10 }}>
      <div className="cx-row" style={{ gap: 10, alignItems: "flex-start" }}>
        <Icon.Bell size={20} />
        <div className="cx-col" style={{ gap: 2, flex: 1 }}>
          <b>Know the moment a client checks in</b>
          <span className="cx-small" style={{ color: "var(--cx-tx2)", lineHeight: 1.45 }}>
            {state === "denied"
              ? "Notifications are blocked for theryn.fit. Allow them in your browser's site settings, then come back here."
              : state === "ios-needs-install"
              ? "On iPhone, add Theryn to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn this on."
              : "Get a notification on this device when a client finishes a workout or sends measurements."}
          </span>
        </div>
      </div>
      {state === "off" && <Button variant="primary" disabled={busy} onClick={() => run(() => enablePush(userId))}>{busy ? "Turning on…" : "Turn on alerts"}</Button>}
      {error && <div className="cx-small" style={{ color: "var(--cx-red, #FF5C5C)" }} role="alert">{error}</div>}
    </div>
  );
}

/** The bell in the header. */
export function NotificationsButton({ unread, onClick, size }) {
  return (
    <button type="button" className="cx-bell" data-tour="bell" onClick={onClick} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
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
export default function NotificationsSheet({ open, onClose, items, loading, onOpenItem, onClearAll, onDismiss, pushUserId }) {
  const groups = React.useMemo(() => groupByDay(items || []), [items]);
  return (
    <Sheet open={open} onClose={onClose} title="Notifications" subtitle="What your clients sent, newest first.">
      {pushUserId && <PushOptIn userId={pushUserId} />}
      {items && items.length > 0 && (
        <div className="cx-row" style={{ justifyContent: "flex-end", marginTop: -6 }}>
          <Button size="sm" icon={<Icon.Trash size={14} />} onClick={onClearAll} aria-label="Clear all notifications">Clear all</Button>
        </div>
      )}
      {loading && (!items || items.length === 0) ? (
        <div className="cx-col"><span className="cx-skel" style={{ height: 56 }} /><span className="cx-skel" style={{ height: 56 }} /><span className="cx-skel" style={{ height: 56 }} /></div>
      ) : !items || items.length === 0 ? (
        <Empty title="You're all caught up">When a client ticks off a workout or sends measurements, it shows up here.</Empty>
      ) : (
        <div className="cx-col" style={{ gap: 14 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="cx-small cx-muted" style={{ marginBottom: 6, fontWeight: 600 }}>{g.label}</div>
              <div className="cx-card">
                {g.items.map((it) => (
                  <div key={it.id} className={`cx-notif ${it.unread ? "unread" : ""}`}>
                    <button type="button" className="cx-notif-main" onClick={() => onOpenItem?.(it)}>
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
                    <button type="button" className="cx-notif-x" onClick={() => onDismiss?.(it.id)} aria-label={`Clear: ${it.title}`}><Icon.Close size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
