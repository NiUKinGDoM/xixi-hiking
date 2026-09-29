#!/usr/bin/env node
/**
 * tools/sitetest.js — 官网 Pages Function 离线自测（★2026-09-29 新增）
 *
 * 为什么需要它：`functions/download.js` 是**唯一在 CF 边缘运行的代码**，
 * 本地页面自检（siteprobe）碰不到它，而它一旦错就会让用户点到死链。
 * （★2026-09-29：功能文件在**仓库根** functions/ —— CF Pages 的 Functions 目录基于
 *   仓库根判定，放 site/ 下线上完全不生效，曾导致 `/download` 静默静默 404。）
 * 这里用「假 fetch」模拟 GitHub API + 镜像探测，验证分流与兜底：
 *
 *   ① 安卓 UA + API 正常 + 镜像可用 → 302 到**镜像直链**（不再是 github.com！）
 *   ② 安卓 UA + API 正常 + 镜像全灭 → 302 到 GitHub 官方直链（老行为兜底）
 *   ③ iPhone / 桌面 UA            → 302 到网页版（不该给 APK）
 *   ④ API 返回非 200              → 302 到 Release 页兜底（绝不给死链）
 *   ⑤ API 返回的 Release 无 apk   → 302 到 Release 页兜底
 *   ⑥ fetch 抛异常                → 302 到 Release 页兜底
 *   ⑦ 历史异常资产名（xixi-hiking- / XiXiHiking- / 中文被替换成 .）都能正确拼出直链
 *   ⑧ 镜像列表与 App 内 UPDATE_MIRRORS 必须逐项一致、同序（两端改源必须同步）
 *
 * 用法：node tools/sitetest.js        （退出码 0 = 全过）
 * 已并入 tools/checkall.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'functions', 'download.js');
const CORE = path.join(ROOT, 'www', 'app-core.js');

if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到 ' + SRC);
  process.exit(1);
}
const code = fs.readFileSync(SRC, 'utf8');

// ---- 断言框架 ----
let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

// 把源码「转换为 CJS」后包成模块执行，注入可控的 fetch / Response。
// ★注意：CF Pages Function 是 ESM（`export async function onRequest`），
//   而这里要同步拿到 handler（外层流程是顺序调用的），故把 export 改成
//   赋值到模块作用域再 module.exports —— 只做语法层面的导出改写，逻辑一字不动。
function loadFn(fakeFetch) {
  const body = code.replace(/\bexport\s+async\s+function\s+onRequest\b/, 'async function onRequest');
  if (!/\basync function onRequest\b/.test(body)) {
    throw new Error('未能从 download.js 中解析出 onRequest（导出写法变了？请同步更新本测试）');
  }
  const wrapper = `
    const fetch = globalThis.__fakeFetch;
    const Response = globalThis.__FakeResponse;
    const AbortSignal = globalThis.__FakeAbortSignal;
    ${body}
    module.exports = { onRequest: onRequest, REPO: REPO, WEBAPP: WEBAPP, FALLBACK: FALLBACK, MIRRORS: MIRRORS };
  `;
  const Module = require('module');
  const m = new Module(SRC, null);
  m.paths = Module._nodeModulePaths(path.dirname(SRC));
  const g = globalThis;
  g.__fakeFetch = fakeFetch;
  g.__FakeResponse = class FakeResponse {
    constructor(body, init) {
      this.body = body;
      this.status = (init && init.status) || 200;
      this.headers = new Map(Object.entries((init && init.headers) || {}));
    }
    get(name) { return this.headers.get(name); }
    async json() { return JSON.parse(this.body); }
    get ok() { return this.status >= 200 && this.status < 300; }
  };
  // download.js 用了 AbortSignal.timeout()，Node 18+ 原生有；这里透传，无需假实现。
  g.__FakeAbortSignal = AbortSignal;
  m._compile(wrapper, SRC);
  return m.exports;
}

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const GH_HOST = 'github.com';
const relBody = (tag, name, size) => JSON.stringify({
  tag_name: tag,
  assets: [{ name: name, size: size || 2510665, browser_download_url: 'https://github.com/X/' + name }],
});

/**
 * 构造假 fetch：按 URL 分流——
 *   - api.github.com  → 走 apiResult（字符串体 / 抛错）
 *   - 其他（镜像探测）→ 走 mirrorResult（可指定哪些前缀可用）
 */
function makeFetch(apiResult, mirrorOkPred) {
  return async (url) => {
    const u = String(url);
    if (u.includes('api.github.com')) return apiResult();
    // 镜像探测请求
    const alive = mirrorOkPred ? mirrorOkPred(u) : true;
    if (!alive) {
      const err = new Error('mirror down');
      err.name = 'TypeError';
      throw err;
    }
    return new (globalThis.__FakeResponse)(null, { status: 206 });
  };
}

async function call(fakeFetch, ua) {
  const mod = loadFn(fakeFetch);
  const res = await mod.onRequest({ request: { headers: { get: (k) => (k.toLowerCase() === 'user-agent' ? ua : null) } } });
  return res;
}

(async () => {
  console.log('== sitetest == 官网下载入口（Pages Function）离线自测\n');
  console.log('① 安卓 → 镜像直链（★2026-09-29 新行为：不再跳 github.com）');
  {
    const res = await call(makeFetch(() => new (globalThis.__FakeResponse)(relBody('v1.2.2.10', 'XiXi-hiking-v1.2.2.10.apk'), { status: 200 })), UA_ANDROID);
    const loc = res.headers.get('Location');
    const tgt = res.headers.get('X-Download-Target');
    ok(res.status === 302, '状态 302', '实际 ' + res.status);
    ok(loc === 'https://gh-proxy.com/https://github.com/NiUKinGDoM/xixi-hiking/releases/download/v1.2.2.10/XiXi-hiking-v1.2.2.10.apk',
      '★302 到**最快镜像**（gh-proxy.com）而非 github.com', '实际 ' + loc);
    ok(/^mirror:/.test(tgt || ''), '标记 X-Download-Target=mirror:<host>', '实际 ' + tgt);
    ok(!/^https:\/\/github\.com\//.test(loc), '★Location 不是 github.com 开头（用户不再看到 GitHub）');
  }

  console.log('\n② 安卓 → 镜像全灭时退回 GitHub 官方直链（兜底仍在）');
  {
    const res = await call(makeFetch(
      () => new (globalThis.__FakeResponse)(relBody('v1.2.2.10', 'XiXi-hiking-v1.2.2.10.apk'), { status: 200 }),
      () => false, // 所有镜像探测都失败
    ), UA_ANDROID);
    ok(res.headers.get('Location') === 'https://github.com/NiUKinGDoM/xixi-hiking/releases/download/v1.2.2.10/XiXi-hiking-v1.2.2.10.apk',
      '镜像全灭 → 官方直链（不是死链）', '实际 ' + res.headers.get('Location'));
    ok(res.headers.get('X-Download-Target') === 'github', '标记 X-Download-Target=github');
  }

  console.log('\n③ 镜像顺序：第一个不可用时应落到第二个');
  {
    const mod = loadFn(makeFetch(
      () => new (globalThis.__FakeResponse)(relBody('v1.2.2.10', 'a.apk'), { status: 200 }),
      // 只放行第二个镜像（gh.xmly.dev）
      (u) => u.indexOf('gh.xmly.dev') >= 0,
    ));
    const res = await mod.onRequest({ request: { headers: { get: () => UA_ANDROID } } });
    ok(/^https:\/\/gh\.xmly\.dev\//.test(res.headers.get('Location') || ''),
      '首选源失败 → 自动落到次选源 gh.xmly.dev', '实际 ' + res.headers.get('Location'));
    ok(res.headers.get('X-Download-Target') === 'mirror:gh.xmly.dev', '标记 mirror:gh.xmly.dev');
  }

  console.log('\n④ iPhone / iPad → 网页版');
  for (const [label, ua] of [['iPhone', UA_IPHONE], ['iPad', UA_IPAD]]) {
    const res = await call(makeFetch(() => new (globalThis.__FakeResponse)(relBody('v1', 'a.apk'), { status: 200 })), ua);
    ok(res.status === 302 && res.headers.get('Location') === 'https://xixi-hiking.pages.dev',
      label + ' 302 → 网页版', '实际 ' + res.headers.get('Location'));
  }

  console.log('\n⑤ 桌面 → 网页版');
  for (const [label, ua] of [['macOS', UA_MAC], ['Windows', UA_WIN]]) {
    const res = await call(makeFetch(() => new (globalThis.__FakeResponse)(relBody('v1', 'a.apk'), { status: 200 })), ua);
    ok(res.status === 302 && res.headers.get('Location') === 'https://xixi-hiking.pages.dev',
      label + ' 302 → 网页版', '实际 ' + res.headers.get('Location'));
  }

  console.log('\n⑥ 兜底：API 非 200');
  {
    const res = await call(makeFetch(() => new (globalThis.__FakeResponse)('rate limited', { status: 403 })), UA_ANDROID);
    ok(res.status === 302 && res.headers.get('Location').endsWith('/releases/latest'), '302 → Release 页兜底');
    ok(res.headers.get('X-Download-Target') === 'fallback-api', '标记原因 fallback-api');
  }

  console.log('\n⑦ 兜底：Release 里没有 apk 资产');
  {
    const res = await call(makeFetch(() => new (globalThis.__FakeResponse)(JSON.stringify({ tag_name: 'v1', assets: [{ name: 'notes.txt' }] }), { status: 200 })), UA_ANDROID);
    ok(res.headers.get('X-Download-Target') === 'fallback-no-apk', '标记原因 fallback-no-apk（不给死链）');
  }

  console.log('\n⑧ 兜底：fetch 抛异常');
  {
    const res = await call(async () => { throw new Error('network down'); }, UA_ANDROID);
    ok(res.status === 302 && res.headers.get('X-Download-Target') === 'fallback-error', '302 → 兜底，不 500');
  }

  console.log('\n⑨ 历史各种资产命名都能正确拼直链（镜像侧同样走通）');
  {
    const NAMES = ['XiXi-hiking-v1.2.2.10.apk', 'xixi-hiking-v1.1.8.4.apk', 'XiXiHiking-v1.1.7.5.apk', 'XiXi.-v1.1.3.0.apk'];
    let allOk = true, bad = '';
    for (const n of NAMES) {
      const res = await call(makeFetch(() => new (globalThis.__FakeResponse)(relBody('v9.9.9.9', n), { status: 200 })), UA_ANDROID);
      const want = 'https://gh-proxy.com/https://github.com/NiUKinGDoM/xixi-hiking/releases/download/v9.9.9.9/' + encodeURIComponent(n);
      if (res.headers.get('Location') !== want) { allOk = false; bad = n + ' → ' + res.headers.get('Location'); }
    }
    ok(allOk, '4 种命名（含中文被替换成 . 的旧包）全部正确', bad);
  }

  console.log('\n⑩ 镜像列表与 App 内 UPDATE_MIRRORS 逐项一致（两端改源必须同步）');
  {
    const core = fs.readFileSync(CORE, 'utf8');
    const grab = (src, re) => { const m = src.match(re); return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : []; };
    const mirs = grab(code, /const MIRRORS = \[([\s\S]*?)\];/);
    const ums = grab(core, /var UPDATE_MIRRORS = \[([\s\S]*?)\];/);
    ok(mirs.length >= 2, 'Function 侧镜像 ≥ 2 个', '实际 ' + mirs.length);
    ok(ums.length >= 2, 'App 侧 UPDATE_MIRRORS ≥ 2 个', '实际 ' + ums.length);
    ok(JSON.stringify(mirs) === JSON.stringify(ums),
      '★两侧镜像列表完全一致（含顺序）', 'fn=[' + mirs.join(',') + '] app=[' + ums.join(',') + ']');
  }

  console.log('\n⑪ 源码卫生');
  {
    ok(/export async function onRequest/.test(code), '导出 onRequest（Pages Function 约定）');
    ok(!/NODE_TLS|process\.env/.test(code), '不依赖 Node 专有 API（CF Workers 运行时）');
    ok(/\.apk/i.test(code) && /releases\/download/.test(code), '用 releases/download 资产直链');
    ok(/for \(const prefix of MIRRORS\)/.test(code), '守卫：安卓路径逐个遍历镜像探测（镜像优先）');
    ok(/mirrorAlive\(/.test(code), '守卫：存在镜像可用性探测函数');
  }

  // ★结果行格式必须与 checkall 的解析正则兼容：`N 通过 / M 失败`
  console.log('\n' + (fail === 0 ? '✅ 全过' : '❌ 有失败') + ' —— ' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 项）');
  process.exit(fail === 0 ? 0 : 1);
})();
