import { Capacitor } from '@capacitor/core';

// LocalNotifications is native-only — dynamically loaded so web builds don't fail.
// All call sites already guard with isNative() + try/catch, so the no-op web shim is safe.
const _noop = async () => {};
const LocalNotifications: any = {
  requestPermissions: async () => ({ display: 'unsupported' }),
  checkPermissions:   async () => ({ display: 'unsupported' }),
  schedule:           _noop,
  cancel:             _noop,
  getPending:         async () => ({ notifications: [] }),
  createChannel:      _noop,
  addListener:        () => {},
};
if (Capacitor.isNativePlatform()) {
  import('@capacitor/local-notifications').then(m => {
    Object.assign(LocalNotifications, m.LocalNotifications);
  }).catch(() => {});
}
type LocalNotificationSchema = any;

// ── NOTIFICATION ID RANGES ────────────────────────────────────────────────
// Reserved ranges (keep stable across app versions):
//   1000 – 1099  Daily routine reminders (athlete)
//   2000 – 2099  Reflection (post-workout)
//   3000 – 3099  Streak reminder (athlete)
//   4000 – 4099  Coach-edit push (athlete side)
//   5000 – 5099  Athlete-finished push (coach side, realtime)
//   6000 – 6099  Coach catch-up (app resume)
//   7000         Coach daily digest
const DAILY_ROUTINE_ID = 1000;
const REFLECTION_ID = 2000;
const STREAK_ID = 3000;
const COACH_EDIT_ID = 4000;
const ATHLETE_FINISHED_BASE = 5000;
const COACH_CATCHUP_BASE = 6000;
const COACH_DIGEST_ID = 7000;

// ── CHANNELS (Android) ────────────────────────────────────────────────────
const CH_REMINDERS = 'theryn-reminders';
const CH_COACH = 'theryn-coach';
const CH_STREAKS = 'theryn-streaks';

// ── UTILITIES ─────────────────────────────────────────────────────────────
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

async function createChannels() {
  if (!isNative()) return;
  const channels = [
    { id: CH_REMINDERS, name: 'Workout Reminders', description: 'Daily routine and reflection reminders', importance: 4 },
    { id: CH_COACH, name: 'Coach Updates', description: 'Coach edits and athlete completions', importance: 5 },
    { id: CH_STREAKS, name: 'Streak Reminders', description: 'Streak protection nudges', importance: 4 },
  ];
  for (const ch of channels) {
    try {
      await LocalNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        importance: ch.importance as 1 | 2 | 3 | 4 | 5,
        visibility: 1,
      });
    } catch {
      // ignore on unsupported platforms
    }
  }
}

/**
 * Request notification permissions + ensure channels exist.
 * Returns 'granted' | 'denied' | 'prompt' | 'unsupported'.
 */
export async function requestNotificationPermissions(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  try {
    const permStatus = await LocalNotifications.requestPermissions();
    if (permStatus.display === 'granted') {
      await createChannels();
    }
    return (permStatus.display as any) || 'unsupported';
  } catch (e) {
    console.error('LocalNotifications not available', e);
    return 'unsupported';
  }
}

/**
 * Check current permission state without prompting.
 */
export async function getNotificationPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  try {
    const s = await LocalNotifications.checkPermissions();
    return (s.display as any) || 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/**
 * Schedule a daily workout reminder based on the user's routine.
 */
export async function scheduleDailyRoutine(routine: Record<string, { type: string }>) {
  try {
    // Clear any existing daily reminders
    const pending = await LocalNotifications.getPending();
    const existingIds = pending.notifications
      .map(n => n.id)
      .filter(id => id > DAILY_ROUTINE_ID && id < DAILY_ROUTINE_ID + 1000);
    
    if (existingIds.length > 0) {
      await LocalNotifications.cancel({ notifications: existingIds.map(id => ({ id })) });
    }

    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    
    const notificationsToSchedule: LocalNotificationSchema[] = [];

    DAYS.forEach((day, index) => {
      const type = routine[day]?.type;
      if (type && type !== "Rest") {
        // We schedule this weekly on the specific day
        // capacitor local-notification schedule expects JS Date getDay() 0=Sun, 1=Mon
        // Our DAYS array 0=Mon, 1=Tue... 6=Sun
        const jsDay = index === 6 ? 1 : index + 2; // capacitor uses 1-7 for Sun-Sat

        const titles = [
          "Start Strong", "Stay Consistent", "Put in the Work",
          "Discipline Wins", "Make It Count", "Execution Over Excuses",
          "Refined Strength", "Earned, Not Given", "Hold the Standard", "Maintain the Effort"
        ];
        
        const bodies = [
          `It's ${type} Day. Show up and execute with focus.`,
          `Your ${type} session is ready. Keep the rhythm going.`,
          `${type} Day is here. Controlled reps, full intent.`,
          `Today's ${type} session matters. Give it your full attention.`,
          `Another opportunity to move forward with ${type}—don't miss it.`,
          `Your ${type} workout awaits. Approach it with intent.`,
          `The results are showing. Stay steady through ${type} today.`,
          `Consistency creates results. Execute your ${type} routine.`
        ];

        notificationsToSchedule.push({
          id: DAILY_ROUTINE_ID + index,
          title: pick(titles),
          body: pick(bodies),
          channelId: CH_REMINDERS,
          schedule: {
            on: { weekday: jsDay, hour: 8, minute: 0 },
            allowWhileIdle: true
          }
        });
      }
    });

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    }
  } catch (e) {
    console.error('Failed to schedule daily routine', e);
  }
}

/**
 * Automatically calculates and schedules a "best set" reflection notification for 8:00 PM tonight.
 * If right now is past 8:00 PM, it won't schedule it (or could schedule for +1 minute for testing).
 */
export async function scheduleReflection(exercises: any[]) {
  try {
    let bestExercise = "";
    let bestWeight = 0;
    
    for (const ex of exercises) {
      for (const set of ex.sets) {
        const w = parseFloat(set.w);
        if (!isNaN(w) && w > bestWeight) {
          bestWeight = w;
          bestExercise = ex.name;
        }
      }
    }

    if (!bestExercise) return; // Nothing to reflect on

    const now = new Date();
    let targetTime = new Date();
    targetTime.setHours(20, 0, 0, 0); // 8:00 PM

    // If it's already past 8 PM, let's schedule for 10 minutes from now (as a nice reflection before bed)
    if (now.getTime() > targetTime.getTime()) {
      targetTime = new Date(now.getTime() + 10 * 60000);
    }

    await LocalNotifications.cancel({ notifications: [{ id: REFLECTION_ID }] });

    const titles = [
      "Well Done", "Progress Noted", "Consistency Shows",
      "Reflect & Reset", "Built Over Time", "Quiet Progress",
      "Effort Acknowledged", "Solid Execution"
    ];
    
    const bodies = [
      `That ${bestWeight} lb ${bestExercise} was solid progress. Take it in.`,
      `${bestWeight} lb ${bestExercise}—earned, not given. Recover well.`,
      `Today's effort moved you forward. Strong execution on ${bestExercise}.`,
      `You showed up today, and moving ${bestWeight} lbs matters.`,
      `Another day of discipline in the books. ${bestExercise} looked solid.`,
      `Quiet progress compounding over time. Nice work today.`,
      `Every rep brought you closer. Hitting ${bestWeight} lbs on ${bestExercise} was a good step.`
    ];

    await LocalNotifications.schedule({
      notifications: [{
        id: REFLECTION_ID,
        title: pick(titles),
        body: pick(bodies),
        channelId: CH_REMINDERS,
        schedule: { at: targetTime, allowWhileIdle: true }
      }]
    });
  } catch (e) {
    console.error('Failed to schedule reflection', e);
  }
}

/**
 * Schedules a streak reminder 48 hours from now.
 */
export async function scheduleStreakReminder(streakCount: number) {
  if (!streakCount || streakCount <= 0) return;

  try {
    await LocalNotifications.cancel({ notifications: [{ id: STREAK_ID }] });

    const targetTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

    const titles = [
      "Stay Consistent", "Keep the Rhythm", "Quiet Progress",
      "Discipline Check", "Hold the Standard", "Don't Break", 
      "Maintain the Effort"
    ];
    
    const bodies = [
      `You've maintained a ${streakCount}-day streak. Show up and execute today.`,
      `${streakCount} days of focused intent. Keep the momentum going.`,
      `Your ${streakCount}-day streak proves your commitment. Stay steady today.`,
      `Another day, another opportunity. Protect your ${streakCount}-day streak.`,
      `A ${streakCount}-day foundation has been built. Keep stacking days.`,
      `Consistency requires showing up. Keep your ${streakCount}-day streak alive.`,
      `Don't let your ${streakCount}-day streak fade. Execute your plan today.`
    ];

    await LocalNotifications.schedule({
      notifications: [{
        id: STREAK_ID,
        title: pick(titles),
        body: pick(bodies),
        channelId: CH_STREAKS,
        schedule: { at: targetTime, allowWhileIdle: true }
      }]
    });
  } catch (e) {
    console.error('Failed to schedule streak reminder', e);
  }
}

/**
 * Triggers an immediate local notification when a coach updates the routine.
 */
export async function triggerCoachEditNotification() {
  try {
    const titles = [
      "Routine Updated", "Coach Adjustment", "Direction Updated",
      "Plan Refined", "Training Update", "Programming Shift", "New Intent"
    ];
    
    const bodies = [
      "Your coach has refined your intent for the week. Review the changes.",
      "Adjustments have been made to your program. Stay focused.",
      "Your training routine has been updated by your coach. Execute with precision.",
      "Your coach has optimized your routine. Time to put in the work.",
      "Updates to your program are ready. Review and execute.",
      "A new training direction has been set by your coach.",
      "Your coaching plan has shifted to push you further."
    ];

    await LocalNotifications.schedule({
      notifications: [{
        id: COACH_EDIT_ID,
        title: pick(titles),
        body: pick(bodies),
        channelId: CH_COACH,
      }]
    });
  } catch (e) {
    console.error('Failed to trigger coach edit notification', e);
  }
}

/**
 * Triggers a notification for the Coach when their athlete completes a workout
 */
export async function triggerAthleteFinishedNotification(athleteName: string, workoutType: string) {
  try {
    const titles = [
      `${athleteName} Put In The Work`, 
      `${athleteName} Completed A Session`, 
      `Athlete Update: ${athleteName}`
    ];
    
    const bodies = [
      `They just finished a solid ${workoutType} workout.`,
      `Another ${workoutType} session in the books.`,
      `Their ${workoutType} routine is complete for today.`
    ];

    // Use a stable ID range; cycling per-athlete avoids collisions
    const hash = [...athleteName].reduce((a, c) => (a + c.charCodeAt(0)) % 100, 0);
    await LocalNotifications.schedule({
      notifications: [{
        id: ATHLETE_FINISHED_BASE + hash,
        title: pick(titles),
        body: pick(bodies),
        channelId: CH_COACH,
        extra: { type: 'athlete_finished', athleteName, workoutType },
      }]
    });
  } catch (e) {
    console.error('Failed to trigger coach notification', e);
  }
}

// ── COACH: DAILY DIGEST ───────────────────────────────────────────────────

/**
 * Schedule a daily 8am coach briefing summarizing which athletes need attention.
 * Pass pre-computed signal counts from detectSignals().
 */
export async function scheduleCoachDailyDigest(
  summary: { urgent: number; warn: number; celebrate: number; totalAthletes: number; topLines?: string[] }
) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: COACH_DIGEST_ID }] });

    if (summary.totalAthletes === 0) return;

    // Schedule for tomorrow 8am (not today)
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(8, 0, 0, 0);

    let title = 'Coach Briefing';
    let body: string;
    if (summary.urgent > 0) {
      title = `${summary.urgent} athlete${summary.urgent > 1 ? 's' : ''} need${summary.urgent === 1 ? 's' : ''} attention`;
      body = summary.topLines?.[0] || 'Open Theryn to review urgent signals.';
    } else if (summary.warn > 0) {
      title = 'Coach Briefing';
      body = `${summary.warn} athlete${summary.warn > 1 ? 's' : ''} off-track this week. Tap to review.`;
    } else if (summary.celebrate > 0) {
      title = 'Coach Briefing';
      body = `${summary.celebrate} athlete${summary.celebrate > 1 ? 's' : ''} on a strong streak — send some recognition.`;
    } else {
      body = `All ${summary.totalAthletes} athlete${summary.totalAthletes > 1 ? 's' : ''} on track. Keep it going.`;
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: COACH_DIGEST_ID,
        title,
        body,
        channelId: CH_COACH,
        schedule: { at: target, allowWhileIdle: true, repeats: true, every: 'day' },
        extra: { type: 'coach_digest' },
      }]
    });
  } catch (e) {
    console.error('Failed to schedule coach daily digest', e);
  }
}

// ── COACH: CATCH-UP ON APP RESUME ─────────────────────────────────────────

const COACH_LAST_SEEN_KEY = 'theryn_coach_last_seen';

export function markCoachSeen() {
  try { localStorage.setItem(COACH_LAST_SEEN_KEY, new Date().toISOString()); } catch {}
}

export function getCoachLastSeen(): Date | null {
  try {
    const v = localStorage.getItem(COACH_LAST_SEEN_KEY);
    return v ? new Date(v) : null;
  } catch { return null; }
}

/**
 * Fire a single catch-up notification summarizing athletes that completed
 * workouts while the coach app was backgrounded. Pass the list of sessions
 * created since last-seen (caller fetches from Supabase).
 */
export async function triggerCoachCatchUp(
  finishedSessions: Array<{ athleteName: string; workoutType: string }>
) {
  if (!finishedSessions || finishedSessions.length === 0) return;
  try {
    const uniqueAthletes = Array.from(new Set(finishedSessions.map(s => s.athleteName)));
    const title = finishedSessions.length === 1
      ? `${finishedSessions[0].athleteName} finished ${finishedSessions[0].workoutType}`
      : `${finishedSessions.length} workouts completed`;
    const body = finishedSessions.length === 1
      ? `While you were away — a ${finishedSessions[0].workoutType} session.`
      : `${uniqueAthletes.slice(0, 3).join(', ')}${uniqueAthletes.length > 3 ? ' and others' : ''} logged workouts.`;

    await LocalNotifications.schedule({
      notifications: [{
        id: COACH_CATCHUP_BASE + Math.floor(Math.random() * 100),
        title,
        body,
        channelId: CH_COACH,
        extra: { type: 'coach_catchup', count: finishedSessions.length },
      }]
    });
  } catch (e) {
    console.error('Failed to trigger coach catch-up', e);
  }
}

// ── DEEP-LINK TAP HANDLER ─────────────────────────────────────────────────

const DEEP_LINK_KEY = 'theryn_pending_deeplink';

export function consumePendingDeepLink(): { type: string; [k: string]: any } | null {
  try {
    const v = localStorage.getItem(DEEP_LINK_KEY);
    if (!v) return null;
    localStorage.removeItem(DEEP_LINK_KEY);
    return JSON.parse(v);
  } catch { return null; }
}

let tapHandlerRegistered = false;

/**
 * Wire a listener so when the user taps a coach/athlete notification,
 * the intended deep-link action is captured in localStorage and the
 * app can consume it on render.
 */
export function registerNotificationTapHandlers() {
  if (tapHandlerRegistered) return;
  tapHandlerRegistered = true;
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action?.notification?.extra;
      if (!extra || !extra.type) return;
      try {
        localStorage.setItem(DEEP_LINK_KEY, JSON.stringify(extra));
      } catch {}
    });
  } catch (e) {
    console.error('Failed to register notification tap handler', e);
  }
}
