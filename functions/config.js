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
    v: 2,
    updatedAt: '2026-10-23',
    data: {
        /* ===== A 类：数值 / 开关 =====
           改这里 → push → 约 1 分钟 CDN 生效 → 客户端**下次启动**拉到。
           越界或类型写错会被客户端夹紧/回退默认值，不会把 App 弄崩。 */
        fpsDefault: false,          // 帧率显示默认值（用户手动切过则以他的为准）
        hapticDefault: true,        // 震动反馈默认值
        photoMaxSide: 1280,         // 照片压缩长边 px（480 ~ 3000）
        photoQuality: 0.7,          // JPEG 质量（0.5 ~ 0.95）—— 调小可显著缩小备份
        pageSize: 10,               // 列表每页条数（5 ~ 50）
        syncMaxFiles: 20,           // 同步索引保留条数（5 ~ 100）
        davTimeoutRead: 15000,      // WebDAV 读超时 ms（3000 ~ 180000，网页版降级路径）
        davTimeoutWrite: 60000,     // WebDAV 写超时 ms

        /* ===== B2 远程公告 =====
           ★换 id 才会再次出现；id 留空 = 完全不显示（默认不打扰）
           显示位置：概览页顶部一张玻璃卡，用户点 ✕ 后同 id 永久不再出现 */
        notice: {
            id: '',
            text: '',
            url: '',
            urlText: '查看详情'
        },

        /* ===== B3 诊断卡 =====
           true ⇒ 设置页顶部出现只读诊断卡（版本/记录数/存储/错误条数），
           排障时远程打开、让用户截图，比问「你手机上啥情况」靠谱得多 */
        debugInfo: false,

        /* ===== C 类 文案覆盖 =====
           只在「远程有值」时才覆盖，留空 = 用 App 内置文案（零风险）。
           可覆盖的 key：
             welcome.title   概览首次引导卡标题
             welcome.sub     引导卡副标题
             welcome.where   「在哪里添加」说明
             empty.records   记录列表空状态
             empty.plans     计划列表空状态
           示例：{ 'empty.records': '还没开始？点右上角「记录」写下第一座山' } */
        text: {}
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
