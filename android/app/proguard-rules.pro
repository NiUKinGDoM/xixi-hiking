# ===== XiXiの徒步小记 ProGuard/R8 规则（阶段2） =====

# ★★铁律1：JS 桥必须完整保留（类名+成员都不能混淆）
# WebView addJavascriptInterface 注入的 JsFileBridge（含 webdavRequest/saveBase64），
# JS 侧通过 window.XixiFileBridge.xxx() 调用；若类名被混淆，JS 就找不到对象了。
# ⚠️ JsFileBridge 是 private 内部类：必须用 -keep 同时保留类名和成员。
#    ❌ 千万别加 allowobfuscation——那会允许类名被混淆（曾踩坑：MainActivity$JsFileBridge -> $d）
-keep class com.xixi.hiking.MainActivity { *; }
-keep class com.xixi.hiking.MainActivity$JsFileBridge { *; }
-keepclassmembers class com.xixi.hiking.MainActivity$JsFileBridge {
    <methods>;
}

# ★★铁律2：OkHttp（WebDAV 桥底层）不能被混淆
# OkHttp 用反射构建请求（OkHttpClient/Request/Response 内部反射），混淆会坏。
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ★★铁律3：Android 组件（Activity）不能被混淆入口
-keep public class * extends android.app.Activity { *; }

# 保留行号信息便于排查崩溃（可选，体积略增）
-keepattributes SourceFile,LineNumberTable

# App 是纯 HTML/JS 单文件应用，无第三方反射库；以上规则已覆盖全部风险点。
# 若未来新增原生代码，按同模式补充 keep 规则。
