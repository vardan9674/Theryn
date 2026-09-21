// Theryn service worker: shows pushes sent by the process-outbox Edge Function
// (see src/lib/webPush.ts). Push only; it caches nothing, so it can't serve a
// stale app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data ? event.data.text() : "" }; }
  const title = msg.title || "Theryn";
  event.waitUntil(self.registration.showNotification(title, {
    body: msg.body || "",
    tag: msg.tag || undefined,
    renotify: Boolean(msg.tag),
    icon: "/theryn-mark.svg",
    badge: "/theryn-mark.svg",
    data: { ...(msg.data || {}), url: "/?notifications=1" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Reuse an open Theryn tab (not a client's /f/ link page) when there is one.
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin && !new URL(c.url).pathname.startsWith("/f/"));
    if (tab) { await tab.focus(); tab.postMessage({ type: "theryn:open-notifications" }); return; }
    await self.clients.openWindow(url);
  })());
});
