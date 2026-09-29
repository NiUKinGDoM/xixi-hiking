/**
 * tools/_devserver.js — 本地官网预览服务（★2026-09-29 新增）
 *
 * 为什么需要它：官网的 `/download` 是 Cloudflare Pages Function，
 * **静态文件服务器（python -m http.server）不会执行它** → 本地无法验证下载入口。
 * 这里用 node 起一个小服务：
 *   - 静态文件 → 走 site/
 *   - /download → 真实调用 functions/download.js 的 onRequest
 *     （★2026-09-29：Function 在**仓库根** functions/，不是 site/functions/ ——
 *       CF Pages 的 Functions 目录基于仓库根判定，放 site/ 下线上完全不生效）
 *
 * 用法：node tools/_devserver.js [端口，默认 8791]
 * 然后用 tools/dlcheck.js --base http://127.0.0.1:8791 验证下载链路。
 *
 * ★注意：本脚本不下载 APK —— 302 目标指向真实 GitHub，
 *   若要验证「真的下到 PK 头」，用 dlcheck.js 连线上即可。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PORT = parseInt(process.argv[2], 10) || 8791;

// ★本机（沙箱）node 的 TLS 根证书链不完整 → fetch 直接报
//   `unable to verify the first certificate`。这只是**本地调试环境**的问题，
//   Cloudflare 边缘的证书链正常，生产不受影响。
//   为了能在本地把 Function 完整跑通，这里仅在本地预演时放宽校验。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

// 把 ESM 的 Function 转成 CJS 便于 require（只改导出写法，逻辑不动）
function loadHandler() {
  // ★2026-09-29：仓库根 functions/ —— 与线上实际部署位置严格一致（放 site/ 下线上无效）
  const p = path.join(ROOT, 'functions', 'download.js');
  const code = fs.readFileSync(p, 'utf8')
    .replace(/\bexport\s+async\s+function\s+onRequest\b/, 'async function onRequest');
  const Module = require('module');
  const m = new Module(p, null);
  m.paths = Module._nodeModulePaths(path.dirname(p));
  m._compile(code + '\nmodule.exports = { onRequest: onRequest };', p);
  return m.exports.onRequest;
}

// 最小 Response 兼容层（CF Workers 的 Response 在 node 里有原生实现）
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class {
    constructor(body, init) {
      this.body = body; this.status = (init && init.status) || 200;
      this.headers = new Map(Object.entries((init && init.headers) || {}));
    }
    get(n) { return this.headers.get(n); }
  };
}

// ★CF Workers 的 `Response.headers` 是 Headers 接口（**不是** Map，也不是普通对象）
//   → 三种形态都要能摊平成 node 认识的普通对象，否则 302 的 Location 会丢
//   （实测踩到：`instanceof Map` 判断为 false 且直接透传 → 只出状态码、无头）
function toPlainHeaders(h) {
  const out = {};
  if (!h) return out;
  if (typeof h.forEach === 'function') { h.forEach((v, k) => { out[k] = v; }); return out; }   // Headers / Map
  if (typeof h.entries === 'function') { for (const [k, v] of h.entries()) out[k] = v; return out; }
  for (const k of Object.keys(h)) out[k] = h[k];
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);

  // ---- /download：交给真实 Function ----
  if (pathname === '/download' || pathname === '/download/') {
    try {
      const onRequest = loadHandler();
      // ★CF Workers 的 request 有 `headers.get(name)` 接口，而 node 的 IncomingMessage
      //   只有普通对象 headers → 这里补一层适配，否则 Function 里 `req.headers.get` 会报错
      const hdrs = req.headers || {};
      const shimReq = {
        url: req.url,
        method: req.method,
        headers: { get: (n) => hdrs[String(n).toLowerCase()] || null },
      };
      const out = await onRequest({ request: shimReq, env: {}, params: {} });
      const headers = toPlainHeaders(out.headers);
      res.writeHead(out.status || 200, headers);
      res.end();
      console.log('  /download → ' + out.status + '  ' + (headers.Location || ''));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Function error: ' + e.message);
      console.log('  /download → 500  ' + e.message);
    }
    return;
  }

  // ---- 静态文件 ----
  let file = path.join(SITE, pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(SITE, 'index.html');   // CF Pages 软 404 行为
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('官网本地预览: http://127.0.0.1:' + PORT);
  console.log('  静态目录: ' + SITE);
  console.log('  /download: 由 functions/download.js 真实处理（仓库根）');
  console.log('  验证下载链路: node tools/dlcheck.js --base http://127.0.0.1:' + PORT);
});
