# 下载统计：一次性配置步骤（Cloudflare）

> 代码已经写好了（`functions/download.js`），**但没绑定数据集时它会静默空转**——
> 所以你只需要在 Cloudflare 控制台做一次绑定，数据就开始记了。整个操作约 3 分钟。

## 一、这套统计能回答什么

| 你想知道 | 能不能答 | 说明 |
|---|---|---|
| **有多少独立访客点了下载**（同一 IP 只算一次） | ✅ 能 | 这是我们专门做的去重统计 |
| 下载总次数（含重复点） | ✅ 能 | 同数据集里一起记着 |
| 哪个版本被下得多 | ✅ 能 | 每条记录带版本号 |
| 谁点的（安卓 / iPhone 被引导到网页版 / 桌面） | ✅ 能 | 每条记录带类型 |
| 镜像下载 vs 直连 GitHub | ✅ 能 | 用来判断镜像健不健康 |
| 下载失败（镜像全灭 / API 异常） | ✅ 能 | 用来发现故障 |
| 用户姓名、手机号等个人信息 | ❌ **不收集** | 只存 IP 的**不可逆哈希前缀**，仅用于去重 |

**与 GitHub 下载数的区别**：GitHub 的 `download_count` 是"文件被下载了几次"（**含重复、机器人、我发版时的回验，无法去重**）；这里统计的是"**多少个不同的人点了下载**"。两个数配合看：GitHub 看总量，这里看人数。

---

## 二、配置三步

### 步骤 1：创建一个 Analytics Engine 数据集

1. 打开 <https://dash.cloudflare.com/> → 左侧选 **Workers & Pages**
2. 左侧菜单找到 **Analytics Engine**（在 Workers & Pages 分组下）
3. 点 **Create dataset** / **创建数据集**
4. 名称填：**`xixi_hiking_dl`**（要和下面的 SQL 对上，别改）
5. 保存

### 步骤 2：给 Pages 项目绑定这个数据集

1. **Workers & Pages** → 点开你的官网项目 **`xixi-hiking-site`**
2. 进 **设置 / Settings** → **Functions**（或 **Bindings / 绑定**）
3. 找到 **Analytics Engine bindings** → **Add / 添加**
4. 填写：
   - **Variable name（变量名）**：**`DL_ANALYTICS`** ← ★必须一字不差
   - **Dataset**：选步骤 1 建的 **`xixi_hiking_dl`**
5. 保存

> ⚠️ 变量名写错 = 代码认不出来 = 继续空转（但**绝不会影响下载**，这是设计好的容错）。

### 步骤 3：重新部署一次

绑定生效需要新一次部署：

**Workers & Pages → 你的项目 → Deployments → 找到最新一条 → Retry deployment**
（或随便改个文件 push 一下也行）

部署完成后，再有人点下载，数据就开始进来了。

---

## 三、怎么看数据

**Analytics Engine → 选中 `xixi_hiking_dl` → 打开 SQL 查询框**，粘贴下面的语句：

> ⚠️ **别名必须用英文**：Cloudflare 的 SQL 解析器**不认中文标识符** —— 写 `AS 人数` 会直接报
> `sql parser error: Expected an identifier after AS, found: 人`。下面所有语句都用英文别名，
> 每列是什么含义写在语句下方的说明里。

### ① 核心问题：有多少独立访客下载了（同一 IP 不算）

```sql
SELECT count(DISTINCT index1) AS people
FROM xixi_hiking_dl
WHERE blob1 = 'apk'
```

> `people` = **独立下载人数**（同一 IP 只算一次）。

### ② 顺便看总次数（同一人多点几次会累加）

```sql
SELECT count() AS hits, count(DISTINCT index1) AS people
FROM xixi_hiking_dl
WHERE blob1 = 'apk'
```

> `hits` = 下载总次数（同一人点几次算几次）；`people` = 去重后的人数。

### ③ 按版本看

```sql
SELECT blob2 AS ver, count(DISTINCT index1) AS people, count() AS hits
FROM xixi_hiking_dl
WHERE blob1 = 'apk'
GROUP BY ver
ORDER BY hits DESC
```

> `ver` = 版本号（如 `v1.2.4.0`）。

### ④ 类型与机型分布（含 iPhone 被引导到网页版的人数）

```sql
SELECT blob3 AS kind, count(DISTINCT index1) AS people
FROM xixi_hiking_dl
GROUP BY kind
ORDER BY people DESC
```

> `kind` = 类型：`android-mirror` / `android-github` / `ios` / `desktop` / 各类 fallback。

### ⑤ ★官网哪个位置点的下载最多

```sql
SELECT blob4 AS entry, count(DISTINCT index1) AS people, count() AS hits
FROM xixi_hiking_dl
WHERE blob1 = 'apk'
GROUP BY entry
ORDER BY people DESC
```

> 入口取值：`nav` = 顶部导航栏的「下载」；`menu` = 手机端展开菜单里的「下载」；
> `store` = 页面底部那个大按钮「下载 Android 版」；`direct` = 直接访问 `/download`
> （别人分享的链接、或从 App 内跳转）；`other` = 带了自己拼的参数。
> 三个按钮分别在官网首页与「功能详情」页各有一个，同一取值会合并统计（看的是"哪种位置更有效"）。

### ⑥ 最近 7 天的每日独立下载人数

```sql
SELECT toDate(timestamp) AS day, count(DISTINCT index1) AS people
FROM xixi_hiking_dl
WHERE blob1 = 'apk' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY day
ORDER BY day
```

> `day` = 日期。

> **若还报错**：① 说 `count(DISTINCT ...)` 不支持 → 换成 **`uniq(index1)`**（近似去重）
> 或 **`uniqExact(index1)`**（精确去重）；② 说 `表不存在` → 数据集名不是 `xixi_hiking_dl`；
> ③ 查出来 0 行 → 大概率是**绑定后没重新部署**（见第二节步骤 3）。

**字段对照表**（对应代码里写的内容）：

| 字段 | 含义 | 取值 |
|---|---|---|
| `index1` | 去重键（IP+UA 的哈希前缀） | 24 位 hex，或 `anon` |
| `blob1` | 目标 | `apk` / `webapp` / `fallback` |
| `blob2` | 版本 | 如 `v1.2.4.0` |
| `blob3` | 类型 | `android-mirror` / `android-github` / `ios` / `desktop` / `api-fail` / `no-apk` / `error` |
| `blob4` | 下载入口 | `nav` 顶部导航栏 / `menu` 手机菜单 / `store` 页面底部大按钮 / `direct` 直接访问 / `other` 非白名单参数 / `unknown` |
| `double1` | 计数 | 恒为 1 |
| `double2` | APK 字节数 | 如 2529520 |
| `timestamp` | 时间 | CF 自动写入 |

---

## 四、隐私与数据

- **只存 IP 的哈希前 12 字节**（`SHA-256(盐 + IP + UA前缀)` 的前 24 位十六进制），**不可逆、无法还原出 IP**，唯一用途是"同一人只算一次"。
- 数据存在 **Cloudflare** 侧（我们**没有自己的服务器**），保留期为 CF 的默认策略（分析数据保留期见 CF 控制台）。
- 想清空：**Analytics Engine → 删除数据集** 即可，之后可重建。
- 官网已提供**独立的隐私说明页**：<https://xixi-hiking-site.pages.dev/site-privacy.html>
  —— 只讲官网与下载统计，与 App 的《隐私政策》分开，**不影响 App 政策版本号、不需要用户重新同意**。
- **官网页面不加任何第三方统计脚本**，所以官网的"访问人数"看不到；要看那个请另外启用
  **Web Analytics**（免费、无 cookie）：Pages 项目 → **Metrics / Web Analytics → Enable**。
  注意它给的是"访问官网的独立访客"，不是"点了下载的人"——**两者都不含任何个人信息**。

---

## 五、故障排查

| 现象 | 原因 |
|---|---|
| 绑定后查询报"表不存在" | 数据集名不是 `xixi_hiking_dl` |
| 有绑定但一直是 0 条 | 变量名不是 `DL_ANALYTICS`；或没重新部署；或没人点过下载 |
| 只看到 `blob1='webapp'` | 说明来的都是 iPhone/桌面（他们本来就不该下 APK） |
| 数据里有 `index1='anon'` | 极少数环境拿不到哈希，已降级为匿名，不影响统计趋势 |

---

## 六、（可选）配一个只读 Token，让我代查

配好之后，你只要说一句「**查下载人数**」，我就直接报数（GitHub 累计 + CF 去重人数 + 入口分布），不用你自己开控制台跑 SQL。

### 第 1 步：创建一个只读 API Token

1. 打开 <https://dash.cloudflare.com/profile/api-tokens>
2. 点 **Create Token** → 找到 **Create Custom Token** → 点 **Get started**
3. **Token name** 随便填，例如 `xixi-dlstat-readonly`
4. **Permissions**（一格三下拉）：选 **`Account`** → **`Account Analytics`** → **`Read`**
   （若下拉里还能找到 `Workers Analytics Engine` 的 `Read`，一并勾上更保险）
5. **Account Resources**：选 `Include` → 选中你的账户名
6. 点 **Continue to summary** → **Create Token** → **复制那串 token**
   > ⚠️ **token 只显示这一次**，关掉就再也看不到（丢了只能删掉重建）
7. （可选）TTL 可以设个过期时间（如 1 年），到期重配更安全

### 第 2 步：拿到 Account ID

任选一种，都很快：

- **看网址**：浏览器地址栏 `dash.cloudflare.com/` **后面那一串 32 位字符**就是它
- **看右侧栏**：任意页面（比如 Workers & Pages）右边栏有 **Account ID**，点一下可复制

### 第 3 步：把这两样发我

直接在对话里贴 **token** + **Account ID** 就行。

> 🔒 **安全说明（请过一眼）**：
> - 这个 token 是**只读**的 —— 只能读分析数据，**改不了**你的任何配置、代码或数据
> - 我会把它存进 **Windows 凭据管理器**（和 GitHub token 同一个地方），
>   **绝不写进代码、绝不进 Git 仓库**
> - 你随时可以回到那个页面点 **Delete**，token 立刻失效

### 第 4 步：配好之后

以后你说「查下载人数」，我直接给：

- **GitHub 累计下载次数**（含历史全量）
- **CF 去重独立下载人数**（同一 IP 只算一次）
- **入口分布**（导航栏 / 手机菜单 / 底部按钮哪个点得多）
- **版本分布**、**iOS/桌面占比**、**失败兜底次数**
