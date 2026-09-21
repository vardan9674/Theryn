import React from "react";
import "../components/auth/signin.css";
import { SignInPanel } from "../components/auth/SignIn.jsx";
import { supabase } from "../lib/supabase.ts";
import { claimLink as realClaim } from "./linkApi.js";
import { Icon } from "../coach/ui/primitives.jsx";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const REASONS = {
  claimed_by_other: "This history is already saved to a different account. Sign in with that one instead.",
  own_client: "You're signed in as the coach. Sign in with the client's own account to save it.",
  app_client: "This link belongs to someone who already has a Theryn account.",
  revoked: "This link has been turned off, so it can't be saved.",
};

/** The card on the link page and on the "Sent" screen. */
export function SaveHistoryCard({ coach, onOpen }) {
  return (
    <div className="lk-card lk-save">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="lk-save-icon"><Icon.Lock size={18} /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <b style={{ fontSize: 16 }}>Save your history to an account</b>
          <span className="lk-small" style={{ lineHeight: 1.45 }}>Keep every workout and measurement you've sent Coach {coach}, even on a new phone. Free, and your coach sees the same as now.</span>
        </div>
      </div>
      <button type="button" className="lk-send secondary" onClick={onOpen}>Save my history</button>
    </div>
  );
}

/**
 * Decision 0007, door 1: the link is the proof. Sign in (Google or an email
 * code), confirm which account, then claim_link copies the history into it.
 * In the dev preview (`api.preview`) nothing touches the backend.
 */
export default function SaveHistorySheet({ token, coach, api, open, onClose, onClaimed }) {
  const preview = Boolean(api?.preview);
  const [session, setSession] = React.useState(undefined); // undefined = checking
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    if (preview) { setSession(api.previewSession ?? null); return; }
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSession(data?.session ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (live) setSession(s ?? null); });
    return () => { live = false; sub?.subscription?.unsubscribe(); };
  }, [open, preview, api]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function claim() {
    setBusy(true); setError(null);
    try {
      const res = await (api?.claimLink || realClaim)(token);
      if (!res?.ok) { setError(REASONS[res?.reason] || "Couldn't save it right now. Try again in a minute."); return; }
      setResult(res);
      onClaimed?.(res);
    } catch (e) {
      setError(/fetch|network/i.test(e.message || "") ? "Couldn't reach Theryn. Check your connection and try again." : "Couldn't save it right now. Try again in a minute.");
    } finally { setBusy(false); }
  }
  async function switchAccount() {
    setError(null);
    if (preview) { setSession(null); return; }
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
  }

  const email = session?.user?.email || "your account";
  return (
    <div className="si-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="si-sheet" role="dialog" aria-modal="true" aria-label="Save your history">
        <button type="button" className="si-close" onClick={onClose} aria-label="Close">×</button>
        {session === undefined ? (
          <div className="si-panel"><p className="si-sub">One moment…</p></div>
        ) : result ? (
          <div className="si-panel">
            <h2 className="si-title">Saved.</h2>
            <p className="si-sub">{result.already
              ? "Your history is already in your Theryn account."
              : `${plural(result.workouts || 0, "workout", "workouts")} and ${plural(result.measurements || 0, "measurement check-in", "measurement check-ins")} are in your account (${email}). New ones save there too.`}</p>
            <p className="si-sub">Keep using this link to tick off your workouts. Coach {coach} sees everything as before.</p>
            <button type="button" className="si-btn si-primary" onClick={onClose}>Done</button>
          </div>
        ) : !session ? (
          <SignInPanel
            title="Save your history"
            subtitle={`Sign in and everything you've sent Coach ${coach} is saved to your account. No password needed.`}
            returnTo={`/f/${token}?claim=1`}
            onSignedIn={(s) => setSession(s)}
          />
        ) : (
          <div className="si-panel">
            <h2 className="si-title">Save to this account?</h2>
            <p className="si-sub">Your workouts and measurements from Coach {coach} will be saved to <b>{email}</b>. Your coach still sees everything as before.</p>
            <button type="button" className="si-btn si-primary" onClick={claim} disabled={busy}>{busy ? "Saving…" : "Save my history"}</button>
            <button type="button" className="si-btn" onClick={switchAccount} disabled={busy}>Use a different account</button>
            {error && <div className="si-error" role="alert">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
