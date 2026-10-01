// Edge Function: delete-account
//
// Deletes the signed-in user's account and everything stored under it.
// Called from the app (Profile → Delete account), the coach dashboard
// (You → Delete account) and the public /delete-account page.
//
// Required by App Store Review Guideline 5.1.1(v) and Google Play's
// account-deletion policy.
//
// Auth: the caller's own access token (Authorization: Bearer <jwt>). The
// function reads the user id from that token, never from the request body, so
// nobody can delete someone else's account.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (injected).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cleanupSteps, runCleanup } from "./steps.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "https://www.theryn.fit",
  "https://theryn.fit",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
]);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) ? origin : "https://www.theryn.fit";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, origin);

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sign in first" }, 401, origin);

  // Who is asking: resolved from their own token.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await asUser.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: "Your sign-in has expired. Sign in again and retry." }, 401, origin);
  const userId = who.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const skipped = await runCleanup(admin as never, cleanupSteps(userId, who.user.email ?? null));
    // Cascades from auth.users → profiles → every table keyed on the person.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(delErr.message);
    console.log(JSON.stringify({ event: "account_deleted", skipped }));
    return json({ deleted: true }, 200, origin);
  } catch (e) {
    console.error(JSON.stringify({ event: "account_delete_failed", message: String((e as Error)?.message || e) }));
    return json({ error: "We couldn't delete your account just now. Try again, or email us and we'll do it for you." }, 500, origin);
  }
});
