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
import { convertPlan, normUnits } from "../lib/units.js";
import { planTemplate, stampTemplate, manualPlanFromTemplate, templateHasWorkouts, EMPTY_PLAN_MSG } from "../lib/manualTemplates.js";
import { isoDate } from "../lib/format.js";

const MANUAL_COLS_V1 = "id, coach_id, first_name, last_name, plan, fee, payments, notes, created_at, updated_at";
// email + archived_at come with 20260918200000_keep_client_history.sql; until it is
// applied the dashboard falls back to V1 (and cannot archive, only refuse to delete).
const MANUAL_COLS_V2 = MANUAL_COLS_V1 + ", email, archived_at";
const HISTORY_SETUP_MSG = "This needs a one-time database update: run supabase/migrations/20260918200000_keep_client_history.sql in the Supabase SQL editor.";
const isMissingColumn = (error) => error?.code === "42703" || error?.code === "PGRST204" || /column .* does not exist|could not find .* column/i.test(String(error?.message || ""));
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
  // The coach's kg/lb choice (profiles.unit_system; the root keeps it as `units`).
  // The whole dashboard reads in it; name-only clients' data is converted on load.
  let unitSystem = (profile?.units || profile?.unit_system) === "metric" ? "metric" : "imperial";
  let manualAvailable = true;
  let historyV2 = true; // email + archived_at columns present
  const cols = () => (historyV2 ? MANUAL_COLS_V2 : MANUAL_COLS_V1);

  // ── Manual client rows ────────────────────────────────────────────────
  async function listManualRows() {
    if (!manualAvailable) return [];
    let q = supabase.from("coach_manual_clients").select(cols()).eq("coach_id", coachId);
    if (historyV2) q = q.is("archived_at", null); // archived clients keep their history but leave the list
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) {
      if (isMissingTable(error)) { manualAvailable = false; return []; }
      if (historyV2 && isMissingColumn(error)) { historyV2 = false; return listManualRows(); }
      throw new Error(error.message);
    }
    return data || [];
  }
  async function getManualRow(manualId) {
    const { data, error } = await supabase.from("coach_manual_clients").select(cols()).eq("id", manualId).eq("coach_id", coachId).maybeSingle();
    if (error && historyV2 && isMissingColumn(error)) { historyV2 = false; return getManualRow(manualId); }
    if (error) throw new Error(isMissingTable(error) ? SETUP_MSG : error.message);
    if (!data) throw new Error("This client no longer exists.");
    return data;
  }
  async function patchManualRow(manualId, patch) {
    const { data, error } = await supabase.from("coach_manual_clients").update(patch).eq("id", manualId).eq("coach_id", coachId).select(cols()).single();
    if (error && isMissingColumn(error)) {
      if (historyV2 && !("email" in patch) && !("archived_at" in patch)) { historyV2 = false; return patchManualRow(manualId, patch); }
      throw new Error(HISTORY_SETUP_MSG);
    }
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
    get unitSystem() { return unitSystem; },
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
        // Plan target weights in the coach's units too (the editor saves them stamped with those units).
        const routine = row.plan ? convertPlan(row.plan, unitSystem, { assumeFrom: unitSystem }) : base.routine;
        return { ...base, routine, history: linked.history, measurements: linked.measurements, weights: linked.weights, profile: { ...base.profile, unit_system: linked.unitSystem }, submissions: linked.submissions };
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
        // Archive, never delete: their check-ins, plan and payments stay for
        // reports and for moving onto an account later. Their link stops working.
        const revoke = () => supabase.from("client_links").update({ revoked_at: new Date().toISOString() }).eq("coach_id", coachId).eq("manual_client_id", mid).is("revoked_at", null);
        if (historyV2) {
          try { await patchManualRow(mid, { archived_at: new Date().toISOString() }); await revoke(); return; }
          catch (e) { if (e.message !== HISTORY_SETUP_MSG) throw e; historyV2 = false; }
        }
        // Before the migration: only a client with no check-ins can go (deleting takes their check-ins with it).
        const sent = await loadSubmissions({ manual_client_id: mid });
        if (sent.length) throw new Error(`Can't remove yet: that would delete their ${sent.length} check-in${sent.length === 1 ? "" : "s"}. ${HISTORY_SETUP_MSG}`);
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
    /** Optional email for a name-only client: later, signing in with it offers them their history. */
    async updateManualEmail(clientId, email) {
      const mid = manualIdOf(clientId);
      if (!mid) throw new Error("Only for clients added by name.");
      const e = String(email || "").trim().toLowerCase();
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("That email doesn't look right.");
      const row = await patchManualRow(mid, { email: e || null });
      return row.email || null;
    },
    get historyKept() { return historyV2; },
    async createManualClient({ firstName, lastName }) {
      const name = cleanName(firstName, lastName);
      if (!name.first_name) throw new Error("A first name is needed.");
      if (!manualAvailable) throw new Error(SETUP_MSG);
      const { data, error } = await supabase.from("coach_manual_clients").insert({ coach_id: coachId, ...name, payments: [] }).select(cols()).single();
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
      // Their link check-ins belong to the name-only row and are deleted with it
      // (client_submissions.manual_client_id ON DELETE CASCADE). Until they can be
      // moved onto the account, don't connect anyone who has sent something.
      const sent = await loadSubmissions({ manual_client_id: mid });
      if (sent.length) throw new Error(`${row.first_name || "This client"} has ${sent.length} check-in${sent.length === 1 ? "" : "s"} from their link. Connecting now would delete them, so it's switched off until their history can be moved onto the account. Keep them as a name-only client for now.`);
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

    // Plans (templates). Name-only clients can't be in routine_template_assignments,
    // so for them "has this plan" is a `template` stamp on their plan JSON
    // (see lib/manualTemplates.js). Every call below splits the two kinds.
    async listTemplates() {
      const [list, manual] = await Promise.all([listTemplates(coachId), listManualRows()]);
      const extra = {}, custom = {};
      for (const r of manual) { const t = planTemplate(r.plan); if (t) { extra[t.id] = (extra[t.id] || 0) + 1; if (t.overridden) custom[t.id] = (custom[t.id] || 0) + 1; } }
      return list.map((t) => ({ ...t, assignment_count: (t.assignment_count || 0) + (extra[t.id] || 0), custom_count: (t.custom_count || 0) + (custom[t.id] || 0) }));
    },
    createTemplate: (name) => createTemplate(coachId, name),
    getTemplateWithTree,
    updateTemplateName,
    saveTemplateTree,
    duplicateTemplate: (id, name) => duplicateTemplate(id, name, coachId),
    // Deleting a plan takes app clients off it (in the RPC). Name-only clients carry
    // the plan as a stamp on their week, so take that off too; the week stays.
    async softDeleteTemplate(templateId) {
      await softDeleteTemplate(templateId);
      for (const r of await listManualRows()) {
        if (planTemplate(r.plan)?.id === templateId) {
          try { await patchManualRow(r.id, { plan: stampTemplate(r.plan, null) }); } catch { /* the lock check below ignores it anyway */ }
        }
      }
    },
    async assignTemplate(templateId, clientIds) {
      const manualIds = clientIds.filter(isManualId), appIds = clientIds.filter((id) => !isManualId(id));
      // Giving an empty plan would replace each client's week with rest days.
      const { template, days } = await getTemplateWithTree(templateId);
      if (!templateHasWorkouts(days)) throw new Error(EMPTY_PLAN_MSG);
      const res = appIds.length ? await assignTemplate(templateId, appIds) : { succeeded: [], failed: [], archived: [] };
      if (manualIds.length) {
        for (const id of manualIds) {
          try { await patchManualRow(manualIdOf(id), { plan: manualPlanFromTemplate(template, days, unitSystem) }); res.succeeded = [...(res.succeeded || []), id]; }
          catch (e) { res.failed = [...(res.failed || []), { athlete_id: id, reason: e.message }]; }
        }
      }
      return res;
    },
    async pushTemplateUpdate(templateId, clientIds, force, skipMidWeek) {
      if (!templateHasWorkouts((await getTemplateWithTree(templateId)).days)) throw new Error(EMPTY_PLAN_MSG);
      const ids = clientIds || null;
      const appIds = ids ? ids.filter((id) => !isManualId(id)) : null;
      const res = !ids || appIds.length ? await pushTemplateUpdate(templateId, appIds, { force: Boolean(force), skipMidWeek: skipMidWeek !== false }) : { succeeded: [], skipped_overridden: [], skipped_mid_week: [], active_session_conflicts: [], failed: [] };
      const rows = (await listManualRows()).filter((r) => planTemplate(r.plan)?.id === templateId && (!ids || ids.includes(toClientId(r.id))));
      if (rows.length) {
        const { template, days } = await getTemplateWithTree(templateId);
        for (const r of rows) {
          const id = toClientId(r.id);
          // The coach edited this client's week since: keep it unless they chose to overwrite.
          if (planTemplate(r.plan)?.overridden && !force) { res.skipped_overridden = [...(res.skipped_overridden || []), id]; continue; }
          try { await patchManualRow(r.id, { plan: manualPlanFromTemplate(template, days, unitSystem) }); res.succeeded = [...(res.succeeded || []), id]; }
          catch (e) { res.failed = [...(res.failed || []), { athlete_id: id, reason: e.message }]; }
        }
      }
      return res;
    },
    async unassignTemplate(templateId, clientIds) {
      const manualIds = clientIds.filter(isManualId), appIds = clientIds.filter((id) => !isManualId(id));
      if (appIds.length) await unassignTemplate(templateId, appIds);
      // Their week stays; it just stops following the saved plan.
      for (const id of manualIds) {
        const row = await getManualRow(manualIdOf(id));
        if (planTemplate(row.plan)?.id === templateId) await patchManualRow(row.id, { plan: stampTemplate(row.plan, null) });
      }
    },
    async getTemplateAssignments(templateId) {
      const [rows, manual] = await Promise.all([getTemplateAssignments(templateId), listManualRows()]);
      const extra = manual.filter((r) => planTemplate(r.plan)?.id === templateId).map((r) => {
        const t = planTemplate(r.plan);
        return { id: "manual-as:" + r.id, template_id: templateId, athlete_id: toClientId(r.id), coach_id: coachId, athlete_name: manualToClient(r).athlete_name, assigned_at: r.updated_at, last_pushed_version: t.version, is_overridden: Boolean(t.overridden), unassigned_at: null };
      });
      return [...rows, ...extra];
    },
    async getActiveAssignmentsForAthletes(clientIds) {
      const appIds = clientIds.filter((id) => !isManualId(id));
      const hasManual = clientIds.some(isManualId);
      const [out, manual, live] = await Promise.all([
        appIds.length ? getActiveAssignmentsForAthletes(appIds) : {},
        hasManual ? listManualRows() : [],
        hasManual ? listTemplates(coachId) : [],
      ]);
      // A stamp for a plan that was deleted doesn't count (plans deleted before the
      // cleanup above left them behind); tidy it off so it stops showing anywhere.
      const liveIds = new Set(live.map((t) => t.id));
      for (const r of manual) {
        const t = planTemplate(r.plan);
        if (!t || !clientIds.includes(toClientId(r.id))) continue;
        if (!liveIds.has(t.id)) { patchManualRow(r.id, { plan: stampTemplate(r.plan, null) }).catch(() => {}); continue; }
        out[toClientId(r.id)] = { template_id: t.id, template_name: t.name };
      }
      return out;
    },

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
    async updateUnits(units) {
      const u = normUnits(units);
      unitSystem = u;
      setProfile?.((p) => ({ ...p, units: u, unit_system: u }));
      const { error } = await supabase.from("profiles").update({ unit_system: u }).eq("id", coachId);
      if (error) throw new Error(error.message);
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
