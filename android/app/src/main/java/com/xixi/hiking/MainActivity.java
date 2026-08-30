package com.xixi.hiking;

import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "XiXiHiking";
    private static final String CRASH_LOG_NAME = "xixi_crash.log";

    // ★2026-08-27 键盘高度桥：记录上次通知 JS 的 IME 高度，避免键盘无变化时重复刷 JS
    private int lastImeHeight = -1;

    // ★2026-08-30 通知动作透传：点通知本体（跳计划页）→ 原生存 JSON → JS consumeNotifyAction 取
    //（数据在 JS 侧，原生只负责中转；App 被杀冷启动也能拿到，onCreate/onNewIntent 都处理）
    private String pendingNotifyAction = null;
    private static final int NOTIFY_ID = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 安装并立即关闭系统 SplashScreen（Android 12+ 强制 splash，不安装就关不掉）
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> false);

        // 全局未捕获异常捕获：把崩溃日志写到 App 外部存储，方便排查
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                writeCrashLog("uncaught-exception", throwable);
                android.os.Process.killProcess(android.os.Process.myPid());
            }
        });

        // WebView 渲染进程崩溃处理：返回 true 接住崩溃，App 不会闪退，并自动重新加载页面
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.e(TAG, "WebView render process gone, reloading... crashed=" + detail.didCrash());
                writeCrashLog("render-process-gone", new RuntimeException(
                        "didCrash=" + detail.didCrash()));
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            webView.loadUrl("https://localhost");
                        } catch (Exception e) {
                            // 加载失败则重建 Activity
                            Intent intent = new Intent(MainActivity.this, MainActivity.class);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                            startActivity(intent);
                            finish();
                        }
                    }
                });
                return true;
            }

            @Override
            public void onPageStarted(WebView webView) {
                // ★2026-08-27 深色防闪白：页面开始加载即设 WebView 背景跟随系统深色
                // （splash 关闭后、HTML 渲染前的瞬间，WebView 白底不再闪；JS 加载后 body 背景覆盖）
                int nightMode = getResources().getConfiguration().uiMode
                        & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
                webView.setBackgroundColor(nightMode == android.content.res.Configuration.UI_MODE_NIGHT_YES
                        ? 0xFF0A1220 : 0xFFFFFFFF);
            }

            @Override
            public void onPageLoaded(WebView webView) {
                setupDownloadListener(webView);
                setupJsBridge(webView);
                // ★2026-08-14 禁用双指捏合缩放（软件感，非网页感）：关闭内置缩放/手势缩放/缩放按钮
                try {
                    webView.getSettings().setSupportZoom(false);
                    webView.getSettings().setBuiltInZoomControls(false);
                    webView.getSettings().setDisplayZoomControls(false);
                } catch (Exception e) {
                    Log.e(TAG, "disable pinch zoom failed", e);
                }
                // 兜底：App 默认浅色模式，页面加载完成时先设置深色状态栏图标（白底时间可见），
                // JS applyThemeMode 会在初始化时按实际主题再校正一次
                setStatusBarStyleInternal(false);
                // ★2026-08-27 关于页 GitHub 图标：http/https 导航拦截 → 系统外部浏览器打开（返回键逻辑不受影响）
                try {
                    final com.getcapacitor.Bridge br = getBridge();
                    if (br != null) {
                        br.setWebViewClient(new com.getcapacitor.BridgeWebViewClient(br) {
                            @Override
                            public boolean shouldOverrideUrlLoading(android.webkit.WebView view, String url) {
                                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                                    try {
                                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        startActivity(intent);
                                        return true;
                                    } catch (Exception e) {
                                        Log.e(TAG, "open external url failed", e);
                                    }
                                }
                                return super.shouldOverrideUrlLoading(view, url);
                            }
                        });
                    }
                } catch (Exception e) {
                    Log.e(TAG, "setup external url handler failed", e);
                }
            }
        });

        super.onCreate(savedInstanceState);

        // ★2026-08-30 冷启动场景：通知点击（跳计划页/「完成」按钮）拉起 App 时处理
        handleNotifyIntent(getIntent());

        // ★2026-08-30 系统通知权限（Android 13+ 运行时申请，计划提醒/备份提醒用；低版本无需）
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            try {
                if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 9001);
                }
            } catch (Exception e) {
                Log.e(TAG, "notification permission request failed", e);
            }
        }

        // ★2026-08-27 返回键防误退 + 关弹窗（OnBackPressedCallback 官方通道）
        setupBackHandler();

        // ★2026-08-27 键盘覆盖式弹出（adjustNothing）+ 搜索框精确跟随：原生监听 IME insets 实时通知 JS
        setupImeListener();

        // 立即尝试设置下载监听和 JS 桥（WebView 可能已可用）
        if (bridge != null && bridge.getWebView() != null) {
            setupDownloadListener(bridge.getWebView());
            setupJsBridge(bridge.getWebView());
        }
    }

    // ★2026-08-30 通知点击处理：singleTask 下 App 在后台 → onNewIntent；App 被杀 → onCreate(getIntent)
    // 点通知本体（navigate=plans）→ 存动作 JSON，JS 启动后经 consumeNotifyAction 取走跳计划页
    private void handleNotifyIntent(Intent intent) {
        if (intent == null) return;
        try {
            String nav = intent.getStringExtra("navigate");
            if (nav != null) {
                org.json.JSONObject obj = new org.json.JSONObject();
                obj.put("navigate", nav);
                pendingNotifyAction = obj.toString();
            }
        } catch (Exception e) {
            Log.e(TAG, "handleNotifyIntent failed", e);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent); // 与 onCreate 冷启动统一，后续 getIntent() 也能拿到最新 extra
        handleNotifyIntent(intent);
    }

    // ===== 导出文件下载：JS 层把 base64 交给原生保存 =====
    private void setupJsBridge(WebView webView) {
        if (webView == null) return;
        try {
            webView.addJavascriptInterface(new JsFileBridge(webView), "XixiFileBridge");
            Log.i(TAG, "JS bridge XixiFileBridge installed");
        } catch (Exception e) {
            Log.e(TAG, "Failed to install JS bridge", e);
        }
    }

    private class JsFileBridge {
        private final WebView webView;

        JsFileBridge(WebView webView) {
            this.webView = webView;
        }

        @JavascriptInterface
        public boolean saveBase64(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safeName = sanitizeFilename(filename);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Android 10+：用 MediaStore 保存到公共 Downloads，无需权限
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    // ★2026-08-20 v1.1.0.4 MIME 按扩展名映射（原来写死 text/csv 导致 .html 备份被识别为 CSV）
                    String mime = "application/octet-stream";
                    String lowerName = safeName.toLowerCase();
                    if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) mime = "text/html";
                    else if (lowerName.endsWith(".csv")) mime = "text/csv";
                    else if (lowerName.endsWith(".json")) mime = "application/json";
                    else if (lowerName.endsWith(".txt")) mime = "text/plain"; /* 2026-08-21 v1.1.1.6 诊断导出：缺 text/plain 被当 octet-stream，系统按错误编码打开致乱码 */
                    else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mime = "image/jpeg";
                    else if (lowerName.endsWith(".png")) mime = "image/png";
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os == null) return false;
                    os.write(bytes);
                    os.flush();
                    os.close();
                } else {
                    // Android 9-：直接写 Download 目录
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File out = new File(dir, safeName);
                    FileOutputStream fos = new FileOutputStream(out);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();
                }
                Log.i(TAG, "File saved to Downloads: " + safeName + " (" + bytes.length + " bytes)");
                return true;
            } catch (Exception e) {
                Log.e(TAG, "saveBase64 failed", e);
                writeCrashLog("save-file-error", e);
                return false;
            }
        }

        private String sanitizeFilename(String name) {
            if (name == null || name.isEmpty()) return "download_" + System.currentTimeMillis() + ".csv";
            // 去掉非法字符
            return name.replaceAll("[\\\\/:*?\"<>|]", "_");
        }

        // ★2026-08-20 v1.1.0.3 保存照片到系统相册（灯箱「保存」按钮）
        // JS 调用：window.XixiFileBridge.saveImageToGallery(base64, filename) → boolean
        @JavascriptInterface
        public boolean saveImageToGallery(String base64, String filename) {
            try {
                if (base64 == null || base64.isEmpty()) return false;
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String name = sanitizeFilename(filename != null && !filename.isEmpty() ? filename : "xixi-" + System.currentTimeMillis() + ".jpg");
                if (!name.endsWith(".jpg")) name = name + ".jpg";
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    // Android 10+：MediaStore 直接写入相册，无需任何权限
                    android.content.ContentValues values = new android.content.ContentValues();
                    values.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name);
                    values.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    values.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/XiXiHiking");
                    android.net.Uri uri = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os != null) {
                        os.write(data);
                        os.close();
                        return true;
                    }
                    return false;
                } else {
                    // Android 7-9：写入公共 Pictures（需存储权限；未授权时返回 false，由 JS 提示）
                    if (android.os.Build.VERSION.SDK_INT >= 23 &&
                            checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 9001);
                        return false;
                    }
                    java.io.File dir = new java.io.File(
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES),
                            "XiXiHiking");
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File f = new java.io.File(dir, name);
                    java.io.FileOutputStream fos = new java.io.FileOutputStream(f);
                    fos.write(data);
                    fos.close();
                    sendBroadcast(new android.content.Intent(android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, android.net.Uri.fromFile(f)));
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "saveImageToGallery failed", e);
                return false;
            }
        }

        // ★2026-08-21 v1.1.1.1 震动反馈：点击按钮短震，强度跟随系统全局振动设置
        // v1.1.1.3 修复：去掉 HAPTIC_FEEDBACK_ENABLED 检查 + 去掉 USAGE_TOUCH——
        // 两者都受系统「触摸反馈」设置抑制（关闭/强度0时 App 不震），
        // 现改为 App 开关=唯一开关，DEFAULT_AMPLITUDE 跟随系统振动强度，保证必震
        // JS 调用：window.XixiFileBridge.vibrate(15) → boolean
        @JavascriptInterface
        public boolean vibrate(int durationMs) {
            try {
                int ms = (durationMs > 0 && durationMs <= 100) ? durationMs : 15;
                android.os.Vibrator v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return false;
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(android.os.VibrationEffect.createOneShot(
                            ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    // Android 7 及以下：默认强度短震
                    v.vibrate(ms);
                }
                return true;
            } catch (Exception e) {
                Log.e(TAG, "vibrate failed", e);
                return false;
            }
        }

        // ★2026-08-30 系统通知（计划提醒等，适配小米灵动岛/通知栏）
        // JS 调用：window.XixiFileBridge.showNotification(title, body) → boolean
        // 小米 HyperOS 对标准通知自动适配灵动岛胶囊形态；通知渠道固定创建，重复调用幂等
        // ★2026-08-30 通知交互（v1.1.6.10 简化）：点通知本体 → 回 App 跳计划页（navigate=plans）
        // ★2026-08-30 修复：权限被拒时 notify() 不抛异常、静默丢弃，
        //   若不检查会误报成功 → JS 收到 true 不降级 toast → 提醒彻底消失
        @JavascriptInterface
        public boolean showNotification(String title, String body) {
            try {
                android.app.NotificationManager nm =
                        (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm == null) return false;
                String channelId = "xixi_hiking_reminders";
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(
                            channelId, "徒步计划提醒", android.app.NotificationManager.IMPORTANCE_DEFAULT);
                    ch.setDescription("计划徒步、备份提醒等");
                    nm.createNotificationChannel(ch);
                    // 渠道被单独关闭（Android 8+ 设置里关某渠道）→ 视为不可用
                    android.app.NotificationChannel real = nm.getNotificationChannel(channelId);
                    if (real != null && real.getImportance()
                            == android.app.NotificationManager.IMPORTANCE_NONE) {
                        return false;
                    }
                }
                // 应用级权限：Android 13+ 查运行时权限；Android 7~12 查通知总开关；
                // Android 6.0 以下无需通知权限直接放行（areNotificationsEnabled 为 API 24+）
                boolean canNotify;
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    canNotify = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED;
                } else if (android.os.Build.VERSION.SDK_INT >= 24) {
                    canNotify = nm.areNotificationsEnabled();
                } else {
                    canNotify = true;
                }
                if (!canNotify) return false;
                android.app.Notification.Builder builder;
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    builder = new android.app.Notification.Builder(MainActivity.this, channelId);
                } else {
                    builder = new android.app.Notification.Builder(MainActivity.this);
                }
                // 点通知本体 → 回 App 跳计划页
                int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
                if (android.os.Build.VERSION.SDK_INT >= 23) {
                    piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
                }
                android.content.Intent contentIntent = new android.content.Intent(MainActivity.this, MainActivity.class)
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        .putExtra("navigate", "plans");
                android.app.PendingIntent contentPi = android.app.PendingIntent.getActivity(
                        MainActivity.this, 0, contentIntent, piFlags);
                builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(title == null ? "XiXiの徒步小记" : title)
                        .setContentText(body == null ? "" : body)
                        .setAutoCancel(true)
                        .setPriority(android.app.Notification.PRIORITY_DEFAULT)
                        .setContentIntent(contentPi);
                // ★固定通知 id：启动提醒/闹钟提醒共用，重复提醒直接覆盖
                nm.notify(NOTIFY_ID, builder.build());
                return true;
            } catch (Exception e) {
                Log.e(TAG, "showNotification failed", e);
                return false;
            }
        }

        // ★2026-08-30 不打开 App 也能提醒：JS 把「今天及以后的计划」同步成系统闹钟
        // JS 调用：window.XixiFileBridge.syncPlanAlarms('[{"id":"..","name":"..","date":"YYYY-MM-DD"}]')
        // 按 date 分组，每天 08:00 触发一次 AlarmReceiver → 发通知（点通知跳计划页）
        // 旧闹钟先全 cancel（SharedPreferences 记上次日期集合），App 每次打开/计划变更都全量重设
        @JavascriptInterface
        public void syncPlanAlarms(String plansJson) {
            try {
                org.json.JSONArray arr = (plansJson == null || plansJson.isEmpty())
                        ? new org.json.JSONArray() : new org.json.JSONArray(plansJson);
                // 按日期分组（LinkedHashMap 保持插入序）
                java.util.Map<String, java.util.List<org.json.JSONObject>> byDate =
                        new java.util.LinkedHashMap<>();
                for (int i = 0; i < arr.length(); i++) {
                    org.json.JSONObject o = arr.optJSONObject(i);
                    if (o == null) continue;
                    String date = o.optString("date", "");
                    if (date.length() != 10) continue;
                    if (!byDate.containsKey(date)) byDate.put(date, new java.util.ArrayList<org.json.JSONObject>());
                    byDate.get(date).add(o);
                }
                android.app.AlarmManager am =
                        (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
                if (am == null) return;
                android.content.SharedPreferences sp =
                        getSharedPreferences("xixi_alarms", MODE_PRIVATE);
                // 取消旧闹钟
                org.json.JSONArray oldDates = new org.json.JSONArray(sp.getString("dates", "[]"));
                for (int i = 0; i < oldDates.length(); i++) {
                    String d = oldDates.optString(i);
                    if (d.length() != 10) continue;
                    am.cancel(buildPlanAlarmPendingIntent(d, ""));
                }
                // 设置新闹钟（今天及以后的日期，每天 08:00 触发一次）
                org.json.JSONArray newDates = new org.json.JSONArray();
                long now = System.currentTimeMillis();
                for (java.util.Map.Entry<String, java.util.List<org.json.JSONObject>> e : byDate.entrySet()) {
                    String date = e.getKey();
                    java.lang.StringBuilder names = new java.lang.StringBuilder();
                    for (org.json.JSONObject p : e.getValue()) {
                        if (names.length() > 0) names.append("、");
                        names.append(p.optString("name", "未命名计划"));
                    }
                    long trigger = parsePlanDateMillis(date) + 8 * 60 * 60 * 1000L; // 当天 08:00
                    if (trigger <= now) continue; // 已过 08:00 今天不再补设
                    android.app.PendingIntent pi = buildPlanAlarmPendingIntent(date, names.toString());
                    if (android.os.Build.VERSION.SDK_INT >= 31) {
                        if (am.canScheduleExactAlarms()) {
                            am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, trigger, pi);
                        } else {
                            am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, trigger, pi);
                        }
                    } else if (android.os.Build.VERSION.SDK_INT >= 23) {
                        am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, trigger, pi);
                    } else {
                        am.set(android.app.AlarmManager.RTC_WAKEUP, trigger, pi);
                    }
                    newDates.put(date);
                }
                sp.edit().putString("dates", newDates.toString()).apply();
            } catch (Exception ex) {
                Log.e(TAG, "syncPlanAlarms failed", ex);
            }
        }

        // 计划日期（YYYY-MM-DD）→ 当天 0 点毫秒（本地时区）
        private long parsePlanDateMillis(String date) {
            try {
                java.text.SimpleDateFormat sdf =
                        new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
                sdf.setTimeZone(java.util.TimeZone.getDefault());
                java.util.Date d = sdf.parse(date);
                return d == null ? 0L : d.getTime();
            } catch (Exception e) {
                return 0L;
            }
        }

        // 按日期构造唯一 PendingIntent（requestCode = YYYYMMDD 数字，稳定可 cancel）
        private android.app.PendingIntent buildPlanAlarmPendingIntent(String date, String names) {
            try {
                int rc = Integer.parseInt(date.replace("-", ""));
                android.content.Intent i = new android.content.Intent(MainActivity.this, AlarmReceiver.class)
                        .putExtra("alarmDate", date)
                        .putExtra("alarmNames", names);
                int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
                if (android.os.Build.VERSION.SDK_INT >= 23) {
                    flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
                }
                return android.app.PendingIntent.getBroadcast(MainActivity.this, rc, i, flags);
            } catch (Exception e) {
                Log.e(TAG, "buildPlanAlarmPendingIntent failed", e);
                return null;
            }
        }

        // ★2026-08-30 通知动作消费：返回 JSON（取走即清空），如 {"navigate":"plans"}
        // JS 启动时调用：点通知本体 → navigate=plans 跳计划页
        @JavascriptInterface
        public String consumeNotifyAction() {
            String a = MainActivity.this.pendingNotifyAction;
            MainActivity.this.pendingNotifyAction = null;
            return a == null ? "" : a;
        }

        // ===== WebDAV 桥：绕开 WebView 跨域限制，原生发起 HTTP 请求 =====
        // JS 调用：window.XixiFileBridge.webdavRequest(url, method, username, password, bodyBase64)
        // 支持方法：GET / PUT / OPTIONS / MKCOL / PROPFIND / DELETE
        // 返回 JSON 字符串：{"status": 0, "body": "base64或空", "error": "错误消息或null"}
        // ★用 OkHttp：支持任意 HTTP 方法（PROPFIND/MKCOL），绕开 HttpURLConnection 反射限制
        //（Android 9+ hidden API 拦截反射改 method 字段，导致 PROPFIND/MKCOL 实际按 GET 发出）
        @JavascriptInterface
        public String webdavRequest(final String url, final String method, final String username, final String password, final String bodyBase64) {
            final String[] result = new String[1];
            Thread thread = new Thread(new Runnable() {
                @Override
                public void run() {
                    result[0] = doWebdavRequest(url, method, username, password, bodyBase64);
                }
            });
            thread.start();
            try {
                thread.join(8000); // ★2026-08-19 v1.1.0.1 根治卡死：30s→8s（网络差时快速放弃，UI 不再卡死）
            } catch (InterruptedException e) {
                return "{\"status\":0,\"body\":\"\",\"error\":\"request interrupted\"}";
            }
            return result[0] != null ? result[0] : "{\"status\":0,\"body\":\"\",\"error\":\"timeout\"}";
        }

        // ★2026-08-19 v1.1.0.2 异步版 WebDAV 桥：调用立即返回，后台线程请求，完成后回调 JS 全局函数。
        // JS 侧 window.XixiFileBridge.webdavRequestAsync(url, method, username, password, bodyBase64, callbackName)
        // 回调：window[callbackName](jsonString)——UI 零阻塞，彻底消除同步桥卡死
        @JavascriptInterface
        public void webdavRequestAsync(final String url, final String method, final String username, final String password, final String bodyBase64, final String callbackName) {
            final WebView wv = webView;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    final String result = doWebdavRequest(url, method, username, password, bodyBase64);
                    if (wv != null && callbackName != null) {
                        try {
                            wv.post(new Runnable() {
                                @Override
                                public void run() {
                                    String escaped = result.replace("\\", "\\\\").replace("\"", "\\\"")
                                            .replace("\n", "\\n").replace("\r", "\\r");
                                    wv.evaluateJavascript("window['" + callbackName + "'](\"" + escaped + "\");", null);
                                }
                            });
                        } catch (Exception e) {
                            Log.e(TAG, "webdavRequestAsync callback failed", e);
                        }
                    }
                }
            }).start();
        }

        private String doWebdavRequest(String url, String method, String username, String password, String bodyBase64) {
            try {
                String upper = method != null ? method.toUpperCase(Locale.US) : "GET";
                // ★2026-08-21 v1.1.1.9 WebDAV 超时修复：上传（PUT，含照片的大备份）用长超时（60s），
                // 否则几 MB 的 body 在 8s 内传不完必超时；其余请求（PROPFIND/GET/DELETE 等）20s 足够
                okhttp3.OkHttpClient.Builder clientBuilder = new okhttp3.OkHttpClient.Builder()
                        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS);
                if ("PUT".equals(upper)) {
                    clientBuilder.readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                            .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS);
                } else {
                    clientBuilder.readTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
                            .writeTimeout(20, java.util.concurrent.TimeUnit.SECONDS);
                }
                okhttp3.OkHttpClient client = clientBuilder.build();
                okhttp3.Request.Builder rb = new okhttp3.Request.Builder().url(url)
                        .header("User-Agent", "XiXiHiking/1.0");
                if (username != null && !username.isEmpty()) {
                    String auth = "Basic " + Base64.encodeToString(
                            (username + ":" + (password != null ? password : "")).getBytes("UTF-8"),
                            Base64.NO_WRAP);
                    rb.header("Authorization", auth);
                }
                okhttp3.RequestBody reqBody = null;
                if ("PUT".equalsIgnoreCase(upper) && bodyBase64 != null && !bodyBase64.isEmpty()) {
                    byte[] data = Base64.decode(bodyBase64, Base64.DEFAULT);
                    reqBody = okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/octet-stream"), data);
                } else if ("PROPFIND".equalsIgnoreCase(upper)) {
                    // 列目录：Depth:1 只列直接子项；标准 propfind XML body（部分服务器要求非空）
                    rb.header("Depth", "1");
                    String propXml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                            "<propfind xmlns=\"DAV:\"><prop><displayname/></prop></propfind>";
                    reqBody = okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/xml; charset=utf-8"), propXml);
                } else if ("OPTIONS".equalsIgnoreCase(upper)) {
                    // OPTIONS 需要空 body 标记
                    rb.header("Content-Length", "0");
                }
                okhttp3.Request request = rb.method(upper, reqBody).build();
                okhttp3.Response response = client.newCall(request).execute();
                int status = response.code();
                byte[] bytes = response.body() != null ? response.body().bytes() : new byte[0];
                String body = bytes.length > 0 ? Base64.encodeToString(bytes, Base64.NO_WRAP) : "";
                response.close();
                return "{\"status\":" + status + ",\"body\":\"" + body + "\",\"error\":null}";
            } catch (Exception e) {
                Log.e(TAG, "webdavRequest failed: " + url, e);
                String msg = e.getMessage() != null ? e.getMessage().replace("\\", "\\\\").replace("\"", "\\\"") : "unknown error";
                return "{\"status\":0,\"body\":\"\",\"error\":\"" + msg + "\"}";
            }
        }

        // ===== 状态栏图标颜色：浅色模式用深色图标（白底可见），深色模式用白色图标 =====
        // JS 调用：window.XixiFileBridge.setStatusBarStyle(isDark)
        // isDark=true  → 深色模式：白色状态栏图标（背景深蓝）
        // isDark=false → 浅色模式：深色状态栏图标（背景白，时间可见）
        @JavascriptInterface
        public void setStatusBarStyle(boolean isDark) {
            setStatusBarStyleInternal(isDark);
        }

        // ===== 应用内更新（2026-08-11）：GitHub Release 检查 =====
        // JS 调用：window.XixiFileBridge.checkUpdate()
        // 返回 JSON：{"tag":"v1.0.8.6","name":"...","apkUrl":"https://...apk","body":"..."} 或 {"error":"..."}
        @JavascriptInterface
        public String checkUpdate() {
            final String[] result = new String[1];
            Thread thread = new Thread(new Runnable() {
                @Override
                public void run() {
                    result[0] = doCheckUpdate();
                }
            });
            thread.start();
            try {
                thread.join(6000); // ★2026-08-19 v1.1.0.1 防御：15s→6s（JS 已改 fetch 异步，此桥保留兜底）
            } catch (InterruptedException e) {
                return "{\"error\":\"request interrupted\"}";
            }
            return result[0] != null ? result[0] : "{\"error\":\"timeout\"}";
        }

        private String doCheckUpdate() {
            try {
                okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                        .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                        .build();
                okhttp3.Request request = new okhttp3.Request.Builder()
                        .url("https://api.github.com/repos/NiUKinGDoM/xixi-hiking/releases/latest")
                        .header("User-Agent", "XiXiHiking/1.0")
                        .header("Accept", "application/vnd.github+json")
                        .build();
                okhttp3.Response response = client.newCall(request).execute();
                String body = response.body() != null ? response.body().string() : "";
                int status = response.code();
                response.close();
                if (status != 200) {
                    return "{\"error\":\"HTTP " + status + "\"}";
                }
                org.json.JSONObject json = new org.json.JSONObject(body);
                String tag = json.optString("tag_name", "");
                String name = json.optString("name", "");
                String relBody = json.optString("body", "");
                String apkUrl = "";
                org.json.JSONArray assets = json.optJSONArray("assets");
                if (assets != null && assets.length() > 0) {
                    apkUrl = assets.optJSONObject(0).optString("browser_download_url", "");
                }
                return "{\"tag\":\"" + escapeJson(tag)
                        + "\",\"name\":\"" + escapeJson(name)
                        + "\",\"apkUrl\":\"" + escapeJson(apkUrl)
                        + "\",\"body\":\"" + escapeJson(relBody)
                        + "\"}";
            } catch (Exception e) {
                Log.e(TAG, "checkUpdate failed", e);
                return "{\"error\":\"" + escapeJson(e.getMessage() != null ? e.getMessage() : "unknown") + "\"}";
            }
        }

        // ===== 应用内更新：镜像下载 + 系统安装器安装 =====
        // JS 调用：window.XixiFileBridge.downloadAndInstall(apkUrl, mirrorUrl)
        // 镜像优先（快），失败自动兜底官方直链；完成后回调 window.XixiUpdaterCallback(state, message)
        // state: 'need_permission'(去授权未知来源) / 'downloaded'(下载完待装，一般自动继续) /
        //        'installing'(已跳系统安装器) / 'error'(失败)
        @JavascriptInterface
        public void downloadAndInstall(final String apkUrl, final String mirrorUrl) {
            Thread thread = new Thread(new Runnable() {
                @Override
                public void run() {
                    File apk = downloadApk(apkUrl, mirrorUrl);
                    if (apk == null) {
                        notifyJs("error", "下载失败，请检查网络后重试");
                        return;
                    }
                    notifyJs("downloaded", apk.getAbsolutePath());
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            installApk(apk);
                        }
                    });
                }
            });
            thread.start();
        }

        private File downloadApk(String apkUrl, String mirrorUrl) {
            String[] urls = new String[]{mirrorUrl, apkUrl};
            for (String u : urls) {
                if (u == null || u.isEmpty()) continue;
                try {
                    okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                            .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                            .build();
                    okhttp3.Request request = new okhttp3.Request.Builder().url(u)
                            .header("User-Agent", "XiXiHiking/1.0").build();
                    okhttp3.Response response = client.newCall(request).execute();
                    if (!response.isSuccessful()) {
                        response.close();
                        continue;
                    }
                    // ★2026-08-26 流式下载 + 进度回调（notifyJs('progress', done/total)，300ms 限频）
                    // total 可能 -1（镜像 chunked 无 Content-Length）→ 前端显示已下载大小兜底
                    long total = response.body() != null ? response.body().contentLength() : -1;
                    java.io.InputStream is = response.body() != null ? response.body().byteStream() : null;
                    if (is == null) {
                        response.close();
                        continue;
                    }
                    File dir = new File(getCacheDir(), "downloads");
                    if (!dir.exists()) dir.mkdirs();
                    File apk = new File(dir, "xixi_update.apk");
                    FileOutputStream fos = new FileOutputStream(apk);
                    byte[] buf = new byte[8192];
                    long done = 0;
                    long lastNotify = 0;
                    int n;
                    while ((n = is.read(buf)) > 0) {
                        fos.write(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 300) {
                            lastNotify = now;
                            notifyJs("progress", done + "/" + total);
                        }
                    }
                    fos.flush();
                    fos.close();
                    is.close();
                    response.close();
                    if (apk.length() < 1000) continue; // 太小基本是错误页
                    Log.i(TAG, "APK downloaded from " + u + " size=" + apk.length());
                    return apk;
                } catch (Exception e) {
                    Log.e(TAG, "download from " + u + " failed", e);
                }
            }
            return null;
        }

        private void installApk(File apk) {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    // Android 8+ 首次需授权"安装未知应用"
                    notifyJs("need_permission", "");
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return;
                }
                Uri apkUri;
                if (Build.VERSION.SDK_INT >= 24) {
                    apkUri = androidx.core.content.FileProvider.getUriForFile(MainActivity.this,
                            getPackageName() + ".fileprovider", apk);
                } else {
                    apkUri = Uri.fromFile(apk);
                }
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(intent);
                notifyJs("installing", "");
            } catch (Exception e) {
                Log.e(TAG, "install failed", e);
                notifyJs("error", "安装失败：" + (e.getMessage() != null ? e.getMessage() : "unknown"));
            }
        }

        private void notifyJs(final String state, final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String msg = message != null
                                ? message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "") : "";
                        String js = "try{if(window.XixiUpdaterCallback){XixiUpdaterCallback('" + state + "','" + msg + "');}}catch(e){}";
                        webView.evaluateJavascript(js, null);
                    } catch (Exception e) {
                        Log.e(TAG, "notifyJs failed", e);
                    }
                }
            });
        }

        private String escapeJson(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "\\r");
        }
    }

    private void setStatusBarStyleInternal(final boolean isDark) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 30) {
                        getWindow().getInsetsController().setSystemBarsAppearance(
                                isDark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
                    } else {
                        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
                        if (!isDark) {
                            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        }
                        getWindow().getDecorView().setSystemUiVisibility(flags);
                    }
                    getWindow().setStatusBarColor(Color.TRANSPARENT);
                    Log.i(TAG, "StatusBar style set: isDark=" + isDark);
                } catch (Exception e) {
                    Log.e(TAG, "setStatusBarStyle failed", e);
                }
            }
        });
    }

    private void setupDownloadListener(final WebView webView) {
        if (webView == null) return;
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    // 仅处理 http/https 链接（blob: 链接走 JS 桥，不在这里处理）
                    if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                        Log.i(TAG, "Download start: " + url + " mime=" + mimetype);
                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                        request.setMimeType(mimetype != null ? mimetype : "application/octet-stream");
                        request.addRequestHeader("User-Agent", userAgent);
                        request.setDescription("下载文件");
                        request.setTitle(getFilenameFromUrl(url, contentDisposition));
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, getFilenameFromUrl(url, contentDisposition));
                        }
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setAllowedOverMetered(true);
                        request.setAllowedOverRoaming(true);

                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(request);
                            Log.i(TAG, "Download enqueued to Downloads folder");
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Download failed", e);
                    writeCrashLog("download-error", e);
                }
            }
        });
    }

    private String getFilenameFromUrl(String url, String contentDisposition) {
        try {
            String filename = null;
            if (contentDisposition != null) {
                int idx = contentDisposition.indexOf("filename=");
                if (idx >= 0) {
                    filename = contentDisposition.substring(idx + "filename=".length()).replace("\"", "").trim();
                }
            }
            if (filename == null || filename.isEmpty()) {
                filename = Uri.parse(url).getLastPathSegment();
            }
            if (filename == null || filename.isEmpty()) {
                filename = "download_" + System.currentTimeMillis() + ".csv";
            }
            return filename;
        } catch (Exception e) {
            return "download_" + System.currentTimeMillis() + ".csv";
        }
    }

    private void writeCrashLog(String event, Throwable throwable) {
        try {
            File dir = getExternalFilesDir(null);
            if (dir == null) {
                dir = getFilesDir();
            }
            File logFile = new File(dir, CRASH_LOG_NAME);
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            pw.println("=== " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()) + " [" + event + "] ===");
            throwable.printStackTrace(pw);
            pw.flush();
            FileWriter fw = new FileWriter(logFile, true);
            fw.write(sw.toString());
            fw.flush();
            fw.close();
            Log.e(TAG, "Crash log saved to: " + logFile.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Failed to write crash log", e);
        }
    }

    // ★2026-08-27 渐进增强：返回键先问 JS 是否有关弹窗（有则关，无则防误退）
    // ★2026-08-27 加固：override onBackPressed 可能被 OnBackPressedDispatcher 抢占，
    // 改用官方 getOnBackPressedDispatcher().addCallback（AppCompatActivity 标准通道，100% 生效）
    private long lastBackPressTime = 0;

    // ★2026-08-27 键盘覆盖式弹出（adjustNothing）+ 搜索框精确跟随：
    //   adjustNothing 下 WebView 视觉视口不更新，JS 测不到键盘高度 → 原生监听 IME insets，
    //   键盘弹出/收起时把真实高度桥给页面（window.__onImeHeight(px)），px=0 表示收起
    private void setupImeListener() {
        try {
            // 确保窗口不消费系统栏 inset（WebView 全屏 + CSS safe-area 避让的现状），仅监听 IME
            androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            final View decor = getWindow().getDecorView();
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(decor,
                    new androidx.core.view.OnApplyWindowInsetsListener() {
                        @Override
                        public androidx.core.view.WindowInsetsCompat onApplyWindowInsets(View v,
                                androidx.core.view.WindowInsetsCompat insets) {
                            int imeBottom = insets.getInsets(
                                    androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;
                            if (imeBottom != lastImeHeight) {
                                lastImeHeight = imeBottom;
                                notifyJsImeHeight(imeBottom);
                            }
                            return insets; // 不消费，仅监听
                        }
                    });
        } catch (Exception e) {
            Log.e(TAG, "ime listener setup failed", e);
        }
    }

    private void notifyJsImeHeight(final int height) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.webkit.WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                    if (wv == null) return;
                    wv.evaluateJavascript(
                            "try{window.__onImeHeight&&window.__onImeHeight(" + height + ");}catch(e){}",
                            null);
                } catch (Exception e) {
                    Log.e(TAG, "notifyJsImeHeight failed", e);
                }
            }
        });
    }

    private void setupBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    android.webkit.WebView wv = getBridge().getWebView();
                    if (wv != null) {
                        wv.evaluateJavascript(
                                "try{window.__handleSystemBack?window.__handleSystemBack():0}catch(e){0}",
                                new android.webkit.ValueCallback<String>() {
                                    @Override
                                    public void onReceiveValue(String value) {
                                        // ★2026-08-27 兼容判断：evaluateJavascript 返回值可能是 1 / "1" / "true"
                                        boolean handled = value != null && (value.contains("1") || value.contains("true"));
                                        if (!handled) doDoubleBackToExit();
                                    }
                                });
                        return;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "back js bridge failed", e);
                }
                doDoubleBackToExit();
            }
        });
    }

    private void doDoubleBackToExit() {
        long now = System.currentTimeMillis();
        if (now - lastBackPressTime < 2000) {
            finish();
            return;
        }
        lastBackPressTime = now;
        // ★2026-08-27 提示改走 JS 玻璃 toast（与下载更新同款 toast-glass 体系），不再用原生系统 Toast
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.evaluateJavascript("try{window.__showBackHint&&__showBackHint()}catch(e){}", null);
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "back hint js failed", e);
        }
        try {
            android.widget.Toast.makeText(this, "再按一次退出徒步小记", android.widget.Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.e(TAG, "back press toast failed", e);
        }
    }
}

