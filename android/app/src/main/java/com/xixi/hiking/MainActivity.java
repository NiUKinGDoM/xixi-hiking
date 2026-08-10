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
            public void onPageLoaded(WebView webView) {
                setupDownloadListener(webView);
                setupJsBridge(webView);
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
            webView.addJavascriptInterface(new JsFileBridge(), "XixiFileBridge");
            Log.i(TAG, "JS bridge XixiFileBridge installed");
        } catch (Exception e) {
            Log.e(TAG, "Failed to install JS bridge", e);
        }
    }

    private class JsFileBridge {
        @JavascriptInterface
        public boolean saveBase64(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safeName = sanitizeFilename(filename);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Android 10+：用 MediaStore 保存到公共 Downloads，无需权限
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "text/csv");
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
                thread.join(30000); // 最多等 30 秒
            } catch (InterruptedException e) {
                return "{\"status\":0,\"body\":\"\",\"error\":\"request interrupted\"}";
            }
            return result[0] != null ? result[0] : "{\"status\":0,\"body\":\"\",\"error\":\"timeout\"}";
        }

        private String doWebdavRequest(String url, String method, String username, String password, String bodyBase64) {
            try {
                String upper = method != null ? method.toUpperCase(Locale.US) : "GET";
                okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                        .readTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
                        .build();
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
}

