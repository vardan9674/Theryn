import React from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import "./coach.css";
import { CoachDataProvider, useCoachData, useClientDataCache } from "./data/CoachDataContext.jsx";
import { createSupabaseCoachData } from "./data/supabaseCoachData.js";
import { ToastProvider, useToast, Icon, Button, Avatar, useViewport, Confirm } from "./ui/primitives.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";
import PlansPage from "./pages/PlansPage.jsx";
import PaymentsPage, { RecordPaymentSheet, FeeSheet } from "./pages/PaymentsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import PlanEditor from "./pages/PlanEditor.jsx";
import ExportExcelDialog from "./pages/ExportExcelDialog.jsx";
import { AddClientSheet, ProfileSheet, LinkClientSheet } from "./pages/Sheets.jsx";
import ShareLinkSheet from "./pages/ShareLinkSheet.jsx";
import NotificationsSheet, { NotificationsButton } from "./pages/NotificationsSheet.jsx";
import CoachTour, { isTourDone, markTourDone } from "./pages/CoachTour.jsx";
import { buildNotifications, unreadCount } from "./lib/notifications.js";
import { consumeBackPress } from "../lib/backStack.ts";
import { registerNotificationTapHandlers, consumePendingDeepLink, markCoachSeen, getCoachLastSeen, triggerCoachCatchUp } from "../hooks/useNotifications.ts";

const TABS = [
  { id: "clients", label: "Clients", Icon: Icon.Clients },
  { id: "plans", label: "Plans", Icon: Icon.Plans },
  { id: "payments", label: "Payments", Icon: Icon.Payments },
  { id: "messages", label: "Messages", Icon: Icon.Messages },
];

/**
 * Entry point. In the real app it receives the same props the old CoachApp
 * did and builds the Supabase data object; the dev preview passes `data`
 * (the mock) directly.
 */
export default function CoachApp(props) {
  const supabaseData = React.useMemo(
    () => (props.data ? null : createSupabaseCoachData(props)),
    // Rebuild when identity or profile-level settings change.
    [props.data, props.authUser?.id, props.profile?.display_name, props.profile?.default_currency, props.profile?.unit_system, props.profile?.units],
  );
  const data = props.data || supabaseData;
  const initialClients = React.useMemo(() => {
    if (props.data) return null;
    return (props.coachLinks || []).filter((l) => l.coach_id === props.authUser?.id && l.status === "accepted");
  }, [props.data, props.coachLinks, props.authUser?.id]);

  return (
    <CoachDataProvider value={data}>
      <ToastProvider>
        <CoachShell initialClients={initialClients} clientsLoaded={props.data ? true : Boolean(props.coachLinksLoaded)} onLinksChanged={props.setCoachLinks ? () => import("../hooks/useCoach.ts").then((m) => m.loadCoachLinks(props.authUser.id)).then(props.setCoachLinks).catch(() => {}) : null} />
      </ToastProvider>
    </CoachDataProvider>
  );
}

function CoachShell({ initialClients, clientsLoaded, onLinksChanged }) {
  const data = useCoachData();
  const toast = useToast();
  const vp = useViewport();
  const cache = useClientDataCache(data);

  const [tab, setTab] = React.useState("clients");
  const [clients, setClients] = React.useState(initialClients || []);
  const [loadedClients, setLoadedClients] = React.useState(false);
  const SELECTED_KEY = `theryn_coach_selected_${data.coachId}`;
  const [selectedId, setSelectedIdRaw] = React.useState(() => { try { return localStorage.getItem(SELECTED_KEY) || null; } catch { return null; } });
  const [search, setSearch] = React.useState("");
  const [detailTab, setDetailTab] = React.useState(null); // null = let the client's "what to do" pick
  const [editor, setEditor] = React.useState(null); // { athleteId }
  const [exportReq, setExportReq] = React.useState(null); // { name, templates, history, unit }
  const [sheet, setSheet] = React.useState(null); // { kind, athleteId?, payment? }
  const [msgOpen, setMsgOpen] = React.useState(null);
  const [fees, setFees] = React.useState([]);
  const [payments, setPayments] = React.useState([]);
  const [previews, setPreviews] = React.useState({});

  // Keep the root's mobile width cap off while the coach app is mounted.
  React.useEffect(() => { document.body.dataset.app = "coach"; return () => { delete document.body.dataset.app; }; }, []);
  React.useEffect(() => { registerNotificationTapHandlers(); }, []);

  // data.loadClients() is the source of truth: it merges app clients (coach_athletes)
  // with name-only clients (coach_manual_clients). The root's coachLinks only seed
  // the first paint and trigger a refetch when they change (accepted requests, etc.).
  React.useEffect(() => {
    if (initialClients && !clientsLoaded) return; // root is still fetching links
    let stale = false;
    data.loadClients()
      .then((c) => { if (!stale) { setClients(c); setLoadedClients(true); } })
      .catch((e) => { if (!stale) { setLoadedClients(true); toast(`Could not load clients: ${e.message}`, "error"); } });
    return () => { stale = true; };
  }, [data, initialClients, clientsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshClients = React.useCallback(async () => {
    try { setClients(await data.loadClients()); onLinksChanged?.(); } catch (e) { toast(`Could not refresh clients: ${e.message}`, "error"); }
  }, [data, onLinksChanged, toast]);
  // Clients who are on the app (name-only clients have no messages, workouts, or template assignments).
  const realClients = React.useMemo(() => clients.filter((c) => !c.manual), [clients]);

  // Selected client persists per coach; drop it if they are no longer a client.
  const setSelectedId = React.useCallback((id) => {
    setSelectedIdRaw(id);
    setDetailTab(null);
    try { if (id) localStorage.setItem(SELECTED_KEY, id); else localStorage.removeItem(SELECTED_KEY); } catch {}
  }, [SELECTED_KEY]);
  React.useEffect(() => {
    if (loadedClients && selectedId && !clients.some((c) => c.athlete_id === selectedId)) setSelectedId(null);
  }, [clients, loadedClients, selectedId, setSelectedId]);

  // Payments data (needed by the clients table too)
  const reloadPayments = React.useCallback(async () => {
    try { const [f, p] = await Promise.all([data.loadFees(), data.loadPayments()]); setFees(f); setPayments(p); }
    catch (e) { toast(`Could not load payments: ${e.message}`, "error"); }
  }, [data, toast]);
  React.useEffect(() => { reloadPayments(); }, [reloadPayments]);

  // Message previews + unread badge
  const refreshPreviews = React.useCallback(() => {
    if (realClients.length === 0) return;
    data.loadPreviews(realClients).then(setPreviews).catch(() => {});
  }, [data, realClients]);
  React.useEffect(() => { refreshPreviews(); }, [refreshPreviews]);
  React.useEffect(() => data.subscribeMessages(realClients, () => refreshPreviews()), [data, realClients, refreshPreviews]);
  const unread = Object.values(previews).reduce((s, p) => s + (p.unread || 0), 0);

  // First visit: show the coach around once the list is in. "Show me around" in the profile sheet replays it.
  const [tourOpen, setTourOpen] = React.useState(false);
  React.useEffect(() => { if (loadedClients && !isTourDone(data.coachId)) setTourOpen(true); }, [loadedClients, data.coachId]);
  const startTour = React.useCallback(() => { setSheet(null); setTab("clients"); setMsgOpen(null); setTourOpen(true); }, []);
  const endTour = React.useCallback(() => { setTourOpen(false); markTourDone(data.coachId); }, [data.coachId]);

  // Notification centre: link submissions + app workouts, unread against the coach's seen watermark.
  const [notifFeed, setNotifFeed] = React.useState({ submissions: [], sessions: [] });
  const [notifSeenAt, setNotifSeenAt] = React.useState(null);
  const [notifClearedAt, setNotifClearedAt] = React.useState(null);
  const [notifDismissed, setNotifDismissed] = React.useState([]);
  const [notifLoading, setNotifLoading] = React.useState(true);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const refreshNotifications = React.useCallback(() => {
    if (!loadedClients || typeof data.loadNotificationFeed !== "function") return;
    data.loadNotificationFeed(clients).then((f) => { setNotifFeed(f); setNotifLoading(false); }).catch(() => setNotifLoading(false));
  }, [data, clients, loadedClients]);
  React.useEffect(() => { refreshNotifications(); }, [refreshNotifications]);
  React.useEffect(() => {
    if (typeof data.getNotificationsState !== "function") return;
    data.getNotificationsState().then((st) => { setNotifSeenAt(st.seenAt); setNotifClearedAt(st.clearedAt); setNotifDismissed(st.dismissed || []); }).catch(() => {});
  }, [data]);
  // Two watermarks: the badge clears the moment the centre opens; the rows keep
  // their unread highlight until it closes, so the coach can see what is new.
  const [badgeSeenAt, setBadgeSeenAt] = React.useState(null);
  const notifications = React.useMemo(() => buildNotifications({ ...notifFeed, clients, seenAt: notifSeenAt, clearedAt: notifClearedAt, dismissed: notifDismissed }), [notifFeed, clients, notifSeenAt, notifClearedAt, notifDismissed]);
  const notifUnread = React.useMemo(() => unreadCount(buildNotifications({ ...notifFeed, clients, seenAt: [badgeSeenAt, notifSeenAt].filter(Boolean).sort().pop() || null, clearedAt: notifClearedAt, dismissed: notifDismissed })), [notifFeed, clients, badgeSeenAt, notifSeenAt, notifClearedAt, notifDismissed]);
  const clearNotifications = () => {
    const iso = new Date().toISOString();
    setNotifClearedAt(iso); setNotifSeenAt(iso); setBadgeSeenAt(iso); setNotifDismissed([]);
    Promise.resolve(data.clearNotifications?.(iso)).catch(() => {});
    toast("Notifications cleared");
  };
  const dismissNotification = (id) => {
    setNotifDismissed((d) => (d.includes(id) ? d : [...d, id]));
    Promise.resolve(data.dismissNotification?.(id)).catch(() => {});
  };
  const openNotifications = () => {
    const iso = new Date().toISOString();
    setNotifOpen(true);
    setBadgeSeenAt(iso);
    refreshNotifications();
    Promise.resolve(data.markNotificationsSeen?.(iso)).catch(() => {});
  };
  const closeNotifications = () => { setNotifOpen(false); if (badgeSeenAt) setNotifSeenAt((cur) => (cur && cur > badgeSeenAt ? cur : badgeSeenAt)); };

  // Live data: a client logs a workout, body data or a link submission → refresh their facts.
  // Depend on the stable callbacks, not `cache` (its identity changes on every version bump).
  const { load: loadClient, reloadAll: reloadLoadedClients } = cache;
  React.useEffect(() => data.subscribeLiveData(clients, (athleteId) => { if (athleteId) loadClient(athleteId, { force: true }).catch(() => {}); refreshNotifications(); }), [data, clients, loadClient, refreshNotifications]);
  // Safety net when realtime was disconnected (phone in the background): refresh on return, at most every 20s.
  React.useEffect(() => {
    let last = Date.now();
    const onBack = () => { if (document.visibilityState !== "visible" || Date.now() - last < 20000) return; last = Date.now(); reloadLoadedClients(); refreshNotifications(); };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => { document.removeEventListener("visibilitychange", onBack); window.removeEventListener("focus", onBack); };
  }, [reloadLoadedClients, refreshNotifications]);

  // Native: catch-up notification on resume, Android back, deep links, foreground toasts
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    markCoachSeen();
    let cancelled = false;
    const sub = CapApp.addListener("appStateChange", async ({ isActive }) => {
      if (!isActive || cancelled) return;
      const lastSeen = getCoachLastSeen();
      if (lastSeen) { try { const s = await data.loadSessionsSince(lastSeen.toISOString()); if (s.length) await triggerCoachCatchUp(s); } catch {} }
      markCoachSeen();
      refreshPreviews();
    });
    return () => { cancelled = true; sub.then((h) => h.remove()).catch(() => {}); };
  }, [data, refreshPreviews]);
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener("backButton", () => {
      if (consumeBackPress()) return;
      if (tab === "messages" && msgOpen) { setMsgOpen(null); return; }
      if (selectedId && vp !== "laptop") { setSelectedId(null); return; }
      if (tab !== "clients") { setTab("clients"); return; }
      CapApp.minimizeApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, [tab, msgOpen, selectedId, vp, setSelectedId]);
  React.useEffect(() => {
    if (!loadedClients) return;
    const link = consumePendingDeepLink();
    if (!link) return;
    switch (link.type) {
      case "chat": setTab("messages"); if (link.athleteId) setMsgOpen(link.athleteId); break;
      case "athlete_detail": case "athlete_finished": if (link.athleteId) setSelectedId(link.athleteId); setTab("clients"); break;
      case "payments": setTab("payments"); break;
      default: setTab("clients");
    }
  }, [loadedClients]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const h = (e) => { const n = e.detail; if (n?.title) toast(n.body ? `${n.title}: ${n.body}` : n.title); };
    window.addEventListener("theryn:foreground-notification", h);
    return () => window.removeEventListener("theryn:foreground-notification", h);
  }, [toast]);

  // ── Actions shared by pages ─────────────────────────────────────────────
  const clientById = (id) => clients.find((c) => c.athlete_id === id) || null;
  const actions = React.useMemo(() => ({
    message: (id) => { setMsgOpen(id); setTab("messages"); },
    remind: (id) => { setMsgOpen(id); setTab("messages"); },
    recordPayment: (id) => setSheet({ kind: "payment", athleteId: id }),
    editFee: (id) => setSheet({ kind: "fee", athleteId: id }),
    deletePayment: (p) => setSheet({ kind: "deletePayment", payment: p }),
    addClient: () => setSheet({ kind: "addClient" }),
    linkClient: (id) => setSheet({ kind: "linkClient", athleteId: id }),
    shareLink: (id) => setSheet({ kind: "shareLink", athleteId: id }),
    profile: () => setSheet({ kind: "profile" }),
    editPlan: (id) => setEditor({ athleteId: id }),
    exportPlan: (id) => {
      const d = cache.get(id); const c = clientById(id);
      if (!d || !c) { toast("Still loading this client. Try again in a moment."); return; }
      setExportReq({ name: c.athlete_name, templates: d.routine || {}, history: d.history, unit: d.profile?.unit_system === "metric" ? "kg" : "lb" });
    },
  }), [cache, clients, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Full-screen plan editor ─────────────────────────────────────────────
  if (editor) {
    const c = clientById(editor.athleteId);
    const d = cache.get(editor.athleteId);
    if (!c) { setEditor(null); return null; }
    return (
      <div className="cx-app">
        <div className="cx-main">
          <PlanEditor
            client={c}
            initialTemplates={d?.routine || null}
            history={d?.history || []}
            unit={d?.profile?.unit_system === "metric" ? "kg" : "lb"}
            onCancel={() => { setDetailTab("plan"); setEditor(null); }}
            onSaved={(templates, extra) => {
              if (extra?.export) { setExportReq({ name: c.athlete_name, templates: extra.templates, history: d?.history || [], unit: d?.profile?.unit_system === "metric" ? "kg" : "lb" }); return; }
              if (templates) { cache.set(editor.athleteId, { ...(d || {}), routine: templates }); }
              setDetailTab("plan");
              setEditor(null);
            }}
          />
        </div>
        <ExportExcelDialog open={Boolean(exportReq)} onClose={() => setExportReq(null)} {...(exportReq || {})} />
      </div>
    );
  }

  const selectedClient = selectedId ? clientById(selectedId) : null;
  const sheetClient = sheet?.athleteId ? clientById(sheet.athleteId) : null;
  const sheetFee = sheet?.athleteId ? fees.find((f) => f.athlete_id === sheet.athleteId) || null : null;

  return (
    <div className="cx-app">
      <header className="cx-topnav">
        <div className="cx-brand"><img src="/theryn-logo.svg" alt="" /> Theryn</div>
        <nav className="cx-navlinks" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="cx-navlink" data-tour={`nav-${t.id}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}{t.id === "messages" && unread > 0 && <span className="cx-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
          ))}
        </nav>
        <div className="cx-spacer" />
        {tab === "clients" && <div className="cx-search"><Icon.Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></div>}
        <NotificationsButton unread={notifUnread} onClick={openNotifications} />
        <Button variant="primary" size="sm" icon={<Icon.Plus />} onClick={actions.addClient} aria-label="Add client" data-tour="add-client"><span>Add client</span></Button>
        <button type="button" className="cx-avatar-btn" data-tour="profile" onClick={actions.profile} aria-label="Your profile and settings"><Avatar name={data.coachName} size="sm" /></button>
      </header>

      {vp === "tablet" && tab === "clients" && (
        <div className="cx-tablet-search"><div className="cx-search"><Icon.Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></div></div>
      )}
      {vp === "phone" && tab === "clients" && !selectedClient && (
        <div className="cx-row" style={{ padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 4px", gap: 8 }}>
          <button type="button" className="cx-avatar-btn" data-tour="profile" onClick={actions.profile} aria-label="Your profile and settings"><Avatar name={data.coachName} /></button>
          <div className="cx-search" style={{ flex: 1, maxWidth: "none", width: "auto", height: 44 }}><Icon.Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></div>
          <NotificationsButton unread={notifUnread} onClick={openNotifications} />
          <Button variant="primary" icon={<Icon.Plus />} aria-label="Add client" onClick={actions.addClient} data-tour="add-client" />
        </div>
      )}

      <main className="cx-main">
        {!loadedClients ? (
          <div className="cx-page"><div className="cx-spinner" style={{ marginTop: 48 }} /></div>
        ) : tab === "clients" ? (
          <ClientsPage clients={clients} cache={cache} selectedId={selectedId} onSelect={setSelectedId} fees={fees} payments={payments} defaultCurrency={data.defaultCurrency} search={search} actions={actions} detailTab={detailTab} onDetailTab={setDetailTab} />
        ) : tab === "plans" ? (
          <PlansPage clients={realClients} onExport={(req) => setExportReq(req)} onClientsChanged={(ids) => { for (const id of ids || []) cache.load(id, { force: true }).catch(() => {}); }} />
        ) : tab === "payments" ? (
          <PaymentsPage clients={clients} fees={fees} payments={payments} defaultCurrency={data.defaultCurrency} actions={actions} />
        ) : (
          <MessagesPage clients={realClients} previews={previews} refreshPreviews={refreshPreviews} openAthleteId={msgOpen} onOpen={setMsgOpen} />
        )}
      </main>

      {!(vp === "phone" && tab === "messages" && msgOpen) && !(vp === "phone" && tab === "clients" && selectedClient) && (
        <nav className="cx-tabbar" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="cx-tab" data-tour={`nav-${t.id}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); if (t.id !== "messages") setMsgOpen(null); }}>
              <t.Icon />{t.label}{t.id === "messages" && unread > 0 && <span className="cx-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
          ))}
        </nav>
      )}

      {/* Sheets */}
      <RecordPaymentSheet open={sheet?.kind === "payment"} onClose={() => setSheet(null)} clients={clients} fees={fees} defaultCurrency={data.defaultCurrency} presetAthleteId={sheet?.athleteId || null}
        onSave={async ({ athleteId, ...input }) => { const saved = await data.savePayment(athleteId, input); setPayments((p) => [saved, ...p]); toast("Payment recorded"); }} />
      <FeeSheet open={sheet?.kind === "fee"} onClose={() => setSheet(null)} client={sheetClient} fee={sheetFee} defaultCurrency={data.defaultCurrency}
        onSave={async (input) => { const saved = await data.upsertFee(sheet.athleteId, input); setFees((f) => [...f.filter((x) => x.athlete_id !== sheet.athleteId), saved]); toast("Fee saved"); }}
        onDelete={sheetFee ? async () => { await data.deleteFee(sheetFee.id); setFees((f) => f.filter((x) => x.id !== sheetFee.id)); toast("Fee removed"); } : null} />
      <Confirm open={sheet?.kind === "deletePayment"} title="Delete this payment?" body="This only removes the record. It doesn't move any money." confirmLabel="Delete" danger onClose={() => setSheet(null)}
        onConfirm={async () => { try { await data.deletePayment(sheet.payment.id); setPayments((p) => p.filter((x) => x.id !== sheet.payment.id)); toast("Payment deleted"); } catch (e) { toast(e.message || "Could not delete", "error"); } setSheet(null); }} />
      <AddClientSheet open={sheet?.kind === "addClient"} onClose={() => setSheet(null)} onAdded={async (c) => { await refreshClients(); if (c?.manual) { setTab("clients"); setSelectedId(c.athlete_id); setDetailTab("plan"); } }} />
      <ShareLinkSheet open={sheet?.kind === "shareLink"} onClose={() => setSheet(null)} client={sheetClient} />
      <NotificationsSheet open={notifOpen} onClose={closeNotifications} items={notifications} loading={notifLoading} onClearAll={clearNotifications} onDismiss={dismissNotification}
        onOpenItem={(it) => { closeNotifications(); setTab("clients"); setMsgOpen(null); setSelectedId(it.clientId); setDetailTab(it.tab); loadClient(it.clientId, { force: true }).catch(() => {}); }} />
      <LinkClientSheet open={sheet?.kind === "linkClient"} onClose={() => setSheet(null)} client={sheetClient} candidates={realClients}
        onLinked={async (athleteId) => { cache.invalidate(athleteId); await Promise.all([refreshClients(), reloadPayments()]); setSelectedId(athleteId); setDetailTab("plan"); }} />
      <ProfileSheet open={sheet?.kind === "profile"} onClose={() => setSheet(null)} clients={clients} onRemoveClient={() => { refreshClients(); reloadPayments(); }} onTour={startTour} />
      <CoachTour open={tourOpen && !editor} onClose={endTour} firstName={(data.coachName || "").replace(/^coach\s+/i, "").split(" ")[0]} hasClients={clients.length > 0}
        onStep={(id) => {
          // Laptop and tablet keep the nav visible with a client open, so show the real Share link button.
          // On the phone an open client hides the tab bar the later steps point at, so stay on the list.
          if (id === "link" && vp !== "phone" && !selectedId && clients.length > 0) { setSelectedId(clients[0].athlete_id); setDetailTab("plan"); }
        }} />
      <ExportExcelDialog open={Boolean(exportReq)} onClose={() => setExportReq(null)} {...(exportReq || {})} />
    </div>
  );
}
