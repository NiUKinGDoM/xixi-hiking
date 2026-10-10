#!/usr/bin/env node
/**
 * tools/siteaudit.js —— 线上站点体检（一条命令跑完全部）
 *
 * 为什么需要它（2026-10-10 新增）：
 *   线上漂移是**静默**的。2026-10-10 发现官网 privacy.html / terms.html 比 App 内
 *   旧了 17 天（少一条、日期停在 09-23），期间没有任何机制会告诉你。
 *   而查这些以前要临时现写 python/node 脚本、逐项手工看，每次 20+ 分钟。
 *   本工具把「查线上」固化成一条命令，收尾/定期/怀疑线上有问题时直接跑。
 *
 * 检查项：
 *   A 官网页面可访问性 + 关键内容（index / features / privacy / terms / robots.txt / sitemap.xml）
 *   B App 网页版资源 + 版本指纹（APP_VERSION / CACHE_NAME / 窄屏适配串）
 *   C 下载链路按 UA 分流（Android → APK；iPhone / 桌面 → 网页版）
 *   D 官网页内链死链扫描
 *   E ★线上政策 == App 内（条款数 / 生效日期 == LEGAL_VERSION / 5 个要素串）
 *   F ★远端 GitHub raw == 本地（关键文件，行尾归一化后比 sha256）
 *
 * 用法：
 *   node tools/siteaudit.js              # 全跑（约 40~70s，视网络）
 *   node tools/siteaudit.js --quick      # 只跑 A+B+C（最快）
 *   node tools/siteaudit.js --no-remote  # 跳过 F（GitHub raw 较慢）
 *   node tools/siteaudit.js --json       # 机器可读输出
 * 退出码：0 全过 / 1 有失败（可直接当门禁；结果行含「N 通过 / M 失败」供 checkall 解析）
 *
 * ★实现约束：**不 spawn 任何子进程** —— 本机 spawn 集体 EBUSY（见 memory MEMORY.md「环境」段）。
 *   纯 https + fs 实现，因此在 EBUSY 环境下依然可用。
 * ★沙箱 SSL：本机根证书不被信任 → rejectUnauthorized:false（仅用于本机自检，不影响用户环境）。
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const SITE = 'https://xixi-hiking-site.pages.dev';
const APPWEB = 'https://xixi-hiking.pages.dev';
const RAW = 'https://raw.githubusercontent.com/NiUKinGDoM/xixi-hiking/master/';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-S9010) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const has = (n) => process.argv.indexOf('--' + n) >= 0;
const QUICK = has('quick');
const NO_REMOTE = has('no-remote');
const JSON_OUT = has('json');

let pass = 0, fail = 0;
const fails = [];
const groupTitle = (s) => { if (!JSON_OUT) console.log('\n' + s); };
function ok(name, extra) {
  pass++;
  if (!JSON_OUT) console.log('  ✅ ' + name + (extra ? '  ' + extra : ''));
}
function bad(name, extra) {
  fail++;
  fails.push(name + (extra ? ' | ' + extra : ''));
  if (!JSON_OUT) console.log('  ❌ ' + name + (extra ? '  ' + extra : ''));
}
function chk(name, cond, extra) { cond ? ok(name, extra) : bad(name, extra); }

// ---------- HTTP（跟随重定向 + 重试；不 spawn） ----------
function request(url, { ua = UA_DESKTOP, timeout = 30000, redirects = 0 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ err: 'bad url' }); }
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.get({
      hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      headers: { 'User-Agent': ua, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' },
      rejectUnauthorized: false,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).toString(); } catch (e) { next = null; }
        if (!next) return resolve({ status: res.statusCode, headers: res.headers, body: Buffer.alloc(0), finalUrl: url });
        return resolve(request(next, { ua, timeout, redirects: redirects + 1 }));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks), finalUrl: url,
      }));
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ err: 'timeout' }); });
    req.on('error', (e) => resolve({ err: e.message }));
  });
}

async function get(url, opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await request(url, opts);
    if (!r.err) return r;
    if (i === tries - 1) return r;
    await new Promise((s) => setTimeout(s, 1200));
  }
}

const txt = (r) => (r && r.body ? r.body.toString('utf8') : '');
const norm = (b) => Buffer.from(b.toString('binary').replace(/\r\n/g, '\n'), 'binary');

// ---------- 本地事实源 ----------
function localSrc(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; }
}
const APP_DATA = localSrc('www/app-data.js');
const APP_CORE = localSrc('www/app-core.js');
const LEGAL_V = (APP_DATA.match(/const LEGAL_VERSION = '([^']+)'/) || [])[1] || '';
const APP_VER = (APP_CORE.match(/APP_VERSION = '([\d.]+)'/) || [])[1] || '';
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];

// ═══════════════════════════════════════════════════════
async function main() {
  if (!JSON_OUT) console.log('== siteaudit ==  线上站点体检');
  if (!JSON_OUT) console.log('   本地事实源：LEGAL_VERSION=' + LEGAL_V + '  APP_VERSION=' + APP_VER);

  // ── A 官网页面 ──────────────────────────────────────
  groupTitle('【A】官网页面可访问性');
  const PAGES = [
    { p: '/', key: ['<title>', '徒步小记'] },
    { p: '/features.html', key: ['更新日志'] },
    { p: '/privacy.html', key: [] },
    { p: '/terms.html', key: [] },
    { p: '/robots.txt', key: ['Sitemap:'], ct: 'text/plain' },
    { p: '/sitemap.xml', key: ['<urlset'], ct: 'xml' },
  ];
  const htmls = {};
  for (const pg of PAGES) {
    const r = await get(SITE + pg.p);
    const label = 'GET ' + pg.p;
    if (r.err) { bad(label, r.err); continue; }
    const ct = String(r.headers['content-type'] || '');
    const t = txt(r);
    if (r.status !== 200) { bad(label, 'HTTP ' + r.status); continue; }
    const miss = pg.key.filter((k) => t.indexOf(k) < 0);
    if (miss.length) { bad(label, '缺关键字 ' + JSON.stringify(miss)); continue; }
    if (pg.ct && ct.indexOf(pg.ct) < 0) { bad(label, 'Content-Type=' + ct + ' 期望含 ' + pg.ct); continue; }
    ok(label, r.body.length + 'B  ' + ct.split(';')[0]);
    if (pg.p.endsWith('.html') || pg.p === '/') htmls[pg.p] = t;
  }

  // ── B App 网页版 ────────────────────────────────────
  groupTitle('【B】App 网页版资源与版本指纹');
  const APP_ASSETS = ['/index.html', '/sw.js', '/app-core.js', '/app-data.js', '/app-sync.js', '/app-init.js', '/manifest.json'];
  let appIdx = '';
  for (const a of APP_ASSETS) {
    const r = await get(APPWEB + a);
    if (r.err) { bad('GET ' + a, r.err); continue; }
    if (r.status !== 200) { bad('GET ' + a, 'HTTP ' + r.status); continue; }
    ok('GET ' + a, r.body.length + 'B');
    if (a === '/index.html') appIdx = txt(r);
  }
  {
    const r = await get(APPWEB + '/app-core.js');
    const v = (txt(r).match(/APP_VERSION = '([\d.]+)'/) || [])[1];
    chk('App 网页版 APP_VERSION == 本地 ' + APP_VER, v === APP_VER, '线上=' + (v || '?'));
  }
  {
    const r = await get(APPWEB + '/sw.js');
    const c = (txt(r).match(/CACHE_NAME = '([^']+)'/) || [])[1];
    const lc = (localSrc('www/sw.js').match(/CACHE_NAME = '([^']+)'/) || [])[1];
    chk('App 网页版 sw 缓存 == 本地 ' + lc, c === lc, '线上=' + (c || '?'));
  }

  // ── C 下载链路 ──────────────────────────────────────
  groupTitle('【C】下载链路按 UA 分流');
  {
    const r = await get(SITE + '/download', { ua: UA_ANDROID });
    const isApk = r.body && r.body.length > 2 && r.body[0] === 0x50 && r.body[1] === 0x4B; // "PK"
    chk('Android UA → 拿到 APK（PK 头）', r.status === 200 && isApk,
      'status=' + r.status + ' head=' + JSON.stringify(r.body ? r.body.slice(0, 2).toString() : '') + ' ' + (r.body ? r.body.length : 0) + 'B');
  }
  for (const [nm, ua] of [['iPhone', UA_IPHONE], ['桌面', UA_DESKTOP]]) {
    const r = await get(SITE + '/download', { ua });
    const t = txt(r);
    chk(nm + ' UA → 网页版（不给 APK）',
      r.status === 200 && t.indexOf('徒步') >= 0 && t.indexOf('<html') >= 0,
      'status=' + r.status + ' ' + (r.body ? r.body.length : 0) + 'B');
  }

  // ── D 内链死链 ──────────────────────────────────────
  groupTitle('【D】官网页内链死链扫描');
  {
    const links = new Set();
    for (const k of Object.keys(htmls)) {
      const t = htmls[k];
      for (const m of t.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/g)) {
        const u = m[1].trim();
        if (/^(#|mailto:|javascript:|data:)/.test(u)) continue;
        if (!/^https?:/i.test(u)) links.add(u);
      }
    }
    const arr = [...links];
    const dead = [];
    for (const l of arr) {
      const full = new URL(l, SITE + '/').toString();
      const r = await get(full, {}, 2);
      if (r.err || r.status !== 200) dead.push(l + '(' + (r.err || r.status) + ')');
    }
    chk('内链 ' + arr.length + ' 个全部可达', dead.length === 0, dead.slice(0, 5).join(', '));
  }

  // ── E 线上政策 == App 内 ────────────────────────────
  groupTitle('【E】线上政策 == App 内（LEGAL_VERSION=' + LEGAL_V + '）');
  {
    const priv = htmls['/privacy.html'] !== undefined ? htmls['/privacy.html'] : txt(await get(SITE + '/privacy.html'));
    const terms = htmls['/terms.html'] !== undefined ? htmls['/terms.html'] : txt(await get(SITE + '/terms.html'));
    for (const [nm, t] of [['privacy.html', priv], ['terms.html', terms]]) {
      if (!t) { bad(nm + ' 抓取失败'); continue; }
      const nums = (t.match(/<h2>[一二三四五六七八九十]+、/g) || []).map((s) => s.replace(/<h2>|、/g, ''));
      chk(nm + ' 条款编号连续到「十一」', nums.join(',') === CN_NUM.join(','), '实际 ' + nums.length + ' 条');
      chk(nm + ' 生效日期 == ' + LEGAL_V, t.indexOf('生效日期：' + LEGAL_V) >= 0);
    }
    const ELEMS = [
      ['privacy', priv, '个人信息处理者'],
      ['privacy', priv, 'GitHub 的服务器位于中国境外'],
      ['privacy', priv, '个人信息安全事件的通知'],
      ['terms', terms, '本应用不具备定位与求救功能'],
      ['terms', terms, '官方渠道与内容来源'],
    ];
    const missE = ELEMS.filter(([, t, k]) => t.indexOf(k) < 0).map(([p, , k]) => p + ':' + k);
    chk('5 个关键要素串齐全（10-09 政策新增项）', missE.length === 0, missE.join(', '));
    const oldDates = [];
    for (const [nm, t] of [['privacy', priv], ['terms', terms]]) {
      if (/2026-09-23/.test(t)) oldDates.push(nm);
    }
    chk('无旧版日期残留（2026-09-23）', oldDates.length === 0, oldDates.join(', '));
  }

  // ── F 远端 raw == 本地 ──────────────────────────────
  if (!NO_REMOTE && !QUICK) {
    groupTitle('【F】远端 GitHub raw == 本地');
    const FILES = [
      'README.md', 'CHANGELOG.md', 'test.js',
      'www/index.html', 'www/app-core.js', 'www/app-data.js', 'www/sw.js',
      'site/index.html', 'site/features.html', 'site/privacy.html', 'site/terms.html',
      'site/robots.txt', 'site/sitemap.xml',
    ];
    for (const rel of FILES) {
      let lb;
      try { lb = fs.readFileSync(path.join(ROOT, rel)); } catch (e) { bad('本地缺文件 ' + rel); continue; }
      const r = await get(RAW + rel.split('/').map(encodeURIComponent).join('/'), {}, 3);
      if (r.err) { bad('远端抓取 ' + rel, r.err); continue; }
      if (r.status !== 200) { bad('远端抓取 ' + rel, 'HTTP ' + r.status); continue; }
      const same = crypto.createHash('sha256').update(norm(r.body)).digest('hex')
        === crypto.createHash('sha256').update(norm(lb)).digest('hex');
      chk('远端 == 本地  ' + rel, same, same ? '' : '远端 ' + r.body.length + 'B / 本地 ' + lb.length + 'B');
    }
  } else if (!JSON_OUT) {
    groupTitle('【F】远端 GitHub raw == 本地 —— 已跳过');
  }

  // ── 汇总 ────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify({ pass, fail, fails, legalVersion: LEGAL_V, appVersion: APP_VER }, null, 2));
  } else {
    console.log('\n' + '='.repeat(58));
    if (fail === 0) console.log('✅ 线上体检全过 —— ' + pass + ' 通过 / 0 失败（共 ' + pass + ' 项）');
    else {
      console.log('❌ 有失败 —— ' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 项）');
      console.log('\n失败项：');
      fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
      console.log('\n提示：官网/App 网页版是 push 后 CF 自动部署，push 完等 30s~几分钟再跑本工具。');
    }
    console.log('='.repeat(58));
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('✗ siteaudit 异常: ' + (e && e.stack || e));
  process.exit(1);
});
