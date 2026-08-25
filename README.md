# 🏔️ XiXiの徒步小记

一款由 **XiXi** 亲手制作的徒步日记软件：记录每一次徒步、登山的足迹与照片，统计里程与难度，规划下一次出发。

**Made by XiXi 💛**

> 📜 完整版本演进史见 [CHANGELOG.md](CHANGELOG.md)

## 功能

- 📊 **概览**：总次数 / 总里程 / 总爬升统计、难度分布柱状图、**年度足迹热力图**
- 📝 **记录**：徒步记录增删改、排序、行内编辑、难度 1-5 级、默认按时间排序、心情/天气/同行人（表情可选）
- 📷 **照片**：每条记录最多 9 张（canvas 压缩 1280px/JPEG0.7，IndexedDB 存储）、灯箱查看（滑动/保存到相册）、完整备份含照片
- 📅 **计划**：计划徒步管理、难度选择、完成标记
- 📳 **震动反馈**：点击按钮短震（设置可开关，默认开，强度跟随系统）
- 🖼️ **分享卡**：热力图详情一键生成（庆祝图背景 + 白色渐变遮罩 + 艺术字，含心情/天气/同行人）
- 📊 **月度小结**：概览「本月 X 次 · 累计爬升 Y 米」
- ⚙️ **设置**：
  - **完整备份**（HTML 单文件：记录 + 照片 + 计划，可导入恢复、浏览器可看）/ **纯数据备份**（不含照片）
  - **导出诊断报告**（版本/数据量/错误日志，问题排查用）
  - **WebDAV 数据同步**（坚果云）：上传/下载/管理云端备份、自动同步开关、**自动保留最近 2 份**
  - **应用内检查更新**（GitHub Release + 国内镜像）：检查更新直接装新版
  - 主题（跟随系统/浅色/深色）、震动开关、照片占用统计
  - **6 个可编辑标题**（顶栏/概览/记录/计划/设置/足迹）
- 🎨 **液态玻璃 UI**：底栏悬浮导航 4 tab、统一圆角/色系/字体（SimSun 手写风）、全组件统一透明玻璃配方（底栏/弹窗/toast）
- 🔄 **当前版本**：v1.1.3.3（vc157 · 2026-08-25）

## 技术栈

- **Capacitor 6.2.1** + Android WebView
- 纯 HTML/JS 单文件应用（`www/index.html`，约 8750 行，无前端框架）
- **原生桥**：OkHttp 3.14.9（WebDAV，PROPFIND/MKCOL 等任意方法）+ 文件保存 + 震动（跟随系统强度）
- 最低支持 Android 7（minSdk 22），target/compileSdk 36（Android 16）
- 数据存储：localStorage（记录/计划/设置）+ IndexedDB（照片）

## 目录结构

```
hiking-app3/
├── www/                    # 前端源码（单文件应用）
│   └── index.html          # 全部逻辑（约 8750 行）
├── android/                # Android 工程
│   └── app/
│       ├── src/main/java/com/xixi/hiking/MainActivity.java  # 原生桥（WebDAV/文件/震动）
│       ├── src/main/AndroidManifest.xml    # 权限（INTERNET/VIBRATE 等）
│       ├── src/main/assets/public/index.html  # 打包进 APK（改完要同步）
│       ├── proguard-rules.pro    # R8 规则（★JS 桥类名禁 allowobfuscation）
│       └── build.gradle          # 版本号（用 bump.js 改，勿手改）
├── bump.js                  # 版本号递增脚本（一条命令四处同步）
└── test.js                  # 自动测试（改完必跑：语法/关键函数/死代码/结构/版本）
```

## 开发流程

```bash
# 1. 改 www/index.html
# 2. 自动测试（语法 + 关键函数 + 死代码残留 + HTML 结构 + 版本同步 + 数据层逻辑）
node test.js
# 3. 版本号递增（vc+1 + 版本名自动进位 + 四处同步 + 校验）
node bump.js
# 4. 同步到 assets
cp www/index.html android/app/src/main/assets/public/index.html
# 5. 构建 Release（R8 混淆 + 资源压缩 + 签名）
cd android && ./gradlew assembleRelease
```

> ★**五项优化约定（2026-08-23 起，每次更新必做）**：①设计统一性（颜色/字体/圆角/间距/按钮）②底层代码清理（不动功能）③流畅度帧率（保留动效只优化）④**文档更新（README/CHANGELOG/PROJECT_STATUS 随版本同步）**⑤**查 bug（扫描潜在问题点：死代码/残留样式/逻辑漏洞）**——完成后汇报

产物：`android/app/build/outputs/apk/release/app-release.apk`

## 📌 版本号规则

- **versionName = 按 versionCode 数出的 `1.x.x.x`**：每段 0~10 共 11 个值，满 10 进位
- 公式：索引 = vc−1；第二段=(索引//121)%11；第三段=(索引//11)%11；第四段=索引%11
- 对照：vc99=1.0.8.10、vc100=1.0.9.0、vc122=1.1.0.0、vc131=1.1.0.9
- ⚠️ **历史说明**：v1.1.1.0~1.1.1.4（vc132~136）为错位命名（比公式 +1，v1.1.1.0 发布时 D4=10 误算为 0），已发布固定；当前序列由 bump.js 基于当前名递增，不再用公式反推
- ⚠️ bump 必须同步四处：build.gradle（versionCode + versionName）+ index.html（`APP_VERSION` 全局变量 + 版本显示），用 `node bump.js` 一键完成
- ⚠️ **已发布的版本号不可复用**（App 内检查更新按 versionCode 判定）

## 🚀 发布流程（按序执行）

1. **网页先行（用户验收）**：部署 `hiking-app3/www` 到 CloudStudio → **用户看网页版确认后**再继续
2. **GitHub 同步**：提交源码（排除签名 keystore / local.properties / APK）+ 建 Release 挂 APK → 用户 **App 内「检查更新」** 装新版
3. **本地归档**：APK 复制到项目根 + `backups/apk-history/`

> ⚠️ 应用内更新前提：仓库 **public**；Release body 只写更新内容 + `Made by XiXi 💛`（不写签名描述段）

## 构建要点（踩坑记录）

- **桌面路径构建会文件锁** → 先复制到 `%TEMP%\hiking-build` 再构建
- **WebDAV 必须 OkHttp**（HttpURLConnection 反射在 Android 9+ 被 hidden API 拦截）
- **R8 keep 规则**：JS 桥 `MainActivity$JsFileBridge` 禁 `allowobfuscation`
- **旧 WebView 兼容**：不用 `inset`/`aspect-ratio` 等新 CSS 属性（用户 WebView 较老），必要时加兜底
- GitHub 更新流程：**clone 远程 → 覆盖文件 → 提交推送**（勿 git init 重建）

## 签名与安全

- ⚠️ **签名密钥（debug.keystore）绝不在本仓库**——本地备份在 `backups/android-signing/`
- APK 签名 SHA-256：`9396fee4e13f3fd1f939d66820d0ca623187be62234fcfcc621577b63ccf8899`（保持签名 → 覆盖安装数据不丢）
- 坚果云账号/密码是用户隐私，不入库
