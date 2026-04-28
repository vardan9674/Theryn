import { openDB, IDBPDatabase } from "idb";
import { supabase } from "./supabase";

export interface QueuedAction {
  id?: number;
  type: string;
  userId: string;
  payload: unknown;
  createdAt: number;
}

export function enqueueAction(action: Omit<QueuedAction, "id" | "createdAt">): void {
  const entry: QueuedAction = { ...action, createdAt: Date.now() };
  getDB()
    .then((db) => db.add("action-outbox", entry))
    .catch(() => {});
}

interface OutboxEntry {
  clientId: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  attempts: number;
  nextRetryAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB("theryn-offline", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("message-outbox", { keyPath: "clientId" });
          store.createIndex("by-created-at", "createdAt");
        }
        if (oldVersion < 2) {
          db.createObjectStore("action-outbox", { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueMessage(
  entry: Omit<OutboxEntry, "attempts" | "nextRetryAt">
): Promise<void> {
  try {
    const db = await getDB();
    await db.put("message-outbox", { ...entry, attempts: 0, nextRetryAt: Date.now() });
  } catch {
    // IndexedDB unavailable (private browsing, SSR) — silently drop
  }
}

let processing = false;

export async function processOfflineQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    let db: IDBPDatabase;
    try {
      db = await getDB();
    } catch {
      return;
    }
    await drainMessageOutbox(db);
    await drainActionOutbox(db);
  } finally {
    processing = false;
  }
}

// Distinguish "the server rejected this payload and will keep rejecting it"
// (drop it) from "transient/network problem" (retry with backoff). Without
// this, a single malformed item retries forever and blocks the queue head.
function isPermanentClientError(err: any): boolean {
  if (!err) return false;
  const status = typeof err.status === "number" ? err.status : null;
  if (status !== null) return status >= 400 && status < 500 && status !== 429;
  const code: string | undefined = err.code;
  if (typeof code !== "string") return false;
  if (code === "23505") return false; // duplicate — handled as success upstream
  // PostgREST + Postgres constraint/check codes are deterministic rejections.
  if (code.startsWith("PGRST")) return true;
  if (/^(22|23|42)\d{3}$/.test(code)) return true;
  return false;
}

async function drainMessageOutbox(db: IDBPDatabase): Promise<void> {
  const all: OutboxEntry[] = await db.getAllFromIndex("message-outbox", "by-created-at");
  const due = all.filter((e) => e.nextRetryAt <= Date.now());

  for (const entry of due) {
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: entry.conversationId,
        sender_id: entry.senderId,
        content: entry.content,
        client_id: entry.clientId,
        created_at: entry.createdAt,
      });

      if (!error || error.code === "23505") {
        // Success or already exists in DB — remove from outbox
        await db.delete("message-outbox", entry.clientId);
      } else if (isPermanentClientError(error)) {
        // Server will never accept this payload — drop it so it doesn't block
        // later messages forever.
        // eslint-disable-next-line no-console
        console.warn("[offlineQueue] dropping un-retryable message", entry.clientId, error);
        await db.delete("message-outbox", entry.clientId);
      } else {
        // Transient failure — exponential backoff, capped at 30 minutes
        const delay = Math.min(30_000 * Math.pow(2, entry.attempts), 30 * 60 * 1000);
        await db.put("message-outbox", {
          ...entry,
          attempts: entry.attempts + 1,
          nextRetryAt: Date.now() + delay,
        });
      }
    } catch {
      // Network offline — leave entry untouched for next flush
    }
  }
}

async function drainActionOutbox(db: IDBPDatabase): Promise<void> {
  const all: QueuedAction[] = await db.getAll("action-outbox");
  if (!all.length) return;

  // Dynamic import avoids the offlineQueue ↔ hooks circular dependency.
  const [{ saveCompletedWorkout }, { saveBodyWeight, saveMeasurement }, { saveRoutine }] =
    await Promise.all([
      import("../hooks/useWorkouts"),
      import("../hooks/useBody"),
      import("../hooks/useRoutine"),
    ]);

  for (const entry of all) {
    if (entry.id == null) continue;
    try {
      switch (entry.type) {
        case "SAVE_WORKOUT": {
          await saveCompletedWorkout(entry.userId, entry.payload as any, true);
          break;
        }
        case "SAVE_WEIGHT": {
          const p = entry.payload as { weight: number; date: string };
          await saveBodyWeight(entry.userId, p.weight, p.date, true);
          break;
        }
        case "SAVE_MEASUREMENT": {
          const p = entry.payload as { data: any; date: string };
          await saveMeasurement(entry.userId, p.data, p.date, true);
          break;
        }
        case "SAVE_ROUTINE": {
          await saveRoutine(entry.userId, entry.payload as any, true);
          break;
        }
        default:
          // Unknown action type — drop so it doesn't poison the queue.
          break;
      }
      await db.delete("action-outbox", entry.id);
    } catch (err) {
      if (isPermanentClientError(err)) {
        // Bad payload / permission error — drop so it doesn't block the queue.
        // eslint-disable-next-line no-console
        console.warn("[offlineQueue] dropping un-retryable action", entry.type, err);
        try { await db.delete("action-outbox", entry.id); } catch {}
      }
      // Otherwise: network/5xx — leave for next flush. The loop continues so
      // independent later writes still get a retry on this pass.
    }
  }
}
