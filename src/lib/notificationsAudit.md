# Theryn Notifications — Reference

Single source of truth for what fires when. Keep this updated when you add or change a notification.

## Channels (Android)

| ID | Name | Used for | Importance |
|---|---|---|---|
| `theryn-reminders` | Workout Reminders | Daily routine, post-workout reflection | 4 |
| `theryn-coach` | Coach Updates | Coach edits (athlete side), athlete finished (coach side), coach daily digest, catch-up | 5 |
| `theryn-streaks` | Streak Reminders | Streak protection nudges | 4 |

Channels are created lazily inside `requestNotificationPermissions()` (only on native). iOS ignores `channelId`.

## ID Ranges

| Range | Purpose |
|---|---|
| `1000 – 1099` | Daily routine reminders (one per weekday, stable IDs `1000 + index`) |
| `2000` | Reflection (post-workout, single slot) |
| `3000` | Streak reminder (single slot, 48h away) |
| `4000` | Coach-edit push (athlete side, immediate) |
| `5000 – 5099` | Athlete-finished push (coach side, hashed from athlete name) |
| `6000 – 6099` | Coach catch-up (app resume) |
| `7000` | Coach daily digest (8am) |

## Triggers

### Athlete side
- **On login** — `requestNotificationPermissions()` creates channels, prompts OS.
- **On routine load / routine save** — `scheduleDailyRoutine(routine)` reschedules all seven `1000+idx` notifications using Capacitor `schedule.on.weekday` (repeats weekly).
- **On workout save** — `scheduleReflection(exercises)` at 8pm local or +10min if past 8pm; `scheduleStreakReminder(streak)` 48h later.
- **On coach routine edit (realtime)** — `triggerCoachEditNotification()` fires immediately.

### Coach side
- **On realtime workout_sessions INSERT** (while foregrounded) — `triggerAthleteFinishedNotification(name, type)` fires immediately.
- **On app cold start + resume** — if last-seen ≥ 15min ago, `loadAthleteSessionsSince(coachId, lastSeen)` queries Supabase; if any results, `triggerCoachCatchUp(sessions)` fires once summarizing them.
- **Daily (background schedule)** — `scheduleCoachDailyDigest(summary)` schedules a 7000 notification repeating every day at 8am. Content is derived from on-device insights; rescheduled 5s after each Athletes tab mount so latest signals are used.

## Deep-link (tap → in-app navigation)

Registered once via `registerNotificationTapHandlers()` in `CoachApp` mount.

When a notification is tapped, its `extra` payload is serialized into `localStorage['theryn_pending_deeplink']`. On render, `CoachApp` calls `consumePendingDeepLink()` and routes:

| `extra.type` | Behavior |
|---|---|
| `athlete_finished` | Select the matching athlete, switch to Progress tab |
| `coach_digest` | Switch to Athletes tab |
| `coach_catchup` | Switch to Athletes tab |

## Permissions UX

- `getNotificationPermissionState()` — non-prompting check.
- When `denied` + native platform, `CoachAthletesTab` shows an amber banner with a one-tap **Enable** button that re-prompts.
- iOS denial is sticky — user must enable in system Settings. For a later pass we should open system settings via a native shim when `denied` on iOS.

## Known Limitations

- **Background coach push without the app running**: Supabase realtime only fires while WebSocket is alive, which means a fully-killed app will not get instant `triggerAthleteFinishedNotification`. The `coach_catchup` flow compensates on next app open. For true background push we would need FCM/APNs via a Supabase Edge Function — tracked for a later phase.
- **Digest timing**: scheduled relative to local device time; a coach who travels across timezones will get it at the "old" local 8am. Acceptable for v1.
- **Web platform**: `LocalNotifications` is a no-op on web; all schedule/trigger calls safely swallow errors.
