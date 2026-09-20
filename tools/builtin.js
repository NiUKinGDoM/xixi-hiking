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

// ★2026-09-18 禁用词校验：“本次更新”是更新日志里的徽章文本，而 P0P3 有
// 「徽章只出现一次」断言（按渲染出的 HTML 数字符串计数）—— 文案里若写了同样这几个字，
// 会被渲染进 HTML 把计数变成 2 条 → prepare 跑到 checkall 才失败（而 prepare 不幂等，只能手动补跑）。
// v1.2.2.3 真实踩过：文案写了「更新日志「本次更新」标签」。
const BANNED = ['本次更新', '上次更新', '上上次更新'];
const rawPre = fs.readFileSync(noteFile, 'utf8').replace(/\r\n/g, '\n');
const bannedHit = BANNED.filter(function (w) { return rawPre.indexOf(w) >= 0; });
if (bannedHit.length) {
  console.error('✗ 文案含徽章文本（' + bannedHit.join('、') + '）—— 渲染后会让 P0P3「徽章只出现一次」断言失败。');
  console.error('  请改写：指代徽章位置时用「本次」「上次」（如「更新日志顶部的「本次」标签」），不要写出完整的徽章文字。');
  process.exit(1);
}

// ★2026-09-20 用户定规矩（原话：「以后更新日志里只纯净写内容，不用体现 app 后端弄了些啥」）：
//   App 内更新日志只写【用户能感知的内容】—— 禁出现【内部】分组，也禁写代码清理/守卫条数/
//   测试项数/构建与性能实测/工具链修复这类开发侧的事。技术细节改写到两处（用户可见）：
//     ① PROJECT_STATUS 版本变更记录（项目文档）；② 项目根「开发侧改动记录.md」（用户随时可打开）。
//   若某版本确实没有用户可见变化，就写一句「本版为稳定性维护，界面与功能无变化」。
const INTERNAL_TAG = '【内部】';
if (rawPre.indexOf(INTERNAL_TAG) >= 0) {
  console.error('✗ 文案含【内部】分组 —— 更新日志只写用户能感知的内容，不写开发侧（后端）做的事。');
  console.error('  请删掉整段【内部】：技术细节写进 doc 文案（PROJECT_STATUS）与「开发侧改动记录.md」；');
  console.error('  若本版没有用户可见变化，就写一句「本版为稳定性维护，界面与功能无变化」。');
  process.exit(1);
}
// 开发侧词汇（用户视角不会出现）→ 出现即拦，避免把内部工作写成日志条目
const DEV_WORDS = ['全量自检', '自检', 'P0P3', 'E2E', 'test.js', '守卫', '断言', '反向验证',
  '重构', '死代码', '视觉基线', '代码审计', '性能实测', '抽成公共函数', 'ResGuard', 'schema'] ;
const devHit = DEV_WORDS.filter(function (w) { return rawPre.indexOf(w) >= 0; });
if (devHit.length) {
  console.error('✗ 文案含开发侧词（' + devHit.join('、') + '）—— 更新日志只写用户能感知的内容。');
  console.error('  请改写为用户视角的说法，或把这条移到 doc 文案 /「开发侧改动记录.md」。');
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
