import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';

const DAILY_ROUTINE_ID = 1000;
const REFLECTION_ID = 2000;
const STREAK_ID = 3000;
const COACH_EDIT_ID = 4000;

// ── UTILITIES ─────────────────────────────────────────────────────────────
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Request notification permissions.
 */
export async function requestNotificationPermissions() {
  try {
    const permStatus = await LocalNotifications.requestPermissions();
    if (permStatus.display === 'granted') {
      try {
        await LocalNotifications.createChannel({
          id: 'theryn-alerts',
          name: 'Theryn Alerts',
          description: 'Workout reminders and coach updates',
          importance: 5,
          visibility: 1, // public on lockscreen
        });
      } catch (cErr) {
        // safe to ignore on unsupported platforms (web/iOS)
      }
    }
    return permStatus.display === 'granted';
  } catch (e) {
    console.error('LocalNotifications not available', e);
    return false;
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
          channelId: 'theryn-alerts',
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
        channelId: 'theryn-alerts',
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
        channelId: 'theryn-alerts',
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
        channelId: 'theryn-alerts',
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

    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 1000000) + 5000,
        title: pick(titles),
        body: pick(bodies),
        channelId: 'theryn-alerts',
      }]
    });
  } catch (e) {
    console.error('Failed to trigger coach notification', e);
  }
}
