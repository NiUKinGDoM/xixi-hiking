/**
 * functions/download.js — 官网下载入口（Cloudflare Pages Function）
 *
 * ★位置铁律（2026-09-29 踩坑）：CF Pages 的 Functions 目录**基于仓库根判定**，
 *   不是构建输出目录。Root=site 时，`site/functions/` 里的文件**线上完全不生效**
 *   （`/download` 会静默返回首页 HTML 软 404，连 404 状态码都没有）。
 *   三条实证证据：① `/download` 与任意不存在路径返回逐字节相同的首页
 *   ② 线上 `/_routes.json` 不存在（CF 只要检测到仓库根 functions/ 就自动生成）
 *   ③ 官方文档：目录结构决定路由，基于仓库根。
 *   ⇒ 本文件必须放在**仓库根** `functions/download.js`。改动时别挪位置。
 *
 * 作用：官网上的「下载」不跳 GitHub 网页，点击后**直接开始下载 APK**。
 *
 * 路由：/download（CF Pages 会自动把 functions/download.js 挂到该路径）
 *
 * 分流规则（按 User-Agent）：
 *   - 安卓 → 302 到最新 APK 的**镜像直链**（见下方「镜像优先」）
 *   - iOS / 桌面 → 302 到网页版（iOS 装不了 APK，别让人白下 2.5MB）
 *
 * ★★ 2026-09-29 改版：镜像优先（用户反馈「一直跳 github，门槛太高」）
 *   原实现：安卓 → 302 到 `github.com/.../releases/download/...`
 *     → 国内访问 github.com 常被墙 / 极慢，用户看到 GitHub 页面就卡住了。
 *   现实现：安卓 → **边缘侧先探测镜像可用性**，命中即 302 到镜像直链；
 *     全部镜像不可用才退回 GitHub 官方直链。
 *   ★镜像顺序：与 App 内 `www/app-core.js` 的 `UPDATE_MIRRORS` **保持同一份实测排序**
 *     （2026-09-29 实测，各源 3 次字节数 + sha256 完全一致）：gh-proxy.com 最快，
 *     gh.xmly.dev 备用。两端改源必须同步改，否则用户在不同入口体验不一致。
 *   ★探测策略：对镜像发 `Range: bytes=0-0` 的 GET（比 HEAD 更可信，部分镜像不支持 HEAD）
 *     + `AbortSignal.timeout(4000)`；只看「响应 ok」不自作聪明判长度，
 *     因为 302/200 与否各镜像实现不一，**只要不是明确失败就认为可用**
 *     （真正的完整性由浏览器侧 Content-Length / 安装时签名校验兜底）。
 *   ★为什么不把镜像写死在 HTML 里：官网文案/按钮由 CF Pages 静态托管，
 *     写死会在换源时留下死角；集中在 Function 里改一处即可。
 *
 * ★为什么不写「releases/latest/download/XiXi-hiking.apk」这种固定名：
 *   本仓库历史上的资产名有 4 种写法（`XiXi.-v…` / `xixi-hiking-v…` / `XiXiHiking-v…` /
 *   `XiXi-hiking-v…`），早期还有 GitHub 把中文「小记」替换成 `.` 的情况 →
 *   **固定文件名不成立**。所以这里查 API 拿「当前 latest 这个 Release 里 apk 资产的真实名字」，
 *   再拼直链。这样以后改命名规则也不用动这个文件。
 *
 * ★为什么不用 `/releases` 列表取第一条：该接口的返回顺序**不是**按版本号排序的
 *   （实测 v1.2.2.9 排在 v1.2.2.10 之前）→ 必须用 `/releases/latest`。
 *
 * 缓存：边缘缓存 10 分钟（`s-maxage=600`），避免每次点击都打 GitHub API
 *       （未鉴权限额 60 次/小时/IP）。发版后最多 10 分钟内自动切到新包。
 *
 * ★绝不返回死链（三层兜底，全部 302 到 Release 页面）：
 *   fallback-api（API 请求失败）/ fallback-no-apk（Release 里没有 apk 资产）
 *   / fallback-error（网络异常）
 */

const REPO = 'NiUKinGDoM/xixi-hiking';
const WEBAPP = 'https://xixi-hiking.pages.dev';
const FALLBACK = `https://github.com/${REPO}/releases/latest`;
const CACHE_S = 600;

// ★★ 镜像前缀（必须与 www/app-core.js 的 UPDATE_MIRRORS 逐项一致、同序）
//   格式：<前缀><github 原始路径>，例如
//   https://gh-proxy.com/https://github.com/NiUKinGDoM/xixi-hiking/releases/download/v1.0.0/x.apk
const MIRRORS = [
  'https://gh-proxy.com/',
  'https://gh.xmly.dev/',
];
const PROBE_TIMEOUT_MS = 4000;

function isAndroid(ua) {
  return /android/i.test(ua);
}
function isIOS(ua) {
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/.test(ua) && /mobile/.test(ua));
}

function redirect(url, extra) {
  return new Response(null, {
    status: 302,
    headers: Object.assign({
      Location: url,
      'Cache-Control': `public, max-age=0, s-maxage=${CACHE_S}`,
      'X-Download-Gateway': 'xixi-hiking',
    }, extra || {}),
  });
}

/**
 * 探测单个镜像是否可用。只发 1 字节 Range，取得任何非 5xx 响应即视为可用。
 * 任何异常（超时 / DNS / TLS / 被断）都返回 false —— 探测失败绝不抛错。
 */
async function mirrorAlive(prefix, ghPath) {
  const url = prefix + ghPath;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        // 只要首字节，省流量也省时间；镜像会 302 到 release-assets CDN
        'Range': 'bytes=0-0',
        'User-Agent': 'xixi-hiking-site',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // ★不做「Content-Length 必须 > 0」这类严格判断：部分镜像回 302 后再由
    //   CDN 定长度，边缘 fetch 拿到的体量不一定规整。5xx / 4xx 视为坏源。
    return r.ok || (r.status >= 200 && r.status < 400);
  } catch (e) {
    return false;
  }
}

export async function onRequest(context) {
  const req = context.request;
  const ua = req.headers.get('User-Agent') || '';

  // 1) 非安卓 → 网页版（iPhone / iPad / 桌面都走这里）
  if (!isAndroid(ua)) {
    return redirect(WEBAPP, { 'X-Download-Target': 'webapp' });
  }

  // 2) 安卓 → 解析最新 APK 直链
  try {
    const api = `https://api.github.com/repos/${REPO}/releases/latest`;
    const r = await fetch(api, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'xixi-hiking-site',
      },
      cf: { cacheTtl: CACHE_S, cacheEverything: true },
    });
    if (!r.ok) return redirect(FALLBACK, { 'X-Download-Target': 'fallback-api' });

    const rel = await r.json();
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    // 优先取 .apk 资产；若没有则退回 Release 页面（绝不给出坏链接）
    let asset = assets.find((a) => /\.apk$/i.test(a.name || ''));
    if (!asset) asset = assets.find((a) => /apk/i.test(a.name || ''));
    if (!asset) return redirect(FALLBACK, { 'X-Download-Target': 'fallback-no-apk' });

    // GitHub 上的真实资产路径（镜像与官方共用同一段）
    const ghPath = `https://github.com/${REPO}/releases/download/${rel.tag_name}/${encodeURIComponent(asset.name)}`;

    // ★3) 镜像优先：按实测速度顺序逐个探测，命中即用
    //   使用 Promise 串行（而非并行 Promise.any）——目的是「优先用最快的源」，
    //   最快的源排在数组首位，串行探测时先命中的天然就是最优解，
    //   同时避免并发探测造成 4 个镜像被无谓地各挨一次请求。
    for (const prefix of MIRRORS) {
      if (await mirrorAlive(prefix, ghPath)) {
        return redirect(prefix + ghPath, {
          'X-Download-Target': 'mirror:' + new URL(prefix).hostname,
          'X-APK-Version': rel.tag_name,
          'X-APK-Name': asset.name,
          'X-APK-Size': String(asset.size || ''),
        });
      }
    }

    // 4) 镜像全灭 → GitHub 官方直链（保持老行为，至少不是死链）
    return redirect(ghPath, {
      'X-Download-Target': 'github',
      'X-APK-Version': rel.tag_name,
      'X-APK-Name': asset.name,
      'X-APK-Size': String(asset.size || ''),
    });
  } catch (e) {
    // 网络 / API 异常也不能让用户点到死链
    return redirect(FALLBACK, { 'X-Download-Target': 'fallback-error' });
  }
}
