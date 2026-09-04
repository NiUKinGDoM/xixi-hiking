# 🏔️ XiXiの徒步小记

一款由 **XiXi** 亲手制作的徒步日记软件：记录每一次徒步、登山的足迹与照片，统计里程与难度，规划下一次出发。

**Made by XiXi 💛**

> 📜 完整版本演进史见 [CHANGELOG.md](CHANGELOG.md)

## 功能

- 📊 **概览**：统计卡片（总记录数/平均海拔/最高海拔/平均难度/总里程/总用时）、**徒步年资**（徒步第 N 天 · 从 X年X月X日 出发）、难度分布柱状图（独立卡片）、**年度足迹热力图** + 累计爬升、**年度回顾**（指标 + 月度柱状 + 年度之最，**「和去年比」**开关：去年划线值 + 增幅 + 一年小结；v1.1.8.4/8.5）
- 🔍 **搜索**：顶部搜索框（记录/计划通用，提示词按页切换）、关键词实时匹配、**显示匹配数量**；日历视图下搜索用于定位匹配计划
- 📝 **记录**：徒步记录增删改、排序、行内编辑、难度 1-5 级（玻璃徽章）、默认按时间排序、**列表按年份分组**（年份标题行）、**心情/天气统一玻璃弹窗选择**（v1.1.7.10 替换原生下拉，网格点选/预选高亮/可清空，存储 emoji，名称后仍显示天气表情）、**自定义日期时间选择弹窗**（玻璃日历网格 + 时/分步进器长按加速，替换系统原生选择器）、**列表/山册双视图**（v1.1.8.4 按山聚合卡片：次数/里程/时长/常伴，点 ↗ 直达记录）、**＋添加弹「添加徒步记录」选择卡**（v1.1.8.5：从最近记录单选填充或直接新建，日期自动今天、照片不复制）
- 📷 **照片**：每条记录最多 9 张（canvas 压缩 1280px/JPEG0.7，IndexedDB 存储）、**编辑行层叠卡片展示**（无照片时白框加号）、**灯箱查看/缩放/保存/翻页 + 编辑模式添加/删除**
- 📅 **计划**：计划徒步管理、难度选择、完成标记、**列表/日历双视图**（默认日历，切换按钮固定最右）、**日历整月明细**（每条标日期，点日期聚焦 + 「整月」按钮，二次点击 tab 回当天）、列表按年份分组、**完成 → 自动进入记录编辑补全**（预填名字/难度/海拔）+ **庆祝卡片**（400 粒彩屑）、**启动提醒 + 每天 08:00 系统通知栏**（不打开 App 也能收到，**手机重启自动恢复**）
- 📳 **震动反馈**：点击按钮短震（设置可开关，默认开，强度跟随系统）
- 🖼️ **分享卡**：热力图详情一键生成（外置背景图 share-bg.jpg + 白渐变遮罩 + 艺术字，含海拔/难度/心情/天气/同行人）
- ⚙️ **设置**：
  - **完整备份**（**.zip 压缩包**：记录 + 计划 + 照片二进制 + 纯文字回忆册）/ **纯数据备份**（不含照片）
  - **导出诊断报告**（版本/数据量/错误日志，问题排查用）
  - **WebDAV 数据同步**（坚果云）：上传 .zip 备份/下载恢复（兼容旧 HTML）/管理云端备份、自动同步开关、**自动保留最近 2 份**、**密码加密存储**
  - **应用内检查更新**（GitHub Release + 国内镜像）：确认弹窗 → 检查 → 立即更新；**更新日志纯本地内置（断网可看）**
  - **通知分级**：计划提醒/备份提醒（>7 天未同步）/自动同步完成/失败/更新下载完成 → **通知栏**；**通知权限未开启时设置页显示「点击去开启」引导**
  - 主题（跟随系统/浅色/深色）、震动开关、照片占用统计
  - **只有顶栏标题可编辑**（统计概览/难度分布/徒步足迹/计划/记录/设置标题已锁定）
- 🎨 **液态玻璃 UI**：底栏悬浮导航 4 tab、统一圆角/色系/字体（SimSun 手写风）、全组件统一透明玻璃配方（底栏/弹窗/toast）、**操作按钮统一浅红玻璃**（检查/立即更新/删除/确认完成/分享）
- 🔄 **当前版本**：v1.1.9.1（vc221 · 2026-09-04）

## 技术栈

- **Capacitor 6.2.1** + Android WebView
- HTML/CSS（`www/index.html`）+ 主 JS 拆 4 外部文件（★2026-08-30 方案A：`www/app-core.js` 工具/数据声明 / `app-data.js` 记录计划渲染 / `app-sync.js` WebDAV 备份 / `app-init.js` 启动）
- **原生桥**：OkHttp 3.14.9（WebDAV，PROPFIND/MKCOL 等任意方法）+ 文件保存 + 震动（跟随系统强度）+ **系统通知**（showNotification，计划提醒走通知栏）
- 最低支持 Android 7（minSdk 22），target/compileSdk 36（Android 16）
- 数据存储：localStorage（记录/计划/设置）+ IndexedDB（照片）

## 目录结构

```
hiking-app3/
├── www/                    # 前端源码（HTML/CSS + 4 个外部 JS）
│   ├── index.html          # HTML+CSS+引脚本（约 4800 行）
│   ├── app-core.js         # 工具/常量/主题/存储/toast/通知
│   ├── app-data.js         # 记录/计划/搜索/照片/灯箱/统计/热力图
│   ├── app-sync.js         # 同步/WebDAV/备份/导入导出/更新检查
│   ├── app-init.js         # init/事件绑定/启动
│   ├── sw.js               # 网页版离线缓存（CACHE v4 含 index.html + 4 JS + share-bg.jpg）
│   └── share-bg.jpg        # 分享卡背景图（外置，发版要同步）
├── android/                # Android 工程
│   └── app/
│       ├── src/main/java/com/xixi/hiking/MainActivity.java  # 原生桥（WebDAV/文件/震动/通知）
│       ├── src/main/AndroidManifest.xml    # 权限（INTERNET/VIBRATE/POST_NOTIFICATIONS 等）
│       ├── src/main/assets/public/  # 打包进 APK（index.html + 4 个 app-*.js + share-bg.jpg + sw.js，改完要全同步，漏 JS 会白屏）
│       ├── proguard-rules.pro    # R8 规则（★JS 桥类名禁 allowobfuscation）
│       └── build.gradle          # 版本号（用 bump.js 改，勿手改）
├── bump.js                  # 版本号递增脚本（build.gradle + app-core.js APP_VERSION + index.html 版本显示）
├── prev-snapshot.js         # 发布前回滚点快照（www 7 文件+原生 → backups/prev-<版本>/，事故可整体还原）
├── test.js                  # 自动测试①（改完必跑：语法/关键函数/死代码/结构/版本/数据层 60 项）
└── test-ui.js               # 自动测试②（jsdom UI 渲染测试 26 项：记录/计划渲染搜索分页徽标空态/键盘跟随/批量/弹窗防重入/转义）
```

## 开发流程

```bash
# 1. 改 www/（index.html + app-core/app-data/app-sync/app-init.js，★2026-08-30 方案A 拆分）
# 2. 自动测试（语法 + 关键函数 + 死代码残留 + HTML 结构 + 版本同步 + 数据层逻辑）
node test.js
# 2b. UI 层测试（jsdom 渲染真实 DOM，发布前必跑；依赖隔离 workspace 的 jsdom，绝对路径 require）
node test-ui.js
# 3. 版本号递增（vc+1 + 版本名自动进位；build.gradle + app-core.js APP_VERSION + index.html 版本显示）
node bump.js
# 4. 同步到 assets（★7 个文件必须全同步：index.html + 4 JS + share-bg.jpg + sw.js，漏 JS 白屏）
cp www/index.html www/app-core.js www/app-data.js www/app-sync.js www/app-init.js android/app/src/main/assets/public/
cp www/share-bg.jpg www/sw.js android/app/src/main/assets/public/
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
- **WebView 兼容（★2026-09-01 用户澄清）**：用户设备 WebView 为跟随系统自动更新的**新版**（Chrome 内核），`inset`/`aspect-ratio` 等现代 CSS 属性可用；仅面向旧 Android（5-7）的兜底习惯保留，不再假设设备旧
- GitHub 更新流程：**clone 远程 → 覆盖文件 → 提交推送**（勿 git init 重建）

## 签名与安全

- ⚠️ **签名密钥（debug.keystore）绝不在本仓库**——本地备份在 `backups/android-signing/`
- APK 签名 SHA-256：`9396fee4e13f3fd1f939d66820d0ca623187be62234fcfcc621577b63ccf8899`（保持签名 → 覆盖安装数据不丢）
- 坚果云账号/密码是用户隐私，不入库
