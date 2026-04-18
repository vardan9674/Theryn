export async function requestNotificationPermissions() { return "denied"; }
export async function getNotificationPermissionState() { return "denied"; }
export async function scheduleDailyRoutine(_user: unknown) {}
export async function scheduleReflection(_user: unknown) {}
export async function scheduleStreakReminder(_user: unknown) {}
export async function triggerCoachEditNotification(_opts: unknown) {}
export async function triggerAthleteFinishedNotification(_opts: unknown) {}
export async function scheduleCoachDailyDigest(_user: unknown) {}
export async function markCoachSeen(_userId: string) {}
export async function getCoachLastSeen(_userId: string): Promise<string | null> { return null; }
export async function triggerCoachCatchUp(_opts: unknown) {}
export function registerNotificationTapHandlers(_opts: unknown) {}
export async function consumePendingDeepLink(): Promise<string | null> { return null; }
