package com.xixi.hiking;

/**
 * ★2026-08-30 计划提醒闹钟接收器：不打开 App 也能收到计划提醒
 * MainActivity.syncPlanAlarms 把「今天及以后」的计划注册成系统精确闹钟（每天 08:00 触发），
 * App 进程不在也由系统 AlarmManager 拉起本接收器 → 发通知（点通知跳计划页）。
 * 权限/渠道检查与 MainActivity.showNotification 完全一致；通知 id 固定 1001（与主通知共用，互不叠加）。
 */
public class AlarmReceiver extends android.content.BroadcastReceiver {
    private static final String TAG = "XiXiHiking";

    @Override
    public void onReceive(android.content.Context context, android.content.Intent intent) {
        try {
            String date = intent.getStringExtra("alarmDate");
            String names = intent.getStringExtra("alarmNames");
            if (names == null || names.isEmpty()) return;

            android.app.NotificationManager nm =
                    (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // 权限检查：Android 13+ 运行时权限；Android 7~12 通知总开关；6.0 以下放行
            boolean canNotify;
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                canNotify = context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED;
            } else if (android.os.Build.VERSION.SDK_INT >= 24) {
                canNotify = nm.areNotificationsEnabled();
            } else {
                canNotify = true;
            }
            if (!canNotify) return;

            String channelId = "xixi_hiking_reminders";
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        channelId, "徒步计划提醒", android.app.NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("计划徒步、备份提醒等");
                nm.createNotificationChannel(ch);
                // 渠道被单独关闭 → 不提醒
                android.app.NotificationChannel real = nm.getNotificationChannel(channelId);
                if (real != null && real.getImportance()
                        == android.app.NotificationManager.IMPORTANCE_NONE) {
                    return;
                }
            }

            android.app.Notification.Builder builder;
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                builder = new android.app.Notification.Builder(context, channelId);
            } else {
                builder = new android.app.Notification.Builder(context);
            }
            // 点通知本体 → 回 App 跳计划页
            int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            }
            android.content.Intent contentIntent = new android.content.Intent(context, MainActivity.class)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra("navigate", "plans");
            android.app.PendingIntent contentPi = android.app.PendingIntent.getActivity(
                    context, 0, contentIntent, piFlags);

            builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("徒步计划提醒")
                    .setContentText("今天有徒步计划：" + names)
                    .setAutoCancel(true)
                    .setPriority(android.app.Notification.PRIORITY_DEFAULT)
                    .setContentIntent(contentPi);
            nm.notify(1001, builder.build());
        } catch (Exception e) {
            android.util.Log.e(TAG, "AlarmReceiver failed", e);
        }
    }
}
