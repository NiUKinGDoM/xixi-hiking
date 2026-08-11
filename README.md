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
  - **应用内检查更新**（GitHub Release 源 + 国内镜像）：设置页「杂项 → 检查更新」检测并安装新版本，无需手动下载 APK
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

# 2. 递增版本号：python android/bump-version.py（vc+1，versionName 按公式算四段）或手改 build.gradle
# 3. 构建 Release（R8 混淆 + 资源压缩 + 签名）
cd android && ./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

## 📌 版本号规则（2026-08-11 更新，用户定义，务必遵守）

- **versionName = 按 versionCode 数出的 `1.x.x.x`**（与 versionCode 完全对齐）：
  - 从 **1.0.0.0** 起算第 1 个版本（vc1=1.0.0.0）
  - **每段 0~10 共 11 个值，满 10 进位**（第四段满 10 → 第三段+1、第四段归零；第三段满 10 → 第二段+1；第二段满 10 → 第一段+1）
  - 当前：**vc99 = 1.0.8.10**
- **生成版本号前必须验证公式**：索引 = vc − 1
  - 第一段 = 1 + 索引//1331；第二段 = (索引//121)%11；第三段 = (索引//11)%11；第四段 = 索引%11
  - 对照：vc85=1.0.7.7、vc88=1.0.7.10、vc89=1.0.8.0、vc97=1.0.8.8、vc99=1.0.8.10、vc100=1.0.9.0、vc121=1.0.10.10、vc122=1.1.0.0
- 测试版 `1.X.test-X`：X 从 1 起递增（当前 1.4.test-11）
- ⚠️ 用 `android/bump-version.py`（或 .ps1）自动递增：vc+1 并按公式算出 versionName（已支持四段 + 同步 index.html），或**手改 build.gradle**（versionCode +1 + versionName 按公式算）

## 🚀 发布流程（2026-08-11 新版，按序执行）

1. **网页先行（用户验收）**：部署 `hiking-app3/www` 到 CloudStudio（https://e7f39d534e2e4958b7844f37fca23f6e.gz4.agentos-app.net）→ **用户看网页版确认后**再继续
2. **GitHub 同步**：提交源码到本仓库（排除签名 keystore / local.properties / APK）+ 建 Release 挂 APK 附件 → 用户即可在 **App 内「检查更新」** 直接下载安装
3. **本地归档**：`XiXiの徒步小记-vX.Y.Z.apk`（项目根 + backups/apk-history/）+ 源码归档 backups/hiking-app3-vX.Y.Z/

> ⚠️ 应用内更新前提：本仓库必须为 **public**（App 匿名请求 GitHub API，私有仓库返回 404）；bump 时除 build.gradle 和版本显示外，**必须同步 `www/index.html` 里的 `APP_VERSION` 全局变量**，否则 App 会误判自身版本
> ⚠️ **Release body 约定（用户 2026-08-11 指定）**：只写更新内容 + `Made by XiXi 💛`，**不写**「APK：...（签名 SHA-256 ...）」描述段

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
