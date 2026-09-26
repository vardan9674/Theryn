import React from "react";

/**
 * The coach dashboard talks to one object for all data. Two implementations:
 *   - supabaseCoachData: the real app (wraps the existing hooks)
 *   - mockCoachData: in-memory sample data for the dev preview and QA
 * Screens never import Supabase directly.
 */
const CoachDataContext = React.createContext(null);

export function CoachDataProvider({ value, children }) {
  return <CoachDataContext.Provider value={value}>{children}</CoachDataContext.Provider>;
}

export function useCoachData() {
  const ctx = React.useContext(CoachDataContext);
  if (!ctx) throw new Error("useCoachData must be used inside CoachDataProvider");
  return ctx;
}

/**
 * Per-client data cache with request de-duplication. Returned object is
 * stable; consumers subscribe via the version counter.
 */
export function useClientDataCache(data) {
  const cacheRef = React.useRef({});
  const inflightRef = React.useRef({});
  // Why a client's data didn't load, so the screen can say so and offer a retry
  // instead of showing skeletons forever or an empty plan (#132).
  const errorsRef = React.useRef({});
  const [version, setVersion] = React.useState(0);
  const bump = () => setVersion((v) => v + 1);

  const get = React.useCallback((athleteId) => cacheRef.current[athleteId] || null, []);
  const error = React.useCallback((athleteId) => errorsRef.current[athleteId] || null, []);

  const load = React.useCallback(async (athleteId, { force = false } = {}) => {
    if (!athleteId) return null;
    if (!force && cacheRef.current[athleteId]) return cacheRef.current[athleteId];
    if (inflightRef.current[athleteId]) return inflightRef.current[athleteId];
    const p = data.loadClientData(athleteId)
      .then((d) => { cacheRef.current[athleteId] = d; delete errorsRef.current[athleteId]; bump(); return d; })
      .catch((e) => { errorsRef.current[athleteId] = e?.message || "Couldn't load"; bump(); throw e; })
      .finally(() => { delete inflightRef.current[athleteId]; });
    inflightRef.current[athleteId] = p;
    return p;
  }, [data]);

  const set = React.useCallback((athleteId, d) => { cacheRef.current[athleteId] = d; bump(); }, []);
  const invalidate = React.useCallback((athleteId) => { delete cacheRef.current[athleteId]; bump(); }, []);
  /** Drop everything, e.g. when the coach switches kg/lb (loaded data is already converted). */
  const reset = React.useCallback(() => { cacheRef.current = {}; inflightRef.current = {}; errorsRef.current = {}; bump(); }, []);
  // A new data object (the coach's profile changed) means reloaded, re-converted data.
  const firstData = React.useRef(data);
  React.useEffect(() => { if (firstData.current !== data) { firstData.current = data; reset(); } }, [data, reset]);
  /** Re-fetch every client already loaded (used when the coach comes back to the app). */
  const reloadAll = React.useCallback(() => Promise.all([...new Set([...Object.keys(cacheRef.current), ...Object.keys(errorsRef.current)])].map((id) => load(id, { force: true }).catch(() => {}))), [load]);

  return React.useMemo(() => ({ get, error, load, set, invalidate, reset, reloadAll, version }), [get, error, load, set, invalidate, reset, reloadAll, version]);
}
