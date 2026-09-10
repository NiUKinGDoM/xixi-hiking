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

if (!tag || !/^v[\d.]+$/.test(tag)) {
  console.error('用法: node tools/ghrelease.js <tag, 如 v1.2.0.3> [apk路径] [body文件] [--keep-apk]');
  process.exit(1);
}
if (!fs.existsSync(apk)) { console.error('✗ APK 不存在: ' + apk); process.exit(1); }

const assetName = 'XiXi-hiking-' + tag + '.apk';
console.log('== ghrelease ==');
console.log('tag: ' + tag + ' | APK: ' + apk);
console.log('asset: ' + assetName + '  (' + (fs.statSync(apk).size / 1048576).toFixed(2) + ' MB)');

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

(async () => {
  // ---------- 1) 建 Release ----------
  let body = '';
  if (bodyFile && fs.existsSync(bodyFile)) {
    body = fs.readFileSync(bodyFile, 'utf8').replace(/\r\n/g, '\n').trim();
    console.log('body: 来自 ' + path.relative(ROOT, bodyFile) + '（' + body.length + ' 字符）');
  } else {
    body = '## ' + tag + ' 更新内容\n\n（未提供 body 文件）\n\nMade by XiXi 💛';
    console.log('body: 未提供文件，使用占位文案');
  }

  const r1 = await fetch('https://api.github.com/repos/' + REPO + '/releases', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: tag, body, draft: false, prerelease: false }),
  });
  if (!r1.ok) { console.error('✗ 建 Release 失败 HTTP ' + r1.status + ': ' + (await r1.text()).slice(0, 300)); process.exit(1); }
  const rel = await r1.json();
  console.log('✅ Release 创建: id=' + rel.id + '  ' + rel.html_url);

  // ---------- 2) 裸二进制上传（严禁 multipart）----------
  const raw = fs.readFileSync(apk);
  const r2 = await fetch(rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(assetName), {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/octet-stream' },
    body: raw,
  });
  if (!r2.ok) { console.error('✗ 上传失败 HTTP ' + r2.status + ': ' + (await r2.text()).slice(0, 300)); process.exit(1); }
  const asset = await r2.json();
  console.log('✅ 上传成功: asset id=' + asset.id + ' size=' + asset.size);

  // ---------- 3) 下载回来验证 md5 + PK 头 ----------
  const r3 = await fetch('https://api.github.com/repos/' + REPO + '/releases/assets/' + asset.id, {
    headers: { ...H, Accept: 'application/octet-stream' },
    redirect: 'follow',
  });
  if (!r3.ok) { console.error('✗ 下载验证失败 HTTP ' + r3.status); process.exit(1); }
  const dl = Buffer.from(await r3.arrayBuffer());
  const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
  const same = md5(dl) === md5(raw);
  const isPk = dl.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  console.log((same ? '✅' : '❌') + ' 下载校验 md5 一致: ' + same);
  console.log((isPk ? '✅' : '❌') + ' PK 头正确: ' + isPk);
  if (!same || !isPk) { console.error('✗ 上传内容与本地不一致，请人工检查 Release'); process.exit(1); }

  // ---------- 4) 清理本地 APK ----------
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

  console.log('\n全部完成 → ' + rel.html_url);
})().catch((e) => { console.error('✗ 异常: ' + e.message); process.exit(1); });
