# 🏔️ XiXiの徒步小记

一款由 **XiXi** 亲手制作的徒步日记软件：记录每一次徒步与登山的足迹、照片与感想，统计里程难度，规划下一次出发。

**Made by XiXi 💛**

---

## 🌐 在线体验

**网页版**（iOS / 桌面浏览器直接可用，推荐"添加到主屏幕"当 App 用）：

👉 **https://xixi-hiking.pages.dev**

- Cloudflare Pages 全球 CDN，域名长期稳定
- 数据存在你自己的浏览器本地，不上传任何第三方
- Android 请下载 APK（见下方 Release）

## ✨ 功能一览

| 板块 | 能力 |
|---|---|
| 📊&nbsp;概览 | 统计主卡（次数/里程/用时/最高海拔）+ 年资 + 年度足迹热力图 + 年度回顾（含"和去年比"） |
| 📝&nbsp;记录 | 增删改、难度 1-5、小日记、心情/天气、照片（最多 24 张/条）、按年份分组、列表/山册双视图、点行弹窗阅读与编辑 |
| 📷&nbsp;照片 | 本地压缩存储（IndexedDB）、详情横滑照片墙、全屏灯箱缩放/保存 |
| 📅&nbsp;计划 | 列表/日历双视图、三态徽章（过期/今天/明天）、完成自动转记录+庆祝、每天 08:00 通知提醒 |
| 🔍&nbsp;搜索 | 山名 + 小日记 + 心情/天气/同行人全文搜索，计划日历定位 |
| 🖼️&nbsp;分享 | 一键生成分享卡（海拔/难度/心情/天气/同行人） |
| ⚙️&nbsp;设置 | 完整备份 zip / 纯数据备份 / WebDAV 坚果云同步（自动保留 2 份）/ 导出诊断 / 检查更新（内置离线更新日志）/ 深色模式 / 震动开关 / 照片占用优化 / 抹掉足迹 |
| 🛡️&nbsp;安全 | 安装包签名自校验（防重打包）+ 打包代码混淆 + 资源完整性校验 + 系统备份关闭（v1.1.10.8 起） |

## 🔒 隐私承诺

- 记录与照片**只存本机**（网页版存浏览器本地），无账号、无统计、无广告
- 唯一可选的联网：你主动配置的 **坚果云 WebDAV**（数据同步到你自己的账号）+ 「检查更新」查版本
- 完整说明见 App 内「设置 → 关于应用 → 隐私政策」

## 📱 下载 Android 版

GitHub Releases 获取最新 APK：https://github.com/NiUKinGDoM/xixi-hiking/releases

（App 内置"检查更新"，装好后可直接在应用内升级，支持直装免重下）

## 🔧 技术概览

- **Capacitor 6**（Android WebView）+ 原生桥（WebDAV OkHttp / 文件 / 震动 / 通知）
- 前端：`www/index.html` + 4 个外部 JS（core 工具 / data 数据 / sync 同步 / init 启动）+ sw.js 离线缓存
- 存储：localStorage（记录/计划/设置）+ IndexedDB（照片）；最低 Android 7，targetSdk 36
- 发布：GitHub Release 分发 APK + Cloudflare Pages 自动发布网页版（push 即部署）

## 🧑‍💻 开发者入口

> 完整交接手册（版本规则/发布流程/踩坑经验）见 **`docs/PROJECT_STATUS.md`**；演进史见 **CHANGELOG.md**；历史变更与决策见 `.workbuddy/memory/` 日志

```bash
# 快速自检三连（改完代码必跑）
node test.js          # 语法/数据层/结构/版本 断言
node test-ui.js       # jsdom UI 渲染
node _test_p0p3.js    # 集成链路（发布前必跑）

# 发版（详见交接手册，勿跳步）
node prev-snapshot.js && node bump.js   # 回滚点 + 版本递增
node tools/security.js obf <assets> <assets> && node tools/security.js hash <assets>  # 安全两步
```

版本号规则：`vc → 1.x.x.x`，每段 0~10 满十进位，用 `node bump.js` 一键同步（勿手改）；已发布版本号不可复用。

> 🛡️ **正版提示**：请从上方 Release 下载并覆盖安装，勿安装来路不明的安装包（App 内置签名校验，非官方包会被拦截）。所有正式版使用同一签名，覆盖安装不会丢数据。
---

**Made by XiXi 💛**
