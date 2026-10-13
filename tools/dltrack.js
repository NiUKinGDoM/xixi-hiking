// 临时探针（用完即删）：验证 download.js 的下载埋点
//   ① 绑定数据集时会写入且去重键不含明文 IP
//   ② ★任何异常/未绑定/crypto 缺失，都绝不破坏 302 跳转
// 加载方式与 tools/sitetest.js 一致：ESM 源码 → 去 export → CJS 包装
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'functions', 'download.js');
let code = fs.readFileSync(SRC, 'utf8').replace(/\bexport\s+async\s+function\s+onRequest\b/, 'async function onRequest');
if (!/\basync function onRequest\b/.test(code)) { console.error('无法解析 onRequest'); process.exit(1); }
code += '\nmodule.exports = { onRequest: onRequest };';
const mod = { exports: {} };
new vm.Script('(function(module, exports, require){' + code + '\n})').runInThisContext()(mod, mod.exports, require);
const onRequest = mod.exports.onRequest;

const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-S9110) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

let mode = 'mirror';
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api.github.com')) {
    if (mode === 'api-fail') return new Response('{}', { status: 500 });
    const assets = mode === 'no-apk' ? [{ name: 'notes.md', size: 10 }] : [{ name: 'xixi-hiking-v1.2.4.0.apk', size: 2529520 }];
    return new Response(JSON.stringify({ tag_name: 'v1.2.4.0', assets }), { status: 200 });
  }
  return new Response('', { status: mode === 'github' ? 503 : 206 });
};

const mkReq = (ua, ip, src) => ({
  url: 'https://xixi-hiking-site.pages.dev/download' + (src ? '?src=' + src : ''),
  headers: { get: (k) => { const s = String(k).toLowerCase(); return s === 'user-agent' ? ua : (s === 'cf-connecting-ip' ? ip : null); } },
});

const results = [];
const rec = (name, ok, note) => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (note ? '  —— ' + note : '')); };

(async () => {
  // C1 未绑定（无 env、无 waitUntil）→ 必须照常 302
  mode = 'mirror';
  let r = await onRequest({ request: mkReq(ANDROID, '1.2.3.4') });
  rec('C1 未绑定 env / 无 waitUntil：仍 302 到镜像', r.status === 302 && (r.headers.get('X-Download-Target') || '').startsWith('mirror:'), r.headers.get('X-Download-Target') || '');

  // C2 绑定 → 写入 1 条；键为 12 字节 hex；无明文 IP；blobs 正确
  mode = 'mirror';
  let dps = [], pending = [];
  let env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
  r = await onRequest({ request: mkReq(ANDROID, '5.6.7.8'), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  const dp = dps[0] || {};
  rec('C2 绑定后：302 正常 + 写入 1 条', r.status === 302 && dps.length === 1, 'dps=' + dps.length);
  rec('C2b 去重键 = 24 位 hex（不可逆）', /^[0-9a-f]{24}$/.test(((dp.indexes || [])[0] || '')), 'key=' + ((dp.indexes || [])[0] || ''));
  rec('C2c 未泄漏明文 IP', !JSON.stringify(dp).includes('5.6.7.8'), 'blobs=' + JSON.stringify(dp.blobs));
  rec('C2d blobs = apk / v1.2.4.0 / android-mirror', dp.blobs && dp.blobs[0] === 'apk' && dp.blobs[1] === 'v1.2.4.0' && dp.blobs[2] === 'android-mirror', JSON.stringify(dp.blobs));

  // C3 writeDataPoint 抛错 → 302 仍必须正常
  mode = 'mirror';
  pending = [];
  env = { DL_ANALYTICS: { writeDataPoint: () => { throw new Error('boom'); } } };
  r = await onRequest({ request: mkReq(ANDROID, '9.9.9.9'), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  rec('C3 writeDataPoint 抛错：302 仍正常（容错铁律）', r.status === 302, r.headers.get('X-Download-Target') || '');

  // C4 crypto 不可用 → 回落 anon，302 仍正常
  mode = 'mirror';
  dps = []; pending = [];
  const realCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
  r = await onRequest({ request: mkReq(ANDROID, '2.2.2.2'), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  rec('C4 crypto 缺失：回落 anon 且 302 正常', r.status === 302 && ((dps[0] || {}).indexes || [])[0] === 'anon', 'key=' + (((dps[0] || {}).indexes) || [])[0]);

  // C5 iPhone → 网页版 + 记 ios
  mode = 'mirror';
  dps = []; pending = [];
  env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
  r = await onRequest({ request: mkReq(IPHONE, '8.8.8.8'), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  rec('C5 iPhone：跳网页版 + 记为 ios', r.status === 302 && (r.headers.get('Location') || '').includes('xixi-hiking.pages.dev') && dps[0] && dps[0].blobs[2] === 'ios', dps[0] ? JSON.stringify(dps[0].blobs) : 'no dp');

  // C6 各 fallback 分支仍 302
  for (const m of ['api-fail', 'no-apk']) {
    mode = m;
    r = await onRequest({ request: mkReq(ANDROID, '3.3.3.3') });
    rec('C6 ' + m + '：仍 302（' + (r.headers.get('X-Download-Target') || '') + '）', r.status === 302);
  }

  // C7 镜像全灭 → 记 android-github
  mode = 'github';
  dps = []; pending = [];
  env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
  r = await onRequest({ request: mkReq(ANDROID, '4.4.4.4'), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  rec('C7 镜像全灭：记 android-github', r.status === 302 && dps[0] && dps[0].blobs[2] === 'android-github', r.headers.get('X-Download-Target') || '');

  // C8 入口来源白名单：nav/store 原样记；非法值归 other；无参数归 direct
  for (const [src, want] of [['nav', 'nav'], ['menu', 'menu'], ['store', 'store'], ['evil-xss', 'other'], ['', 'direct']]) {
    mode = 'mirror';
    dps = []; pending = [];
    env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
    r = await onRequest({ request: mkReq(ANDROID, '6.6.6.6', src), env, waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    rec('C8 src=' + (src || '(无参数)') + ' → blob4=' + want, !!(dps[0] && dps[0].blobs[3] === want), dps[0] ? 'got=' + dps[0].blobs[3] : 'no dp');
  }

  // C9 无 req.url（老客户端/测试 mock）→ 回落 direct，不抛错
  {
    mode = 'mirror';
    dps = []; pending = [];
    env = { DL_ANALYTICS: { writeDataPoint: (dp) => dps.push(dp) } };
    const noUrl = { headers: { get: () => ANDROID } };
    r = await onRequest({ request: noUrl, env, waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    rec('C9 无 req.url：回落 direct 且 302 正常', r.status === 302 && !!(dps[0] && dps[0].blobs[3] === 'direct'), dps[0] ? 'blob4=' + dps[0].blobs[3] : 'no dp');
  }

  const bad = results.filter((x) => !x).length;
  console.log('\n===== ' + (results.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();
