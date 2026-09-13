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
import { generateToken, hashToken, submissionToMeasurement, submissionToHistory } from "../lib/clientLinks.js";

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
    unitSystem: profile?.unit_system || "imperial",
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
        const history = subs.filter((x) => x.kind === "workout").map(submissionToHistory);
        const measurements = subs.filter((x) => x.kind === "measurements").map(submissionToMeasurement);
        const weights = measurements.filter((m) => m.weight != null).map((m) => ({ id: m.id + ":w", date: m.date, weight: m.weight, source: "link" }));
        const unit = measurements[0]?.unit === "cm" ? "metric" : "imperial";
        return { ...base, history, measurements, weights, profile: { ...base.profile, unit_system: unit }, submissions: subs };
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
        const fee = { amount: Number(input.amount), currency: input.currency || defaultCurrency, cadence: input.cadence || "monthly", start_date: input.start_date || new Date().toISOString().slice(0, 10), active: input.active !== false, notes: input.notes ?? null };
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
        const entry = { id: randomId(), amount: Number(input.amount), currency: input.currency || defaultCurrency, received_date: input.received_date || new Date().toISOString().slice(0, 10), notes: input.notes ?? null, created_at: new Date().toISOString() };
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

    // Client links. The raw token is kept in localStorage on the coach's
    // device (the database only has its hash), so "Copy" works again later.
    async getClientLink(clientId) {
      const t = linkTarget(clientId);
      let q = supabase.from("client_links").select("id, requested, opens, last_opened_at, submissions, created_at").eq("coach_id", coachId).is("revoked_at", null);
      q = t.athlete_id ? q.eq("athlete_id", t.athlete_id) : q.eq("manual_client_id", t.manual_client_id);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(isMissingLinks(error) ? LINK_SETUP_MSG : error.message);
      if (!data) return { link: null, token: null };
      let token = null;
      try { token = localStorage.getItem(tokenKey(data.id)); } catch {}
      // A link exists but this device doesn't know its token: treat as "make a new link".
      return { link: data, token };
    },
    async createClientLink(clientId, { requested, label } = {}) {
      const t = linkTarget(clientId);
      const token = generateToken();
      const token_hash = await hashToken(token);
      const { data, error } = await supabase.rpc("client_link_upsert", { p_athlete_id: t.athlete_id, p_manual_client_id: t.manual_client_id, p_token_hash: token_hash, p_label: label || null, p_requested: requested || null });
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
    /** Latest link submissions across all clients, for the "what to do" line and a future inbox. */
    async loadRecentSubmissions(limit = 50) {
      const { data, error } = await supabase.from("client_submissions").select("id, kind, payload, submitted_at, athlete_id, manual_client_id").eq("coach_id", coachId).order("submitted_at", { ascending: false }).limit(limit);
      if (error) { if (isMissingLinks(error)) return []; throw new Error(error.message); }
      return data || [];
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
