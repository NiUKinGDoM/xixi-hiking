#!/usr/bin/env node
/**
 * tools/dlcheck.js — 官网下载链路实测（★2026-09-29 新增）
 *
 * 模拟真实浏览器行为，验证「点一下就直接下 APK」到底成不成立：
 *   ① GET /download（带安卓 UA）→ 期望 302
 *   ② ★若拿到的是 CF Pages 的 404 页 → 判定「Function 未部署」并醒目提示
 *   ③ 顺着重定向一路跟到底，检查最终响应是否为 APK 字节
 *      （判据：Content-Type 含 android.package-archive / octet-stream，或 body 前两字节 = PK）
 *
 * 用法：
 *   node tools/dlcheck.js                          # 测线上（官网）
 *   node tools/dlcheck.js --base http://127.0.0.1:8080   # 测本地 wrangler/静态服务
 *   node tools/dlcheck.js --ua ios                 # 换 UA 看分流（android|ios|mac|win）
 *   node tools/dlcheck.js --head                   # 只听首跳（快，不下载 2.5MB）
 *
 * 已并入 tools/ship.js publish（发布后自动核对下载链路）。
 */
const SITE = process.env.XIXI_SITE || 'https://xixi-hiking-site.pages.dev';

const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const BASE = val('base') || SITE;
const HEAD_ONLY = has('head');
const UA_KIND = val('ua') || 'android';

const UAS = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// 用 python 发请求（本机 node 的 spawn 偶发 EBUSY；python 侧稳定）
const { spawnSync } = require('child_process');
const PY = `
import sys, json, urllib.request, urllib.error

url = ${JSON.stringify(BASE + '/download')}
ua  = ${JSON.stringify(UAS[UA_KIND])}
head_only = ${HEAD_ONLY ? 'True' : 'False'}
max_hops = 6

def open_req(u, method='GET', follow=True):
    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            self.last = (code, newurl)
            return None
    nr = NR(); nr.last = None
    handlers = [urllib.request.ProxyHandler({}), NR()]
    op = urllib.request.build_opener(*handlers)
    r = urllib.request.Request(u, method=method)
    r.add_header('User-Agent', ua)
    r.add_header('Accept', '*/*')
    r.add_header('Referer', ${JSON.stringify(BASE + '/')})
    try:
        resp = op.open(r, timeout=45)
        return {'code': resp.status, 'ctype': resp.headers.get('Content-Type') or '',
                'loc': resp.headers.get('Location'), 'len': resp.headers.get('Content-Length'),
                'target': resp.headers.get('X-Download-Target'), 'ver': resp.headers.get('X-APK-Version'),
                'name': resp.headers.get('X-APK-Name'), 'gateway': resp.headers.get('X-Download-Gateway'),
                'pk': None, 'body_len': None}
    except urllib.error.HTTPError as e:
        d = {'code': e.code, 'ctype': (e.headers.get('Content-Type') or '') if e.headers else '',
             'loc': (e.headers.get('Location') if e.headers else None),
             'len': (e.headers.get('Content-Length') if e.headers else None),
             'target': (e.headers.get('X-Download-Target') if e.headers else None),
             'ver': (e.headers.get('X-APK-Version') if e.headers else None),
             'name': (e.headers.get('X-APK-Name') if e.headers else None),
             'gateway': (e.headers.get('X-Download-Gateway') if e.headers else None),
             'pk': None, 'body_len': None}
        return d

hops = []
cur = url; final = None
for i in range(max_hops):
    method = 'HEAD' if head_only else 'GET'
    d = open_req(cur, method=method)
    hops.append({'url': cur[:120], 'code': d['code'], 'ctype': d['ctype'], 'target': d['target'],
                 'ver': d['ver'], 'name': d['name'], 'len': d['len']})
    if d['code'] in (301, 302, 303, 307, 308) and d['loc']:
        cur = d['loc']
        continue
    final = d
    # 真下载时才确认字节头（HEAD 没有 body）
    if not head_only:
        try:
            r = urllib.request.Request(cur); r.add_header('User-Agent', ua); r.add_header('Accept','*/*')
            op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            resp = op.open(r, timeout=60)
            b = resp.read(4)
            final['pk'] = b[:2].decode('latin1')
            final['body_len'] = len(b)
        except Exception as e:
            final['pk'] = 'ERR:' + type(e).__name__
    break

print('@@' + json.dumps({'hops': hops, 'final': final, 'head_only': head_only}))
`;

const r = spawnSync('python', ['-c', PY], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
const raw = (r.stdout || '').trim();
const line = raw.split('\n').find((l) => l.startsWith('@@'));

if (!line) {
  console.error('✗ 请求失败：');
  console.error((r.stdout || '') + (r.stderr || ''));
  process.exit(1);
}
const data = JSON.parse(line.slice(2));

console.log('== dlcheck ==  ' + BASE + '  [UA=' + UA_KIND + (HEAD_ONLY ? ' · HEAD' : ' · 完整下载') + ']\n');
let fail = 0;
data.hops.forEach((h, i) => {
  console.log('  第 ' + (i + 1) + ' 跳: ' + h.code + '  ' + h.url);
  if (h.target) console.log('           X-Download-Target=' + h.target + (h.ver ? '  X-APK-Version=' + h.ver : '') + (h.name ? '  name=' + h.name : ''));
  if (h.ctype) console.log('           Content-Type: ' + h.ctype);
});

const f = data.final || {};
const last = data.hops[data.hops.length - 1] || {};
// ★关键：本脚本关心的所有标记都在**第 1 跳**（我们自己那台服务器返回的）上，
//   第 2 跳之后是 GitHub/CDN，不会再带这些头 → 必须取首跳，不能取最后一跳
const first = data.hops[0] || {};

console.log('\n── 判定 ──');

// ① 首跳是不是 Function 生效（而不是静态站兜底页）
//   ★判据必须用「X-Download-Gateway 标记」而非状态码：CF Pages 对**不存在的路径**
//     返回的是 **200 + 首页 HTML**（软 404，实测确认），只看 404 会把「没部署」误判成「正常」。
const gateway = first.gateway;
const firstIsHtml = /text\/html/.test(first.ctype || '');
const wentToGithub = data.hops.some((h) => /github\.com|release-assets/.test(h.url));

if (gateway === 'xixi-hiking') {
  console.log('  ✅ Function 已生效（X-Download-Gateway=xixi-hiking）');
} else if (first.code === 404) {
  console.log('  ❌ /download 返回 404 → **CF Pages Function 未部署**');
  fail++;
} else if (firstIsHtml && !wentToGithub) {
  console.log('  ❌ /download 返回的是**静态 HTML**（CF 软 404 兜底页）→ **Function 未部署**');
  console.log('     检查：site/functions/download.js 是否已推到 master（ghsync 的 site/ 目录必须含 functions/）');
  fail++;
} else {
  console.log('  ⚠ 未见 X-Download-Gateway 标记（但已跳到 GitHub，行为正确）');
}

const target = first.target;
const expected = UA_KIND === 'android' ? 'apk' : 'webapp';
if (target) {
  if (target === expected) console.log('  ✅ 分流正确：' + UA_KIND + ' → ' + target);
  else { console.log('  ❌ 分流异常：' + UA_KIND + ' 期望 ' + expected + '，实际 ' + target); fail++; }
} else if (UA_KIND !== 'android' || !wentToGithub) {
  console.log('  ⚠ 未拿到 X-Download-Target 头（可能是 CF 改写了响应头）');
}

if (UA_KIND === 'android') {
  const ct = (f.ctype || '').toLowerCase();
  const isApkCt = /android\.package-archive|application\/octet-stream|application\/vnd\.android/.test(ct);
  const isPk = f.pk === 'PK';
  if (HEAD_ONLY) {
    if (isApkCt) console.log('  ✅ 最终响应 Content-Type 是安装包类型（' + f.ctype + '）');
    else if (isPk) console.log('  ✅ 最终响应体前两字节 = PK（APK zip 头）');
    else console.log('  ⚠ HEAD 模式拿不到 body，未验证字节（去掉 --head 可完整验证）');
  } else {
    if (isPk) console.log('  ✅ 最终响应体前两字节 = PK → 下载到的确实是 APK 文件（不是网页）');
    else if (isApkCt) console.log('  ✅ Content-Type 为安装包类型（' + f.ctype + '）');
    else { console.log('  ❌ 最终响应不像 APK（Content-Type=' + f.ctype + '，首字节=' + f.pk + '）'); fail++; }
  }
  if (f.len) console.log('  ℹ 文件大小: ' + f.len + ' 字节 (' + (Number(f.len) / 1024 / 1024).toFixed(2) + ' MB)');
} else {
  const isHtml = /text\/html/.test(last.ctype || '');
  if (isHtml) console.log('  ✅ ' + UA_KIND + ' 落到网页版（HTML）—— 与预期一致');
  else if (last.code === 200 || last.code === 302) console.log('  ℹ 结束状态 ' + last.code + '（' + last.ctype + '）');
}

console.log('\n' + (fail === 0 ? '✅ 下载链路正常' : '❌ 有 ' + fail + ' 项异常'));
process.exit(fail === 0 ? 0 : 1);
