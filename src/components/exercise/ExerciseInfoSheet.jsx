import React, { useEffect, useState } from "react";
import BodyMap from "../BodyMap.jsx";
import { A, S1, S2, BD, TX, SB, MT, RED } from "../templates/tokens.js";
import { MUSCLE_GROUPS, GROUP_LABEL, EQUIPMENT_LABEL, alsoWorks, lastSessions } from "../../lib/exerciseLibrary.js";
import { reportWrongMuscle } from "../../lib/muscleReports.js";
import { useBackHandler } from "../../lib/backStack";

const TX2 = "#B0B0B0";
const MU = "#8A8A8A";
const HELPER = "#5E7310";
const TYPE_LABEL = { strength: "Strength", power: "Olympic & strongman", plyo: "Jumps & drills", cardio: "Cardio", stretch: "Stretch" };

const chip = (on, current) => ({
  display: "inline-flex", alignItems: "center", minHeight: "36px", padding: "0 12px", borderRadius: "999px",
  fontSize: "13px", fontWeight: on ? 700 : 600, cursor: current ? "default" : "pointer", fontFamily: "inherit",
  border: `1px ${current ? "dashed" : "solid"} ${on ? A : current ? HELPER : BD}`,
  background: on ? A : current ? "transparent" : S2, color: on ? "#000" : TX2,
});
const label = { fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MU };

/**
 * Exercise details: muscle diagram, how-to steps, the person's last sessions, and a
 * "Wrong muscle?" report. `entry` comes from the exercise library. `history` is the
 * app's workout history (optional). Rendered above the exercise picker (zIndex 1100).
 */
export default function ExerciseInfoSheet({ entry, history, units = "imperial", onClose, onAdd }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState("info"); // info | report | sent
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

  useEffect(() => {
    // Slide in on the next frame; the timer covers webviews that pause animation frames.
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => setVisible(true), 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);
  const close = () => { setVisible(false); setTimeout(onClose, 200); };
  useBackHandler(true, () => (mode === "report" ? setMode("info") : close()));

  if (!entry) return null;
  const sessions = lastSessions(history, [entry.name, entry.sourceName], 3);
  const unit = units === "metric" ? "kg" : "lb";
  const helpersText = alsoWorks(entry, 4);

  const send = async () => {
    if (!pick || sending) return;
    setSending(true); setError("");
    try {
      await reportWrongMuscle({ exerciseRef: entry.id, suggested: pick, note });
      setMode("sent");
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center",
        background: visible ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0)", transition: "background 0.2s ease" }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        onClick={(e) => e.stopPropagation()}
        style={{ background: S1, width: isDesktop ? "520px" : "100%", maxHeight: isDesktop ? "86vh" : "92vh", overflowY: "auto",
          borderRadius: isDesktop ? "20px" : "22px 22px 0 0", border: `1px solid ${BD}`, boxSizing: "border-box",
          padding: "12px 18px calc(24px + env(safe-area-inset-bottom, 0px))",
          transform: visible ? "translateY(0)" : "translateY(100%)", opacity: visible ? 1 : 0,
          transition: "transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease", display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {!isDesktop && <div style={{ width: "40px", height: "5px", background: MT, borderRadius: "3px", margin: "0 auto" }} />}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", color: TX }}>{entry.name}</h2>
            <span style={{ fontSize: "14px", color: MU }}>
              {[GROUP_LABEL[entry.group], EQUIPMENT_LABEL[entry.equipment], TYPE_LABEL[entry.type]].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button type="button" onClick={close} aria-label="Close" style={{ width: "44px", height: "44px", marginRight: "-8px", background: "none", border: "none", color: MU, cursor: "pointer", fontSize: "22px" }}>×</button>
        </div>

        {mode === "info" && (
          <>
            <div style={{ background: "#0C0C0C", border: `1px solid ${BD}`, borderRadius: "14px", padding: "14px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
                <BodyMap view="front" main={[entry.group]} helpers={entry.helperGroups} width={112} />
                <BodyMap view="back" main={[entry.group]} helpers={entry.helperGroups} width={112} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "16px", fontSize: "13px", color: TX2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "12px", height: "12px", borderRadius: "3px", background: A }} />Main muscle</span>
                {entry.helperGroups.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "12px", height: "12px", borderRadius: "3px", background: HELPER }} />Also works</span>}
              </div>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.45, color: TX2, textAlign: "center" }}>
                Main: {GROUP_LABEL[entry.group].toLowerCase()}.{helpersText ? ` ${helpersText}.` : ""}
              </p>
              <div style={{ display: "flex", justifyContent: "center", borderTop: `1px solid ${BD}`, paddingTop: "4px" }}>
                <button type="button" onClick={() => { setMode("report"); setPick(""); setError(""); }}
                  style={{ minHeight: "44px", background: "none", border: "none", color: TX2, fontSize: "14px", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px", cursor: "pointer", fontFamily: "inherit" }}>
                  Wrong muscle?
                </button>
              </div>
            </div>

            {entry.instructions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={label}>How to do it</span>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {entry.instructions.map((step, i) => (
                    <li key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: S2, border: `1px solid ${BD}`, color: TX, fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: "15px", lineHeight: 1.45, color: TX2, paddingTop: "2px" }}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {sessions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: "4px" }}>
                  <span style={label}>Your last {sessions.length === 1 ? "time" : `${sessions.length} times`}</span>
                  <span style={{ fontSize: "12px", color: MU }}>{unit} × reps</span>
                </div>
                {sessions.map((s) => (
                  <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "44px", borderTop: `1px solid ${BD}` }}>
                    <span style={{ fontSize: "14px", color: TX2 }}>{s.date}</span>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: TX, fontVariantNumeric: "tabular-nums" }}>{s.text}</span>
                  </div>
                ))}
              </div>
            )}

            {onAdd && (
              <button type="button" onClick={() => { onAdd(entry.name); close(); }}
                style={{ minHeight: "48px", borderRadius: "10px", border: "none", background: A, color: "#000", fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Add to workout
              </button>
            )}
          </>
        )}

        {mode === "report" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "18px", fontWeight: 700, color: TX }}>Which muscle does it mainly work?</span>
              <span style={{ fontSize: "14px", lineHeight: 1.45, color: TX2 }}>
                It's listed as <b style={{ color: TX }}>{GROUP_LABEL[entry.group].toLowerCase()}</b>. Tap the muscle you think is right.
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
              <BodyMap view="front" main={pick ? [pick] : []} helpers={[entry.group]} width={96} onToggle={(g) => g !== entry.group && setPick(g)} />
              <BodyMap view="back" main={pick ? [pick] : []} helpers={[entry.group]} width={96} onToggle={(g) => g !== entry.group && setPick(g)} />
            </div>
            <div role="radiogroup" aria-label="Main muscle" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {MUSCLE_GROUPS.map((g) => {
                const current = g.id === entry.group;
                return (
                  <button key={g.id} type="button" role="radio" aria-checked={pick === g.id} disabled={current}
                    onClick={() => setPick(g.id)} style={chip(pick === g.id, current)}>
                    {g.label}{current ? " (listed)" : ""}
                  </button>
                );
              })}
            </div>
            <label htmlFor="wrong-muscle-note" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: TX2 }}>Why? (optional)</span>
              <input id="wrong-muscle-note" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. I feel it most in my triceps"
                style={{ minHeight: "44px", boxSizing: "border-box", padding: "0 12px", background: S2, border: `1px solid ${BD}`, borderRadius: "10px", color: TX, fontSize: "16px", fontFamily: "inherit" }} />
            </label>
            {error && <p role="alert" style={{ margin: 0, fontSize: "14px", color: RED }}>{error}</p>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setMode("info")}
                style={{ minHeight: "48px", padding: "0 18px", borderRadius: "10px", border: `1px solid ${MT}`, background: "none", color: TX, fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button type="button" onClick={send} disabled={!pick || sending}
                style={{ flex: 1, minHeight: "48px", borderRadius: "10px", border: pick ? "none" : `1px solid ${MT}`, background: pick ? A : S2, color: pick ? "#000" : SB,
                  fontSize: "15px", fontWeight: 700, cursor: pick ? "pointer" : "default", fontFamily: "inherit", opacity: sending ? 0.6 : 1 }}>
                {sending ? "Sending…" : pick ? "Send report" : "Pick a muscle"}
              </button>
            </div>
          </>
        )}

        {mode === "sent" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "8px 0" }}>
            <span aria-hidden="true" style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(200,255,0,0.14)", color: A, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: "20px", fontWeight: 700, color: TX }}>Thanks. Report sent.</span>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, color: TX2 }}>
              You said <b style={{ color: TX }}>{GROUP_LABEL[pick]?.toLowerCase()}</b>. We'll look into it and fix this exercise if it's wrong.
            </p>
            <button type="button" onClick={() => setMode("info")}
              style={{ minHeight: "48px", borderRadius: "10px", border: "none", background: A, color: "#000", fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Back to exercise</button>
          </div>
        )}
      </section>
    </div>
  );
}
