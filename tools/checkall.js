#!/usr/bin/env node
/**
 * tools/checkall.js — 一条命令跑全部自检（2026-09-10 建）
 *
 * 目的：终结"反复单跑 test.js / 单跑 e2e"的往返浪费。
 * 用法：
 *   node tools/checkall.js            全跑（test + test-ui + P0P3 + E2E）
 *   node tools/checkall.js --fast     只跑 test + test-ui（秒级）
 *   node tools/checkall.js --no-e2e   跳过 E2E（E2E 最慢）
 *   node tools/checkall.js --only=e2e 只跑 E2E
 * 退出码：任一套失败 → 1（可直接用于发布前门禁）
 * 说明：隔离 workspace 的 NODE_PATH 自动注入（jsdom / playwright-core / pngjs）
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const WS = 'C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules';

const has = (n) => process.argv.indexOf('--' + n) >= 0;
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

const SUITES = [
  { key: 'test', name: '数据层/语法自检', file: 'test.js', timeout: 120000 },
  { key: 'test-ui', name: 'jsdom UI 自检', file: 'test-ui.js', timeout: 180000 },
  { key: 'p0p3', name: 'P0P3 链路自检', file: '_test_p0p3.js', timeout: 300000 },
  { key: 'e2e', name: 'E2E 真实渲染回归', file: 'e2e/run.js', timeout: 420000 },
];

let list = SUITES;
if (has('fast')) list = SUITES.slice(0, 2);
else if (has('no-e2e')) list = SUITES.slice(0, 3);
if (onlyArg) list = SUITES.filter((s) => s.key === onlyArg);

function parseResult(out) {
  // 形如 "===== 结果: 185 通过 / 0 失败 =====" 或 "===== E2E: 24 通过 / 0 失败 ====="
  const ms = [...out.matchAll(/(\d+)\s*通过\s*\/\s*(\d+)\s*失败/g)];
  if (!ms.length) return null;
  const m = ms[ms.length - 1];
  return { pass: Number(m[1]), fail: Number(m[2]) };
}

const t0 = Date.now();
const rows = [];
let anyFail = false;

for (const s of list) {
  const file = path.join(ROOT, s.file);
  if (!fs.existsSync(file)) { rows.push({ ...s, status: '文件不存在' }); anyFail = true; continue; }
  process.stdout.write(`▶ ${s.name} (${s.file}) … `);
  const st = Date.now();
  const r = spawnSync(NODE, [file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: s.timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { NODE_PATH: WS }),
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const res = parseResult(out);
  const secs = ((Date.now() - st) / 1000).toFixed(1);
  const failed = res ? res.fail > 0 : (r.status !== 0);
  if (failed || !res) anyFail = true;
  rows.push({ ...s, status: res ? `${res.pass} 通过 / ${res.fail} 失败` : `未解析（退出码 ${r.status}${r.error ? ' / ' + r.error.code : ''}）`, ok: !failed && !!res, secs, out });
  console.log(res ? (res.fail === 0 ? `✅ ${res.pass}/${res.fail}` : `❌ ${res.pass}/${res.fail}`) : `⚠ 未解析（exit ${r.status}）`);
}

console.log('\n================ 汇总 ================');
for (const r of rows) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(18, '　')} ${r.status}${r.secs ? '   (' + r.secs + 's)' : ''}`);
}
// 失败明细
const failedRows = rows.filter((r) => r.ok === false && r.out);
for (const r of failedRows) {
  const lines = r.out.split('\n').filter((l) => l.includes('❌'));
  if (lines.length) console.log(`\n--- ${r.name} 失败明细 ---\n` + lines.slice(0, 8).join('\n'));
}
console.log(`\n总计 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${anyFail ? '❌ 有失败' : '✅ 全绿'}`);
process.exit(anyFail ? 1 : 0);
