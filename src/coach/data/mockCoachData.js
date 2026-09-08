// In-memory implementation of the coach data interface. Used by the dev
// preview (?coachPreview=1) so the dashboard can be exercised without signing
// in. Sample data is deliberately varied: one urgent client, one celebrating a
// PR, one with a late payment, and several on track.
import React from "react";
import { isoDate } from "../lib/format.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function session(daysBack, type, exercises) {
  const start = daysAgo(daysBack, 18);
  const exs = exercises.map(([name, sets]) => ({ name, sets: sets.map(([w, r]) => ({ w: String(w), r: String(r) })) }));
  const totalSets = exs.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exs.reduce((a, e) => a + e.sets.reduce((s, x) => s + Number(x.w) * Number(x.r), 0), 0);
  return { id: uid(), date: isoDate(start), type, duration: 55 * 60, startedAt: start.toISOString(), exercises: exs, totalSets, totalVolume };
}

const PPL = {
  Mon: { type: "Push", exercises: [{ name: "Bench Press", sets: 4, reps: "8", coachNote: "Breathe out on the press" }, { name: "Overhead Press", sets: 3, reps: "10" }, { name: "Incline Dumbbell Press", sets: 3, reps: "12" }, { name: "Lateral Raise", sets: 3, reps: "15" }, { name: "Triceps Pushdown", sets: 3, reps: "12" }] },
  Tue: { type: "Pull", exercises: [{ name: "Deadlift", sets: 3, reps: "5" }, { name: "Pull-Up", sets: 4, reps: "8" }, { name: "Barbell Row", sets: 3, reps: "10" }, { name: "Face Pull", sets: 3, reps: "15" }, { name: "Biceps Curl", sets: 3, reps: "12" }] },
  Wed: { type: "Rest", exercises: [] },
  Thu: { type: "Legs", exercises: [{ name: "Back Squat", sets: 4, reps: "6" }, { name: "Romanian Deadlift", sets: 3, reps: "10" }, { name: "Leg Press", sets: 3, reps: "12" }, { name: "Walking Lunge", sets: 3, reps: "20" }, { name: "Calf Raise", sets: 4, reps: "15" }] },
  Fri: { type: "Rest", exercises: [] },
  Sat: { type: "Upper", exercises: [{ name: "Dumbbell Bench", sets: 3, reps: "10" }, { name: "Lat Pulldown", sets: 3, reps: "12" }, { name: "Arnold Press", sets: 3, reps: "12" }, { name: "Cable Row", sets: 3, reps: "12" }] },
  Sun: { type: "Rest", exercises: [] },
};
const FULLBODY = {
  Mon: { type: "Full Body", exercises: ["Squat", "Bench Press", "Barbell Row"] },
  Tue: { type: "Rest", exercises: [] },
  Wed: { type: "Full Body", exercises: ["Deadlift", "Overhead Press", "Pull-Up"] },
  Thu: { type: "Rest", exercises: [] },
  Fri: { type: "Full Body", exercises: ["Leg Press", "Incline Dumbbell Press", "Cable Row"] },
  Sat: { type: "Rest", exercises: [] },
  Sun: { type: "Rest", exercises: [] },
};

const COACH_ID = "coach-1";
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LIFTS = {
  Push: [["Bench Press", [[135, 8], [145, 6]]], ["Overhead Press", [[75, 10]]]],
  Pull: [["Deadlift", [[225, 5]]], ["Barbell Row", [[115, 10]]]],
  Legs: [["Back Squat", [[185, 6]]], ["Leg Press", [[270, 12]]]],
  Upper: [["Dumbbell Bench", [[50, 10]]], ["Lat Pulldown", [[110, 12]]]],
  "Full Body": [["Squat", [[155, 8]]], ["Bench Press", [[115, 8]]], ["Barbell Row", [[95, 10]]]],
};
/**
 * Sessions on every scheduled day of the routine within the last `days`
 * days, except the offsets listed in `skip`. `scale` multiplies weights so
 * clients differ. Newest first, like the real loader.
 */
function scheduledHistory(routine, { days = 28, skip = [], scale = 1, includeToday = true } = {}) {
  const out = [];
  for (let back = includeToday ? 0 : 1; back < days; back++) {
    if (skip.includes(back)) continue;
    const d = daysAgo(back);
    const type = routine[DAY_KEYS[d.getDay()]]?.type;
    if (!type || type === "Rest") continue;
    const lifts = (LIFTS[type] || LIFTS.Push).map(([name, sets]) => [name, sets.map(([w, r]) => [Math.round(w * scale / 5) * 5, r])]);
    out.push(session(back, type, lifts));
  }
  return out;
}
const CLIENTS = [
  // Priya: went quiet 5 days ago → urgent "no activity" signal.
  { id: "a1", name: "Priya Sharma", routine: PPL, history: scheduledHistory(PPL, { days: 24, skip: [0, 1, 2, 3, 4], scale: 0.7 }), weights: [[0, 142], [14, 144]], fee: [150, "monthly", "1mo"], payments: [[31, 150]] },
  // Marcus: perfect month and a fresh bench PR today (225 beats 215).
  { id: "a2", name: "Marcus Lee", routine: PPL, history: [session(0, "Push", [["Bench Press", [[205, 6], [225, 5]]], ["Overhead Press", [[115, 8]]]]), ...scheduledHistory(PPL, { days: 28, includeToday: false, scale: 1.5 }).map((s) => (s.type === "Push" ? { ...s, exercises: [{ name: "Bench Press", sets: [{ w: "205", r: "5" }, { w: "215", r: "5" }] }, ...s.exercises.slice(1)] } : s))], weights: [[0, 181], [14, 179]], fee: [150, "monthly", 40], payments: [[9, 150], [40, 150]] },
  // Dana: missed two of the last six sessions, and her monthly fee is 2 days late.
  { id: "a3", name: "Dana Kim", routine: FULLBODY, history: scheduledHistory(FULLBODY, { days: 28, skip: [2, 7], scale: 0.8 }), weights: [[0, 128], [14, 130]], fee: [120, "monthly", 32], payments: [[33, 120]] },
  // Aisha, Jonas, Sam: on track and paid.
  { id: "a4", name: "Aisha Rahman", routine: PPL, history: scheduledHistory(PPL, { days: 28, scale: 0.6 }), weights: [[0, 135]], fee: [180, "monthly", 3], payments: [[3, 180]] },
  { id: "a5", name: "Jonas Tran", routine: FULLBODY, history: scheduledHistory(FULLBODY, { days: 28, scale: 1.1 }), weights: [[0, 172]], fee: [40, "weekly", 2], payments: [[1, 40]] },
  { id: "a6", name: "Sam Okafor", routine: FULLBODY, history: scheduledHistory(FULLBODY, { days: 28, scale: 1.3 }), weights: [[0, 190], [14, 190]], fee: [150, "monthly", 12], payments: [[11, 150]] },
];

function makeState() {
  const links = CLIENTS.map((c) => ({ id: "link-" + c.id, coach_id: COACH_ID, athlete_id: c.id, status: "accepted", created_at: daysAgo(60).toISOString(), athlete_name: c.name, coach_name: "Coach Vardan", athlete_code: c.id.toUpperCase() + "XY", coach_code: "THRYN4K2P" }));
  const routines = Object.fromEntries(CLIENTS.map((c) => [c.id, JSON.parse(JSON.stringify(c.routine))]));
  const histories = Object.fromEntries(CLIENTS.map((c) => [c.id, c.history]));
  const weights = Object.fromEntries(CLIENTS.map((c) => [c.id, c.weights.map(([d, w]) => ({ id: uid(), date: isoDate(daysAgo(d)), weight: w }))]));
  const measurements = Object.fromEntries(CLIENTS.map((c) => [c.id, c.id === "a1" ? [{ id: uid(), date: isoDate(daysAgo(3)), chest: 34, waist: 27, hips: 36, lArm: 11, rArm: 11.2, lThigh: 21, rThigh: 21 }] : []]));
  const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; };
  const fees = CLIENTS.map((c) => ({ id: "fee-" + c.id, coach_id: COACH_ID, athlete_id: c.id, amount: c.fee[0], currency: "USD", cadence: c.fee[1], start_date: isoDate(c.fee[2] === "1mo" ? monthAgo() : daysAgo(c.fee[2])), active: true, notes: null }));
  const payments = CLIENTS.flatMap((c) => c.payments.map(([d, amt]) => ({ id: uid(), coach_id: COACH_ID, athlete_id: c.id, amount: amt, currency: "USD", received_date: isoDate(daysAgo(d)), notes: d % 2 ? "cash" : "bank transfer" })));
  const messages = {
    a2: [
      { id: uid(), sender_id: "a2", content: "Hit 225 on bench today!!", created_at: daysAgo(0, 9).toISOString() },
      { id: uid(), sender_id: "a2", content: "Felt strong, 5 reps clean. What should I go for next week?", created_at: daysAgo(0, 9).toISOString() },
    ],
    a3: [{ id: uid(), sender_id: "a3", content: "Can I move Thursday to Friday this week?", created_at: daysAgo(1, 19).toISOString() }],
    a1: [{ id: uid(), sender_id: COACH_ID, content: "How did legs day go?", created_at: daysAgo(6, 15).toISOString() }],
    a4: [{ id: uid(), sender_id: "a4", content: "Thanks coach, see you Thursday", created_at: daysAgo(8, 11).toISOString() }],
  };
  const reads = { a2: null, a3: null, a1: daysAgo(6, 16).toISOString(), a4: daysAgo(8, 12).toISOString() };
  const templates = [
    { id: "t1", owner_coach_id: COACH_ID, name: "PPL Intermediate", version: 3, visibility: "private", created_at: daysAgo(60).toISOString(), updated_at: daysAgo(6).toISOString(), assignment_count: 3, days: toTemplateDays(PPL) },
    { id: "t2", owner_coach_id: COACH_ID, name: "Beginner Full Body", version: 1, visibility: "private", created_at: daysAgo(50).toISOString(), updated_at: daysAgo(21).toISOString(), assignment_count: 3, days: toTemplateDays(FULLBODY) },
    { id: "t3", owner_coach_id: COACH_ID, name: "Marathon Strength", version: 1, visibility: "private", created_at: daysAgo(2).toISOString(), updated_at: daysAgo(1).toISOString(), assignment_count: 0, days: [] },
  ];
  const assignments = { t1: ["a1", "a2", "a4"], t2: ["a3", "a5", "a6"], t3: [] };
  return { links, routines, histories, weights, measurements, fees, payments, messages, reads, templates, assignments, listeners: new Set() };
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function toTemplateDays(routine) {
  return DAY_ORDER.map((label, day_index) => ({
    day_index, label, workout_type: routine[label]?.type || "Rest",
    exercises: (routine[label]?.exercises || []).map((e, sort_order) => {
      const o = typeof e === "string" ? { name: e } : e;
      return { sort_order, exercise_name: o.name, target_sets: Number(o.sets) || 3, target_reps: o.reps || "8-12", notes: o.coachNote || "" };
    }),
  }));
}

const EXERCISES = ["Bench Press", "Incline Dumbbell Press", "Overhead Press", "Lateral Raise", "Triceps Pushdown", "Deadlift", "Pull-Up", "Barbell Row", "Face Pull", "Biceps Curl", "Back Squat", "Front Squat", "Romanian Deadlift", "Leg Press", "Walking Lunge", "Calf Raise", "Dumbbell Bench", "Lat Pulldown", "Arnold Press", "Cable Row", "Squat", "Plank", "Hip Thrust", "Leg Curl", "Leg Extension", "Hammer Curl", "Skull Crusher", "Dips", "Cable Fly", "Chest-Supported Row"];

export function createMockCoachData() {
  const st = makeState();
  const notify = () => st.listeners.forEach((fn) => fn());

  function useMockChat({ athleteId, authUser }) {
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => { const fn = () => setTick((t) => t + 1); st.listeners.add(fn); return () => st.listeners.delete(fn); }, []);
    const raw = st.messages[athleteId] || [];
    const otherRead = st.reads[athleteId];
    const messages = raw.map((m) => ({
      ...m, conversation_id: "conv-" + athleteId, client_id: m.id,
      status: m.sender_id === authUser.id ? (otherRead && otherRead >= m.created_at ? "read" : "sent") : "sent",
    }));
    return {
      messages, loading: false, error: null, typingUsers: [], conversationId: "conv-" + athleteId,
      sendMessage: async (content) => {
        st.messages[athleteId] = [...raw, { id: uid(), sender_id: authUser.id, content, created_at: new Date().toISOString() }];
        notify();
        await wait(50);
      },
      markRead: async () => { st.reads["__coach_" + athleteId] = new Date().toISOString(); notify(); },
      sendTyping: () => {},
    };
  }

  return {
    mode: "mock",
    isNative: false,
    coachId: COACH_ID,
    coachName: "Coach Vardan",
    coachEmail: "coach@example.com",
    defaultCurrency: "USD",
    unitSystem: "imperial",

    async loadClients() { await wait(150); return st.links.slice(); },
    async loadClientData(athleteId) {
      await wait(200 + Math.random() * 300);
      return { routine: st.routines[athleteId] || null, history: st.histories[athleteId] || [], weights: st.weights[athleteId] || [], measurements: st.measurements[athleteId] || [], profile: { height_cm: 168, unit_system: "imperial" } };
    },
    async saveClientRoutine(athleteId, templates) { await wait(300); st.routines[athleteId] = JSON.parse(JSON.stringify(templates)); return { routineId: "r-" + athleteId, forked: true }; },
    async removeClient(linkId) { await wait(200); st.links = st.links.filter((l) => l.id !== linkId); },
    async ensureInviteCode() { await wait(100); return "THRYN4K2P"; },
    async findProfileByCode(code) { await wait(200); return code.toUpperCase() === "NEWBIE" ? { id: "a7", display_name: "New Client" } : null; },
    async addClientByCode(code) {
      await wait(300);
      if (code.toUpperCase() !== "NEWBIE") throw new Error("No athlete found with that code. Ask them to check it in their app.");
      const c = { id: "link-a7", coach_id: COACH_ID, athlete_id: "a7", status: "accepted", created_at: new Date().toISOString(), athlete_name: "New Client", athlete_code: "NEWBIE" };
      st.links.push(c); st.routines.a7 = null; st.histories.a7 = []; st.weights.a7 = []; st.measurements.a7 = [];
      return { id: "a7", display_name: "New Client" };
    },
    async loadSessionsSince() { return []; },
    async searchExercises(term) {
      await wait(120);
      const q = (term || "").trim().toLowerCase();
      const list = EXERCISES.filter((n) => !q || n.toLowerCase().includes(q)).map((name) => ({ id: "ex-" + name, name, muscle_group: "", is_custom: false }));
      return list.slice(0, 12);
    },

    async loadFees() { await wait(120); return st.fees.slice(); },
    async loadPayments() { await wait(120); return st.payments.slice().sort((a, b) => (a.received_date < b.received_date ? 1 : -1)); },
    async upsertFee(athleteId, input) {
      await wait(200);
      const existing = st.fees.find((f) => f.athlete_id === athleteId);
      const fee = { id: existing?.id || "fee-" + athleteId, coach_id: COACH_ID, athlete_id: athleteId, amount: Number(input.amount), currency: input.currency || "USD", cadence: input.cadence || "monthly", start_date: input.start_date || isoDate(), active: input.active !== false, notes: input.notes ?? null };
      st.fees = [...st.fees.filter((f) => f.athlete_id !== athleteId), fee];
      return fee;
    },
    async deleteFee(id) { await wait(150); st.fees = st.fees.filter((f) => f.id !== id); },
    async savePayment(athleteId, input) {
      await wait(200);
      const p = { id: uid(), coach_id: COACH_ID, athlete_id: athleteId, amount: Number(input.amount), currency: input.currency || "USD", received_date: input.received_date || isoDate(), notes: input.notes ?? null };
      st.payments = [p, ...st.payments];
      return p;
    },
    async deletePayment(id) { await wait(150); st.payments = st.payments.filter((p) => p.id !== id); },

    async loadPreviews() {
      await wait(120);
      const out = {};
      for (const [aid, msgs] of Object.entries(st.messages)) {
        const last = msgs[msgs.length - 1];
        const readAt = st.reads["__coach_" + aid];
        const unread = msgs.filter((m) => m.sender_id !== COACH_ID && (!readAt || m.created_at > readAt)).length;
        out[aid] = { lastMsg: last ? (last.sender_id === COACH_ID ? "You: " + last.content : last.content) : null, lastMsgAt: last?.created_at || null, unread };
      }
      return out;
    },
    useChat: useMockChat,
    subscribeMessages(_clients, onMessage) { const fn = () => onMessage({}); st.listeners.add(fn); return () => st.listeners.delete(fn); },
    subscribeLiveData() { return () => {}; },

    async listTemplates() { await wait(150); return st.templates.map(({ days, ...t }) => ({ ...t, assignment_count: (st.assignments[t.id] || []).length })); },
    async createTemplate(name) { await wait(200); const t = { id: "t" + uid(), owner_coach_id: COACH_ID, name, version: 1, visibility: "private", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), days: [] }; st.templates.push(t); st.assignments[t.id] = []; return t; },
    async getTemplateWithTree(id) { await wait(150); const t = st.templates.find((x) => x.id === id); const { days, ...template } = t; return { template, days: JSON.parse(JSON.stringify(days)) }; },
    async updateTemplateName(id, name) { await wait(100); const t = st.templates.find((x) => x.id === id); if (t) t.name = name; },
    async saveTemplateTree(id, days) { await wait(300); const t = st.templates.find((x) => x.id === id); t.days = JSON.parse(JSON.stringify(days)); t.version += 1; t.updated_at = new Date().toISOString(); return t.version; },
    async duplicateTemplate(id, name) { await wait(200); const src = st.templates.find((x) => x.id === id); const t = { ...JSON.parse(JSON.stringify(src)), id: "t" + uid(), name, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; st.templates.push(t); st.assignments[t.id] = []; return t; },
    async softDeleteTemplate(id) { await wait(200); st.templates = st.templates.filter((x) => x.id !== id); delete st.assignments[id]; },
    async assignTemplate(id, athleteIds) { await wait(300); for (const a of athleteIds) { for (const k of Object.keys(st.assignments)) st.assignments[k] = st.assignments[k].filter((x) => x !== a); st.assignments[id].push(a); const t = st.templates.find((x) => x.id === id); st.routines[a] = fromTemplateDays(t.days); } return { succeeded: athleteIds, failed: [], archived: [] }; },
    async pushTemplateUpdate(id, athleteIds) { await wait(300); const ids = athleteIds || st.assignments[id]; const t = st.templates.find((x) => x.id === id); for (const a of ids) st.routines[a] = fromTemplateDays(t.days); return { succeeded: ids, skipped_overridden: [], skipped_mid_week: [], active_session_conflicts: [], failed: [] }; },
    async unassignTemplate(id, athleteIds) { await wait(200); st.assignments[id] = st.assignments[id].filter((a) => !athleteIds.includes(a)); },
    async getTemplateAssignments(id) { await wait(100); return (st.assignments[id] || []).map((a) => ({ id: "as-" + a, template_id: id, athlete_id: a, coach_id: COACH_ID, athlete_name: st.links.find((l) => l.athlete_id === a)?.athlete_name, assigned_at: daysAgo(10).toISOString(), last_pushed_version: 1, is_overridden: false })); },
    async getActiveAssignmentsForAthletes(ids) { await wait(100); const out = {}; for (const [tid, list] of Object.entries(st.assignments)) for (const a of list) if (ids.includes(a)) out[a] = { template_id: tid, template_name: st.templates.find((t) => t.id === tid)?.name }; return out; },

    async updateDisplayName() { await wait(100); },
    async updateCurrency() { await wait(100); },
    signOut() { alert("Preview mode: sign out does nothing."); },
    switchRole() { alert("Preview mode: switch role does nothing."); },
  };
}

function fromTemplateDays(days) {
  const out = {};
  for (const label of DAY_ORDER) out[label] = { type: "Rest", exercises: [] };
  for (const d of days || []) {
    out[d.label] = { type: d.workout_type, exercises: (d.exercises || []).map((e) => ({ name: e.exercise_name, sets: e.target_sets, reps: e.target_reps, coachNote: e.notes || undefined })) };
  }
  return out;
}
