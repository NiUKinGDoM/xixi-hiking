#!/usr/bin/env node
/**
 * tools/builtin.js — BUILTIN_CHANGELOG 条目注入（★2026-09-10 新增）
 *
 * 为什么需要它：
 *   手工用 python + json 注入时，JSON 层的 `\n` 会被解析成【真实换行】写进 JS 源码
 *   → 破坏字符串字面量（patch.js 的语法校验会拦下，但你得重来一遍）。
 *   本工具直接读「真实换行」的文案文件，内部转成 JS 源码里的字面 `\n`，零转义歧义。
 *
 * 用法：
 *   node tools/builtin.js 1.2.0.3 tools/notes/1.2.0.3.txt   # 从文件读文案
 *   node tools/builtin.js --check                            # 只检查条目与 APP_VERSION 是否一致
 *
 * 退出码：0 成功；1 失败（未改动文件）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'www/app-core.js');

function eolOf(s) { return s.includes('\r\n') ? '\r\n' : '\n'; }

/** 把真实文本转成 JS 单引号字符串字面量内容（换行 → 字面 \n） */
function toJsLiteral(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\\/g, '\\\\')     // 反斜杠先转义（避免与下面的 \n 混淆）
    .replace(/'/g, "\\'")       // 单引号
    .replace(/\n/g, '\\n');     // 真实换行 → 字面 \n（两字符）
}

function readVersion(core) {
  const m = core.match(/var APP_VERSION = '([\d.]+)';/);
  if (!m) throw new Error('app-core.js 里找不到 APP_VERSION');
  return m[1];
}

function syntaxCheck(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return { ok: r.status === 0, msg: (r.stderr || '').split('\n')[0] };
}

// ---------------- main ----------------
const args = process.argv.slice(2);

if (args[0] === '--check') {
  const core = fs.readFileSync(CORE, 'utf8');
  const ver = readVersion(core);
  const has = core.includes("'v" + ver + "': '");
  const list = [...core.matchAll(/'(v[\d.]+)': '/g)].map((m) => m[1]).slice(0, 5);
  console.log('APP_VERSION = ' + ver);
  console.log('BUILTIN 最新条目: ' + list.join(', '));
  console.log(has ? '✅ 当前版本条目已在 BUILTIN' : '⚠ 当前版本尚无 BUILTIN 条目（发布前需注入）');
  process.exit(has ? 0 : 1);
}

const ver = args[0];
const noteFile = args[1];
if (!ver || !/^[\d.]+$/.test(ver)) {
  console.error('用法: node tools/builtin.js <版本号> <文案文件>   |   node tools/builtin.js --check');
  process.exit(1);
}
if (!noteFile || !fs.existsSync(noteFile)) {
  console.error('✗ 文案文件不存在: ' + noteFile);
  process.exit(1);
}

const core = fs.readFileSync(CORE, 'utf8');
const E = eolOf(core);

if (core.includes("'v" + ver + "': '")) {
  console.log('⚠ v' + ver + ' 条目已存在，跳过（幂等）');
  process.exit(0);
}

// 锚点 = 第一个已有的版本条目行（形如 `    'v1.2.0.2': '`)
const m = core.match(/^ {4}'v[\d.]+': '/m);
if (!m) { console.error('✗ 找不到 BUILTIN 锚点（第一个版本条目）'); process.exit(1); }
const anchor = m[0];
const idx = core.indexOf(anchor);
if (core.indexOf(anchor, idx + 1) !== -1) {
  console.error('✗ 锚点不唯一，拒绝写入（请人工检查 BUILTIN 结构）');
  process.exit(1);
}

const raw = fs.readFileSync(noteFile, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const entry = "    'v" + ver + "': '" + toJsLiteral(raw) + "'," + E;

const backup = core;
fs.writeFileSync(CORE, core.slice(0, idx) + entry + core.slice(idx));

const chk = syntaxCheck(CORE);
if (!chk.ok) {
  fs.writeFileSync(CORE, backup);
  console.error('✗ 写后语法校验失败，已还原: ' + chk.msg);
  process.exit(1);
}

// 回读确认（防写入被系统吞掉）
const after = fs.readFileSync(CORE, 'utf8');
if (!after.includes("'v" + ver + "': '")) {
  fs.writeFileSync(CORE, backup);
  console.error('✗ 回读未发现新条目，已还原');
  process.exit(1);
}

const front = after.slice(after.indexOf("'v" + ver + "': '"), after.indexOf("'v" + ver + "': '") + 70);
console.log('✅ BUILTIN v' + ver + ' 已注入');
console.log('   行首: ' + JSON.stringify(front));
console.log('   条目数（前 5）: ' + [...after.matchAll(/'(v[\d.]+)': '/g)].map((x) => x[1]).slice(0, 5).join(', '));
