// Browser push for the coach dashboard (roadmap 1.12). The subscription is
// stored as a device_tokens row (platform 'web', token = subscription JSON);
// the process-outbox Edge Function delivers to it with VAPID web push, and
// public/sw.js shows it.
import { supabase } from "./supabase";

// Public half of the VAPID pair. Safe to ship; the private half is a Supabase secret.
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)
  || "BAAb2mg3g6mtUtttb0u8oEIMpAQx0xtge-XqCoSR-R59_VtGzvD7LsX0XMIqhrZhs-AbK4a0-OSW24pbYAFLMDE";

export type PushState = "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone/iPad Safari only allows web push from a site added to the Home Screen. */
function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  return ios && !standalone;
}

function keyBytes(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  return existing || navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIosBrowserTab() ? "ios-needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Asks for permission, subscribes this browser and saves it. Returns the new state. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return isIosBrowserTab() ? "ios-needs-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const token = JSON.stringify(sub.toJSON());
  const { error } = await supabase.from("device_tokens").upsert(
    { user_id: userId, token, platform: "web", locale: navigator.language || null, app_version: "web", last_seen_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  if (error) throw new Error(error.message);
  // Pushes are held during quiet hours in the coach's own time zone, so it must be right.
  let tz: string | null = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* keep the old one */ }
  await supabase.from("profiles").update({ push_enabled: true, ...(tz ? { timezone: tz } : {}) }).eq("id", userId);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const token = JSON.stringify(sub.toJSON());
    await supabase.from("device_tokens").delete().eq("token", token);
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}
