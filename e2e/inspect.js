#!/usr/bin/env node
/**
 * e2e/inspect.js — 常驻「浏览器实测」工具（2026-09-10 建）
 *
 * 目的：终结"每次排查都新写一个一次性 playwright 脚本"的低效循环。
 * 用法：
 *   node e2e/inspect.js --inline "return typeof showInfoMessage"
 *   node e2e/inspect.js --file tools/snippets/xxx.js [--dark] [--shot out.png] [--keep]
 *   echo "return 1+1" | node e2e/inspect.js
 * 选项：
 *   --dark          打开 App 后给 body 加 dark-mode
 *   --shot <file>   截图保存到 e2e/shots/<file>
 *   --keep          不关闭浏览器（调试用）
 *   --url <url>     指定页面地址（默认本地 127.0.0.1:8123/index.html）
 *   --no-server     不自动起本地静态服务
 *   --vw <n>        视口宽（默认 390）
 *   --vh <n>        视口高（默认 844）
 * 说明：
 *   - snippets 里写函数体（可 return 任意可 JSON 化值），在页面里以 new Function 执行
 *   - 自动上报 pageerror / console.error（排查隐藏 JS 错误用）
 *   - 自动起服务：复用 e2e/serve.js（8123）
 *   - NODE_PATH 需指向隔离 workspace（见 PROJECT_STATUS 常用命令速查）
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');

function argv(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0) {
    const v = process.argv[i + 1];
    return (v && !v.startsWith('--')) ? v : true;
  }
  return def;
}
const has = (n) => process.argv.indexOf('--' + n) >= 0;

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8123/index.html', () => { req.destroy(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  if (has('no-server')) return;
  if (await serverUp()) return;
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await serverUp()) { srv.unref(); return; }
  }
  throw new Error('本地静态服务 8123 启动失败');
}

(async () => {
  // 1) 取 snippet
  let code = argv('inline', null);
  if (!code && argv('file', null)) code = fs.readFileSync(path.resolve(argv('file')), 'utf8');
  if (!code && !process.stdin.isTTY) {
    code = await new Promise((res) => { let b = ''; process.stdin.on('data', (d) => b += d); process.stdin.on('end', () => res(b)); });
  }
  if (!code) {
    console.error('用法: node e2e/inspect.js --inline "return ..." | --file <snippet.js> | (stdin)');
    process.exit(2);
  }

  await ensureServer();

  const { chromium } = require('playwright-core');
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const ALT = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';
  const exe = fs.existsSync(EDGE) ? EDGE : ALT;

  const browser = await chromium.launch({ executablePath: exe, headless: !has('head') });
  // ★2026-10-12 --vw/--vh：多档位视口实测（窄屏适配/截断类问题必须多档验证，默认 390×844 不变）
  const VW = Number(argv('vw', 390)) || 390;
  const VH = Number(argv('vh', 844)) || 844;
  // ★2026-10-23 --ua：验证「按平台隐藏用不了的功能」（iOS Safari 没有 navigator.vibrate）。
  //   ★Playwright 没有 page.setUserAgent（那是 Puppeteer），UA 只能在 newContext 时传 ——
  //     跑到一半改不了，必须在建上下文时就定下来。
  const _ctxOpts = { viewport: { width: VW, height: VH }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true };
  if (argv('ua', null)) _ctxOpts.userAgent = String(argv('ua'));
  const ctx = await browser.newContext(_ctxOpts);
  const page = await ctx.newPage();

  // ★2026-09-10 --offline：阻断一切外部域名请求（只放行本地 127.0.0.1/localhost）
  // 用途：验证"徒步野外无信号"场景——图标字体、第三方 CDN 脚本、离线缓存是否都能扛住
  if (has('offline')) {
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(u)) return route.continue();
      return route.abort();
    });
  }

  const errs = [];
  // 噪音过滤：浏览器自动请求 /favicon.ico（index.html 未声明 icon）必 404，与本项目无关
  const NOISE = /favicon\.ico/;
  page.on('pageerror', (e) => { if (!NOISE.test(e.message)) errs.push('pageerror: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!NOISE.test(r.url())) errs.push('requestfailed: ' + r.url()); });

  const url = typeof argv('url', null) === 'string' ? argv('url') : 'http://127.0.0.1:8123/index.html';
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(Number(argv('wait', 1100)));

  if (has('dark')) {
    await page.evaluate(() => document.body.classList.add('dark-mode'));
    await page.waitForTimeout(250);
  }

  let result = null, evalErr = null;
  try {
    result = await page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(src);
      return fn();
    }, code);
  } catch (e) { evalErr = e.message; }

  if (argv('shot', null)) {
    if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
    const f = path.join(SHOTS, String(argv('shot')));
    await page.screenshot({ path: f });
    console.log('[shot] ' + f);
  }

  if (evalErr) console.log('[snippet 执行异常] ' + evalErr);
  else {
    try { console.log(JSON.stringify(result, null, 1)); }
    catch (e) { console.log(String(result)); }
  }
  if (errs.length) console.log('[页面错误 ' + errs.length + '] ' + errs.slice(0, 8).join(' ;; '));
  else console.log('[页面错误 0]');

  if (!has('keep')) await browser.close();
})().catch((e) => { console.error('INSPECT FAIL:', e.message); process.exit(1); });
