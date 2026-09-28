# site/ — XiXiの徒步小记 官网

App 的介绍站：**首页 + 隐私政策 + 免责声明**，纯静态（无构建步骤）。

## 为什么单独一个目录

官网**故意不放进 `www/`**：`www/` 是 App 本体（PWA），它的 `sw.js` 会接管整个作用域 —— 官网若放进去，用户打开官网会被 Service Worker 拉进 App 本体。所以官网用**独立的 Cloudflare Pages 项目**，Root 指向本目录。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 首页（hero + 真实界面 + 01–09 九段 + 隐私承诺 + 收尾 + 页脚） |
| `privacy.html` | 隐私政策（10 节，与 App 内同口径） |
| `terms.html` | 免责声明（10 节，与 App 内同口径） |
| `assets/site.css` | **共享样式**（三页共用；改样式只改这一个文件） |
| `assets/shots/` | 三张真机截图（统计概览 / 徒步足迹 / 山册，585×1266） |
| `assets/icons/` | 图标（复用 App 的 192 / 512 / 180） |

## 首次部署（Cloudflare Pages）

1. 控制台 → **Workers & Pages → Create → Pages → Connect to Git**
2. 选仓库 `NiUKinGDoM/xixi-hiking`，分支 `master`
3. 构建设置：
   - **Framework preset**：None
   - **Build command**：留空
   - **Build output directory**：`site`
4. Save and Deploy → 得到 `<项目名>.pages.dev`

> 之后每次 `git push` 到 `master`，CF 会自动重新部署官网（与 App 的 PWA 站点互不影响）。

## 设计语言（v9 · 2026-09-28）

按用户提供的设计稿实现：

- **配色**：近黑 `#0E110F` / 暖纸 `#E9E3D6` / 陶土红 `#A4512B`（浅色区强调）/ 赭橙 `#CC8058`（深色区强调）/ 鼠尾草绿 `#77866E`
- **深浅交替**：每段用 `data-tone="light|dark"` 切换 —— 深色区在 `.sec[data-tone]` 里**重定义 CSS 变量**，不是两套样式
- **字体**：`Fraunces`（英文衬线）+ `Noto Serif SC`（中文衬线）做标题；`Inter` + `Noto Sans SC` 做正文
- **质感**：全局噪点覆盖层（内联 SVG `feTurbulence`）+ 手绘山景 SVG + 顶部滚动进度条
- **几乎无图片依赖**：所有装饰都是内联 SVG，只有三张真机截图是真图

## ★两个必须知道的坑

**1）字体走 Google Fonts —— 国内访问不稳**

样式表用 `media="print" onload="this.media='all'"` **异步加载**，加载失败不会阻塞首屏（同步加载会白屏）。
兜底字体栈已写全：`"Noto Serif SC" → "Source Han Serif SC" → "Songti SC"（iOS/macOS 好看）→ "STZhongsong"（Win+Office 好看）→ "SimSun"`。

> 想彻底摆脱外部依赖：把 Fraunces / Noto Serif SC 下载到 `assets/fonts/` 自托管（中文字体需子集化，否则体积过大）。

**2）政策正文是两份拷贝**

App 内在 `www/app-data.js`（`showPrivacyPolicyModal` / `showDisclaimerModal`），官网在 `privacy.html` / `terms.html`。
→ **改一处必须同步另一处**，并 bump `LEGAL_VERSION` + 官网页「生效日期」。

## 内容维护：改哪儿

| 要改什么 | 位置 |
|---|---|
| 首屏大标题 / 引言 / 两个按钮 | `index.html` 的 `<header class="hero">` |
| 顶部菜单 | `index.html` 的 `<ul class="nav-links">` 与 `.m-menu` |
| 各段标题与说明 | 每段 `<header class="sec-head">` 里的 `sec-title` / `sec-lede` |
| 统计卡演示数字 | `#s01` 的 `.stat-grid`（已标「示例数据」，建议保留标注） |
| 更新日志 | `#s09` 的 `.rel-list` |
| 下载入口 | `.finale` 的 `.store-row`（目前 = GitHub Releases + 网页版） |
| 配色 / 字体 / 间距 | `assets/site.css` 顶部的 `:root` |
| 界面截图 | 替换 `assets/shots/` 同名文件（建议 585×1266 或同比例） |

## 自检（无浏览器自动化时也能做）

改完**务必**用探针跑一遍 `320/360/390/414/768/1024/1440 × 三页` 的**横溢** + **图片显示比例 vs `naturalWidth/naturalHeight`**（探针写法见项目 memory）。

**已知脆弱点**：`.split` / `.finder` / `.share` 是 grid 双列，里面若出现 `width:max-content` 的元素（如年度热力图 `.heat`，53 列 ≈ 742px），**必须给 grid item 显式 `min-width:0`**（已加），否则窄屏整页可横向拖动。
