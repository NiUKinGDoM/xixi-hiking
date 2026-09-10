#!/usr/bin/env node
/**
 * tools/ghrelease.js — GitHub Release 一条龙（★2026-09-10 新增）
 *
 * 替代每次手写的三个临时脚本：建 Release / 裸二进制上传 APK / 下载回来验证 md5+PK。
 * 内置：token 由 tools/ghtoken.py 从 Windows 凭据管理器读取（不落盘、不外泄）；
 *       上传后自动下载校验 + 清理本地 APK（Release 是唯一发布渠道，本地不留包）。
 *
 * 用法：
 *   node tools/ghrelease.js <tag> [apk路径] [body文件] [--keep-apk]
 * 例：
 *   node tools/ghrelease.js v1.2.0.3 tools/release-notes/1.2.0.3.md
 *
 * 退出码：0 成功；1 失败
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'NiUKinGDoM/xixi-hiking';
const DEFAULT_APK = path.join(os.tmpdir(), 'hiking-build/android/app/build/outputs/apk/release/app-release.apk');

const args = process.argv.slice(2);
const KEEP = args.includes('--keep-apk');
const pos = args.filter((a) => !a.startsWith('--'));
const tag = pos[0];
const apk = pos[1] && fs.existsSync(pos[1]) ? pos[1] : DEFAULT_APK;
const bodyFile = pos.slice(1).find((p) => /\.(md|txt)$/i.test(p));

const SELFTEST = args.includes('--selftest');

if (!SELFTEST) {
  if (!tag || !/^v[\d.]+$/.test(tag)) {
    console.error('用法: node tools/ghrelease.js <tag, 如 v1.2.0.3> [apk路径] [body文件] [--keep-apk]');
    console.error('      node tools/ghrelease.js --selftest   （只读，验证网络层与 token）');
    process.exit(1);
  }
  if (!fs.existsSync(apk)) { console.error('✗ APK 不存在: ' + apk); process.exit(1); }
}

const assetName = 'XiXi-hiking-' + tag + '.apk';
if (!SELFTEST) {
  console.log('== ghrelease ==');
  console.log('tag: ' + tag + ' | APK: ' + apk);
  console.log('asset: ' + assetName + '  (' + (fs.statSync(apk).size / 1048576).toFixed(2) + ' MB)');
}

// ---------- token ----------
const tk = spawnSync('python', [path.join(__dirname, 'ghtoken.py')], { encoding: 'utf8' });
const token = (tk.stdout || '').trim();
if (!token || !token.startsWith('ghp_')) { console.error('✗ 未取到 GitHub token（tools/ghtoken.py）'); process.exit(1); }
console.log('token: 已读取（' + token.length + ' 字符）\n');

const H = {
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'xixi-ghrelease',
};

function eolOf(s) { return s.includes('\r\n') ? '\r\n' : '\n'; }

// ---------- 网络层：curl + 自动钉可用 IP（2026-09-10 起）----------
// 背景：本机 DNS 解析到的 github.com / api.github.com 会 TCP 超时，但同段其他 IP 正常
// （表现：codeload / pages.dev 通，github / api 不通，极易误判为"节点坏了"）。
// node fetch 无法自定义 DNS 解析 → 改用 curl，支持 --resolve 直接指定可用 IP。
const NUL = os.platform() === 'win32' ? 'NUL' : '/dev/null';
const PIN_HOSTS = ['api.github.com', 'github.com'];
const IP_MAP = {
  'api.github.com': ['20.205.243.168', '140.82.112.6', '140.82.113.6', '20.205.243.166', '20.27.177.113'],
  'github.com': ['20.205.243.166', '140.82.112.3', '140.82.113.3', '140.82.114.3', '140.82.116.3', '20.27.177.113'],
};
// 探针端点按 host 定制：用真实接口，避免 vhost 不匹配的 301 被误判为可用
const PROBE_PATH = { 'api.github.com': '/rate_limit', 'github.com': '/' };
const pinned = {};

// hosts 劫持检测：Steam++ / Watt Toolkit 类加速器会把域名写进 hosts 指向 127.0.0.1，
// 一旦它的本地反代没在跑，域名就全部"连接被拒"（2026-09-10 本机实测真凶）。
const HOSTS_FILE = os.platform() === 'win32'
  ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/hosts';
function hostsHijacked(host) {
  try {
    const t = fs.readFileSync(HOSTS_FILE, 'utf8');
    const re = new RegExp('^\\s*127\\.0\\.0\\.1\\s+' + host.replace(/\./g, '\\.') + '\\s*$', 'm');
    return re.test(t);
  } catch (e) { return false; }
}

function curlProbe(host, ip) {
  const r = spawnSync('curl', ['-s', '-o', NUL, '-w', '%{http_code}', '--max-time', '6', '-L',
    '--resolve', host + ':443:' + ip, 'https://' + host + (PROBE_PATH[host] || '/')], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function ensurePin(host) {
  if (pinned[host]) return true;
  if (PIN_HOSTS.indexOf(host) < 0) return false;
  if (hostsHijacked(host)) {
    console.log('   ⚠ ' + host + ' 被 hosts 劫持到 127.0.0.1（Steam++/Watt Toolkit 类加速器）');
    console.log('     → 自动绕过：钉真实 IP（彻底解决可清理 hosts 中的 Steam++ 段）');
  }
  for (const ip of (IP_MAP[host] || [])) {
    const c = curlProbe(host, ip);
    if (c === '200') {   // 只认 200：301/302 多为 vhost 不匹配，用它会得到空响应
      pinned[host] = ip;
      console.log('   ℹ 网络适配：' + host + ' → 钉 ' + ip + '（200）');
      return true;
    }
  }
  return false;
}

function httpExec(o) {
  const host = new URL(o.url).hostname;
  const args = ['-s', '-S', '--max-time', String(o.timeout || 180)];
  if (o.follow) args.push('-L');
  if ((o.method || 'GET') !== 'GET') args.push('-X', o.method);
  for (const k of Object.keys(o.headers || {})) args.push('-H', k + ': ' + o.headers[k]);
  if (ensurePin(host)) args.push('--resolve', host + ':443:' + pinned[host]);
  if (o.dataFile) args.push('--data-binary', '@' + o.dataFile);
  if (o.outFile) args.push('-o', o.outFile);
  args.push(o.url, '-w', '\n__CODE__%{http_code}');
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const out = r.stdout || '';
  const m = out.match(/__CODE__(\d+)\s*$/);
  return { code: m ? parseInt(m[1], 10) : 0, body: out.replace(/\n__CODE__\d+\s*$/, ''), stderr: (r.stderr || '').trim() };
}

const ok2xx = (c) => c >= 200 && c < 300;

// ---------- 只读自检（--selftest）：验证 token + 网络层，不发送任何写请求 ----------
if (SELFTEST) {
  console.log('== ghrelease --selftest（只读，不发写请求）==');
  const r = httpExec({
    url: 'https://api.github.com/repos/' + REPO + '/releases/latest', headers: H, timeout: 30,
  });
  if (!ok2xx(r.code)) {
    console.error('✗ 网络层自检失败 HTTP ' + r.code + (r.stderr ? ' | ' + r.stderr : '') + ' ' + r.body.slice(0, 200));
    process.exit(1);
  }
  const d = JSON.parse(r.body);
  console.log('✅ token 有效、网络层正常');
  console.log('   最新 Release: ' + d.tag_name + '（assets ' + d.assets.length + ' 个）');
  console.log('   钉住主机: ' + (Object.keys(pinned).length ? JSON.stringify(pinned) : '（直连即可，无需钉 IP）'));
  process.exit(0);
}

// ---------- 主流程 ----------
(function main() {
  // 1) 建 Release
  let body = '';
  if (bodyFile && fs.existsSync(bodyFile)) {
    body = fs.readFileSync(bodyFile, 'utf8').replace(/\r\n/g, '\n').trim();
    console.log('body: 来自 ' + path.relative(ROOT, bodyFile) + '（' + body.length + ' 字符）');
  } else {
    body = '## ' + tag + ' 更新内容\n\n（未提供 body 文件）\n\nMade by XiXi 💛';
    console.log('body: 未提供文件，使用占位文案');
  }

  const payloadFile = path.join(os.tmpdir(), 'ghrel-payload.json');
  fs.writeFileSync(payloadFile, JSON.stringify({
    tag_name: tag, name: tag, body: body, draft: false, prerelease: false,
  }), 'utf8');

  const r1 = httpExec({
    method: 'POST', url: 'https://api.github.com/repos/' + REPO + '/releases',
    headers: Object.assign({}, H, { 'Content-Type': 'application/json' }), dataFile: payloadFile,
  });
  if (!ok2xx(r1.code)) {
    console.error('✗ 建 Release 失败 HTTP ' + r1.code + (r1.stderr ? ' | ' + r1.stderr : '') + ': ' + r1.body.slice(0, 300));
    process.exit(1);
  }
  const rel = JSON.parse(r1.body);
  console.log('✅ Release 创建: id=' + rel.id + '  ' + rel.html_url);

  // 2) 裸二进制上传（严禁 multipart）
  const r2 = httpExec({
    method: 'POST', url: rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(assetName),
    headers: Object.assign({}, H, { 'Content-Type': 'application/octet-stream' }),
    dataFile: apk, timeout: 900,
  });
  if (!ok2xx(r2.code)) {
    console.error('✗ 上传失败 HTTP ' + r2.code + (r2.stderr ? ' | ' + r2.stderr : '') + ': ' + r2.body.slice(0, 300));
    process.exit(1);
  }
  const asset = JSON.parse(r2.body);
  console.log('✅ 上传成功: asset id=' + asset.id + ' size=' + asset.size);

  // 3) 下载回来验证 md5 + PK 头（网络受限时降级为 size 校验并明确标注）
  const raw = fs.readFileSync(apk);
  const dlFile = path.join(os.tmpdir(), 'ghrel-download.apk');
  if (fs.existsSync(dlFile)) fs.rmSync(dlFile);
  const r3 = httpExec({
    url: 'https://api.github.com/repos/' + REPO + '/releases/assets/' + asset.id,
    headers: Object.assign({}, H, { Accept: 'application/octet-stream' }),
    follow: true, outFile: dlFile, timeout: 900,
  });

  const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
  let verified = false;
  if (ok2xx(r3.code) && fs.existsSync(dlFile)) {
    const dl = fs.readFileSync(dlFile);
    const same = md5(dl) === md5(raw);
    const isPk = dl.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    console.log((same ? '✅' : '❌') + ' 下载校验 md5 一致: ' + same);
    console.log((isPk ? '✅' : '❌') + ' PK 头正确: ' + isPk);
    verified = same && isPk;
    if (!verified) { console.error('✗ 上传内容与本地不一致，请人工检查 Release'); process.exit(1); }
    fs.rmSync(dlFile);
  } else {
    // 网络受限（objects.githubusercontent.com 不可达等）→ 退化为 size 校验，不让发布卡死
    const sizeOk = asset.size === raw.length;
    console.log('⚠ 下载验证不可用（HTTP ' + r3.code + (r3.stderr ? ' | ' + r3.stderr : '') + '）→ 降级为 size 校验');
    console.log((sizeOk ? '✅' : '❌') + ' 远端 size 与本地一致: ' + asset.size + ' / ' + raw.length);
    if (!sizeOk) { console.error('✗ 远端大小与本地不符，请人工检查 Release'); process.exit(1); }
    console.log('⚠ 注意：本次未做 md5 校验，建议网络恢复后手动下载一次核对');
  }

  // 4) 清理本地 APK
  if (!KEEP) {
    const dir = path.dirname(apk);
    let n = 0;
    for (const f of [path.basename(apk), 'output-metadata.json']) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) { fs.rmSync(p); n++; }
    }
    console.log('✅ 本地 APK 已清理（' + n + ' 个文件；Release 为唯一发布渠道）');
  } else {
    console.log('ℹ --keep-apk：保留本地 APK');
  }

  if (fs.existsSync(payloadFile)) fs.rmSync(payloadFile);
  console.log('\n全部完成 → ' + rel.html_url);
})();
