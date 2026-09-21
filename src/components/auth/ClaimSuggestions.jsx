import React from "react";
import "./signin.css";
import { supabase } from "../../lib/supabase.ts";

const dismissKey = (uid) => `theryn_claim_dismissed_${uid}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Decision 0007, door 2: someone signs in with a verified email that a coach
 * typed on a name-only client. Offer the history; nothing moves until they say yes.
 */
export default function ClaimSuggestions({ userId }) {
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!userId) return;
    let live = true;
    let dismissed = [];
    try { dismissed = JSON.parse(localStorage.getItem(dismissKey(userId)) || "[]"); } catch {}
    supabase.rpc("claim_suggestions").then(({ data }) => {
      if (live && Array.isArray(data)) setItems(data.filter((x) => !dismissed.includes(x.manual_client_id)));
    }, () => {});
    return () => { live = false; };
  }, [userId]);

  const current = items[0];
  if (!current && !done) return null;

  const next = () => { setItems((xs) => xs.slice(1)); setError(null); };
  const notNow = () => {
    try {
      const list = JSON.parse(localStorage.getItem(dismissKey(userId)) || "[]");
      localStorage.setItem(dismissKey(userId), JSON.stringify([...new Set([...list, current.manual_client_id])]));
    } catch {}
    next();
  };
  async function claim() {
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc("claim_by_email", { p_manual_client_id: current.manual_client_id });
    setBusy(false);
    if (error || !data?.ok) { setError(data?.reason === "claimed_by_other" ? "This history is already saved to another account." : "Couldn't bring it in. Try again in a minute."); return; }
    setDone({ coach: data.coach_name || current.coach_name, workouts: data.workouts, measurements: data.measurements });
    next();
  }

  return (
    <div className="si-overlay">
      <div className="si-sheet" role="dialog" aria-modal="true" aria-label="Your saved history">
        <div className="si-panel">
          {done && !current ? (
            <>
              <h2 className="si-title">It's in your account.</h2>
              <p className="si-sub">{plural(done.workouts, "workout", "workouts")} and {plural(done.measurements, "measurement check-in", "measurement check-ins")} from Coach {done.coach} are saved to your account. Your coach still sees everything as before.</p>
              <button type="button" className="si-btn si-primary" onClick={() => setDone(null)}>Done</button>
            </>
          ) : (
            <>
              <h2 className="si-title">Coach {current.coach_name} saved your history.</h2>
              <p className="si-sub">
                {current.workouts || current.measurements
                  ? `${plural(current.workouts, "workout", "workouts")} and ${plural(current.measurements, "measurement check-in", "measurement check-ins")} are waiting for ${current.first_name || "you"}. `
                  : `Coach ${current.coach_name} added ${current.first_name || "you"} with this email. `}
                Bring them into your account? Your coach still sees everything as before.
              </p>
              <button type="button" className="si-btn si-primary" onClick={claim} disabled={busy}>{busy ? "Bringing it in…" : "Bring it in"}</button>
              <button type="button" className="si-btn" onClick={notNow} disabled={busy}>Not now</button>
              <p className="si-fine">Not you? Choose Not now. Nothing moves unless you say yes.</p>
              {error && <div className="si-error" role="alert">{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
