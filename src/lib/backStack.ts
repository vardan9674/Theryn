import { useEffect, useRef } from "react";

// LIFO stack of "back press" consumers. A modal/sheet pushes a handler when it
// opens; the Android back-button effect in App.jsx pops the topmost handler
// before falling through to tab navigation. This keeps modal-aware back
// behavior decoupled from where each modal's open state lives.
const stack: Array<() => void> = [];

export function pushBackHandler(fn: () => void): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function consumeBackPress(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function useBackHandler(active: boolean, onBack: () => void): void {
  const fnRef = useRef(onBack);
  useEffect(() => { fnRef.current = onBack; }, [onBack]);
  useEffect(() => {
    if (!active) return;
    const handler = () => fnRef.current?.();
    return pushBackHandler(handler);
  }, [active]);
}
