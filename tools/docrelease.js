#!/usr/bin/env node
/**
 * tools/docrelease.js — 发布文档三处同步（★2026-09-10 新增）
 *
 * 为什么需要它：每次发版要手改「PROJECT_STATUS 主工程 + GH 副本 + CHANGELOG」4 个位置
 *   （顶部版本行 / 删过期待发行 / 插正式版条目 / CHANGELOG 标题），漏一处就会被
 *   test.js 的 5r「文档版本一致」断言拦下重来。本工具一次做完。
 *
 * 用法：
 *   node tools/docrelease.js <版本号> <vc> <条目文案文件> [--dry-run]
 *
 * 条目文案文件 = PROJECT_STATUS 里要插入的那几行（支持多行，建议以 "- **正式版 vX**..." 开头）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const PS = [path.join(PROJ, 'PROJECT_STATUS.md'), path.join(PROJ, 'backups/github-同步目录/xixi-hiking/docs/PROJECT_STATUS.md')];
const CL = path.join(ROOT, 'CHANGELOG.md');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const pos = args.filter((a) => !a.startsWith('--'));
const [ver, vc, noteFile] = pos;

if (!ver || !vc || !noteFile) {
  console.error('用法: node tools/docrelease.js <版本号> <vc> <条目文案文件> [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(noteFile)) { console.error('✗ 文案文件不存在: ' + noteFile); process.exit(1); }

const eolOf = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();

const note = fs.readFileSync(noteFile, 'utf8').replace(/\r\n/g, '\n').trim();
let changed = 0;

// ---------- 1) PROJECT_STATUS 双端 ----------
for (const p of PS) {
  if (!fs.existsSync(p)) { console.log('⚠ 跳过（不存在）: ' + p); continue; }
  let s = fs.readFileSync(p, 'utf8');
  const E = eolOf(s);
  const orig = s;
  const acts = [];

  // a) 顶部「最后更新」版本行
  const topRe = /(> 最后更新：)\d{4}-\d{2}-\d{2}（v[\d.]+ \/ vc\d+）/;
  if (topRe.test(s)) {
    s = s.replace(topRe, `$1${today}（v${ver} / vc${vc}）`);
    acts.push('顶部版本行');
  } else {
    console.log('⚠ ' + path.basename(p) + ' 未匹配到顶部版本行');
  }

  // b) 删除过期的 ▶待发 行
  const pendRe = new RegExp('^- \\*\\*▶待发[^\\n]*' + E.replace('\r', '\\r') + '?', 'gm');
  const pendBefore = s.length;
  s = s.replace(pendRe, '');
  if (s.length !== pendBefore) acts.push('清过期待发行');

  // c) 在第一个「正式版 v」条目行前插入新条目（幂等：已有该版本条目则跳过）
  const marker = '- **正式版 v';
  const i = s.indexOf(marker);
  if (s.includes('- **正式版 v' + ver + '**')) {
    console.log('ℹ ' + path.basename(p) + ' 已有 v' + ver + ' 正式版条目，跳过插入（幂等）');
  } else if (i < 0) {
    console.log('⚠ ' + path.basename(p) + ' 找不到「正式版 v」锚点');
  } else {
    const entry = note.split('\n').join(E) + E;
    s = s.slice(0, i) + entry + s.slice(i);
    acts.push('插正式版条目');
  }

  if (s !== orig) {
    if (!DRY) fs.writeFileSync(p, s);
    changed++;
    console.log('✅ ' + path.relative(PROJ, p) + ' → ' + acts.join(' + '));
  } else {
    console.log('⚠ ' + path.relative(PROJ, p) + ' 无变化');
  }
}

// ---------- 2) CHANGELOG ----------
if (fs.existsSync(CL)) {
  let c = fs.readFileSync(CL, 'utf8');
  const E = eolOf(c);
  const head = '### v' + ver + '（vc' + vc + ' · ' + today + '）';
  if (c.includes(head)) {
    console.log('⚠ CHANGELOG 已有 ' + head + '，跳过（幂等）');
  } else {
    const m = c.match(/^### v[\d.]/m);
    if (!m) {
      console.log('⚠ CHANGELOG 找不到「### v」锚点');
    } else {
      c = c.slice(0, m.index) + head + E + E + c.slice(m.index);
      if (!DRY) fs.writeFileSync(CL, c);
      changed++;
      console.log('✅ CHANGELOG.md → 插入 ' + head);
    }
  }
}

console.log('');
console.log((DRY ? '[DRY-RUN] ' : '') + '完成：' + changed + ' 个文件已更新');
if (!DRY && changed) console.log('👉 接着跑 `node tools/checkall.js --fast` 验证文档版本一致性断言');
