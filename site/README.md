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
| `assets/shots/` | **10 张真机截图**（由 `tools/siteshots.js` 从 `www/` 真实渲染生成，585×1266；分享卡 1080×1440） |
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
- **★界面一律用真机截图，不做假界面**（2026-09-28 起）：正文里出现的每一块 App 界面（概览 / 记录 / 山册 / 详情 / 计划 / 搜索 / 设置 / 分享卡 / 深色模式）都是 `tools/siteshots.js` 从 `www/` 渲染出来的真图。上一版的「手搓 mock」（统计主卡面板、日历、搜索框、分享卡海报）**已全部删除** —— 手搓的界面必然和 App 走样（实测：旧 mock 里的「年度足迹热力图 53 列」和「分享卡带难度 + 二维码 + 9:16/PDF 导出」在 App 里都不存在）。

## ★内容的唯一事实来源：App 自己

写文案前**必须**先跑一遍把 App 四页的真实文案导出，照着写：

```bash
node tools/siteshots.js --dump     # → tools/notes/app-tabs-text.txt（概览/记录/计划/设置 全部可见文字）
```

2026-09-28 逐条核对，改掉的错：

| 官网上写的 | App 实际 | 处理 |
|---|---|---|
| 概览有「年资」 | 概览是「我的里程碑」；年资在**设置→关于**里（徒步第 N 天） | 换掉 |
| 「年度足迹热力图」（53 列年视图） | 是「徒步足迹」**按月**一张日历 + 右上「回顾」 | 换掉 |
| 搜索「按山名匹配」 | 匹配 **山名 / 小日记 / 心情 / 天气 / 同行人** 五个字段 | 换掉 |
| 分享卡「带难度」 | 分享卡**不显示难度**（2026-08-25 起） | 删 |
| 分享卡「带二维码」「落款可关」 | 没有二维码；二维码是「支持作者」的打赏码，跟分享卡无关 | 删 |
| 分享卡「9:16 Story / PDF Print」 | 只有一种尺寸 **1080×1440（3:4）** | 删 |
| — | 「那年今日」「我的里程碑（17 项）」「批量模式」「从历史复制」「照片回忆」「平均三项」「自动同步」「显示帧率」「先看看示例」都**没写** | 补 |

## ★渐显动画的三层兜底（2026-09-28）

`.reveal`（滚动渐显）与首屏 `.mask`（标题升起）都是**先隐藏、再由 JS 显示** —— 一旦 JS 失效就是整页空白。
现在有三重保险，别删：

1. **`.js` 开关** — `index.html` `<head>` 第一行给 `<html>` 加 `.js`，CSS 里写成 `.js .reveal{opacity:0}`。
   JS 被拦 / 老浏览器 → 没有 `.js` → 内容直接可见。
2. **try/catch 撤销** — 主脚本整体包在 `try{}catch{}` 里，任何一步抛错就 `classList.remove('js')`，立刻恢复可见。
3. **超时 + 打印兜底** — 首屏标题 1.6s 强制升起、视口内 `.reveal` 2.5s 强制显示、`beforeprint` 全部展开。

> 改这块前先读项目 memory 的「渐显类动画必须有兜底」硬教训。

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
| 界面截图 | 别手改图；改 `www/` 的界面后跑 `node tools/siteshots.js` 重出（素材在 `assets/shots/`） |
| 配色 / 字体 / 间距 | `assets/site.css` 顶部的 `:root` |
| 界面截图 | 替换 `assets/shots/` 同名文件（建议 585×1266 或同比例） |

## 真机截图怎么生成

```bash
cd hiking-app3
python -m http.server 8123 --directory www &        # ★App 照片走 IndexedDB，file:// 不可靠 → 必须 http
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9333 --user-data-dir="$TEMP/cr-shot" --no-first-run about:blank &
sleep 4
export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1
node tools/siteshots.js                 # 全部重出（--only=search 只重出一张）
node tools/siteshots.js --dump          # 只导出四页文案，不截图
```

脚本做的事：CDP 连上 Chrome → 给 `<html>` 预置 localStorage（37 条演示记录 + 4 条计划 + **从源码读出的 `LEGAL_VERSION` 同意记录** + 四个引导卡已关 + FPS 关 + 浅色 + 顶栏标题 + 当日过期提醒已消）→ 打开 `www/index.html`（390×844 @1.5x）→ 把 5 张「插画风」演示照片画进 canvas 再塞进 IndexedDB（这样照片墙/详情是真渲染出来的）→ 逐页逐弹窗截图 → 最后拦下 `generateShareCard` 的输出存成真分享卡。

**三个必须知道的坑**：
1. **必须和 chrome / http server 写在同一条 shell 命令里** —— 后台进程会随 shell 退出被杀。
2. `NO_PROXY=127.0.0.1` —— 否则 node 的请求被代理吃掉（`ECONNREFUSED`），而 python 直连反而通。
3. **换页前先清场** —— 不是所有弹层都叫 `.confirm-modal`，记录详情弹窗是 `#record-detail-modal`（没有 confirm-modal 类），漏清会让后面几张图全被上一张的弹窗压住。

## 自检（无浏览器自动化时也能做）

**★本机 `node` 的 `child_process.spawn` 会 EBUSY** → 不能用 puppeteer/playwright 那套「node 拉起浏览器」。
改成 **Chrome 自己起调试端口 + node 只连 WebSocket**（`hiking-app3/tools/` 下三个脚本）：

```bash
cd hiking-app3
# ① 起 Chrome（★必须和 node 脚本写在同一条命令里 —— 后台进程会随 shell 退出被杀）
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --hide-scrollbars --remote-debugging-port=9333 \
  --user-data-dir="$TEMP/cr-prof" --no-first-run about:blank &
sleep 4
export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1      # ★否则 node 的请求会被代理成 ECONNREFUSED

# ② 整页/分段截图:   node tools/siteshot.js <url> <out.png> [宽=1440] [缩放=1] [强制显示=1] [y偏移] [高]
node tools/siteshot.js "file:///…/site/index.html" "$TEMP/a.png" 1440 1 1 0 4200
# ③ 单点求值:        node tools/siteeval.js <url> "<js表达式>" [宽]
node tools/siteeval.js "file:///…/site/index.html" "document.querySelectorAll('.reveal.on').length" 1440
# ④ 多档宽度批量:    node tools/siteprobe.js <url> "<js表达式>" "320,360,390,414,768,1440"
node tools/siteprobe.js "file:///…/site/index.html" "document.documentElement.scrollWidth" "320,768,1440"
kill %1
```

**两个坑**：
1. `siteshot.js` **必须先整页滚一遍**（脚本里已做）—— `captureBeyondViewport` 不会触发 `loading="lazy"` 解码，否则截图里图片是空白块。
2. 截图脚本会把 `.reveal` 全点亮（否则未滚到的区块是 `opacity:0`）；**验证「无 JS 也能看」要单独跑** `siteeval.js` 里 `classList.remove('js')` 再读 `getComputedStyle`。

改完**务必**跑一遍 `320/360/390/414/768/1024/1440` 的**横溢**（判据：`document.documentElement.scrollWidth === clientWidth`）
+ **图片显示比例 vs `naturalWidth/naturalHeight`**（偏差应 < 1%，`border` 会带来约 0.3% 的固有偏差）。

**已知脆弱点**：`.split` / `.finder` / `.share` 是 grid 双列，里面若出现 `width:max-content` 的元素（如年度热力图 `.heat`，53 列 ≈ 742px），**必须给 grid item 显式 `min-width:0`**（已加），否则窄屏整页可横向拖动。

**★图片两个必踩的坑**（都踩过）：
1. **`<img>` 写了 `width`/`height` 属性就必须配 CSS `height:auto`** —— 属性值会被当固定像素，只覆盖 `width` 不覆盖 `height` 就把图**纵向拉长**。
2. **`max-width` + `margin-inline:auto` 放在 grid item 上，会让它退化成「按内容收缩」**（auto 外边距会取消 grid 的 `stretch`）。图片没加载前容器只剩标题那么宽（实测 ≈110px），加载完跳到 352px → **整页抖一次（实测 842px CLS）**。必须显式写 `width:100%` 把宽度先钉死，`max-width` 再封顶。验收判据：`document.images` 全部未加载时与全部加载后的 `scrollHeight` 必须相等。
