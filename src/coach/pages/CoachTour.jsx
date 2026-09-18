import React from "react";
import { Button, Icon } from "../ui/primitives.jsx";
import { useBackHandler } from "../../lib/backStack.ts";

/**
 * A short "where is what" for a coach who has never seen the dashboard.
 * Each step points at a real element (found by data-tour="…") and says, in
 * plain words, what it is for. If that element is not on screen at this size
 * the card sits in the middle instead. Shown once per coach per device;
 * "Show me around" under the coach's picture plays it again.
 */
export const tourDoneKey = (coachId) => `theryn_coach_tour_done_${coachId}`;
export function isTourDone(coachId) { try { return Boolean(localStorage.getItem(tourDoneKey(coachId))); } catch { return true; } }
export function markTourDone(coachId) { try { localStorage.setItem(tourDoneKey(coachId), new Date().toISOString()); } catch {} }

function steps({ firstName, hasClients }) {
  const you = firstName ? `Hi ${firstName}, this` : "This";
  return [
    { id: "welcome", tag: "Welcome", title: `${you} is your coaching desk.`, body: "Everything about your clients lives here: their plan, what they did, what they've paid. This takes two minutes. Tap Skip any time; you can see it again under your picture at the top." },
    { id: "clients", target: "nav-clients", tag: "Clients", title: "Your people, one row each.", body: "Each row shows their last workout, how this week is going, whether they've paid, and what to do next. Tap a name to open them." },
    hasClients
      ? { id: "row", target: "client-row", tag: "A client's page", title: "Tap a client to see everything about them.", body: "Plan is their week of workouts. Workouts is what they actually did. Body is weight and measurements. Payments is their fee and what they've paid." }
      : { id: "first", target: "add-client", tag: "Start here", title: "Add your first client.", body: "By name if they don't use the app, or with their code if they already have Theryn on their phone." },
    hasClients && { id: "add", target: "add-client", tag: "Add client", title: "Two ways to add someone.", body: "By name if they don't use the app, or with their code if they already have Theryn on their phone." },
    { id: "link", target: "share-link", tag: "Share link", title: "Every client gets their own private link.", body: "They open it on their phone, no app and no password, tick off today's workout, and send measurements when you ask. It's the green Share link button on each client's page." },
    { id: "plans", target: "nav-plans", tag: "Plans", title: "Build a week of workouts once.", body: "Save it as a plan and give it to as many clients as you like. Change it later in one place and everyone gets the update." },
    { id: "payments", target: "nav-payments", tag: "Payments", title: "Who has paid, who is due.", body: "Set each client's fee, record what they pay, and see at a glance who to remind." },
    { id: "messages", target: "nav-messages", tag: "Messages", title: "Chat with clients who have the app.", body: "They get a notification on their phone. Good for form cues and check-ins." },
    { id: "bell", target: "bell", tag: "Notifications", title: "When a client sends something, it lands here.", body: "A finished workout, new measurements. Tap one to see it. Clear all when you're done." },
    { id: "profile", target: "profile", tag: "You", title: "Your name, your currency, and this tour.", body: "Tap your picture to change your name, pick the currency you charge in, sign out, or press Show me around to see this again." },
    { id: "done", tag: "That's it", title: "You know where everything is.", body: hasClients ? "Open a client and build their plan, or share their link so they can start ticking off workouts." : "Start by adding a client and building their plan. If you get stuck, Show me around is under your picture." },
  ].filter(Boolean);
}

function findTarget(name) {
  if (!name) return null;
  const els = [...document.querySelectorAll(`[data-tour="${name}"]`)];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
  }
  return null;
}

export default function CoachTour({ open, onClose, onStep, firstName, hasClients }) {
  const list = React.useMemo(() => steps({ firstName, hasClients }), [firstName, hasClients]);
  const [i, setI] = React.useState(0);
  const [rect, setRect] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const step = list[Math.min(i, list.length - 1)];
  const last = i >= list.length - 1;

  React.useEffect(() => { if (open) setI(0); }, [open]);
  // Let the shell set the stage for a step (e.g. open a client so the Share link button is on screen).
  React.useEffect(() => { if (open) onStep?.(step.id); }, [open, step.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useBackHandler(Boolean(open), () => onClose?.());

  // Measure the target for this step, after it has had a chance to scroll into view.
  React.useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step.target);
    if (el) { try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {} }
    const measure = () => {
      const t = findTarget(step.target);
      if (!t) { setRect(null); return; }
      const r = t.getBoundingClientRect();
      const pad = 6;
      setRect({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
    };
    const id = requestAnimationFrame(measure);
    const t2 = setTimeout(measure, 120);
    return () => { cancelAnimationFrame(id); clearTimeout(t2); };
  }, [open, step, tick]);
  React.useEffect(() => {
    if (!open) return;
    const on = () => setTick((t) => t + 1);
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); last ? onClose?.() : setI((n) => n + 1); }
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, last, onClose]);

  if (!open) return null;

  // Card placement: under the target when there is room, else above it; centred on the target and kept on screen.
  const W = window.innerWidth, H = window.innerHeight;
  const cardW = Math.min(360, W - 24);
  let cardStyle;
  let arrow = null;
  if (rect) {
    const below = rect.y + rect.h + 12;
    const roomBelow = H - below;
    const placeBelow = roomBelow >= 220 || rect.y < 220;
    const left = Math.max(12, Math.min(W - 12 - cardW, rect.x + rect.w / 2 - cardW / 2));
    cardStyle = placeBelow ? { top: below, left, width: cardW } : { bottom: H - rect.y + 12, left, width: cardW };
    arrow = { side: placeBelow ? "top" : "bottom", x: Math.max(18, Math.min(cardW - 18, rect.x + rect.w / 2 - left)) };
  } else {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: cardW };
  }

  return (
    <div className="cx-tour" role="dialog" aria-modal="true" aria-label="Show me around">
      {rect
        ? <div className="cx-tour-spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
        : <div className="cx-tour-dim" />}
      <div className="cx-tour-card" style={cardStyle}>
        {arrow && <span className={`cx-tour-arrow ${arrow.side}`} style={{ left: arrow.x }} />}
        <div className="cx-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span className="cx-tour-tag">{step.tag}</span>
          <button type="button" className="cx-tour-skip" onClick={onClose}>{last ? "Close" : "Skip"}</button>
        </div>
        <div className="cx-tour-title">{step.title}</div>
        <div className="cx-tour-body">{step.body}</div>
        <div className="cx-row" style={{ justifyContent: "space-between", marginTop: 14 }}>
          <span className="cx-tour-dots" aria-label={`Step ${i + 1} of ${list.length}`}>{list.map((s, k) => <i key={s.id} className={k === i ? "on" : k < i ? "done" : ""} />)}</span>
          <span className="cx-row" style={{ gap: 6 }}>
            {i > 0 && <Button size="sm" onClick={() => setI((n) => n - 1)} aria-label="Back"><Icon.Back size={16} /></Button>}
            <Button variant="primary" size="sm" onClick={() => (last ? onClose?.() : setI((n) => n + 1))}>{last ? "Done" : i === 0 ? "Show me" : "Next"}</Button>
          </span>
        </div>
      </div>
    </div>
  );
}
