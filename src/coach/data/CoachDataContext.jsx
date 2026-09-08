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
  const [version, setVersion] = React.useState(0);
  const bump = () => setVersion((v) => v + 1);

  const get = React.useCallback((athleteId) => cacheRef.current[athleteId] || null, []);

  const load = React.useCallback(async (athleteId, { force = false } = {}) => {
    if (!athleteId) return null;
    if (!force && cacheRef.current[athleteId]) return cacheRef.current[athleteId];
    if (inflightRef.current[athleteId]) return inflightRef.current[athleteId];
    const p = data.loadClientData(athleteId)
      .then((d) => { cacheRef.current[athleteId] = d; bump(); return d; })
      .finally(() => { delete inflightRef.current[athleteId]; });
    inflightRef.current[athleteId] = p;
    return p;
  }, [data]);

  const set = React.useCallback((athleteId, d) => { cacheRef.current[athleteId] = d; bump(); }, []);
  const invalidate = React.useCallback((athleteId) => { delete cacheRef.current[athleteId]; bump(); }, []);

  return React.useMemo(() => ({ get, load, set, invalidate, version }), [get, load, set, invalidate, version]);
}
