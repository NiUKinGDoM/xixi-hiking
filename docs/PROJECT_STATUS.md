# XiXiの徒步小记 — 项目状态交接文档

> **本文件是换模型/换人的第一入口**。阅读顺序：本文件 → `.workbuddy/memory/MEMORY.md`（精炼铁律）→ `.workbuddy/memory/2026-08-11.md`（今日详细日志）即可完整接手，不在细节上出错。
> 最后更新：2026-08-16（v1.0.10.4 / vc115）

## 一句话
纯本地 Android 徒步记录 App（Capacitor 6.2.1 + Android WebView 单页应用，`www/index.html` 单文件 ~375KB 全逻辑），XiXi 自己用的徒步记录软件，开发迭代成熟。iPhone 可走网页版（PWA，Safari 添加到主屏幕）。

## 当前版本状态（2026-08-16）
- **正式版 v1.0.10.4**（versionCode 115，com.xixi.hiking，**Release+R8 签名包**）——主工程 `hiking-app3/` 即正式版，所有修改直接在这里做
- 测试版 `hiking-app3-test/`（v1.4.test-11，com.xixi.hiking.beta）——**实验场，当前暂停**，与正式版数据隔离，勿主动碰
- **★应用内自更新已上线（v1.0.8.7+）**：GitHub Release 源，用户手机直接「检查更新」装新版，不再手动传 APK
- **★发版必更 CHANGELOG（2026-08-14 起）**：GitHub 同步时同步更新仓库根 CHANGELOG.md（新→旧插顶部）
- **★iPhone 网页版（2026-08-14 起）**：网页链接 Safari 打开可添加到主屏幕（PWA）；网页版无 WebDAV 同步/应用内更新（走原生桥）
- **★GitHub 仓库已改 PUBLIC（2026-08-11）**：`NiUKinGDoM/xixi-hiking`，应用内匿名更新依赖公开仓库

## 技术栈
- Capacitor 6.2.1 + Android WebView，纯 HTML/JS 单文件（无前端框架，Tailwind v4 编译产物内嵌）
- 原生依赖仅 OkHttp 3.14.9（WebDAV 桥 + 更新下载用；HttpURLConnection 反射在 Android 9+ 被 hidden API 拦截不可用）
- Android 构建：本地 JDK 21 + Gradle 8.2.1 + SDK platform-36 + build-tools 34.0.0（工具链在项目根，不在 C:/Program Files）
- 最低 Android 7（minSdk 22），target/compileSdk 36（Android 16）
- 数据存储：localStorage（徒步记录/计划/标题/暗色/帧率/WebDAV 配置）

## 功能清单（当前全部）
- 📊 概览：总次数/总里程/总爬升统计、难度分布柱状图、**年度足迹热力图**（按次数定色，GitHub 风格，点格看当天详情，年月切换）
- 📝 记录：徒步记录增删改、排序、行内编辑、难度 1-5
- 📅 计划：计划徒步管理、难度选择、完成标记
- ⚙️ 设置：
  - 外观（跟随系统/手动深色浅色）→ 杂项（FPS 开关、**检查更新**）→ WebDAV 数据同步 → 关于
  - **WebDAV 数据同步**（坚果云）：上传备份（时间戳独立文件）、下载恢复（PROPFIND 列网盘选文件）、自动检测连接、自动同步
  - **应用内检查更新**（GitHub Release + 国内镜像 ghfast.top）
  - 导入/导出 CSV
  - **6 个可编辑标题**（顶栏/统计概览/记录/计划/设置/徒步足迹）：铅笔图标+弹窗，点击不自动弹输入法（2026-08-11 约定）
- 🎨 液态玻璃 UI：底栏悬浮导航 4 tab（概览/计划/记录/设置），二次点当前 tab 刷新该页并取消编辑态

## ★关键约定（改代码前必读，都是踩坑换来的）
1. **★版本号规则（2026-08-10 用户最终确认，与 versionCode 完全对齐）**：
   - versionName = 按 versionCode 数出的 `1.x.x.x`：从 1.0.0.0 起算第 1 个版本（vc1），每段 **0~10 共 11 个值**，满 10 进位
   - 公式：索引=vc-1；第四段=索引%11；第三段=(索引//11)%11；第二段=(索引//121)%11
   - 对照：vc84=1.0.7.6、vc89=1.0.8.0、vc97=1.0.8.8、vc98=1.0.8.9、**vc99=1.0.8.10**、vc100=1.0.9.0（索引 99：99%11=0 → 第四段 0，99//11=9 → 第三段 9）。**生成版本号必须用公式验证，勿手算**
   - ⚠️ bump 时**必须同步三处**：build.gradle（versionCode+1 + versionName 按公式）+ index.html 版本显示（`版本 X.X.X.X`）+ index.html 的 **`APP_VERSION` 全局变量**（v1.0.8.8 漏改导致装新版还被提示更新的返工教训）
   - 测试版 `1.X.test-X`（X 从 1 递增，当前 1.4.test-11）
2. **★发布流程（2026-08-11 用户改版，覆盖旧三处同步）**：
   - ① **网页先行**：`workbuddy_cloudstudio_deploy` 部署 `hiking-app3/www` 到 CloudStudio → **用户看网页版确认**后才继续
   - ② **GitHub 同步**：源码 push（NiUKinGDoM/xixi-hiking，master 分支）+ **仓库根 `CHANGELOG.md` 顶部加版本号一行**（2026-08-19 用户改版：只加 `### vX（vcN · 日期）`，**更新内容以 Release 更新日志为准**，不再逐条写）+ 建 Release 挂 APK → 用户 **App 内「检查更新」** 下载安装
   - ③ **本地归档**：APK 复制到项目根 + `backups/apk-history/`（**绝不主动展示/交付 APK 卡片**，用户 2026-08-11 明说「我不要本地apk了，直接给我网页」）
   - **★Release body 约定**：只写更新内容 + `Made by XiXi 💛`，**不写**「APK：...（签名 SHA-256 ...）」段（用户 2026-08-11 指定）
3. **图标约定**：导入=download、导出=upload（勿搞反）
4. **底栏形态**：图标在上文字在下（column），文字横向（writing-mode: horizontal-tb）；position: fixed 悬浮，container 底部留白防遮挡
5. **顶栏无框**：header-bar 必须透明；「最强玻璃质感」统一规则组里不能含 .header-bar
6. **Tailwind v4 坑**：①translate-x/y 类勿与 CSS transform 动画混用；②**新增 Tailwind 工具类前必须确认编译产物里已有该类**（按需编译，如 `transition-transform` 从未生成=死类，用 CSS 直写）
7. **弹窗样式**：.glass-modal / .modal-cancel-btn 自定义液态玻璃，**不用 Tailwind `dark:` 前缀**（跟随系统主题，与 App 自定义 dark-mode 冲突）
8. **暗色模式**：body 纯 background-color 过渡；玻璃元素亮/暗两套规则；`.dark-mode` 覆盖 Tailwind 用 !important 是正常手法
9. **圆角层级体系（2026-08-11 统一）**：卡片 20px / 子项 16px / 按钮 12px / 输入框 10px / 滚动条 4px
10. **全 App 统一衬线**（SimSun 系）= 刻意的手写风设计，不是不一致，勿改
11. **可编辑栏不自动弹输入法**（2026-08-11）：标题弹窗/行内编辑进入时不自动 focus；仅保留用户点击输入框 & 校验失败提示两处 focus
12. **二次点底栏刷新**：点击当前 tab = 刷新该页；记录/计划页刷新前先取消编辑态（cancelEdit / plannedEditingId=null）

## ★应用内更新机制（v1.0.8.7 实现）
- 原生桥（MainActivity.java JsFileBridge）：`checkUpdate()`（GET `api.github.com/repos/NiUKinGDoM/xixi-hiking/releases/latest` 匿名）→ 返回 tag/name/apkUrl/body JSON；`downloadAndInstall(apkUrl, mirrorUrl)`（OkHttp 下载 cacheDir/downloads → FileProvider → 系统安装器；Android 8+ canRequestPackageInstalls 检查）
- 前端：`APP_VERSION`（本地版本）+ `UPDATE_MIRROR_PREFIX='https://ghfast.top/'`（index.html 顶部一处换源）+ 设置页杂项「检查更新」→ 弹窗（版本号+body）→ 下载安装；回调 `window.XixiUpdaterCallback(state,msg)`
- ⚠️ 网页版（浏览器）点检查更新提示"网页版无需更新"= 正常（桥不存在）
- ⚠️ 更新源版本号必须 > 本地 APP_VERSION 才会提示

## 构建流程（PowerShell，牢记）
1. 改 `hiking-app3/www/index.html` → 复制到 `android/app/src/main/assets/public/index.html` 和 `%TEMP%\hiking-build\android\app\src\main\assets\public\index.html`
2. 手改 `android/app/build.gradle` 版本号（versionCode+1，versionName 按公式）+ index.html 三处版本号（见上）
3. 复制 build.gradle 到 `%TEMP%\hiking-build\android\app\`，**删 `%TEMP%\hiking-build\android\app\build` 旧产物**（只同步 www 会打包出旧版本号）
4. 构建命令（PowerShell 后台）：
   ```
   Get-Process java* | Stop-Process -Force
   $env:GRADLE_USER_HOME="$env:TEMP\gradle-home-niuxc"; $env:ANDROID_USER_HOME="$env:TEMP\android-user-home"
   $env:JAVA_HOME="C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04\jdk-21.0.12"; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
   cd %TEMP%\hiking-build\android; gradle.bat assembleRelease --no-daemon --project-cache-dir "$env:TEMP\gradle-project-cache"
   ```
   （Release+R8：signingConfigs.release 用同一 debug.keystore 签名不变 + minifyEnabled/shrinkResources true + proguard-rules.pro 铁律：MainActivity+JsFileBridge 全保留【禁 allowobfuscation】/okhttp3 保留）
5. aapt 验证：`android-sdk\build-tools\34.0.0\aapt.exe dump badging app-release.apk | grep package:`（包名/版本号）；apksigner 验证签名 SHA-256 应为 `9396fee4e13f3fd1f939d66820d0ca623187be62234fcfcc621577b63ccf8899`
6. 归档：`XiXiの徒步小记-vX.Y.Z.apk` → 项目根 + `backups/apk-history/`
7. 部署网页 + GitHub 同步（见发布流程）

## 签名密钥（★重要）
- APK 实际签名 = `C:\Users\NIU-XC\.android\debug.keystore`（SHA256 `9396fee4...`，所有历史 APK 一致）
- 别名 androiddebugkey / 密码 android / JKS；备份在 `backups/android-signing/`
- ⚠️ `%TEMP%\android-user-home\debug.keystore` 是残留（B0:C7），勿混淆
- **绝不上传 GitHub / 不外传**；签名不变 = 覆盖安装数据不丢

## 工具链真实路径（项目根 `C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04\`）
- `jdk-21.0.12\`（JAVA_HOME）、`gradle-8.2.1\bin\gradle.bat`、`android-sdk\`（local.properties 写死 sdk.dir）
- 托管 python：`C:\Users\NIU-XC\.workbuddy\binaries\python\versions\3.13.12\python.exe`

## 备份体系
- `backups/hiking-app3-vX.Y.Z/`：完整源码备份
- `backups/apk-history/`：历史 APK（正式+测试版）
- `backups/android-signing/`：签名密钥（★绝不上传）
- `backups/github-同步目录/xixi-hiking/`：GitHub 仓库本地副本（clone 后覆盖提交推送）
- CloudStudio 网页：https://e7f39d534e2e4958b7844f37fca23f6e.gz4.agentos-app.net（部署源 hiking-app3/www）

## 近期版本要点（v1.0.7.x ~ v1.0.8.10）
- v1.0.7.6（vc84）：版本号体系与 versionCode 完全对齐（新计数规则）
- v1.0.7.7~1.0.8.3：热力图（难度分布下独立卡片）、下拉框宽度自适应、启动防闪白、状态栏跟随主题、数据管理+同步合并
- v1.0.8.4~1.0.8.5：底栏点击当前 tab 手动刷新（记录/计划/概览/设置）+ 热力图随刷新重置 + WebDAV 状态 2 秒自动回正
- v1.0.8.6（vc95）：「3条优化」第一轮——圆角统一层级体系、代码清理确认健康、11 处 transition:all 改指定属性
- v1.0.8.7（vc96）：★应用内检查更新上线（GitHub Release + 镜像；发布流程改版：网页先行→GitHub→App 内自更）
- v1.0.8.8（vc97）：设置页外观/杂项对调 + 4 个标题默认名（统计概览/记录/计划/设置）+ **修复 APP_VERSION 漏改 bug** + 仓库转 public
- v1.0.8.9（vc98）：「3条优化」第二轮——chart-bar/标题过渡只作用目标属性（transition-all→定向）、清理 6 处无效 Tailwind 类、Tailwind 编译坑记录
- v1.0.8.10（vc99）：二次点底栏刷新取消编辑态 + 可编辑栏点击不自动弹输入法

## 待办/新功能方案（2026-08-11 定稿）
- **照片功能（待实现）**：记录增删改弹窗加「添加照片」（拍照/相册，canvas 压缩 1280px/JPEG0.7），IndexedDB 大仓库存储，记录 JSON 只存 photos:id[]，表格缩略图列 + 全屏 Lightbox，最多 9 张/条；⚠️ WebDAV 备份不含照片（zip 二期）；卸载丢失
- 热力图 ✅ 已完成（v1.0.8.3）

## ⚠️ 接手注意事项（环境经验大全，防踩坑）
1. **GitHub 同步环境**：
   - clone/push 必须 `GIT_SSL_NO_VERIFY=true`（Windows schannel 吊销检查失败 CRYPT_E_NO_REVOCATION_CHECK；http.schannelCheckRevoke false 无效）
   - 默认分支是 **master**（不是 main）
   - **凭据提取**：PowerShell Add-Type 可能因环境块超 64KB 失败（本机环境变量 496KB）→ 用 **Python ctypes CredReadW** 读 Windows 凭据管理器 `git:https://github.com`（USER=x-access-token，密码即 token），然后 `git -c http.extraHeader="Authorization: Basic $(echo -n x-access-token:TOKEN|base64 -w0)" push`
   - **资产上传端点是 `uploads.github.com`**（不是 api.github.com）；用后立即删 token 临时文件（**用 Python os.remove 删最稳**，bash rm 会被 safe-delete 误拼路径）
   - 建 Release：POST api.github.com/repos/NiUKinGDoM/xixi-hiking/releases（body 遵守约定）；查资产/删资产：GET/DELETE releases/{id}/assets
   - 应用内更新依赖：仓库必须 **public**、Release 的 tag 版本号 > APP_VERSION
2. **构建必须在 %TEMP%\hiking-build**（桌面路径文件锁"拒绝访问"）
3. **不需要 node_modules / npx cap sync**：直接改 index.html → 复制到 assets → gradle 构建（除非加了 Capacitor 插件）
4. **敏感凭据红线**：坚果云账号密码用户自己填手机、AI 不索要；GitHub token 用完即弃不落盘；keystore 绝不外传
5. **换电脑**：绝对路径 C:\Users\NIU-XC\... 只对当前电脑有效；local.properties sdk.dir 必须改；见 `backups/新电脑部署指南.md`
6. **沟通风格**：用户称呼「爹」，助手自称「小小牛 🛠️」；直接给结论不废话；换模型时本文件+MEMORY.md+当日日志三件套保证无断层

## 用户信息
- 用户称呼：爹；助手自称：小小牛（🛠️）；直接、不废话风格
- 钛铸件国企销售，关注航空产业链；偏好 Word 报告（用户级记忆另有）
