# 官网（site/）

App 的官方介绍站：**首页 + 隐私政策 + 免责声明**，纯静态（无构建、无依赖、无外部 CDN）。

## 为什么单独一个目录

官网**故意不放进 `www/`**：`www/` 是 App 本体（PWA），它的 `sw.js` 会接管整个作用域 —— 官网若放进去，用户打开官网会被 Service Worker 拉进 App 本体，两边互相污染。所以官网用**独立的 Cloudflare Pages 项目**，Root 指向本目录。

## 首次部署（Cloudflare Pages）

1. 打开 Cloudflare 控制台 → **Workers & Pages → Create → Pages → Connect to Git**
2. 选仓库 `NiUKinGDoM/xixi-hiking`，分支 `master`
3. 构建设置：
   - **Framework preset**：None
   - **Build command**：留空
   - **Build output directory**：`site`
4. Save and Deploy → 得到 `<项目名>.pages.dev`

> 之后每次 `git push` 到 `master`，CF 会自动重新部署官网（与 App 的 PWA 站点互不影响）。

## 设计说明（v4 · 2026-09-27 重做）

**基调：纸感极简 / 户外杂志**（推翻了 v3 的「粉紫蓝渐变 + 彩色图标 + 玻璃卡片堆叠」）。

| 要素 | 取值 |
|---|---|
| 底色 | 暖米白 `#f7f6f3`（`--paper`） |
| 文字 | 墨黑 `#16181c`（标题）/ `#5c6269`（正文） |
| 主色 | **森林绿 `#1f5c3f`** —— 与 App 图标同色系，色彩不再打架 |
| 分隔 | 「细线 + 留白」，线为**渐变淡出**；**不用卡片堆叠** |
| 排版 | 宋体衬线栈；标题 `clamp(27px, 6.6vw, 78px)`；小标签 12px / `letter-spacing .2em`；**左对齐** |
| 装饰 | 首屏底部的淡绿山脊线；宽屏（≥1280px）左侧「跟随滚动绘制的路线」 |
| 玻璃 | 只保留在导航条（配方全站唯一 `blur(2px) saturate(150%)`） |

**为什么这么改**：v3 堆了太多效果（三色渐变底 + 到处玻璃卡 + 彩色图标 + 药丸标签），反而显廉价。现在把层次交给**排版与留白**，颜色收敛到「纸 + 墨 + 一个绿」。

> ★**渐显动画必须有兜底**：`.reveal` 初始 `opacity:0`，靠 IntersectionObserver 加 `.in` 才显示 —— 一旦回调不触发（headless / 虚拟时间 / 打印 / JS 部分失败）就是**永久白屏**。因此 JS 里做了两件事：① 已在首屏内的区块**不挂** `.reveal`（直接可见）；② 4 秒兜底强制显示全部。

## 改完怎么自检（无法用浏览器自动化时）

1. **静态**：内联脚本抽出跑 `node --check`；核对玻璃配方唯一 / 圆角表 / HTML 类名 100% 被 CSS 覆盖 / 无 emoji / 无外部依赖。
2. **截图**：直接调 Chrome（不经 node）—— `chrome.exe --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,1000 --screenshot=out.png <url>`。`--virtual-time-budget` 要够大，否则动画没跑完。
3. **真实手机视口**：Chrome 窗口有 **~500px 最小宽度**，`--window-size=390` **是假的**（内容按 500 排版后被裁，会误判成「横溢」）。正解：建一个同源 `_probe.html`，里面用 `<iframe style="width:390px;height:7000px">`（**高度须大于页面总高**，否则 iframe 内滚动条占宽造成假溢出）加载页面，测完把结果写进 `#out`，再 `--dump-dom` 抓回来。用完即删该探针文件。

## 日常维护：改哪儿

| 想改什么 | 改哪个文件 |
|---|---|
| 首屏标题 / 简介 / 按钮 | `site/index.html`（`.hero` 段） |
| 功能清单、卖点文案 | `site/index.html`（`#what` / `#features` 段） |
| 更新日志（首页那 2 个版本） | `site/index.html`（`#changelog` 段） |
| 隐私政策正文 | `site/privacy.html` |
| 免责声明正文 | `site/terms.html` |
| 配色 / 间距 / 响应式 | `site/assets/site.css`（顶部 `:root` 变量） |
| 界面截图 | `site/assets/shots/`（换同名文件即可） |
| 图标 | `site/assets/icons/`（`icon-192.png` / `icon-512.png` / `apple-touch-icon.png`） |

改完执行：`node tools/ghsync.js -m "site: ..." --push`（`tools/ghsync.js` 的同步清单里已包含 `site/`）。

## 界面截图怎么来的

`site/assets/shots/` 里的三张（统计概览 / 徒步足迹 / 山册）是**用真实 App 渲染、演示数据**截出来的，不是手绘：
起本地服务 → 浏览器里调 `loadSampleData()` 再补一批记录 → 截图。想换成自己的真机截图，直接替换同名文件即可（建议 390×844、2 倍图）。

## ★两个易踩的坑

1. **政策正文是两份拷贝**：App 内的正文在 `www/app-data.js`（`showPrivacyPolicyModal()` / `showDisclaimerModal()`），官网在 `site/privacy.html` / `site/terms.html`。**改一处必须同步另一处**，否则应用商店审核会看到两边口径不一致。
2. **改 App 内政策正文时必须 bump `LEGAL_VERSION`**（`www/app-data.js`，与正文「生效日期」保持一致），并且官网对应页的「生效日期 / 最近更新」也要跟着改 —— 否则老用户不会被重新征求同意。
