import { supabase } from "./supabase";

export interface OfflineAction {
  id: string;        // timestamp
  type: "SAVE_WORKOUT" | "SAVE_ROUTINE" | "SAVE_WEIGHT" | "SAVE_MEASUREMENT";
  userId: string;
  payload: any;
}

const QUEUE_KEY = "theryn_offline_queue";

export function getOfflineQueue(): OfflineAction[] {
  try {
    const q = localStorage.getItem(QUEUE_KEY);
    return q ? JSON.parse(q) : [];
  } catch {
    return [];
  }
}

export function enqueueAction(action: Omit<OfflineAction, "id">) {
  const queue = getOfflineQueue();
  const fullAction: OfflineAction = { ...action, id: Date.now().toString() };
  queue.push(fullAction);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  
  // Optionally, immediately try to process the queue just in case we are connected
  processOfflineQueue();
}

export function dequeueAction(actionId: string) {
  const queue = getOfflineQueue();
  const newQueue = queue.filter(a => a.id !== actionId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
}

let isProcessing = false;

export async function processOfflineQueue() {
  // Prevent parallel overlapping processing
  if (isProcessing) return;
  if (!navigator.onLine) return; // Wait to come online
  
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isProcessing = true;

  for (const action of queue) {
    let success = false;
    try {
      if (action.type === "SAVE_WORKOUT") {
        // Need to import dynamically to prevent circular dependencies or just resolve here manually
        // But doing it dynamically works.
        const { saveCompletedWorkout } = await import("../hooks/useWorkouts");
        await saveCompletedWorkout(action.userId, action.payload);
        success = true;
      } 
      else if (action.type === "SAVE_ROUTINE") {
        const { saveRoutine } = await import("../hooks/useRoutine");
        await saveRoutine(action.userId, action.payload);
        success = true;
      }
      // You can add more offline handlers here later
    } catch (err) {
      console.error(`Offline action ${action.id} failed to process:`, err);
      // Wait for next time if it crashed (might literally be offline mid-request)
    }

    if (success) {
      dequeueAction(action.id);
    }
  }

  isProcessing = false;
}

// Subscribe to browser network events to flush queue when internet comes back automatically
if (typeof window !== "undefined") {
  window.addEventListener("online", processOfflineQueue);
}
