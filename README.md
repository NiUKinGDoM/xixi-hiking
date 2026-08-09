# 🏔️ XiXiの徒步小记

一款由 **XiXi** 亲手制作的徒步记录小软件：记录每一次登山的足迹与心情，统计海拔与难度，规划下一次出发。

**Made by XiXi 💛**

## 功能

- 📊 **概览**：总次数 / 总里程 / 总爬升统计、难度分布柱状图
- 📝 **记录**：徒步记录增删改、排序、行内编辑、难度 1-5 级
- 📅 **计划**：计划徒步管理、难度选择
- ⚙️ **设置**：
  - 导入/导出 CSV（徒步记录 / 计划徒步）
  - **WebDAV 数据同步**（坚果云）：上传备份（时间戳独立文件）、下载恢复（**备份文件选择器，PROPFIND 实时列网盘**）、打开设置页/输入配置自动检测连接、自动同步开关
  - 暗色模式（夜间模式）、帧率开关（开发者用）
- 🎨 **液态玻璃 UI**：底栏悬浮导航（4 tab：概览/计划/记录/设置）

## 技术栈

- **Capacitor 6.2.1** + Android WebView
- 纯 HTML/JS 单文件应用（`www/index.html`，约 9300 行，无前端框架）
- **原生桥**：OkHttp 3.14.9（WebDAV 请求，支持 PROPFIND/MKCOL 等任意 HTTP 方法）+ 文件保存
- 最低支持 Android 7（minSdk 22），target/compileSdk 36（Android 16）
- 数据存储：localStorage（徒步记录 / 计划 / 标题 / 暗色模式 / 帧率）

## 目录结构

```
hiking-app3/
├── www/                    # 前端源码（单文件应用）
│   └── index.html          # 全部逻辑（约 9300 行）
├── android/                # Android 工程
│   └── app/
│       ├── src/main/java/com/xixi/hiking/MainActivity.java  # 原生桥（WebDAV + 文件）
│       ├── src/main/assets/public/index.html  # 打包进 APK 的 index.html（改完要同步）
│       ├── proguard-rules.pro    # R8 规则（★JS 桥类名禁 allowobfuscation）
│       └── build.gradle          # 版本号在这里手改
└── capacitor.config.json
```

## 构建（Release + R8）

```bash
# 1. 改完 www/index.html → 同步到 assets
cp www/index.html android/app/src/main/assets/public/index.html

# 2. 手改 android/app/build.gradle 版本号（versionCode +1，versionName 直接改目标值）
# 3. 构建 Release（R8 混淆 + 资源压缩 + 签名）
cd android && ./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

## 📌 版本号规则（用户定义，务必遵守）

- 正式版 `1.X.X.X` 四段式：**每次发版第四段+1，第四段加到上限 10 就进位（第三段+1、第四段归零），每段上限 10**
  - 例：`1.4.9.9 → 1.4.9.10 → 1.4.10.0 → 1.4.10.1 → ... → 1.4.10.10 → 1.4.11.0`
- 测试版 `1.X.test-X`：X 从 1 起递增（当前 1.4.test-11）
- ⚠️ 四段版本号 bump 脚本不支持，**手改 build.gradle**（versionCode +1 + versionName 直接改目标值）

## 🚀 发布流程（三处同步铁律，缺一不可）

每次发版必须同步三处：

1. **本地交付**：`XiXiの徒步小记-vX.Y.Z.apk`（项目根 + backups/apk-history/）+ 源码归档 backups/hiking-app3-vX.Y.Z/
2. **GitHub**：提交源码到本仓库（排除签名 keystore / local.properties / APK）+ 建 Release 挂 APK 附件
3. **联网网页**：部署 `hiking-app3/www` 到 CloudStudio（https://e7f39d534e2e4958b7844f37fca23f6e.gz4.agentos-app.net）

## 构建要点（踩坑记录）

- **桌面路径构建会文件锁报错** → 先 robocopy 到 `%TEMP%\hiking-build` 再构建
- **Android HttpURLConnection 反射发 PROPFIND/MKCOL 不可靠**（Android 9+ hidden API 拦截，实际按 GET 发出）→ **必须用 OkHttp**
- **R8 keep 规则**：JS 桥 `MainActivity$JsFileBridge` 禁加 `allowobfuscation`（会改类名导致 JS 调不到）→ `-keep class com.xixi.hiking.MainActivity$JsFileBridge { *; }`
- **夜间模式 select**：用 `background-color` 单设（`background` 简写会重置箭头位置导致双箭头），箭头要浅色反转才可见
- bump 后必须把整个 android 目录同步到构建目录，否则打包出旧版本号
- GitHub 更新流程：**clone 远程 → 覆盖文件 → 提交推送**（不要 git init 新仓库，会被历史冲突拒绝）

## 签名与安全

- ⚠️ **签名密钥（debug.keystore）绝不在本仓库**——本地备份在 `backups/android-signing/`，构建前需放回 `android/app/debug.keystore`
- APK 签名 SHA-256：`9396fee4e13f3fd1f939d66820d0ca623187be62234fcfcc621577b63ccf8899`（保持签名不变 → 覆盖安装数据不丢）
- 坚果云账号/应用密码是用户隐私，不入库、不索要
