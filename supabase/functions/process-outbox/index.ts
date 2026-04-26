// Edge Function: process-outbox
//
// Invoked every minute by pg_cron. Claims a batch of due notifications from
// notify_outbox, fans them out to each of the user's device tokens via FCM,
// and finalizes (sent / failed / dead-token cleanup).
//
// Auth: Supabase platform verifies the JWT (service_role key) before this code
// runs — no additional auth check needed here.
// Env:
//   SUPABASE_URL                - injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   - injected by Supabase (NEVER expose client-side)
//   FCM_SERVICE_ACCOUNT_JSON    - set via `supabase secrets set` (Phase 1 setup)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendToToken, type Platform, type PushPayload } from "../_shared/fcm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface OutboxRow {
  id: string;
  user_id: string;
  channel: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: string | null;
  collapse_key: string | null;
}

interface DeviceToken {
  token: string;
  platform: Platform;
}

const BATCH_SIZE = 100;

async function processOne(row: OutboxRow): Promise<void> {
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .eq("user_id", row.user_id)
    .returns<DeviceToken[]>();

  if (error) {
    await supabase.rpc("mark_outbox_failed", {
      p_id: row.id,
      p_error: `token_lookup: ${error.message}`,
    });
    return;
  }

  if (!tokens || tokens.length === 0) {
    // No devices registered. Mark sent so we don't keep retrying — the user
    // will get the notification on their next session via in-app history.
    await supabase.rpc("mark_outbox_sent", { p_id: row.id });
    return;
  }

  // FCM data values must be strings.
  const stringData: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.data ?? {})) {
    stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  // Always include channel + outbox id for client-side routing/analytics.
  stringData.channel = row.channel;
  stringData.outbox_id = row.id;

  const payload: PushPayload = {
    title: row.title,
    body: row.body,
    data: stringData,
    channel: row.channel,
    priority: row.priority,
    sound: row.sound ?? undefined,
    collapseKey: row.collapse_key ?? undefined,
  };

  let anySuccess = false;
  let lastError: string | undefined;
  const deadTokens: string[] = [];

  // HTTP/2 keep-alive lets these run effectively in parallel; we await each
  // for clearer error attribution and dead-token tracking.
  for (const t of tokens) {
    const result = await sendToToken(t.token, t.platform, payload);
    if (result.success) {
      anySuccess = true;
    } else if (result.deadToken) {
      deadTokens.push(t.token);
    } else {
      lastError = `${result.errorCode}: ${result.errorMessage}`;
    }
  }

  // Cleanup dead tokens in one round trip.
  if (deadTokens.length > 0) {
    await supabase.from("device_tokens").delete().in("token", deadTokens);
  }

  if (anySuccess || (deadTokens.length === tokens.length && deadTokens.length > 0)) {
    // Either we delivered to at least one device, or every device's token was
    // dead (we cleaned them up — no point retrying this row).
    await supabase.rpc("mark_outbox_sent", { p_id: row.id });
  } else {
    await supabase.rpc("mark_outbox_failed", {
      p_id: row.id,
      p_error: lastError ?? "no_tokens_succeeded",
    });
  }
}

Deno.serve(async (_req) => {
  // Supabase verifies the JWT (service_role) at the platform level before this
  // function runs — no additional auth check required.

  const { data: claimed, error } = await supabase.rpc("claim_outbox_batch", {
    p_limit: BATCH_SIZE,
  }).returns<OutboxRow[]>();

  if (error) {
    console.error("claim_outbox_batch failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = claimed ?? [];
  // Process serially within a single invocation. With BATCH_SIZE=100 and
  // ~50ms/push (single token, FCM HTTP/2 keep-alive), worst case is ~5s,
  // well under the Edge Function 60s timeout.
  for (const row of rows) {
    try {
      await processOne(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.rpc("mark_outbox_failed", { p_id: row.id, p_error: msg });
    }
  }

  return new Response(
    JSON.stringify({ processed: rows.length }),
    { headers: { "content-type": "application/json" } },
  );
});
