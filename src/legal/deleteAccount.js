import { supabase } from "../lib/supabase";

// Deletes the signed-in account on the server (Edge Function `delete-account`,
// which removes the auth user and, by cascade, everything stored under it),
// then wipes what this device kept: the session, cached plans and workouts,
// and the offline outbox. Throws with a readable message on failure; nothing
// local is cleared unless the server confirmed the deletion.
export async function deleteMyAccount() {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) throw new Error("Sign in first, then try again.");

  const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error || !data?.deleted) {
    let msg = data?.error;
    try { if (!msg && error?.context?.json) msg = (await error.context.json())?.error; } catch { /* ignore */ }
    throw new Error(msg || "We couldn't delete your account just now. Check your connection and try again.");
  }

  await clearLocalData();
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* the user is already gone */ }
  return true;
}

// Everything Theryn writes on the device. Keys are all prefixed "theryn" or
// belong to Supabase's own session ("sb-…").
export async function clearLocalData() {
  try {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (/^theryn/i.test(k) || /^sb-/.test(k))) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage may be blocked */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try {
    if (typeof indexedDB !== "undefined") {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("theryn-offline");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    }
  } catch { /* ignore */ }
}
