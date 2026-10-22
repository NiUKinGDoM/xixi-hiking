#!/usr/bin/env node
/**
 * e2e/offline-test.js — 离线可用性硬验证（★2026-10-22）
 *
 * 做什么：起本地静态服务器 → 首次在线访问让 SW 装完并写缓存 → **真的断网** → 重新加载
 *         → 检查页面是否还能渲染（不是白屏）。
 * 为什么：iOS 网页版「没网就白屏」的根因是 SW 预缓存整批失败（c.addAll 原子性）。
 *         仅靠肉眼/门禁测不出来，必须模拟真实断网。
 *
 * 用法：node e2e/offline-test.js
 */
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const PORT = 8321;
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(WWW, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
});

(async () => {
    const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const ALT = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';
    const exe = fs.existsSync(EDGE) ? EDGE : ALT;

    await new Promise(r => server.listen(PORT, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: exe, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await ctx.newPage();
    const url = 'http://127.0.0.1:' + PORT + '/';

    // ---- 1) 首次在线访问：等 SW 安装 + 预缓存写完 ----
    await page.goto(url, { waitUntil: 'load' });
    let swOk = false;
    try {
        await page.evaluate(() => navigator.serviceWorker.ready);
        swOk = true;
    } catch (e) { swOk = false; }
    await page.waitForTimeout(2500);   // 给 install 的逐个 add 留时间

    const cacheInfo = await page.evaluate(async () => {
        const keys = await caches.keys();
        let total = 0;
        for (const k of keys) { const c = await caches.open(k); total += (await c.keys()).length; }
        return { names: keys, entries: total };
    });

    const onlineText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 60));

    // ---- 2) 真的断网，再重新加载 ----
    await ctx.setOffline(true);
    let offlineOk = false, offlineText = '', err = '';
    try {
        await page.reload({ waitUntil: 'load', timeout: 20000 });
        offlineText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 60));
        offlineOk = offlineText.length > 20;
    } catch (e) {
        err = (e && e.message ? e.message : String(e)).slice(0, 120);
    }

    // ---- 3) 断网下关键元素是否在（不只是白页）----
    let keyElOk = false;
    try {
        keyElOk = await page.evaluate(() => !!document.getElementById('bottomTabBar') && !!document.getElementById('tab-overview'));
    } catch (e) { keyElOk = false; }

    console.log('SW 注册就绪   : ' + (swOk ? '✅' : '❌'));
    console.log('缓存键         : ' + cacheInfo.names.join(', '));
    console.log('缓存条目数     : ' + cacheInfo.entries);
    console.log('在线首屏文字   : ' + (onlineText || '(空)'));
    console.log('断网重载       : ' + (offlineOk ? '✅ 正常渲染' : '❌ 白屏/失败 ' + err));
    console.log('断网首屏文字   : ' + (offlineText || '(空)'));
    console.log('断网关键元素   : ' + (keyElOk ? '✅ 底栏+概览在' : '❌ 缺失'));

    const pass = swOk && cacheInfo.entries >= 20 && offlineOk && keyElOk;
    console.log('\n' + (pass ? '✅ 离线可用' : '❌ 离线不可用'));

    await browser.close();
    server.close();
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); server.close(); process.exit(1); });
