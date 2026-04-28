/**
 * usePushNotifications
 *
 * • Captures IANA timezone on every auth (handles travel)
 * • Registers with FCM via @capacitor/push-notifications
 * • Syncs token to device_tokens (upsert on conflict)
 * • Re-checks permission every time the app comes to foreground — so if the
 *   user enables notifications in iOS/Android Settings, the token registers
 *   immediately on next foreground without needing a restart.
 * • Routes tap → deep-link via localStorage (consumed by consumePendingDeepLink)
 * • Emits 'theryn:foreground-notification' for in-app toast on chat/PR while app is open
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import type { PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';

export const DEEP_LINK_KEY = 'theryn_pending_deeplink';

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureTimezone(userId: string): void {
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* keep UTC */ }
  void supabase.from('profiles').update({ timezone: tz }).eq('id', userId);
}

async function syncToken(userId: string, token: string): Promise<void> {
  const platform: 'ios' | 'android' =
    Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

  console.log('[push] syncing token for', platform, 'user', userId, 'token', token.slice(0, 20) + '...');

  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' }
    );
  if (error) {
    console.error('[push] device_tokens upsert FAILED:', error.message, error.details);
  } else {
    console.log('[push] device token saved successfully');
  }
}

function emitForeground(n: PushNotificationSchema): void {
  try {
    window.dispatchEvent(new CustomEvent('theryn:foreground-notification', { detail: n }));
  } catch { /* ignore */ }
}

function buildDeepLink(data: Record<string, string>): Record<string, unknown> | null {
  switch (data.type) {
    case 'chat':
      return { type: 'chat', conversationId: data.conversation_id, senderId: data.sender_id };
    case 'pr':
      return { type: 'pr', exerciseName: data.exercise_name, athleteId: data.athlete_id ?? null };
    case 'streak_milestone':
      return { type: 'streak_milestone', streak: data.streak };
    case 'athlete_inactive':
    case 'athlete_finished':
      return { type: 'athlete_detail', athleteId: data.athlete_id };
    case 'connection_request':
      return { type: 'connection_request', linkId: data.link_id };
    case 'connection_accepted':
    case 'connection_declined':
      return { type: 'coaching', coachId: data.coach_id };
    case 'payment_due':
    case 'payment_overdue':
      return { type: 'payments', athleteId: data.athlete_id };
    case 'comeback':
    case 'sunday_plan':
    case 'midweek_pulse':
    case 'weekly_recap':
      return { type: 'log' };
    case 'friday_wins':
      return { type: 'athletes' };
    default:
      return null;
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function usePushNotifications(userId: string | null | undefined): void {
  const userIdRef = useRef(userId);
  const listenersWired = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inProgressRef = useRef(false);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;

    // Timezone capture: fire-and-forget, handles travel.
    captureTimezone(userId);

    // ── tryRegister: check permission and register if granted ───────────────
    // Called on mount AND every time the app comes back to foreground.
    // This means: enable notifications in Settings → open app → token registers.
    const tryRegister = async () => {
      // Prevent concurrent invocations — most importantly suppresses the
      // appStateChange re-entry that fires while requestPermissions() is open,
      // which otherwise causes a duplicate register() → duplicate token sync.
      if (inProgressRef.current) return;
      inProgressRef.current = true;
      try {
        const perm = await PushNotifications.checkPermissions();
        console.log('[push] permission state:', perm.receive);

        if (perm.receive === 'granted') {
          await PushNotifications.register();
          return;
        }

        if (perm.receive === 'denied') {
          console.info('[push] notifications denied by user — skipping registration');
          return;
        }

        // 'prompt' or 'prompt-with-rationale' — show dialog with a small delay
        // so the OS dialog doesn't hit users on the very first screen.
        if (timerRef.current) clearTimeout(timerRef.current);
        await new Promise<void>((resolve) => {
          timerRef.current = setTimeout(resolve, 3000);
        });

        const req = await PushNotifications.requestPermissions();
        console.log('[push] permission request result:', req.receive);

        if (req.receive === 'granted') {
          await PushNotifications.register();
        }
      } catch (e) {
        console.error('[push] tryRegister failed:', e);
      } finally {
        inProgressRef.current = false;
      }
    };

    // ── Wire listeners once per session ─────────────────────────────────────
    if (!listenersWired.current) {
      listenersWired.current = true;

      // Token received from APNs/FCM
      void PushNotifications.addListener('registration', (t: Token) => {
        const uid = userIdRef.current;
        console.log('[push] registration token received, uid:', uid);
        if (uid) void syncToken(uid, t.value);
      });

      // Registration error
      void PushNotifications.addListener('registrationError', (err) => {
        console.error('[push] registration error:', JSON.stringify(err));
      });

      // Foreground notification — show toast for chat / PRs
      void PushNotifications.addListener(
        'pushNotificationReceived',
        (n: PushNotificationSchema) => {
          const channel = n.data?.channel ?? '';
          const type = n.data?.type ?? '';
          const shouldToast =
            channel === 'chat' ||
            channel === 'milestones' ||
            type === 'pr' ||
            type === 'streak_milestone';
          if (shouldToast) emitForeground(n);
        }
      );

      // Notification tap — store deep link
      void PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          const data: Record<string, string> = action.notification?.data ?? {};
          const link = buildDeepLink(data);
          if (link) {
            try { localStorage.setItem(DEEP_LINK_KEY, JSON.stringify(link)); } catch { /* ignore */ }
          }
        }
      );
    }

    // Run immediately on mount
    void tryRegister();

    // Re-run every time the app comes back to foreground.
    // This handles: user denied → went to Settings → enabled → returned to app.
    let appListener: { remove: () => Promise<void> } | null = null;
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && userIdRef.current) {
        console.log('[push] app foregrounded — re-checking push permission');
        void tryRegister();
      }
    }).then((l) => { appListener = l; });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void appListener?.remove();
      // Note: we intentionally keep PushNotifications listeners alive across
      // re-renders — removeAllListeners would kill them for the session.
    };
  }, [userId]);
}
