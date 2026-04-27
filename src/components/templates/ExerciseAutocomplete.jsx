import React from "react";
import { supabase } from "../../lib/supabase";
import { createUserExercise } from "../../hooks/useWorkouts.ts";
import { A, BG, S1, S2, BD, TX, SB, MT } from "./tokens.js";

/**
 * Typo-tolerant exercise picker. Replaces the bare <input> in the template
 * editor with a debounced autocomplete that hits the search_exercises RPC,
 * shows custom + public results with badges, and lets the user commit a brand
 * new private exercise inline if nothing matches.
 *
 * Props:
 *   value                  — current exercise_name string
 *   sourceExerciseId       — current public_exercises.id (or undefined)
 *   sourceUserExerciseId   — current user_exercises.id (or undefined)
 *   userId                 — auth.uid() of the editor (coach or athlete)
 *   onChange               — ({ exercise_name, source_exercise_id, source_user_exercise_id }) => void
 *   placeholder            — optional input placeholder
 */
export default function ExerciseAutocomplete({
  value,
  sourceExerciseId,
  sourceUserExerciseId,
  userId,
  onChange,
  placeholder = "Exercise name…",
  autoFocus = false,
}) {
  const [text, setText]         = React.useState(value || "");
  const [open, setOpen]         = React.useState(false);
  const [loading, setLoading]   = React.useState(false);
  const [results, setResults]   = React.useState([]);
  const [highlight, setHighlight] = React.useState(0);
  const [creating, setCreating] = React.useState(false);

  const wrapperRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const debounceRef = React.useRef(null);
  const lastQueryRef = React.useRef("");

  // Auto-focus + open library when this row was just added by + Add Exercise.
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value updates (e.g. parent reset).
  React.useEffect(() => { setText(value || ""); }, [value]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Debounced fetch.
  // - 0–1 chars: browse the library (top public + user customs, alphabetical).
  // - 2+ chars: typo-tolerant RPC search.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!userId) { setResults([]); setLoading(false); return; }
    const term = text.trim();

    // Browse mode — show the library immediately so users can pick without typing.
    if (term.length < 2) {
      setLoading(true);
      const queryKey = `__browse__:${term}`;
      lastQueryRef.current = queryKey;
      (async () => {
        const [pubRes, userRes] = await Promise.all([
          supabase
            .from("public_exercises")
            .select("id, name, muscle_group, equipment")
            .order("name", { ascending: true })
            .limit(100),
          supabase
            .from("user_exercises")
            .select("id, name, muscle_group, equipment")
            .eq("user_id", userId)
            .order("name", { ascending: true })
            .limit(100),
        ]);
        if (lastQueryRef.current !== queryKey) return;
        if (pubRes.error) console.error("[public_exercises]", pubRes.error.message);
        if (userRes.error) console.error("[user_exercises]", userRes.error.message);
        const customs = (userRes.data || []).map(r => ({ ...r, is_custom: true,  similarity: 1 }));
        const publics = (pubRes.data  || []).map(r => ({ ...r, is_custom: false, similarity: 1 }));
        // Customs first, then public library.
        setResults([...customs, ...publics]);
        setHighlight(0);
        setLoading(false);
      })();
      return;
    }

    // Search mode — typo-tolerant RPC.
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = term;
      const { data, error } = await supabase.rpc("search_exercises", {
        search_term: term,
        user_uid:    userId,
      });
      if (lastQueryRef.current !== term) return;
      if (error) {
        console.error("[search_exercises]", error.message);
        setResults([]);
      } else {
        setResults(data || []);
      }
      setHighlight(0);
      setLoading(false);
    }, 250);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [text, userId]);

  // Whether the typed text exactly matches a result name (case-insensitive).
  const trimmedLower = text.trim().toLowerCase();
  const exactMatch = results.find(r => r.name.toLowerCase() === trimmedLower);
  const showAddRow = !exactMatch && trimmedLower.length >= 2;

  // Total selectable rows (results + optional Add row).
  const rowCount = results.length + (showAddRow ? 1 : 0);

  const selectResult = (r) => {
    setText(r.name);
    setOpen(false);
    onChange({
      exercise_name:           r.name,
      source_exercise_id:      r.is_custom ? null : r.id,
      source_user_exercise_id: r.is_custom ? r.id : null,
    });
  };

  const selectAddNew = async () => {
    const name = text.trim();
    if (!name || creating || !userId) return;

    // Anti-duplication: if a fuzzy match exists with high similarity, prefer it.
    const closeMatch = results.find(r => r.is_custom && (r.similarity ?? 0) >= 0.6);
    if (closeMatch) {
      const ok = window.confirm(
        `Use existing "${closeMatch.name}" instead of creating a new exercise?`
      );
      if (ok) { selectResult(closeMatch); return; }
    }

    setCreating(true);
    try {
      const created = await createUserExercise(userId, name);
      setText(created.name);
      setOpen(false);
      onChange({
        exercise_name:           created.name,
        source_exercise_id:      null,
        source_user_exercise_id: created.id,
      });
    } catch (e) {
      console.error("[createUserExercise]", e?.message);
      // Fall back to plain name save so the user isn't blocked.
      onChange({
        exercise_name:           name,
        source_exercise_id:      null,
        source_user_exercise_id: null,
      });
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown") { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(h => Math.min(rowCount - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (rowCount === 0) return;
      e.preventDefault();
      if (highlight < results.length) selectResult(results[highlight]);
      else if (showAddRow) selectAddNew();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", flex: 1 }}>
      <input
        ref={inputRef}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setOpen(true);
          // Type-ahead breaks any pinned source id until the user re-picks.
          if (sourceExerciseId || sourceUserExerciseId) {
            onChange({
              exercise_name:           e.target.value,
              source_exercise_id:      null,
              source_user_exercise_id: null,
            });
          } else {
            onChange({ exercise_name: e.target.value });
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          flex: 1, width: "100%", boxSizing: "border-box",
          background: "none", border: "none", color: TX,
          fontSize: 14, fontWeight: 700, outline: "none",
          fontFamily: "inherit",
        }}
      />

      {open && (loading || results.length > 0 || showAddRow) && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: S1, border: `1px solid ${BD}`, borderRadius: 10,
            zIndex: 100, maxHeight: 280, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
          onMouseDown={e => e.preventDefault()} // keep input focus on click
        >
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: SB }}>
              Searching…
            </div>
          )}

          {!loading && results.map((r, i) => {
            const isFuzzy = (r.similarity ?? 1) < 0.6;
            const active = i === highlight;
            return (
              <div
                key={r.id}
                onClick={() => selectResult(r)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: "10px 12px",
                  background: active ? S2 : "transparent",
                  cursor: "pointer",
                  borderBottom: `1px solid ${BD}`,
                  display: "flex", alignItems: "center", gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: TX,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: SB, marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {[r.muscle_group, r.equipment].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {r.is_custom && (
                  <span style={badge(A)}>Custom</span>
                )}
                {isFuzzy && !r.is_custom && (
                  <span style={badge("#FFD166")}>Did you mean?</span>
                )}
              </div>
            );
          })}

          {!loading && showAddRow && (
            <div
              onClick={selectAddNew}
              onMouseEnter={() => setHighlight(results.length)}
              style={{
                padding: "10px 12px",
                background: highlight === results.length ? S2 : "transparent",
                cursor: creating ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
                color: A, fontSize: 13, fontWeight: 700,
                opacity: creating ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              <span style={{
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {creating ? "Adding…" : `Add "${text.trim()}" as custom exercise`}
              </span>
            </div>
          )}

          {!loading && results.length === 0 && !showAddRow && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: SB }}>
              Type at least 2 characters…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function badge(color) {
  return {
    fontSize: 10, fontWeight: 800, color: BG, background: color,
    padding: "2px 6px", borderRadius: 6, letterSpacing: "0.02em",
    flexShrink: 0,
  };
}
