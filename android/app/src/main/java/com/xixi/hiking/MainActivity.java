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
            }
        });

        super.onCreate(savedInstanceState);

        // 立即尝试设置下载监听和 JS 桥（WebView 可能已可用）
        if (bridge != null && bridge.getWebView() != null) {
            setupDownloadListener(bridge.getWebView());
            setupJsBridge(bridge.getWebView());
        }
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
    private long lastBackPressTime = 0;

    @Override
    public void onBackPressed() {
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.evaluateJavascript(
                        "try{window.__handleSystemBack?__handleSystemBack()?'1':'0':'0'}catch(e){'0'}",
                        new android.webkit.ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                boolean handled = value != null && value.indexOf('1') >= 0;
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

    private void doDoubleBackToExit() {
        long now = System.currentTimeMillis();
        if (now - lastBackPressTime < 2000) {
            finish();
            return;
        }
        lastBackPressTime = now;
        try {
            android.widget.Toast.makeText(this, "再按一次退出徒步小记", android.widget.Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.e(TAG, "back press toast failed", e);
        }
    }
}

