#!/usr/bin/env node
/**
 * tools/smoke.js — 工具链冒烟测试（★2026-09-10 新增）
 *
 * 为什么需要它：项目有 14 个自建工具（覆盖补丁注入/构建/同步/校验/编排），
 *   但它们此前**零测试**——今天 ghsync（assets 子目录 → EPERM）与 ship（绝对路径）
 *   都是「第一次真实使用就崩」。机制兜住了代码，机制自己却没人管。
 *
 * 本工具做两件事：
 *   ① 全部工具语法校验（node --check）
 *   ② 安全工具实际跑一次「无副作用模式」（--check / --dry-run / 无参数用法提示），
 *      判定：无未捕获异常 + 退出码 ∈ {0,1} + 有输出
 *   有副作用或耗时的工具（release/checkall/ghrelease 写模式等）**只做语法校验**，
 *   标注 skip-exec，绝不因为冒烟测试而改动工程或触发构建。
 *
 * 用法：
 *   node tools/smoke.js             # 默认：语法 + 安全执行
 *   node tools/smoke.js --verbose   # 附带输出片段
 *   node tools/smoke.js --list      # 只看清单
 *
 * 退出码：0 全过；1 有失败
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const VERBOSE = process.argv.includes('--verbose');
const LIST = process.argv.includes('--list');
const NET = process.argv.includes('--net');   // --net：额外跑依赖网络的用例（--selftest）

// path: 相对主工程；args: 安全执行参数；safe: 是否可实际执行
const CASES = [
  { path: 'tools/patch.js', args: [], safe: true, note: '无参数 → 用法提示' },
  { path: 'tools/builtin.js', args: ['--check'], safe: true, note: '--check → 只读查条目' },
  { path: 'tools/docrelease.js', args: [], safe: true, note: '无参数 → 用法提示' },
  { path: 'tools/verify-apk.js', args: [], safe: true, note: '无 APK → 优雅报错' },
  { path: 'tools/ghrelease.js', args: [], safe: true, note: '无参数 → 用法提示' },
  { path: 'tools/ghrelease.js', args: ['--selftest'], safe: true, net: true, note: '网络+token 自检 → https://api.github.com（仅 --net）' },
  { path: 'tools/ship.js', args: [], safe: true, note: '无参数 → 用法提示' },
  { path: 'tools/audit.js', args: [], safe: true, note: '只读分析（含 F 外部依赖门禁）' },
  { path: 'tools/deepcheck.js', args: [], safe: true, note: '只读深查' },
  { path: 'tools/docaudit.js', args: [], safe: true, note: '只读文档体检' },
  { path: 'tools/ghsync.js', args: ['--dry-run'], safe: true, note: '--dry-run → 只读预览' },
  { path: 'tools/security.js', args: [], safe: true, note: '无参数 → 用法提示' },
  { path: 'tools/release.js', args: [], safe: false, note: '⚠ 会触发构建 → 仅语法校验' },
  { path: 'tools/checkall.js', args: [], safe: false, note: '⚠ 会跑全部测试 → 仅语法校验' },
  { path: 'tools/ghtoken.py', args: [], safe: true, py: true, note: '读取凭据（不打印内容）' },
];

// 未捕获异常的判别（stderr 出现这些即为真崩）
const CRASH = /Uncaught|TypeError:|ReferenceError:|SyntaxError:|RangeError:|^\s+at\s/m;

if (LIST) {
  console.log('工具链清单（' + CASES.length + ' 项）：');
  CASES.forEach((c) => console.log('  ' + (c.safe ? '跑 ' : '检 ') + c.path + '   ' + c.note));
  process.exit(0);
}

const active = CASES.filter((c) => !c.net || NET);
const netSkipped = CASES.length - active.length;

console.log('== 工具链冒烟测试（' + active.length + ' 项' +
  (netSkipped ? '；' + netSkipped + ' 项网络用例未跑，加 --net 启用' : '') + '）==\n');

const results = [];
for (const c of active) {
  const abs = path.join(ROOT, c.path);
  const r = { path: c.path, note: c.note, syntaxOk: false, execOk: null, detail: '' };

  if (!fs.existsSync(abs)) {
    r.detail = '文件不存在';
    results.push(r);
    continue;
  }

  // ① 语法校验（.py 跳过）
  if (!c.py) {
    const s = spawnSync(NODE, ['--check', abs], { encoding: 'utf8' });
    r.syntaxOk = s.status === 0;
    if (!r.syntaxOk) r.detail = '语法错误: ' + (s.stderr || '').split('\n')[0];
  } else {
    r.syntaxOk = true;   // py 由执行环节验证
  }

  // ② 安全执行
  if (r.syntaxOk && c.safe) {
    const cmd = c.py ? 'python' : NODE;
    const e = spawnSync(cmd, [abs, ...c.args], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    const stderr = e.stderr || '';
    const stdout = e.stdout || '';
    const crashed = CRASH.test(stderr) || e.signal != null;
    // 退出码约定：0 正常；1 未就绪/前置缺失（优雅）；2 命令行用法错误（Unix 惯例）——都算"没崩"
    const codeOk = e.status === 0 || e.status === 1 || e.status === 2;
    r.execOk = !crashed && codeOk;
    if (!r.execOk) {
      r.detail = crashed ? '未捕获异常: ' + stderr.split('\n').slice(0, 2).join(' ') : '退出码异常: ' + e.status;
    }
    // ghtoken 特殊：只验证拿到 token，不打印
    if (c.py && r.execOk) r.detail = stdout.trim().startsWith('ghp_') ? '已读到凭据（长度 ' + stdout.trim().length + '）' : '凭据格式异常';
    if (VERBOSE && stdout.trim()) r.detail = (r.detail ? r.detail + ' | ' : '') + stdout.trim().split('\n').slice(0, 2).join(' / ');
  }
  results.push(r);
}

// ---------- 汇总 ----------
let pass = 0, fail = 0, skipped = 0;
for (const r of results) {
  const okAll = r.syntaxOk && (r.execOk === null ? true : r.execOk);
  let tag;
  if (!r.syntaxOk || r.execOk === false) { tag = '❌'; fail++; }
  else if (r.execOk === null) { tag = '⏭ '; skipped++; pass++; }
  else { tag = '✅'; pass++; }
  console.log(tag + ' ' + r.path.padEnd(24) + (r.syntaxOk ? '语法OK ' : '语法✗  ') +
    (r.execOk === null ? '(仅语法)  ' : (r.execOk ? '执行OK  ' : '执行✗  ')) +
    (r.detail ? '→ ' + r.detail : ''));
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全过') +
  '（' + pass + ' 通过 / ' + skipped + ' 仅语法校验 / 共 ' + results.length + '）');
console.log('===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);
