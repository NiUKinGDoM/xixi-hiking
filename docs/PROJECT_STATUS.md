# XiXiの徒步小记 — 项目状态交接文档

> **本文件是换模型/换人的第一入口**。阅读顺序：本文件 → `.workbuddy/memory/MEMORY.md`（精炼铁律）→ `.workbuddy/memory/` 下最新日期日志（今日明细）即可完整接手。
> 最后更新：2026-08-31（v1.1.7.2 / vc200）

## 一句话
纯本地 Android 徒步记录 App（Capacitor 6.2.1 + Android WebView 应用，★2026-08-30 方案A：`www/` 主 JS 拆 4 个外部文件 app-core/app-data/app-sync/app-init.js + index.html(HTML/CSS) + 外置 share-bg.jpg），XiXi 自己用的徒步记录软件。iPhone 可走网页版（PWA）。

## 当前版本状态（2026-08-30）
- **正式版 v1.1.7.2**（versionCode 200，com.xixi.hiking，**Release+R8 签名包**）——主工程 `hiking-app3/` 即正式版，改代码直接在这里
- **★2026-08-30 测试版已全部删除**（hiking-app3-test + Flutter 全系，用户要求彻底删）；残留两个空壳（C:\Users\NIU-XC\flutter\bin\internal\shared.bat + hiking-flutter-test 空目录）被 WorkBuddy 占句柄，重启 WorkBuddy 后手动删，无害
- **★应用内自更新**：GitHub Release 源（latest），用户手机「检查更新」自更，依赖仓库 public
- **★发布流程（2026-08-11 新版，铁律 2026-08-22 强化）**：①CloudStudio 部署 `hiking-app3/www` → 用户网页确认 → ②bump→test（test.js + **test-ui.js** 双自检）→构建→push GitHub（master）→Release 挂 APK → ③用户 App 内检查更新
- **★★★未确认同步前只改 www/index.html + 部署网页，绝不 bump/构建/归档/push**；确认「同步」才 bump→test→构建→push→Release
- **★版本号铁律（2026-08-24 强化）**：发版口头汇报版本号必须用 **bump.js 实际输出**，禁止十进制直觉（v1.1.2.10 → 必须说 1.1.3.0，不许说 1.1.2.11，被用户叫停纠正过）
- **★五项优化约定（2026-08-23 起）**：①设计统一性 ②底层代码清理 ③流畅度帧率 ④文档更新（README/CHANGELOG/本文件随版本同步）⑤查 bug——每次更新必做，完成后汇报
- **★玻璃质感定稿（2026-08-23 v1.1.2.4~2.8）**：全组件统一透明玻璃配方 = `rgba(255,255,255,0.08) + blur(2px) + 细白边(0.5) + 无高光 + 无任何折射装饰`；**「最强玻璃质感」全局覆盖规则已删除**（光泽带/角部反光/内光晕/四角光斑全清）；弹窗全部 confirm 体系（confirm-modal-content）；toast 浅色同色系底边（成功浅绿底绿边/错误浅红底红边，alpha 统一 0.4）；激活按钮靛蓝描边 0.18；浅色遮罩 0.3 / 深色 0.7

## 技术栈
- Capacitor 6.2.1 + Android WebView，纯 HTML/JS 单文件（无前端框架，Tailwind v4 编译产物内嵌）
- 原生依赖仅 OkHttp 3.14.9（WebDAV 桥 + 更新下载；HttpURLConnection 反射在 Android 9+ 被拦）
- Android 构建：本地 JDK 21 + Gradle 8.2.1 + SDK platform-36 + build-tools 34.0.0（工具链在项目根，不在 C:/Program Files）
- 最低 Android 7（minSdk 22），target/compileSdk 36
- 数据存储：localStorage（记录/计划/标题/暗色/帧率/WebDAV 配置）+ IndexedDB（照片大仓库）

## 功能清单（当前全部，v1.1.3.9）
- 📊 概览：统计卡片（总记录数/平均海拔/最高海拔/平均难度/**总里程/总用时**）、**难度分布柱状图（独立卡片，图标标题）**、**年度足迹热力图**（GitHub 风格，点格看当天详情：心情/天气/同行/全部照片/分享，底部「累计爬升 X 米」）
- 📝 记录：增删改、行内编辑（**心情/天气下拉文字选择**/同行人/里程/用时/照片层叠卡片）、难度 1-5（徽章玻璃化）、记录行名称后天气图标 + 照片按钮（玻璃版）
- 📷 照片：记录最多 9 张（canvas 压缩 1280px/JPEG0.7，IndexedDB）、**编辑行层叠卡片**（无照片时白框加号）、**灯箱：查看/保存/翻页 + 编辑模式添加/删除**、热力图弹窗多图显示
- 📅 计划：计划徒步管理、难度选择、完成标记（确认弹窗）、**默认按计划时间由近到远排序**、**启动提醒（系统通知，点通知跳计划页，权限被拒自动降级 App 内 toast）+ 不打开 App 也能提醒（原生 AlarmManager 闹钟，计划当天 08:00 触发，v1.1.7.0）**、**★列表/日历双视图切换（默认日历，v1.1.7.1）+ 计划完成直接进记录编辑补全（名字/难度/海拔预填，v1.1.7.1）**
- 🎴 **分享卡（v1.1.3.0 定版）**：canvas 720×960，**外置背景图 share-bg.jpg**（v1.1.3.1 从 base64 内置换为外置，发版必须同步此文件）+ 白渐变遮罩 + 楷体艺术字 + 顶部软件标题 + 海拔/难度/心情/天气/同行（**标题加粗**）+ Made by XiXi；入口 = 热力图弹窗底部「分享」按钮
- ⚙️ 设置：
  - 外观（跟随系统/深浅）→ 杂项（FPS 开关、**检查更新确认弹窗**）→ WebDAV 数据同步 → 关于
  - **WebDAV（坚果云）**：上传（时间戳独立 .zip 压缩包备份，v1.1.3.9 起）、下载恢复（zip/老 HTML 兼容）、管理（**云端自动清理保留最近 2 份**）、自动同步（失败限频提醒）、**密码加密存储（xk1: 前缀，老明文兼容）**、**网页版弹窗示例按钮**
  - **导出**（弹窗三选一：**完整备份 = zip 压缩包**（xixi-data.json + photos 二进制 + 纯文字回忆册，省 base64 33%）/ 纯数据 HTML / 诊断报告）、**导入**（zip/HTML/JSON 自动识别，同 id 以备份为准覆盖、本地独有合并保留）；备份回忆册含心情天气同行
  - **导出诊断**：版本/数据量/最近 100 条错误日志（__diagLogs）
  - **只有顶栏标题可编辑**（6 个区块标题：统计概览/难度分布/徒步足迹/计划/记录/设置 已改为不可编辑）
- 🎨 液态玻璃 UI：底栏悬浮 4 tab（概览/计划/记录/设置，**底部阴影已删**），二次点当前 tab 刷新；全 App 统一玻璃配方；**操作按钮统一浅红玻璃（check-go-btn：检查/立即更新/删除/确认完成/分享）**

## ★关键约定（改代码前必读，都是踩坑换来的）
1. **★版本号规则（2026-08-10 用户最终确认）**：
   - versionName = 按 vc 数 `1.x.x.x`，每段 **0~10 共 11 个值**满 10 进位；公式：索引=vc-1；D4=索引%11；D3=(索引//11)%11；D2=(索引//121)%11
   - 对照：vc84=1.0.7.6、vc99=1.0.8.10、vc100=1.0.9.0、vc122=1.1.0.0
   - **bump 用 `node bump.js` 一键**（vc+1 + 版本名满10进位 + build.gradle/APP_VERSION/版本显示四处同步 + 校验），**汇报版本号以 bump.js 输出为准**（2026-08-24 教训：1.1.2.10 → 1.1.3.0，不许说 1.1.2.11）
   - ⚠️ 历史错位：v1.1.1.0~1.1.1.4（vc132~136）比公式 +1，已发布固定，bump.js 延续序列
   - ⚠️ 已发布版本号不可复用，修复版也必须 bump
   - 测试版 `1.X.test-X`（当前 1.4.test-12）
2. **★发布流程**：①部署 www → 网页确认 → ②bump.js + `node test.js`（60项数据层/语法自检）+ `node test-ui.js`（26项 jsdom UI 自检，2026-08-28 起）→ 同步 assets+temp → gradle 构建 → push master + CHANGELOG 顶部加版本号一行 + Release（body 只写更新内容 + `Made by XiXi 💛`）→ ③用户 App 检查更新
   - **CHANGELOG 只加版本号一行**（`### vX（vcN · 日期）`），更新内容以 Release body 为准
   - **绝不主动展示/交付 APK 卡片**（只给网页链接）
3. **图标约定**：导入=download、导出=upload
4. **底栏**：图标上文字下（column）；fixed 悬浮；激活按钮靛蓝描边（非激活无框）
5. **顶栏无框**：header-bar 必须透明
6. **Tailwind v4 坑**：新工具类必须确认编译产物已有（按需编译，如 transition-transform 死类，用 CSS 直写）；弹窗不用 Tailwind `dark:` 前缀（跟随系统主题冲突）
7. **暗色模式**：body 纯 background-color 过渡；`.dark-mode` 覆盖 Tailwind 用 !important 是正常手法；**浅色看不清 = 固定灰蓝 #64748b 在玻璃底上偏淡，弹窗内文字一律主题色/近黑**（#0f172a/#1f2937 系）
8. **圆角层级**：卡片 20 / 子项 16 / 按钮 12 / 输入框 10 / 滚动条 4
9. **全 App 统一衬线**（SimSun 系）= 刻意手写风，勿改
10. **折叠动画正解**：grid-template-rows 0fr↔1fr（max-height 卡、transform 不同步、translateY margin 死结——全踩过）
11. **可编辑栏不自动弹输入法**
12. **二次点底栏刷新**：记录/计划先取消编辑态
13. **玻璃统一配方（2026-08-23 定稿）**：透明 0.08 + blur(2px) saturate(150%) + 白边 0.5 + 双层浮动阴影；**禁止加**光泽带/折射渐变/角部反光/内光晕/四角光斑（都被用户否决过）；toast 浅色同色系底边

## ★应用内更新机制（v1.0.8.7 实现）
- 原生桥 `checkUpdate()`（GET api.github.com/repos/NiUKinGDoM/xixi-hiking/releases/latest 匿名）+ `downloadAndInstall(apkUrl, mirrorUrl)`（OkHttp → FileProvider → 系统安装器）
- 前端：`APP_VERSION` + `UPDATE_MIRROR_PREFIX='https://ghfast.top/'`（index.html 顶部换源）
- ★2026-08-25 起网页版也可弹检查更新确认窗并真实检测（GitHub API 支持 CORS），但无法安装（点立即更新有兜底提示）；更新源版本号必须 > 本地

## 构建流程（PowerShell，牢记）
1. 改 `www/`（★2026-08-30 方案A 落地：主 JS 拆 4 外部文件 app-core/app-data/app-sync/app-init.js，index.html 只留 HTML+CSS+引脚本）→ `node test.js`（60项）+ `node test-ui.js`（26项 jsdom UI，2026-08-28 起）→ `node bump.js`（版本号：build.gradle + app-core.js APP_VERSION + index.html 版本显示）
2. 复制 **index.html + app-core.js + app-data.js + app-sync.js + app-init.js** + **share-bg.jpg** + **sw.js** → `android/app/src/main/assets/public/` + `%TEMP%\hiking-build\android\app\src\main\assets\public\`（★漏同步 JS 会白屏！）；build.gradle → temp；**原生改动同步 temp：MainActivity.java + AndroidManifest.xml + styles.xml(values+values-night) + 图标全资源(mipmap 5dpi/anydpi-v26/foreground/background)**；**删 temp 的 app/build 旧产物**
3. 构建（PowerShell 后台）：
   ```
   Get-Process java* | Stop-Process -Force
   $env:GRADLE_USER_HOME="$env:TEMP\gradle-home-niuxc"; $env:ANDROID_USER_HOME="$env:TEMP\android-user-home"
   $env:JAVA_HOME="C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04\jdk-21.0.12"; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
   cd %TEMP%\hiking-build\android; gradle.bat assembleRelease --no-daemon --project-cache-dir "$env:TEMP\gradle-project-cache"
   ```
4. ★构建报 `Could not load compiled classes for settings file ... from cache`（settings 编译类缓存损坏）：删 `%TEMP%\gradle-home-niuxc\caches\8.2.1\scripts` + `executionHistory` 后重试（别清整个 caches，会重新下依赖；2026-08-26 遇过）
   （Release+R8，签名不变 = 覆盖安装数据不丢；proguard 铁律：MainActivity+JsFileBridge 保留、okhttp3 保留）
4. aapt 验证包名/版本 + apksigner 验证签名 SHA-256 `9396fee4...`
5. 归档：`XiXiの徒步小记-vX.Y.Z.apk` → 项目根 + `backups/apk-history/`（不主动展示）
6. 部署网页 + GitHub 同步（见发布流程）

## 签名密钥（★重要）
- 签名 = `C:\Users\NIU-XC\.android\debug.keystore`（SHA256 9396fee4...，所有历史 APK 一致）；别名 androiddebugkey / 密码 android / JKS；备份 `backups/android-signing/`
- ⚠️ `%TEMP%\android-user-home\debug.keystore` 是残留（B0:C7）勿混淆；**绝不上传**

## 工具链真实路径（项目根 `C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04\`）
- `jdk-21.0.12\`、`gradle-8.2.1\bin\gradle.bat`、`android-sdk\`（local.properties 写死 sdk.dir）
- 托管 python：`C:\Users\NIU-XC\.workbuddy\binaries\python\versions\3.13.12\python.exe`；托管 node：`C:\Users\NIU-XC\.workbuddy\binaries\node\versions\22.22.2\node.exe`

## 备份体系
- `backups/hiking-app3-vX.Y.Z/`：完整源码备份；`backups/apk-history/`：历史 APK；`backups/android-signing/`：签名（绝不上传）
- `backups/github-同步目录/xixi-hiking/`：GitHub 仓库本地副本（clone 后覆盖提交推送）
- CloudStudio 网页：https://e7f39d534e2e4958b7844f37fca23f6e.gz4.agentos-app.net

## 近期版本要点（v1.1.0.7 ~ v1.1.7.0）
- v1.1.0.7~1.1.1.4（vc129~136）：inset 兼容、震动反馈、WebDAV 上传超时修复等（注意 vc132 起版本名错位）
- v1.1.1.5（vc137）：去灵光化（36处 storage→AppStore + 删死搜索）+ toast 玻璃修复 + **bump.js/test.js 脚本** + 旧 WebView 兜底 + 照片占用 + 启动懒加载 + README 重写
- v1.1.1.6（vc138）：导出诊断 + 备份瘦身（完整/纯数据）+ 同步失败提醒 + 云端自动清理（留2份）+ 字段增强（心情/天气/同行人）+ 数据层单测 + 分享卡 v1 + 月度统计
- v1.1.1.7（vc139）：分享卡动漫风 + 设置页双卡合并 + 编辑行一行化 + 热力图详情弹窗增强
- v1.1.1.8（vc140）：热力图弹窗 meta 一行 + 分享卡玻璃质感重做
- v1.1.1.9~1.1.1.10（vc141~142）：刷新错误限频 / 诊断 MIME 修复 / WebDAV 双超时（原生60s+JS桥90s）
- v1.1.2.0（vc143）：分享卡庆祝图背景内置（SHARE_BG_DATA）+ 回忆册补字段 + 诊断说明改短
- v1.1.2.1（vc144）：分享卡布局修复（横排/白标题/自适应字号/心情天气写文字）+ 诊断报告并入导出 + **四项优化约定**
- v1.1.2.2~2.3（vc145~146）：分享卡数据下沉贴底 + 品牌间隔 120px
- v1.1.2.4（vc147）：**玻璃质感定稿**——全组件统一透明玻璃配方（0.08+blur2+亮边）+ 去全部边框高光
- v1.1.2.5（vc148）：toast 深浅透明度统一 0.4 + 云端弹窗闪灰修复 + 同步转圈修复
- v1.1.2.6~2.9（vc149~152）：**五项优化约定** + confirm-modal blur 补漏 + 帧率框统一 + 热力图弹窗按钮玻璃化/meta 标签式/分享移底部/多照片 + 弹窗全 confirm 化 + **删除「最强玻璃质感」折射装饰** + 浅色弹窗文字加深 + 遮罩调淡 + 更新弹窗文字修复
- v1.1.2.10（vc153）：月度横条删除 → 热力图下「累计爬升」+ 知道了按钮/设置开关/热力图红格子玻璃化
- v1.1.3.0（vc154）：**分享卡定版**——新背景图（分享卡背景.png）+ 海拔/难度/心情/天气/同行标题加粗 + textAlign 重叠修复（⚠️版本号教训：1.1.2.10 → 1.1.3.0 非 1.1.2.11）
- v1.1.3.1（vc155）：**11 项批量优化 + 照片层叠卡片 + 灯箱添加/删除 + 编辑行字段调优 + 难度徽章玻璃化 + 热力图弹窗四行分组/标签内容区分/心情天气文字化 + 添加按钮玻璃化 + toast 加宽 + 记录行照片按钮玻璃版 + iOS 导出修复**（详见 Release）
- v1.1.3.2（vc156）：**检查更新确认弹窗（检查/关闭，浅红玻璃按钮）+ 网页版弹窗示例（检测更新/WebDAV 管理备份）+ 难度分布独立卡片统一概览格式 + 直方图边框调浅 + 五项优化微调**（详见 Release）
- v1.1.3.3（vc157）：**检查更新弹窗显示版本更新内容 + 计划提醒优化（延迟2s/停留3s + 未来3天按明天/后天/大后天分组 + 今天优先于过期 + 文案精简）**（详见 Release）
- v1.1.3.4（vc158）：**更新弹窗「立即更新」按钮统一浅红玻璃（与「检查」按钮一致）**（详见 Release）
- v1.1.3.5（vc159）：**计划列表默认按计划时间近到远排序 + 删除/确认完成/分享按钮统一浅红玻璃 + 修复 check-go-btn 被 confirm-btn-delete 覆盖 bug + 计划提醒时序 1s/2s + 标题不可编辑 + 底栏阴影删除**（详见 Release）
- v1.1.3.6（vc160）：**照片添加支持多选（编辑行 + 灯箱，≤9 上限超出提示）**（详见 Release）
- v1.1.3.7（vc161）：**分享卡去掉难度显示（热力图弹窗难度保留）**（详见 Release）
- v1.1.3.8（vc162）：**回忆册备份补里程/用时 + 同步状态结果展示期（上传中转圈→成功对号/失败错号，10 秒后恢复连接状态）**（详见 Release）
- v1.1.3.9（vc163）：**导入/下载改合并不覆盖 + 完整备份改 zip 压缩包（照片二进制）+ 统计总里程/总用时卡片 + 计划 toast 合并 + 分享卡自适应 + 统计卡片行级渐入**（详见 Release）
- v1.1.3.10（vc164）：**恢复规则升级：时间戳取新 + 空字段补全（undefined/null/空字符串/0 都算空，如 0 海拔会自动用另一份补）；导入/下载/自动同步三处规则统一**（详见 Release）
- v1.1.4.0（vc165）：**合并取新升级为 updatedAt 最后修改时间（改了的字段更新、没改保持）+ 概览总爬升卡片/平均难度移直方图右上角/热力图累计爬升删除 + 热力图弹窗分组（难度里程/用时/心情天气）+ 检查更新确认弹窗显示检测结果 + teal/rose 光晕补齐 + 平均海拔图标换 height**（详见 Release）
- v1.1.4.1（vc166）：**toast 单行省略修复（导出长文件名不再折行）**（详见 Release）
- v1.1.4.2（vc167）：**toast 折行 v2（长文件名限宽内折行分两段）+ 检查更新确认弹窗显示当前版本内容回顾**（详见 Release）
- v1.1.4.3（vc168）：**toast 限宽收窄 60%（min(55vw,288px) 约两行）+ 清理 showLoadingMessage/hideLoadingMessage 死代码**（详见 Release）
- v1.1.4.4（vc169）：**toast 限宽调整为 75%（min(69vw,360px)）**（详见 Release）
- v1.1.4.5（vc170）：**记录/计划列表分页（每页 10 条 + 翻页控件）+ WebDAV 上传下载阶段进度 + 更新下载实时百分比（原生流式）+ 诊断报告补 WebDAV 状态/最近同步 + 清调试日志 + 主题切换 0.3s 过渡**（详见 Release）
- v1.1.4.6（vc171）：**底栏二次点击刷新回到第一页 + 浅色模式底栏可见性微调（0.2）**（详见 Release）
- v1.1.4.7（vc172）：**修复更新下载百分比不可见（镜像无 Content-Length，改传字节显示已下载大小兜底）+ WebDAV 弹窗进度文字字号调小**（详见 Release）
- v1.1.4.8（vc173）：**记录/计划批量删除 + 统计防抖 + 启动并行 + 行动画首播 + 灯箱照片预加载缓存 + 热力图缓存 + backdrop 瘦身 + 网页版离线（SW）**（详见 Release）
- v1.1.4.9（vc174）：**渐进增强批次：返回键防误退/关弹窗 + 深色防闪白（启动屏+WebView）+ 导航栏跟随主题 + 轻震动 + 滚动丝滑 + 图标自适应 + 关于页更新日志（内置离线）+ 检查更新简化**（详见 Release）
- v1.1.4.10（vc175）：**返回键改系统标准通道（OnBackPressedCallback）确保生效 + 图标恢复原图（walk 修复）**（详见 Release）
- v1.1.5.0（vc176）：**返回键关弹窗修复（实时检测）+ 防误退提示改玻璃 toast + 批量模式切页自动退出 + 关于页 GitHub 图标（外部浏览器打开仓库）**（详见 Release）
- v1.1.5.1（vc177）：**导入/导出弹窗按返回键可直接关闭（选择器扩到 modal-backdrop-animate，取消按钮优先走淡出清理）**（详见 Release）
- v1.1.5.2（vc178）：**弹窗关闭取消淡出动画，全部直接关闭（含返回键统一 remove，删 modal-closing 死代码）**（详见 Release）
- v1.1.5.3（vc179）：**导出诊断修复（AppStore.getItem 同步误用）+ 错误提示全中文化（网络/同步/JS 代码）+ 离线优化（断网跳自动同步/检查更新直提示）+ 去掉 Made by XiXi 爱心**（详见 Release）
- v1.1.5.4（vc180）：**记录/计划搜索（滚动滑出+按名称过滤）+ 照片缩略图缓存（LRU）+ 统计数字滚动防抖（值变才播）**（详见 Release）
- v1.1.5.5（vc181）：**搜索功能修复（currentTabId 全局化）+ 搜索框交互定稿（任意方向轻滑显示/1秒消失/底部让位分页/键盘跟随+回位）+ 玻璃透明度统一**（详见 Release）
- v1.1.5.6（vc182）：**搜索框移除底部避让逻辑（滑到列表底部不再自动隐藏）**（详见 Release）
- v1.1.5.7（vc183）：**紧急修复 v1.1.5.6 更新日志换行转义错误导致页面无法操作**（详见 Release）
- v1.1.5.8（vc184）：**输入法覆盖式弹出（adjustNothing，软件不再被整体抬高）+ 搜索框原生 IME 桥精确跟随键盘（原生监听 insets 高度 → window.__onImeHeight；网页版 visualViewport 照旧）**（详见 Release）
- v1.1.5.9（vc185）：**修复输入法弹出时搜索框被顶出屏幕（原生 insets 物理像素 ÷DPR 换算 + 60vh 上限保护 + focus 45vh 兜底）**（详见 Release）
- v1.1.5.10（vc186）：**修复中文输入法搜索失效（拼音中间态不再误搜 + 上屏强制同步）+ 搜索结果列表避让输入法（键盘弹出列表可滚动查看）**（详见 Release）
- v1.1.6.0（vc187）：**五项优化：修复编辑输入框被键盘盖住（adjustNothing 回归）+ placeholder 统一 + 删 roundRect 死代码 + 键盘让位平滑过渡**（详见 Release）
- v1.1.6.1（vc188）：**编辑输入框浅色模式加浅色边（与底栏同款）+ 修复点搜索框跳变/页面被抬高（去掉 45vh 兜底 + 滚动排除搜索框）**（详见 Release）
- v1.1.6.2（vc189）：**计划页搜索优化：placeholder 按页切换（搜索记录/搜索计划）+ 切页自动呼出搜索框（计划少无法滚动也能找到）+ 搜索时徽标显示"匹配 N / 共 M 条"**（详见 Release）
- v1.1.6.3（vc190）：**修复打开软件后第一次搜索不实时出结果（输入事件重构：不再依赖易丢失的 compositionend，拼音阶段实时过滤 + 3s 超时防卡死）**（详见 Release）
- v1.1.6.4（vc191）：**彻底修复搜索不实时（轮询检测输入内容 250ms，不依赖输入法事件——某些输入法拼音期间不派发 input 且丢 compositionend）**（详见 Release）
- v1.1.6.5（vc192）：**五项优化：启动瘦身（删数据加载前空表渲染）+ XSS 安全加固（escapeHtml 补引号转义，7 处用户输入/云端文件名插值全转义）+ prefers-reduced-motion 适配（系统减少动态效果时动画降级）**（详见 Release）
- v1.1.6.6（vc193）：**修复导出/管理弹窗连点叠加、关闭按钮失灵（closeOpenModals 全局防重入 + manageCloudBackups 防连点 + 按钮"读取中…"反馈）**（详见 Release）
- v1.1.6.7（vc194）：**下载键弹窗同款修复 + 全弹窗防重入 + 照片删除确认（同款 confirm 设计）+ 编辑海拔负数归零 + 分享卡里程 toFixed(1) + Tailwind .container 覆盖修复（双类提特异性）+ 五项优化 v4**（详见 Release）
- v1.1.6.8（vc195）：**灯箱修复：照片删除确认弹窗被灯箱遮挡（z-index 提级 300）+ 灯箱删除键样式统一为浅红玻璃（check-go-btn 深色配方）**（详见 Release）
- v1.1.6.9（vc196）：**★方案A 单文件拆分落地（主 JS 拆 4 外部文件 app-core/app-data/app-sync/app-init.js，bump/test/sw 全适配）+ 系统通知（计划提醒走通知栏，MainActivity showNotification 桥 + Android13 权限）+ 全局禁长按选择/图片菜单（输入框放行）+ 通知失败降级 toast + 五项优化 v5**（详见 Release）
- v1.1.6.10（vc197）：**★通知交互升级：修复关通知权限后提醒彻底消失（原生桥 notify() 静默丢弃误报成功 → 加权限/渠道三层检查，失败返回 false → JS 降级 toast）+ 通知「✓ 完成」按钮（点后通知消失 + 对应计划标记完成转记录）+ 点击通知直达计划页（固定 NOTIFY_ID + PendingIntent 双动作 + consumeNotifyAction 桥 + 冷启动/热启动双路径消费）**（详见 Release）
- v1.1.7.0（vc198）：**★计划提醒升级：不打开 App 也能收到提醒（原生 AlarmManager 闹钟：syncPlanAlarms 桥把「今天及以后」计划按天注册系统闹钟，每天 08:00 触发 AlarmReceiver 发通知，App 进程不在也能收到；Manifest 加 USE_EXACT_ALARM/SCHEDULE_EXACT_ALARM；JS 启动+计划保存全量重设，增删改/完成自动取消）+ 通知「✓ 完成」按钮按用户要求删除（只保留点击跳计划页，清死代码/死图标）**（详见 Release）
- v1.1.7.1（vc199）：**计划列表/日历双视图切换（默认日历，日历下隐藏添加/批量，切换按钮固定最右，日历模式搜索定位+标记）+ 计划完成直接进记录编辑补全（预填名字/难度/海拔）+ 深色模式关于卡片边框统一玻璃配方**（详见 Release）
- v1.1.7.2（vc200）：**计划日历：二次点击 tab 回当天 + 明细区整月全部计划按日期分组每条标注日期（点日期聚焦该日+2px 框选，「整月」按钮返回）+ 日期条深色统一玻璃配方 + 选中日期 2px 强调框**（详见 Release）

## 待办/新功能方案（2026-08-28 更新）
- 分享卡 ✅ 定版（v1.1.3.0）；照片层叠 ✅、灯箱添加删除 ✅、WebDAV 密码加密 ✅（11 项优化 v1.1.3.1 全含）
- ✅ **记录/计划本地搜索**（v1.1.5.4~v1.1.6.4 完成：名称包含匹配 + 输入法协作 + 轮询根治 + 计划页优化）
- ✅ **UI 层自动化测试**（test-ui.js 26 项 jsdom 渲染测试，发布双保险）
- ✅ 备份 zip 二期 **已完成**（v1.1.3.9：完整备份改 zip 压缩包，照片二进制省 33%）
- ✅ 设置页数据管理框空白约 1 秒 **已解决**（v1.1.3.1 缩短 settingsBlockIn 动画 0.3s+0.56s → 0.18s+0.28s，最后块 0.46s 出现，见 index.html 907 行注释）
- ✅ **方案 A 单文件拆分 已落地**（2026-08-30：主 JS 拆 4 外部文件 app-core/app-data/app-sync/app-init.js；bump.js/test.js/test-ui.js/sw.js 全部适配；同步清单+回退点已更新，漏同步 JS 会白屏）
- 💡 备份提醒（距上次同步超 7 天启动轻提示）——用户未采纳，仍建议

## ⚠️ 接手注意事项（环境经验大全，防踩坑）
1. **GitHub 同步**：`GIT_SSL_NO_VERIFY=true`（schannel 吊销检查失败）；分支 **master**；★★2026-08-27 凭据读取**必须用 Python ctypes CredEnumerate 枚举过滤 `git:https://github.com` 读 blob**（**CredReadW 读该 target 返回空 blob size=0，CredEnumerate 正常**；CredentialBlob 是 UTF-16LE、40 字符裸 token、无 x-access-token 前缀）；★2026-08-25 起 `git -c http.extraHeader` 失效（PortableGit GCM 缺失）→ **改用 `git push https://x-access-token:TOKEN@github.com/... master` URL 带凭据**；★★2026-08-26 **PortableGit 有 `credential.helper=helper-selector`（+ .gitconfig GCM）→ push 会弹「选择凭证管理器」→ push 必须加 `-c credential.helper=` 禁用**：`git -c credential.helper= push https://x-access-token:TOKEN@github.com/... master`；**★★2026-08-27 Release asset 上传必须裸二进制（Content-Type: application/octet-stream，body=APK 原始字节），严禁 multipart（会被原样存成坏文件，手机"解析包出问题"）；上传后必须下载验证 md5 + PK 头；asset 名用 ASCII（中文被替换成 .）**；资产上传端点 **uploads.github.com**；建 Release POST api.github.com；更新依赖仓库 public + tag 版本 > APP_VERSION
2. **构建必须在 %TEMP%\hiking-build**（桌面路径文件锁）
3. **不需要 node_modules / npx cap sync**：改 index.html → 复制 → gradle 构建（除非加 Capacitor 插件）
4. **★环境坑（2026-08-28）**：Write 工具写入与 Bash 文件系统偶发隔离（Write 报成功但 bash 找不到文件）→ 临时脚本一律用 **Bash heredoc 创建**；PowerShell 工具输出偶发被吞 → APK 验证改 **bash/python**（aapt 直接调 + python md5）；**test-ui.js 需要 jsdom，装在隔离 workspace**（`C:\Users\NIU-XC\.workbuddy\binaries\node\workspace`，**项目 node_modules 有损坏包（http-proxy-agent/agent-base 缺 dist）不可用**），test-ui.js 用绝对路径 require
5. **敏感凭据红线**：坚果云密码用户自己填、AI 不索要；GitHub token 用完即弃；keystore 绝不外传
6. **换电脑**：绝对路径只对当前电脑有效；local.properties sdk.dir 必须改；见 `backups/新电脑部署指南.md`
7. **沟通风格**：用户称呼「爹」，助手自称「小小牛 🛠️」；直接给结论不废话
8. **★换模型/新会话流程（铁律）**：重读本文件 + `.workbuddy/memory/MEMORY.md` + 最新日期日志 → 复述确认（当前版本号/主工程路径/最近发版/发布流程顺序）→ 再开工

## 用户信息
- 用户称呼：爹；助手自称：小小牛（🛠️）；直接、不废话风格
- 钛铸件国企销售，关注航空产业链；偏好 Word 报告（用户级记忆另有）
