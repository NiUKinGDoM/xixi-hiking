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

## 日常维护：改哪儿

| 想改什么 | 改哪个文件 |
|---|---|
| 首屏标题 / 简介 / 按钮 | `site/index.html`（`.hero` 段） |
| 功能清单、卖点文案 | `site/index.html`（`#what` / `#features` 段） |
| 更新日志（首页那 4 条） | `site/index.html`（`#changelog` 段） |
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
