// Real implementation of the coach data interface. Thin wrapper over the
// existing hooks so the dashboard has one seam to the backend. Name-only
// clients (coach_manual_clients) are merged in here so screens never care.
import { supabase } from "../../lib/supabase.ts";
import { Capacitor } from "@capacitor/core";
import { loadAthleteData, loadCoachLinks, ensureInviteCode, findProfileByCode, sendCoachRequest, removeCoachLink, loadAthleteSessionsSince } from "../../hooks/useCoach.ts";
import { saveRoutineAsCoach } from "../../hooks/useRoutine.ts";
import { loadClientFees, loadPayments, upsertClientFee, deleteClientFee, savePayment, deletePayment } from "../../hooks/usePayments.ts";
import { useChat, loadConversationPreviews } from "../../hooks/useChat.ts";
import {
  listTemplates, createTemplate, getTemplateWithTree, updateTemplateName, saveTemplateTree, duplicateTemplate,
  softDeleteTemplate, assignTemplate, pushTemplateUpdate, unassignTemplate, getTemplateAssignments, getActiveAssignmentsForAthletes,
} from "../../hooks/useTemplates.ts";
import {
  isManualId, manualIdOf, toClientId, manualToClient, manualClientData, manualFeeRow, manualPaymentRows,
  parseManualPaymentId, parseManualFeeId, cleanName, randomId,
} from "../lib/manualClients.js";
import { generateToken, hashToken, linkClientData } from "../lib/clientLinks.js";
import { isoDate } from "../lib/format.js";

const MANUAL_COLS = "id, coach_id, first_name, last_name, plan, fee, payments, notes, created_at, updated_at";
const SETUP_MSG = "Name-only clients need a one-time database update. Run supabase/migrations/20260909120000_coach_manual_clients.sql in the Supabase SQL editor.";

function isMissingTable(error) {
  const msg = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "PGRST205" || /coach_manual_clients/.test(msg) && /not exist|not find|schema cache/i.test(msg);
}

export function createSupabaseCoachData({ authUser, profile, setProfile, onSignOut, onSwitchRole }) {
  const coachId = authUser?.id;
  const email = authUser?.email || "";
  const coachName = profile?.display_name || email.split("@")[0] || "Coach";
  const defaultCurrency = profile?.default_currency || "USD";
  // The root keeps the profiles.unit_system column as `units`.
  const unitSystem = (profile?.unit_system || profile?.units) === "metric" ? "metric" : "imperial";
  let manualAvailable = true;

  // ── Manual client rows ────────────────────────────────────────────────
  async function listManualRows() {
    if (!manualAvailable) return [];
    const { data, error } = await supabase.from("coach_manual_clients").select(MANUAL_COLS).eq("coach_id", coachId).order("created_at", { ascending: true });
    if (error) {
      if (isMissingTable(error)) { manualAvailable = false; return []; }
      throw new Error(error.message);
    }
    return data || [];
  }
  async function getManualRow(manualId) {
    const { data, error } = await supabase.from("coach_manual_clients").select(MANUAL_COLS).eq("id", manualId).eq("coach_id", coachId).maybeSingle();
    if (error) throw new Error(isMissingTable(error) ? SETUP_MSG : error.message);
    if (!data) throw new Error("This client no longer exists.");
    return data;
  }
  async function patchManualRow(manualId, patch) {
    const { data, error } = await supabase.from("coach_manual_clients").update(patch).eq("id", manualId).eq("coach_id", coachId).select(MANUAL_COLS).single();
    if (error) throw new Error(isMissingTable(error) ? SETUP_MSG : error.message);
    return data;
  }

  // ── Client links (decision 0006) ───────────────────────────────────────
  const LINK_SETUP_MSG = "Run supabase/migrations/20260912120000_client_links.sql in the Supabase SQL editor.";
  function isMissingLinks(error) {
    const msg = String(error?.message || "");
    return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || (/client_links|client_link_upsert|client_submissions/.test(msg) && /not exist|not find|schema cache/i.test(msg));
  }
  function linkTarget(clientId) {
    const mid = manualIdOf(clientId);
    return mid ? { manual_client_id: mid, athlete_id: null } : { athlete_id: clientId, manual_client_id: null };
  }
  const tokenKey = (linkId) => `theryn_link_token_${linkId}`;
  const TOKEN_LABEL = "tok:";
  async function loadSubmissions(where) {
    let q = supabase.from("client_submissions").select("id, kind, payload, submitted_at").eq("coach_id", coachId).order("submitted_at", { ascending: false }).limit(200);
    q = where.athlete_id ? q.eq("athlete_id", where.athlete_id) : q.eq("manual_client_id", where.manual_client_id);
    const { data, error } = await q;
    if (error) { if (isMissingLinks(error)) return []; throw new Error(error.message); }
    return data || [];
  }

  return {
    mode: "supabase",
    isNative: Capacitor.isNativePlatform(),
    coachId,
    coachName,
    coachEmail: email,
    defaultCurrency,
    unitSystem,
    get manualClientsAvailable() { return manualAvailable; },

    // Clients: app accounts first, then name-only clients
    async loadClients() {
      const [links, manual] = await Promise.all([loadCoachLinks(coachId), listManualRows()]);
      return [...links.filter((l) => l.coach_id === coachId && l.status === "accepted"), ...manual.map(manualToClient)];
    },
    async loadClientData(clientId) {
      const mid = manualIdOf(clientId);
      if (mid) {
        // Name-only clients have no app data; link submissions are their only history.
        const [row, subs] = await Promise.all([getManualRow(mid), loadSubmissions({ manual_client_id: mid })]);
        const base = manualClientData(row);
        const linked = linkClientData(subs, { plan: row.plan, coachUnits: unitSystem });
        return { ...base, history: linked.history, measurements: linked.measurements, weights: linked.weights, profile: { ...base.profile, unit_system: linked.unitSystem }, submissions: subs };
      }
      const [d, subs] = await Promise.all([loadAthleteData(clientId), loadSubmissions({ athlete_id: clientId })]);
      // Promoted rows already live in the real tables; keep the raw submissions for notes and "via link" tags.
      return { ...d, submissions: subs };
    },
    async saveClientRoutine(clientId, templates) {
      const mid = manualIdOf(clientId);
      if (mid) { await patchManualRow(mid, { plan: templates }); return { routineId: "manual", forked: false }; }
      return saveRoutineAsCoach(clientId, templates, coachId);
    },
    async removeClient(linkId) {
      const mid = manualIdOf(linkId);
      if (mid) {
        const { error } = await supabase.from("coach_manual_clients").delete().eq("id", mid).eq("coach_id", coachId);
        if (error) throw new Error(error.message);
        return;
      }
      return removeCoachLink(linkId);
    },
    ensureInviteCode: () => ensureInviteCode(coachId),
    findProfileByCode: (code) => findProfileByCode(code),
    addClientByCode: async (code) => {
      const p = await findProfileByCode(code);
      if (!p) throw new Error("No athlete found with that code. Ask them to check it in their app.");
      if (p.id === coachId) throw new Error("That is your own code.");
      await sendCoachRequest(coachId, p.id);
      return p;
    },
    async createManualClient({ firstName, lastName }) {
      const name = cleanName(firstName, lastName);
      if (!name.first_name) throw new Error("A first name is needed.");
      if (!manualAvailable) throw new Error(SETUP_MSG);
      const { data, error } = await supabase.from("coach_manual_clients").insert({ coach_id: coachId, ...name, payments: [] }).select(MANUAL_COLS).single();
      if (error) throw new Error(isMissingTable(error) ? SETUP_MSG : error.message);
      return manualToClient(data);
    },
    /**
     * The person joined with the coach's code: copy plan, fee and payments
     * onto their real account, then delete the name-only row.
     */
    async linkManualClient(clientId, athleteId) {
      const mid = manualIdOf(clientId);
      if (!mid || isManualId(athleteId)) throw new Error("Pick a client who is on the app.");
      const row = await getManualRow(mid);
      if (row.plan && Object.keys(row.plan).length) await saveRoutineAsCoach(athleteId, row.plan, coachId);
      const fee = manualFeeRow(row, defaultCurrency);
      if (fee) await upsertClientFee(coachId, athleteId, { amount: fee.amount, currency: fee.currency, cadence: fee.cadence, start_date: fee.start_date, active: fee.active, notes: fee.notes });
      for (const p of manualPaymentRows(row)) {
        await savePayment(coachId, athleteId, { amount: p.amount, currency: p.currency, received_date: p.received_date, notes: p.notes });
      }
      const { error } = await supabase.from("coach_manual_clients").delete().eq("id", mid).eq("coach_id", coachId);
      if (error) throw new Error(error.message);
      return { moved: { plan: Boolean(row.plan), fee: Boolean(fee), payments: manualPaymentRows(row).length } };
    },
    loadSessionsSince: (sinceIso) => loadAthleteSessionsSince(coachId, sinceIso),

    // Exercise search for the plan editor
    async searchExercises(term) {
      const q = (term || "").trim();
      if (q.length < 2) {
        const [pub, mine] = await Promise.all([
          supabase.from("public_exercises").select("id, name, muscle_group").order("name").limit(60),
          supabase.from("user_exercises").select("id, name, muscle_group").eq("user_id", coachId).order("name").limit(60),
        ]);
        return [...(mine.data || []).map((r) => ({ ...r, is_custom: true })), ...(pub.data || []).map((r) => ({ ...r, is_custom: false }))];
      }
      const { data, error } = await supabase.rpc("search_exercises", { search_term: q, user_uid: coachId });
      if (error) throw new Error(error.message);
      return data || [];
    },

    // Payments (real rows plus the JSON kept on name-only clients)
    async loadFees() {
      const [real, manual] = await Promise.all([loadClientFees(coachId), listManualRows()]);
      return [...real, ...manual.map((r) => manualFeeRow(r, defaultCurrency)).filter(Boolean)];
    },
    async loadPayments() {
      const [real, manual] = await Promise.all([loadPayments(coachId), listManualRows()]);
      return [...real, ...manual.flatMap(manualPaymentRows)].sort((a, b) => (a.received_date < b.received_date ? 1 : a.received_date > b.received_date ? -1 : 0));
    },
    async upsertFee(clientId, input) {
      const mid = manualIdOf(clientId);
      if (mid) {
        const fee = { amount: Number(input.amount), currency: input.currency || defaultCurrency, cadence: input.cadence || "monthly", start_date: input.start_date || isoDate(), active: input.active !== false, notes: input.notes ?? null };
        const row = await patchManualRow(mid, { fee });
        return manualFeeRow(row, defaultCurrency);
      }
      return upsertClientFee(coachId, clientId, input);
    },
    async deleteFee(feeId) {
      const m = parseManualFeeId(feeId);
      if (m) { await patchManualRow(m.manualId, { fee: null }); return; }
      return deleteClientFee(feeId);
    },
    async savePayment(clientId, input) {
      const mid = manualIdOf(clientId);
      if (mid) {
        const row = await getManualRow(mid);
        const entry = { id: randomId(), amount: Number(input.amount), currency: input.currency || defaultCurrency, received_date: input.received_date || isoDate(), notes: input.notes ?? null, created_at: new Date().toISOString() };
        const updated = await patchManualRow(mid, { payments: [...(Array.isArray(row.payments) ? row.payments : []), entry] });
        return manualPaymentRows(updated).find((p) => p.id.endsWith(":" + entry.id));
      }
      return savePayment(coachId, clientId, input);
    },
    async deletePayment(paymentId) {
      const m = parseManualPaymentId(paymentId);
      if (m) {
        const row = await getManualRow(m.manualId);
        await patchManualRow(m.manualId, { payments: (Array.isArray(row.payments) ? row.payments : []).filter((p) => p.id !== m.paymentId) });
        return;
      }
      return deletePayment(paymentId);
    },

    // Messages (app clients only; callers pass real clients)
    loadPreviews: (clients) => loadConversationPreviews(coachId, clients.filter((c) => !c.manual)),
    useChat,
    subscribeMessages(clients, onMessage) {
      let cancelled = false;
      let channel = null;
      (async () => {
        const ids = clients.filter((c) => !c.manual).map((c) => c.athlete_id);
        if (ids.length === 0) return;
        const { data: convs } = await supabase.from("conversations").select("id").eq("coach_id", coachId).in("athlete_id", ids);
        if (cancelled || !convs || convs.length === 0) return;
        const set = new Set(convs.map((c) => c.id));
        channel = supabase
          .channel(`coach-msgs:${coachId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
            const row = payload.new;
            if (!row || !set.has(row.conversation_id) || row.sender_id === coachId) return;
            onMessage(row);
          })
          .subscribe();
      })();
      return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
    },
    // Tables must be in the supabase_realtime publication (20260913120000).
    // Link submissions cover name-only clients, whose only data is that table.
    subscribeLiveData(clients, onChange) {
      const ids = clients.filter((c) => !c.manual).map((c) => c.athlete_id).sort();
      const channel = supabase.channel(`coach-live-data:${coachId}`);
      if (ids.length > 0) {
        const filterIn = `user_id=in.(${ids.join(",")})`;
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "workout_sessions", filter: filterIn }, (p) => onChange(p.new?.user_id))
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workout_sessions", filter: filterIn }, (p) => onChange(p.new?.user_id))
          .on("postgres_changes", { event: "*", schema: "public", table: "body_weights", filter: filterIn }, (p) => onChange(p.new?.user_id || p.old?.user_id))
          .on("postgres_changes", { event: "*", schema: "public", table: "body_measurements", filter: filterIn }, (p) => onChange(p.new?.user_id || p.old?.user_id));
      }
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "client_submissions", filter: `coach_id=eq.${coachId}` }, (p) => {
        const row = p.new || {};
        onChange(row.manual_client_id ? toClientId(row.manual_client_id) : row.athlete_id);
      });
      channel.subscribe();
      return () => { supabase.removeChannel(channel); };
    },

    // Plans (templates)
    listTemplates: () => listTemplates(coachId),
    createTemplate: (name) => createTemplate(coachId, name),
    getTemplateWithTree,
    updateTemplateName,
    saveTemplateTree,
    duplicateTemplate: (id, name) => duplicateTemplate(id, name, coachId),
    softDeleteTemplate,
    assignTemplate,
    pushTemplateUpdate: (id, athleteIds, force, skipMidWeek) => pushTemplateUpdate(id, athleteIds, { force: Boolean(force), skipMidWeek: skipMidWeek !== false }),
    unassignTemplate,
    getTemplateAssignments,
    getActiveAssignmentsForAthletes,

    // Client links. link_view/link_submit only ever see the hash. So the coach
    // can copy the link on any device, the raw token is also kept in the row's
    // `label` column as "tok:<token>": coach-only under RLS, never returned to
    // the public page, and unused otherwise. Links made before this carry only
    // the device's localStorage copy; the first device that has it syncs it up.
    async getClientLink(clientId) {
      const t = linkTarget(clientId);
      let q = supabase.from("client_links").select("id, requested, opens, last_opened_at, submissions, created_at, label, token_hash").eq("coach_id", coachId).is("revoked_at", null);
      q = t.athlete_id ? q.eq("athlete_id", t.athlete_id) : q.eq("manual_client_id", t.manual_client_id);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(isMissingLinks(error) ? LINK_SETUP_MSG : error.message);
      if (!data) return { link: null, token: null };
      const { label, token_hash, ...link } = data;
      const matches = async (tok) => Boolean(tok) && (await hashToken(tok)) === token_hash;
      const synced = typeof label === "string" && label.startsWith(TOKEN_LABEL) ? label.slice(TOKEN_LABEL.length) : null;
      let local = null;
      try { local = localStorage.getItem(tokenKey(link.id)); } catch {}
      if (await matches(synced)) {
        if (local !== synced) { try { localStorage.setItem(tokenKey(link.id), synced); } catch {} }
        return { link, token: synced };
      }
      if (await matches(local)) {
        await supabase.from("client_links").update({ label: TOKEN_LABEL + local }).eq("id", link.id).eq("coach_id", coachId);
        return { link, token: local };
      }
      // Made on a device we can't read the token from. The sheet says so and
      // only replaces the link after a warning.
      return { link, token: null };
    },
    async createClientLink(clientId, { requested } = {}) {
      const t = linkTarget(clientId);
      const token = generateToken();
      const token_hash = await hashToken(token);
      const { data, error } = await supabase.rpc("client_link_upsert", { p_athlete_id: t.athlete_id, p_manual_client_id: t.manual_client_id, p_token_hash: token_hash, p_label: TOKEN_LABEL + token, p_requested: requested || null });
      if (error) throw new Error(isMissingLinks(error) ? LINK_SETUP_MSG : error.message);
      try { localStorage.setItem(tokenKey(data.id), token); } catch {}
      return { link: data, token };
    },
    async revokeClientLink(clientId) {
      const t = linkTarget(clientId);
      let q = supabase.from("client_links").update({ revoked_at: new Date().toISOString() }).eq("coach_id", coachId).is("revoked_at", null);
      q = t.athlete_id ? q.eq("athlete_id", t.athlete_id) : q.eq("manual_client_id", t.manual_client_id);
      const { error } = await q;
      if (error) throw new Error(error.message);
    },
    async updateClientLinkRequested(clientId, requested) {
      const t = linkTarget(clientId);
      let q = supabase.from("client_links").update({ requested }).eq("coach_id", coachId).is("revoked_at", null);
      q = t.athlete_id ? q.eq("athlete_id", t.athlete_id) : q.eq("manual_client_id", t.manual_client_id);
      const { error } = await q;
      if (error) throw new Error(error.message);
    },
    /** Latest link submissions across all clients, for the "what to do" line and the notification centre. */
    async loadRecentSubmissions(limit = 50) {
      const { data, error } = await supabase.from("client_submissions").select("id, kind, payload, submitted_at, athlete_id, manual_client_id").eq("coach_id", coachId).order("submitted_at", { ascending: false }).limit(limit);
      if (error) { if (isMissingLinks(error)) return []; throw new Error(error.message); }
      return data || [];
    },

    // ── Notification centre ────────────────────────────────────────────────
    // Built from rows that already exist: link submissions (all clients) and
    // workouts app clients logged themselves. Link workouts are not read from
    // workout_sessions here, or they would appear twice.
    async loadNotificationFeed(clients, { days = 30 } = {}) {
      const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
      const ids = (clients || []).filter((c) => !c.manual).map((c) => c.athlete_id);
      const [submissions, sessionsRes] = await Promise.all([
        this.loadRecentSubmissions(60),
        ids.length === 0 ? Promise.resolve({ data: [] }) : supabase.from("workout_sessions").select("id, user_id, workout_type, started_at, completed_at, notes, source").in("user_id", ids).not("completed_at", "is", null).neq("source", "link").gte("completed_at", sinceIso).order("completed_at", { ascending: false }).limit(60),
      ]);
      if (sessionsRes.error) throw new Error(sessionsRes.error.message);
      const sessions = (sessionsRes.data || []).map((s) => {
        let n = {}; try { n = s.notes ? JSON.parse(s.notes) : {}; } catch {}
        const mins = s.started_at && s.completed_at ? Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000) : null;
        return { id: s.id, athlete_id: s.user_id, type: s.workout_type, completed_at: s.completed_at, totalSets: n.totalSets || null, durationMin: mins && mins > 0 && mins < 600 ? mins : null };
      });
      return { submissions: submissions.filter((x) => x.submitted_at >= sinceIso), sessions };
    },
    // Seen and cleared watermarks live on the profile (so phone and laptop agree)
    // with a localStorage mirror, in case the column is missing or the network is out.
    // Whichever is later wins. Single dismissals are per device only.
    async getNotificationsState() {
      const { data } = await supabase.from("profiles").select("coach_notifications_seen_at, coach_notifications_cleared_at").eq("id", coachId).maybeSingle();
      const later = (remote, key) => { let local = null; try { local = localStorage.getItem(key); } catch {} return [remote || null, local].filter(Boolean).sort().pop() || null; };
      let dismissed = []; try { dismissed = JSON.parse(localStorage.getItem(`theryn_coach_notif_dismissed_${coachId}`) || "[]"); } catch {}
      return {
        seenAt: later(data?.coach_notifications_seen_at, `theryn_coach_notif_seen_${coachId}`),
        clearedAt: later(data?.coach_notifications_cleared_at, `theryn_coach_notif_cleared_${coachId}`),
        dismissed: Array.isArray(dismissed) ? dismissed : [],
      };
    },
    async markNotificationsSeen(iso = new Date().toISOString()) {
      try { localStorage.setItem(`theryn_coach_notif_seen_${coachId}`, iso); } catch {}
      await supabase.from("profiles").update({ coach_notifications_seen_at: iso }).eq("id", coachId);
      return iso;
    },
    async clearNotifications(iso = new Date().toISOString()) {
      try { localStorage.setItem(`theryn_coach_notif_cleared_${coachId}`, iso); localStorage.removeItem(`theryn_coach_notif_dismissed_${coachId}`); } catch {}
      await supabase.from("profiles").update({ coach_notifications_cleared_at: iso, coach_notifications_seen_at: iso }).eq("id", coachId);
      return iso;
    },
    async dismissNotification(id) {
      let list = []; try { list = JSON.parse(localStorage.getItem(`theryn_coach_notif_dismissed_${coachId}`) || "[]"); } catch {}
      if (!Array.isArray(list)) list = [];
      if (!list.includes(id)) list.push(id);
      try { localStorage.setItem(`theryn_coach_notif_dismissed_${coachId}`, JSON.stringify(list.slice(-300))); } catch {}
      return list;
    },

    // Profile & account
    async updateDisplayName(name) {
      const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", coachId);
      if (error) throw new Error(error.message);
      setProfile?.((p) => ({ ...p, display_name: name }));
    },
    async updateCurrency(code) {
      setProfile?.((p) => ({ ...p, default_currency: code }));
      const { error } = await supabase.from("profiles").update({ default_currency: code }).eq("id", coachId);
      if (error) throw new Error(error.message);
    },
    signOut: () => onSignOut?.(),
    switchRole: () => onSwitchRole?.(),
  };
}
