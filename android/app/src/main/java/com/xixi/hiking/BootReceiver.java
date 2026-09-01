package com.xixi.hiking;

/**
 * ★2026-09-01 开机重建计划闹钟：手机重启后 Android 会清空所有 AlarmManager 闹钟，
 * 本接收器监听 BOOT_COMPLETED → 读 App 上次同步时持久化的计划数据 → 重建当天 08:00 闹钟，
 * 保证「不打开 App 也能收到计划提醒」在重启后依然生效（用户不必先打开一次 App）。
 * 数据源：SharedPreferences("xixi_alarms").plans（MainActivity.syncPlanAlarms 每次写入）。
 */
public class BootReceiver extends android.content.BroadcastReceiver {
    private static final String TAG = "XiXiHiking";

    @Override
    public void onReceive(android.content.Context context, android.content.Intent intent) {
        try {
            if (!android.content.Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
            String plans = context.getSharedPreferences("xixi_alarms", android.content.Context.MODE_PRIVATE)
                    .getString("plans", "");
            if (plans == null || plans.isEmpty()) return; // 从没设过闹钟，无需重建
            MainActivity.rebuildPlanAlarms(context, plans);
        } catch (Exception e) {
            android.util.Log.e(TAG, "BootReceiver failed", e);
        }
    }
}
