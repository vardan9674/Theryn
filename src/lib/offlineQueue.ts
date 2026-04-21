import { openDB, IDBPDatabase } from "idb";
import { supabase } from "./supabase";

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
    dbPromise = openDB("theryn-offline", 1, {
      upgrade(db) {
        const store = db.createObjectStore("message-outbox", { keyPath: "clientId" });
        store.createIndex("by-created-at", "createdAt");
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

export async function processOfflineQueue(): Promise<void> {
  let db: IDBPDatabase;
  try {
    db = await getDB();
  } catch {
    return;
  }

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
