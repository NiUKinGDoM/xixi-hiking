/**
 * functions/config.js — 远程配置端点（Cloudflare Pages Function）
 *
 * 路由：/config
 * ★位置铁律同 download.js：Functions 目录基于**仓库根**判定（不是 Root=site 里的 site/functions/），
 *   本文件必须在仓库根 `functions/config.js`，别挪位置。
 *
 * 用途：让 App / 网页版**不升号、不重新打包**就能调「开关 / 文案 / 数值」。
 *   改这里 → push → CF Pages 约 1 分钟自动部署 → 客户端下次启动拉到新值。
 *
 * ★能力边界（很重要）：只能覆盖客户端代码里**已经读的 key**（目前是 fpsDefault）。
 *   没有对应代码的 key 会被忽略 —— 它不能新增功能，也不能改逻辑。
 * ★安全：内容完全公开、无任何敏感信息；客户端只当「配置值」用，**不会执行**其中任何代码。
 * ★必须带 CORS：App 内 WebView 的源是 capacitor://localhost / file://，
 *   请求 xixi-hiking.pages.dev 属跨域，无 ACAO 头会被浏览器直接拦掉。
 * ★缓存 60s：避免客户端每次启动都打到边缘，又不至于改了半小时看不到。
 */

const CONFIG = {
    v: 1,
    updatedAt: '2026-10-22',
    data: {
        // 帧率显示默认值（用户手动开/关过，则以用户选择为准；详见 app-init.js 三层优先级）
        fpsDefault: false
    }
};

// ★2026-10-22 用通用 onRequest（与 download.js 同款）—— 分方法导出 onRequestGet/onRequestOptions
//   在本项目实测未命中路由（/config 落到静态资源，返回首页 HTML 软 404、OPTIONS 405）。
const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400'
};

export async function onRequest(context) {
    const method = (context.request && context.request.method) || 'GET';
    if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }
    return new Response(JSON.stringify(CONFIG), {
        headers: Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=60'
        }, CORS)
    });
}
