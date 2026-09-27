import React, { useEffect, useMemo, useRef, useState } from "react";
import BodyMap from "../BodyMap.jsx";
import ExerciseInfoSheet from "./ExerciseInfoSheet.jsx";
import useExerciseLibrary from "./useExerciseLibrary.js";
import useEquipment from "./useEquipment.js";
import { A, S1, S2, BD, TX, SB, MT } from "../templates/tokens.js";
import {
  MUSCLE_GROUPS, GROUP_LABEL, EQUIPMENT, EQUIPMENT_LABEL, TYPES, DEFAULT_TYPES,
  filterLibrary, alsoWorks, lastSessions,
} from "../../lib/exerciseLibrary.js";

const TX2 = "#B0B0B0";
const MU = "#8A8A8A";
const PAGE = 60;

const chip = (on) => ({
  display: "inline-flex", alignItems: "center", minHeight: "36px", padding: "0 12px", borderRadius: "999px",
  fontSize: "13px", fontWeight: on ? 700 : 600, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${on ? A : BD}`, background: on ? A : S2, color: on ? "#000" : TX2,
});
const sectionLabel = { fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MU };

/**
 * Pick an exercise: search, tap muscles on the body, filter by equipment and type.
 * Calls onSelect(name, entry) with the exercise name (or the typed name for a custom
 * exercise, where entry is null), then closes. `entry` is the library row, so a caller
 * that keeps its own exercise list — the coach's plan builder — can match the pick
 * against it instead of taking the name on trust. `history` (optional) shows what the
 * person lifted last time.
 */
export default function ExercisePicker({ onClose, onSelect, history, units = "imperial" }) {
  const lib = useExerciseLibrary();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  // Starts from the person's saved equipment (Profile › Your equipment); changes here are for this search only.
  const saved = useEquipment();
  const [equipment, setEquipment] = useState(saved.equipment);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [limit, setLimit] = useState(PAGE);
  const [info, setInfo] = useState(null);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
  const unit = units === "metric" ? "kg" : "lb";

  useEffect(() => {
    // Slide in on the next frame; the timer covers webviews that pause animation frames.
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => setVisible(true), 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);
  useEffect(() => { setLimit(PAGE); }, [q, groups, equipment, types]);

  const close = () => { setVisible(false); setTimeout(onClose, 220); };
  const choose = (name, entry = null) => { onSelect(name, entry); close(); };
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const results = useMemo(() => (lib ? filterLibrary(lib, { groups, equipment, types, query: q }) : []), [lib, groups, equipment, types, q]);
  const lastTime = useMemo(() => {
    const m = {};
    for (const e of results.slice(0, limit)) {
      const s = lastSessions(history, [e.name, e.sourceName], 1)[0];
      if (s) m[e.id] = s.text;
    }
    return m;
  }, [results, limit, history]);

  const typed = q.trim();
  const exact = typed && results.some((e) => e.name.toLowerCase() === typed.toLowerCase());

  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center",
        background: visible ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0)", transition: "background 0.22s ease" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add exercise"
        onClick={(e) => e.stopPropagation()}
        style={{ background: S1, width: isDesktop ? "560px" : "100%", height: isDesktop ? "86vh" : "92vh", display: "flex", flexDirection: "column",
          borderRadius: isDesktop ? "20px" : "24px 24px 0 0", border: `1px solid ${BD}`, overflow: "hidden",
          transform: visible ? "translateY(0)" : "translateY(100%)", opacity: visible ? 1 : 0,
          transition: "transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.22s ease" }}
      >
        <div style={{ padding: "12px 16px 12px", flexShrink: 0, borderBottom: `1px solid ${BD}`, display: "flex", flexDirection: "column", gap: "10px" }}>
          {!isDesktop && <div style={{ width: "40px", height: "5px", background: MT, borderRadius: "3px", margin: "0 auto" }} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: TX, letterSpacing: "-0.02em" }}>Add exercise</h2>
            <button type="button" onClick={close} style={{ minHeight: "40px", background: "none", border: `1px solid ${BD}`, borderRadius: "10px", color: TX2, fontSize: "14px", fontWeight: 600, cursor: "pointer", padding: "0 14px", fontFamily: "inherit" }}>Cancel</button>
          </div>
          <label style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Search exercises</span>
            <svg aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SB} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name"
              style={{ width: "100%", boxSizing: "border-box", minHeight: "46px", background: S2, border: `1px solid ${BD}`, borderRadius: "12px", color: TX, fontSize: "16px", padding: "0 14px 0 38px", outline: "none", fontFamily: "inherit" }}
            />
          </label>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <section aria-label="Muscles" style={{ background: "#0C0C0C", border: `1px solid ${BD}`, borderRadius: "14px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "15px", fontWeight: 600, color: TX }}>Muscles</span>
              {groups.length > 0
                ? <button type="button" onClick={() => setGroups([])} style={{ minHeight: "32px", background: "none", border: "none", color: TX2, fontSize: "13px", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
                : <span style={{ fontSize: "13px", color: MU }}>Tap the body or a name</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "24px" }}>
              <BodyMap view="front" main={groups} width={104} onToggle={(g) => toggle(groups, setGroups, g)} stroke="#0C0C0C" />
              <BodyMap view="back" main={groups} width={104} onToggle={(g) => toggle(groups, setGroups, g)} stroke="#0C0C0C" />
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {MUSCLE_GROUPS.map((g) => (
                <button key={g.id} type="button" aria-pressed={groups.includes(g.id)} onClick={() => toggle(groups, setGroups, g.id)} style={chip(groups.includes(g.id))}>{g.label}</button>
              ))}
            </div>
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={sectionLabel}>Equipment</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {EQUIPMENT.map((e) => (
                <button key={e.id} type="button" aria-pressed={equipment.includes(e.id)} onClick={() => toggle(equipment, setEquipment, e.id)} style={chip(equipment.includes(e.id))}>{e.label}</button>
              ))}
            </div>
            <span style={{ ...sectionLabel, marginTop: "4px" }}>Type</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {TYPES.map((t) => (
                <button key={t.id} type="button" aria-pressed={types.includes(t.id)} onClick={() => toggle(types, setTypes, t.id)} style={chip(types.includes(t.id))}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={sectionLabel}>{lib ? `${results.length} ${results.length === 1 ? "exercise" : "exercises"}` : "Loading exercises…"}</span>
            {lib && results.length > 0 && <span style={{ fontSize: "12px", color: MU }}>Most common first</span>}
          </div>

          {typed && !exact && (
            <button type="button" onClick={() => choose(typed)} style={{ textAlign: "left", background: S2, border: `1px solid ${A}44`, borderRadius: "14px", padding: "14px 16px", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: A }}>+ Add "{typed}"</div>
              <div style={{ fontSize: "13px", color: MU, marginTop: "3px" }}>As your own exercise</div>
            </button>
          )}

          <div role="list" style={{ display: "flex", flexDirection: "column" }}>
            {results.slice(0, limit).map((e) => (
              <div role="listitem" key={e.id} style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: `1px solid ${BD}` }}>
                <button type="button" onClick={() => choose(e.name, e)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: "12px 0", cursor: "pointer", display: "flex", flexDirection: "column", gap: "3px", fontFamily: "inherit" }}>
                  <span style={{ fontSize: "16px", fontWeight: 600, color: TX }}>{e.name}</span>
                  <span style={{ fontSize: "13px", color: TX2 }}>{GROUP_LABEL[e.group]} · {EQUIPMENT_LABEL[e.equipment]}{lastTime[e.id] ? ` · last time ${lastTime[e.id].replace(/^(\S+) ×/, `$1 ${unit} ×`)}` : ""}</span>
                  {alsoWorks(e) && <span style={{ fontSize: "12px", color: MU }}>{alsoWorks(e)}</span>}
                </button>
                <button type="button" aria-label={`About ${e.name}`} onClick={() => setInfo(e)}
                  style={{ width: "44px", height: "44px", flexShrink: 0, borderRadius: "12px", border: `1px solid ${MT}`, background: "none", color: TX2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16.5" /><line x1="12" y1="7.5" x2="12" y2="7.6" /></svg>
                </button>
              </div>
            ))}
          </div>

          {results.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} style={{ minHeight: "44px", background: "none", border: `1px solid ${MT}`, borderRadius: "10px", color: TX2, fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Show more ({results.length - limit} left)
            </button>
          )}

          {lib && results.length === 0 && !typed && (
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.45, color: TX2 }}>No exercises match. Try another muscle, or turn on more equipment or types.</p>
          )}
        </div>
      </div>

      {info && (
        <div onClick={(ev) => ev.stopPropagation()}>
          <ExerciseInfoSheet entry={info} history={history} units={units} onClose={() => setInfo(null)} onAdd={(name) => { setInfo(null); choose(name, info); }} />
        </div>
      )}
    </div>
  );
}
