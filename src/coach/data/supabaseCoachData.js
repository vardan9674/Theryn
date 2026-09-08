// Real implementation of the coach data interface. Thin wrapper over the
// existing hooks so the dashboard has one seam to the backend.
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

export function createSupabaseCoachData({ authUser, profile, setProfile, onSignOut, onSwitchRole }) {
  const coachId = authUser?.id;
  const email = authUser?.email || "";
  const coachName = profile?.display_name || email.split("@")[0] || "Coach";

  return {
    mode: "supabase",
    isNative: Capacitor.isNativePlatform(),
    coachId,
    coachName,
    coachEmail: email,
    defaultCurrency: profile?.default_currency || "USD",
    unitSystem: profile?.unit_system || "imperial",

    // Clients
    async loadClients() {
      const links = await loadCoachLinks(coachId);
      return links.filter((l) => l.coach_id === coachId && l.status === "accepted");
    },
    loadClientData: (athleteId) => loadAthleteData(athleteId),
    saveClientRoutine: (athleteId, templates) => saveRoutineAsCoach(athleteId, templates, coachId),
    removeClient: (linkId) => removeCoachLink(linkId),
    ensureInviteCode: () => ensureInviteCode(coachId),
    findProfileByCode: (code) => findProfileByCode(code),
    addClientByCode: async (code) => {
      const p = await findProfileByCode(code);
      if (!p) throw new Error("No athlete found with that code. Ask them to check it in their app.");
      if (p.id === coachId) throw new Error("That is your own code.");
      await sendCoachRequest(coachId, p.id);
      return p;
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

    // Payments
    loadFees: () => loadClientFees(coachId),
    loadPayments: () => loadPayments(coachId),
    upsertFee: (athleteId, input) => upsertClientFee(coachId, athleteId, input),
    deleteFee: (id) => deleteClientFee(id),
    savePayment: (athleteId, input) => savePayment(coachId, athleteId, input),
    deletePayment: (id) => deletePayment(id),

    // Messages
    loadPreviews: (clients) => loadConversationPreviews(coachId, clients),
    useChat,
    /** Notify when any message lands in this coach's conversations (excluding own). */
    subscribeMessages(clients, onMessage) {
      let cancelled = false;
      let channel = null;
      (async () => {
        const ids = clients.map((c) => c.athlete_id);
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
    /** Notify when an athlete logs a session or body data. */
    subscribeLiveData(clients, onChange) {
      const ids = clients.map((c) => c.athlete_id).sort();
      if (ids.length === 0) return () => {};
      const filterIn = `user_id=in.(${ids.join(",")})`;
      const channel = supabase
        .channel(`coach-live-data:${coachId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "workout_sessions", filter: filterIn }, (p) => onChange(p.new?.user_id))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workout_sessions", filter: filterIn }, (p) => onChange(p.new?.user_id))
        .on("postgres_changes", { event: "*", schema: "public", table: "body_weights", filter: filterIn }, (p) => onChange(p.new?.user_id || p.old?.user_id))
        .on("postgres_changes", { event: "*", schema: "public", table: "body_measurements", filter: filterIn }, (p) => onChange(p.new?.user_id || p.old?.user_id))
        .subscribe();
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
    pushTemplateUpdate,
    unassignTemplate,
    getTemplateAssignments,
    getActiveAssignmentsForAthletes,

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
