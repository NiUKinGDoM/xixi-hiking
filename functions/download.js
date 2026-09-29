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
 *   - 安卓 → 302 到最新 APK 的**资产直链**（`releases/download/<tag>/<name>`，
 *           GitHub 再 302 到 release-assets CDN，最终返回
 *           `Content-Type: application/vnd.android.package-archive`
 *           + `Content-Disposition: attachment` → 浏览器直接存文件）
 *   - iOS / 桌面 → 302 到网页版（iOS 装不了 APK，别让人白下 2.5MB）
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
 */

const REPO = 'NiUKinGDoM/xixi-hiking';
const WEBAPP = 'https://xixi-hiking.pages.dev';
const FALLBACK = `https://github.com/${REPO}/releases/latest`;
const CACHE_S = 600;

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

    const url = `https://github.com/${REPO}/releases/download/${rel.tag_name}/${encodeURIComponent(asset.name)}`;
    return redirect(url, {
      'X-Download-Target': 'apk',
      'X-APK-Version': rel.tag_name,
      'X-APK-Name': asset.name,
      'X-APK-Size': String(asset.size || ''),
    });
  } catch (e) {
    // 网络 / API 异常也不能让用户点到死链
    return redirect(FALLBACK, { 'X-Download-Target': 'fallback-error' });
  }
}
