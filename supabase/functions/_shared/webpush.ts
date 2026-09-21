// Standard Web Push (VAPID) for browsers: the coach dashboard on theryn.fit.
//
// A web device_tokens row stores the browser's PushSubscription as JSON
// ({ endpoint, keys: { p256dh, auth } }) in `token`, with platform = 'web'.
//
// Configure via environment variables (`supabase secrets set`):
//   VAPID_PUBLIC_KEY   - base64url P-256 public key; the same value the web app
//                        subscribes with (VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY  - base64url private key. Never in the repo.
//   VAPID_SUBJECT      - "mailto:you@example.com" or "https://theryn.fit"

import webpush from "npm:web-push@3.6.7";
import type { PushPayload, SendResult } from "./fcm.ts";

let configured = false;
function configure() {
  if (configured) return;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://theryn.fit", pub, priv);
  configured = true;
}

export function isWebSubscription(token: string): boolean {
  return token.trimStart().startsWith("{");
}

export async function sendWebPush(token: string, p: PushPayload): Promise<SendResult> {
  let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try { sub = JSON.parse(token); } catch { return { success: false, deadToken: true, errorCode: "BAD_SUBSCRIPTION" }; }
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { success: false, deadToken: true, errorCode: "BAD_SUBSCRIPTION" };
  }
  configure();
  // The service worker (public/sw.js) reads exactly these fields.
  const body = JSON.stringify({ title: p.title, body: p.body, tag: p.collapseKey ?? undefined, data: p.data });
  try {
    // deno-lint-ignore no-explicit-any
    await webpush.sendNotification(sub as any, body, {
      TTL: 60 * 60 * 24,
      urgency: p.priority === "critical" || p.priority === "high" ? "high" : "normal",
      topic: p.collapseKey ? p.collapseKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined,
    });
    return { success: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410: the browser dropped the subscription (signed out, cleared data, uninstalled).
    return {
      success: false,
      deadToken: status === 404 || status === 410,
      errorCode: status ? `HTTP_${status}` : "WEBPUSH_ERROR",
      errorMessage: String((e as { body?: string }).body || (e as Error).message || e).slice(0, 500),
    };
  }
}
