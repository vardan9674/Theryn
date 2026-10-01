package com.theryn.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannels();
        }
    }

    /**
     * Register all Theryn notification channels once on first launch.
     * Channels are permanent after creation — settings survive app updates.
     * FCM sends the channel_id in the message payload; Android routes to
     * the matching channel automatically.
     */
    private void createNotificationChannels() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Helper: build a sound URI for a res/raw file
        // e.g. android.resource://com.theryn.app/raw/chime_chat
        String pkg = getPackageName();

        createChannel(nm, "chat",
                "Messages",
                "New messages from your coach or athletes",
                NotificationManager.IMPORTANCE_HIGH,
                pkg + "/raw/chime_chat", true, true);

        createChannel(nm, "coach-alerts",
                "Coach Alerts",
                "Updates about your athletes",
                NotificationManager.IMPORTANCE_HIGH,
                pkg + "/raw/bell_coach", true, true);

        createChannel(nm, "milestones",
                "Milestones & PRs",
                "Personal records and streak achievements",
                NotificationManager.IMPORTANCE_HIGH,
                pkg + "/raw/flourish_milestone", true, true);

        createChannel(nm, "reminders",
                "Reminders",
                "Workout reminders and reflections",
                NotificationManager.IMPORTANCE_DEFAULT,
                pkg + "/raw/tone_reminder", false, false);

        createChannel(nm, "routine-update",
                "Routine Updates",
                "When your coach edits your routine",
                NotificationManager.IMPORTANCE_DEFAULT,
                pkg + "/raw/bell_coach", false, false);

        createChannel(nm, "streaks",
                "Streaks",
                "Streak reminders",
                NotificationManager.IMPORTANCE_LOW,
                pkg + "/raw/pulse_streak", false, false);

        createChannel(nm, "winback",
                "Comeback",
                "Re-engagement nudges",
                NotificationManager.IMPORTANCE_LOW,
                pkg + "/raw/pulse_streak", false, false);

        createChannel(nm, "admin",
                "Connections",
                "Coach connection requests and updates",
                NotificationManager.IMPORTANCE_DEFAULT,
                pkg + "/raw/bell_coach", true, false);

        createChannel(nm, "payments",
                "Payments",
                "Payment due and overdue reminders",
                NotificationManager.IMPORTANCE_HIGH,
                null, true, false);
    }

    private void createChannel(NotificationManager nm,
                                String id, String name, String desc,
                                int importance, String soundResPath,
                                boolean vibrate, boolean showBadge) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return;

        // Skip if already registered (channels are immutable after first creation)
        if (nm.getNotificationChannel(id) != null) return;

        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        ch.setShowBadge(showBadge);
        ch.enableVibration(vibrate);

        if (soundResPath != null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            Uri soundUri = Uri.parse("android.resource://" + soundResPath);
            ch.setSound(soundUri, attrs);
        }

        nm.createNotificationChannel(ch);
    }
}
