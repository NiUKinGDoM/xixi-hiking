// XiXiの徒步小记 E2E 静态服务器（http://127.0.0.1:8123，本地 IndexedDB 需安全上下文）
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.env.E2E_ROOT ? path.resolve(process.env.E2E_ROOT) : path.resolve(__dirname, '../www');
const PORT = 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};
http.createServer(function (req, res) {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const body = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', function () {
  console.log('E2E server: http://127.0.0.1:' + PORT);
});
