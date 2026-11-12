# 任务：iOS Safari 支持（PWA 化）

> 来源：Android 原生版会话派发 · 2026-11-12
> 起因：用户问「iPhone 能不能用、能不能做个 ipa」

## 为什么是这个任务，不是 ipa

「做个 ipa」在技术上是**重写整个 App**，不是打包：

- iOS 安装必须签名：App Store / TestFlight 要 $99/年开发者账号，个人免费签名 **7 天过期**
- 编译必须用 macOS + Xcode（用户现在是 Windows）
- **更关键**：原生版的核心视觉是 **AGSL RuntimeShader**（液态玻璃真实折射），
  这是 Android 专有 API，iOS 没有对应物；Room / AlarmManager / MediaStore / 签名自校验
  也全要换成 iOS 实现

⇒ 原生 iOS 是 2~4 周 + Mac + 账号的事，先不做。
⇒ **本任务只做 PWA 适配，让 iPhone 现在就能用**，预计 1~2 小时。

## 必须做（缺一样体验就崩）

| # | 改动 | 缺了会怎样 |
|---|---|---|
| 1 | `<meta name="apple-mobile-web-app-capable" content="yes">` | 点开还是浏览器，有地址栏 |
| 2 | `<meta name="apple-mobile-web-app-status-bar-style" content="default">` | 状态栏和内容割裂，顶部一条黑边 |
| 3 | `<link rel="apple-touch-icon" sizes="180x180" href="...">` | **主屏图标是网页截图**，一眼假 |
| 4 | `manifest.json`（name / short_name / start_url / display=standalone / theme_color / background_color / icons 192+512 maskable） | Android/桌面端 PWA 不完整；iOS 部分读取 |
| 5 | `<meta name="viewport" content="...viewport-fit=cover">` | **safe-area 变量全是 0**，刘海屏内容被切 |
| 6 | 安全区适配 `env(safe-area-inset-top/bottom)` | 顶部标题被刘海挡、底部按钮被 Home 条压 |

## 应该做

7. 首屏 loading 骨架 —— Safari 冷启动比 Chrome 慢，白屏 1~2 秒很常见
8. **输入框 `font-size ≥ 16px`** —— 否则 iOS 聚焦会自动放大页面，而且**不会缩回来**
9. 禁双击缩放 / 长按菜单：`touch-action: manipulation`、`-webkit-touch-callout: none`
10. 底部固定元素处理软键盘：iOS 键盘弹出时 `position: fixed` 的底栏会被顶飞，
    用 `visualViewport` 或 `env(keyboard-inset-height)` 兜

## 已知限制（**必须写进 README 和应用内提示**）

别让用户以为坏了：

- **没有到点提醒** —— iOS PWA 推送要 16.4+ 且需手动授权，可靠性远不如 Android 的 AlarmManager。
  这是 Web 版和原生版最大的一处功能差
- 不能后台运行
- **读不到照片 EXIF** —— iOS Safari 的 File API 不给拍摄时间，原生版的"自动填日期"在这里做不到
- 数据存在 Safari 本地存储，**清缓存会丢** —— 首次使用就要引导配 WebDAV 备份，
  这是最容易踩的坑（用户以为加了主屏就是 App，其实数据还在浏览器沙箱里）

## 验收标准

1. iPhone Safari 打开 → 分享 → 添加到主屏幕 → **图标是设计图标，不是网页缩略图**
2. 点图标打开：**没有地址栏**，状态栏与背景融合
3. 上下滑到顶/底：内容不被刘海和 Home 条切掉
4. 点输入框：页面**不放大**
5. 断网打开：能看到已有数据（Service Worker 缓存生效）
6. 旋转横屏：布局不崩

## 不要做

- **不要为了"像 App"改视觉语言** —— 玻璃、字体、圆角都必须和 Android 版对齐，
  这是用户反复强调的红线（CLEAN WHITE glassmorphism，禁绿色紫色、禁 emoji 图标）
- 不要塞 iOS 专属控件（`<input type="date">` 之类的原生选择器已经被处理过，别回退）

## 做完之后

- 更新 `README.md` 的"iPhone 怎么用"一节
- 在本任务单末尾记一行结果（改了什么、验收过了没有）

---

## 完成记录（2026-11-12）

### 核查结论：清单第 1–6 项**本来就已到位**，不用改

| 项 | 实测 |
|---|---|
| 1 `apple-mobile-web-app-capable` | ✅ `index.html:5` = yes |
| 2 `apple-mobile-web-app-status-bar-style` | ✅ `index.html:6` = black-translucent（另有 `apple-mobile-web-app-title`） |
| 3 `apple-touch-icon` | ✅ `index.html:9` + `www/apple-touch-icon.png`（28KB） |
| 4 `manifest.json` | ✅ 合规：name/short_name/start_url/display=standalone/theme_color/background_color，icons 含 192 + 512 + maskable |
| 5 `viewport-fit=cover` | ✅ `index.html:3` |
| 6 安全区 `env(safe-area-inset-*)` | ✅ app.css 7 处 + app-modal.css 4 处 = **11 处** |

第 8 项（输入框 ≥16px）与第 9 项（禁长按菜单 `-webkit-touch-callout: none`、`touch-action`）也已在位。

### 本轮实际改动（4 个文件）

| 文件 | 改动 |
|---|---|
| `www/app.css` | 新增 `html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100% }` —— 禁 iOS 横屏/长标题页字体自动放大**且缩不回来** |
| `www/app.css` | 新增 `body.kb-open .bottom-tabbar { transform: translateY(140%); opacity: 0 }` —— 键盘弹出藏底栏 |
| `www/app-modal.css` | 3 处滚动容器补 `-webkit-overflow-scrolling: touch` |
| `www/app-init.js` | 新增 `visualViewport` 监听：算键盘高度 → 给 `body` 打 `kb-open`（无 visualViewport 的浏览器直接跳过，行为不变） |
| `tools/ioscheck.js` | **修工具盲区**：③ 段原来只扫 `index.html`，而项目 CSS 全在外部三份文件里 → 4 项永远报「未检测到」= 假红。改为拼接 app.css/app-modal.css/app-form.css 一起扫 |

### 验证

```
ioscheck ③  : 安全区 11 处 / 禁字体放大 2 处 / 视口高度 6 处 / 滚动顺滑 5 处 — 全绿
test.js     : 356 通过 / 0 失败
e2e/run.js  : 133 通过 / 0 失败（视觉基线零差异，改动均为条件生效）
```

### 未做：第 7 项「首屏 loading 骨架」

没做，理由：这属于**首屏视觉**改动，会动 e2e 基线，而 Safari 冷启动白屏到底多长我没法在 Windows 上实测。等有真机 iPhone 反馈"白屏明显"再补，避免凭想象加一层遮罩。

### 真机验收：待用户执行

本机没有 iPhone，检查项 1–6（图标是不是设计图标 / 有没有地址栏 / 刘海是否切内容 / 聚焦是否放大 / 断网能否打开 / 横屏是否崩）**需要用户在 iPhone Safari 上按上面「iPhone 怎么用」走一遍**。有任何一条不符，回来报具体现象。

---

# 二期追加（2026-11-12，Android 原生版会话派发）

## 需求：iOS 首次使用要引导配置云备份

**为什么必须加**：iOS 上数据存在 Safari 的本地存储里。加了主屏幕**不等于**变成 App，
数据还在浏览器沙箱 —— 清缓存、或者长期不用被系统清理，**记录会直接没**。
Android 版有 Room 数据库兜底，iOS PWA 没有。这是最容易踩、且后果最严重的坑。

用户在 README 里能看到警告，但 iPhone 上的人不会去读 README。

## 触发条件（三条同时满足才弹）

1. `navigator.standalone === true`（从主屏图标启动，不是 Safari 里打开的标签页）
2. 云备份**未配置**（地址/账号任一为空）
3. `localStorage` 里没有 `webdavHintAt`，或距上次提示已超过 **7 天**

> 第 3 条里"7 天后再提一次"是有意的：这是数据丢失风险，不是营销弹窗。
> 用户点"稍后"就永久不再提，等于默认接受丢数据的风险 —— 不能这么做。

## 形态（不要做成全屏弹窗）

- 首屏渲染完 **1.5 秒后**从底部滑入一条提示条（先让用户看到界面，别一进来就拦住）
- 文案：**「数据存在这个浏览器里，清理缓存会丢。先花一分钟配好云备份？」**
  （一句话说完风险 + 行动，不要写成"为了更好的体验"这种废话）
- 两个按钮：`去配置` → 跳到设置页云备份区；`稍后再说` → 关掉并记 `webdavHintAt`
- 配好之后（`webdav.configured === true`）**永远不再出现**，不管有没有点过"稍后"

## 视觉要求

- 和现有玻璃语言一致（同一个 `.glass` / 圆角 / 字体），**不要新造样式**
- 不要用 emoji 图标；用现有 inline SVG 或纯文字
- 颜色走现有变量，不要硬编码（会破 designcheck）

## 验收

1. iOS 主屏模式首次进入 → 1.5 秒后出现提示条
2. 点「去配置」→ 跳到云备份设置
3. 配置完成后再进 → 不再出现
4. Safari 普通标签页打开 → **不出现**（不是 PWA 模式，用的是浏览器存储策略）
5. `test.js` 356+ 全过、`e2e` 跑一遍（这次会动基线，属预期，`--update` 后复跑必须 0 差异）
6. `ioscheck` 全绿

## 做完在这里记一行结果

---

## 二期完成记录（2026-11-12）

**口径变更**：需求原文是「1.5 秒后从底部滑入提示条」，用户当场改为「**每次进入时在概览页顶部显示一条常驻小字，直到配好为止**」。按后者实现 —— 更轻，不拦人、不需要"稍后再说"按钮、不需要 7 天重提逻辑。

### 改动

| 文件 | 内容 |
|---|---|
| `www/index.html` | 概览页顶部加 `#cloudBackupHint`：一行小字 +「去配置」按钮 |
| `www/app.css` | `.cloud-hint`：玻璃配方与底栏**完全一致**（rgba .2 / blur 2px / saturate 150% / 同色描边），圆角 12、字号 12；深色模式有单独配色 |
| `www/app-init.js` | `refreshCloudHint()`：仅当 `navigator.standalone === true` 且 webdav `server/username/password` 任一为空时显示；启动后 300ms、每次点底栏 tab 各刷一次；「去配置」→ 切设置页 + 滚到 `#syncAccountCard` |
| `tools/snippets/cloud-hint-check.js` | 三态验收片段（非 PWA / PWA 未配 / PWA 已配），跑完还原配置不留副作用 |

### 实测（`e2e/inspect.js --inline`）

```json
{"nonPwa":"none","noCfg":"flex","cfg":"none"}
```

三种状态全部符合需求：Safari 标签页不显示、主屏模式未配置才显示、配好后隐藏。

### 验收对照

| 验收项 | 结果 |
|---|---|
| 1. iOS 主屏首次进入出现提示 | ✅ 逻辑实测 `noCfg=flex`（真机待确认视觉） |
| 2. 点「去配置」跳云备份设置 | ✅ 切 tab + 滚动到 `#syncAccountCard` |
| 3. 配置完成后不再出现 | ✅ 实测 `cfg=none` |
| 4. Safari 普通标签页不出现 | ✅ 实测 `nonPwa=none` |
| 5. test 356+ / e2e 全过 | ✅ 356/0、133/0（基线零差异：非 PWA 下提示条不渲染） |
| 6. ioscheck 全绿 | ✅ |

### 与需求原文的差异（有意）

- 原文要求「配好之后永远不再出现，不管有没有点过稍后」→ 本实现按配置状态判断，**配置被清空会重新出现**（这才符合"直到配好为止"的新口径）
- 未做「7 天重提」与「稍后再说」——常驻小字没有关闭概念，用户明确改成常驻
