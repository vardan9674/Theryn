// Tiny dispatch table that lets hook modules register their offline-flush
// handlers without offlineQueue.ts having to import the hooks. Without this
// indirection, offlineQueue → useWorkouts/useBody/useRoutine and those hooks →
// offlineQueue (for enqueueAction) form a circular ESM dep. Vite splits them
// into separate chunks and the chunks try to read each other's exports during
// module init, producing "Cannot access 'X' before initialization" at runtime.
//
// The registry has no other dependencies, so it sits cleanly between the two
// sides.

export type ActionHandler = (userId: string, payload: unknown) => Promise<unknown>;

const handlers = new Map<string, ActionHandler>();

export function registerActionHandler(type: string, handler: ActionHandler): void {
  handlers.set(type, handler);
}

export function getActionHandler(type: string): ActionHandler | undefined {
  return handlers.get(type);
}
