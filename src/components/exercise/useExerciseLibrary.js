import { useEffect, useState } from "react";
import { loadLibrary } from "../../lib/exerciseLibrary.js";

/** The exercise library, or null while it loads (or if it could not load). */
export default function useExerciseLibrary() {
  const [lib, setLib] = useState(null);
  useEffect(() => {
    let alive = true;
    loadLibrary().then((l) => { if (alive) setLib(l); }).catch((e) => console.error("Exercise library failed to load", e));
    return () => { alive = false; };
  }, []);
  return lib;
}
