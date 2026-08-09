# 🏔️ XiXiの徒步小记

一款由 **XiXi** 亲手制作的徒步记录小软件：记录每一次登山的足迹与心情，统计海拔与难度，规划下一次出发。

## 功能

- 📊 **概览**：统计总次数、总里程、总爬升、难度分布柱状图
- 📝 **记录**：徒步记录增删改、排序、行内编辑
- 📅 **计划**：计划徒步管理
- ⚙️ **设置**：导入/导出 CSV、WebDAV 数据同步（坚果云）、暗色模式、帧率开关
- ☁️ **WebDAV 同步**：上传备份（时间戳独立文件）、下载恢复（文件选择器）、自动检测连接、自动同步

## 技术栈

- **Capacitor 6.2.1** + Android WebView
- 纯 HTML/JS 单文件应用（`www/index.html`，无外部依赖）
- 原生桥：WebDAV 请求（OkHttp）、文件保存
- 最低支持 Android 7（minSdk 22），target/compileSdk 36

## 目录结构

```
hiking-app3/
├── www/                    # 前端源码（单文件应用）
│   └── index.html          # 全部逻辑（约 9000 行）
├── android/                # Android 工程
│   └── app/
│       ├── src/main/java/  # MainActivity + 原生桥
│       ├── src/main/assets/public/  # 打包进 APK 的 index.html
│       └── proguard-rules.pro       # R8 规则
└── capacitor.config.json
```

## 构建（Release + R8）

```bash
# 1. 修改 www/index.html 后同步到 assets
cp www/index.html android/app/src/main/assets/public/index.html

# 2. 手改 android/app/build.gradle 版本号（versionCode +1，versionName 目标值）
# 3. 构建 Release（R8 混淆 + 资源压缩 + 签名）
cd android && ./gradlew assembleRelease
```

> ⚠️ 签名密钥（debug.keystore）**不在本仓库**——构建前需自行准备并放回 `android/app/debug.keystore`。

## 构建要点（踩坑记录）

- 桌面路径构建会文件锁报错 → 先 robocopy 到 `%TEMP%\hiking-build` 再构建
- **Android HttpURLConnection 反射发 PROPFIND/MKCOL 不可靠**（Android 9+ hidden API 拦截）→ 用 OkHttp
- **R8 keep 规则**：JS 桥类名禁止 `allowobfuscation`（曾踩坑 JsFileBridge 被混淆改名）
- bump 后必须把整个 android 目录同步到构建目录，否则打包出旧版本号

## Made by XiXi 💛
