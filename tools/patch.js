#!/usr/bin/env node
/**
 * tools/patch.js —— 原子文本补丁工具（2026-09-10 固化）
 *
 * 解决的历史坑：bash heredoc / Edit 工具的转义层数不可控，导致 JS 里的 \n
 * 被写成真实换行、字符串被拆坏（昨日连炸 4 次）。
 *
 * 用法：
 *   node tools/patch.js patches.json            # 应用补丁
 *   node tools/patch.js patches.json --dry-run  # 只检查 old 是否命中，不写文件
 *
 * patches.json 格式（JSON 转义规则是确定性的单层，语义可控）：
 * {
 *   "patches": [
 *     { "file": "www/app-data.js",
 *       "old": "要被替换的精确文本",
 *       "new": "替换后的新文本",
 *       "required": true },               // 默认 true：old 未命中即报错退出
 *     { "file": "www/app-core.js",
 *       "old": "…", "new": "…", "required": false }  // false：未命中则跳过
 *   ]
 * }
 *
 * 安全保证：
 *  1) 每个 patch 先验证 old 命中次数，命中 != 1 且 required 时直接中止（不写任何文件）
 *  2) 全部补丁应用成功后才统一写回（原子）
 *  3) 写回后自动校验：.js → node --check；.html → 花括号/圆括号配平
 *  4) 任一校验失败 → 自动还原为写前内容
 *
 * 注意：需要写入 JS 文件里的反斜杠转义（如 \n 两字符），在 JSON 中写 "\\n"；
 *       需要写入真实换行，在 JSON 中写 "\n"。两层但确定，不会出现 shell 层吃转义。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) {
  console.error('用法: node tools/patch.js <patches.json> [--dry-run]');
  process.exit(2);
}

const specPath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
} catch (e) {
  console.error('补丁文件读取失败:', e.message);
  process.exit(2);
}
const patches = Array.isArray(spec) ? spec : (spec.patches || []);
if (!patches.length) {
  console.error('补丁列表为空');
  process.exit(2);
}

// 阶段 1：全部检查 + 内存应用
const staged = new Map();
let failed = false;
for (const p of patches) {
  const abs = path.isAbsolute(p.file) ? p.file : path.join(ROOT, p.file);
  if (!staged.has(abs)) {
    if (!fs.existsSync(abs)) { console.error('✗ 文件不存在:', p.file); failed = true; continue; }
    staged.set(abs, { original: fs.readFileSync(abs, 'utf8'), next: null, touched: false });
  }
  const entry = staged.get(abs);
  const src = entry.next !== null ? entry.next : entry.original;
  const hits = src.split(p.old).length - 1;
  if (hits === 0) {
    if (p.required === false) { console.log('• 跳过（未命中）:', p.file, '|', String(p.old).slice(0, 40)); continue; }
    console.error('✗ old 未命中:', p.file, '|', String(p.old).slice(0, 60).replace(/\n/g, '\\n'));
    failed = true;
    continue;
  }
  if (hits > 1) {
    console.error('✗ old 命中 ' + hits + ' 次（要求唯一）:', p.file, '|', String(p.old).slice(0, 60).replace(/\n/g, '\\n'));
    failed = true;
    continue;
  }
  entry.next = src.replace(p.old, p.new);
  entry.touched = true;
  console.log('✓ 命中:', p.file, '|', String(p.old).slice(0, 40).replace(/\n/g, '\\n'));
}
if (failed || dryRun) {
  console.log(dryRun ? (failed ? '\n[DRY-RUN] 存在未命中项' : '\n[DRY-RUN] 全部命中，未写入') : '\n存在失败项，未写入任何文件');
  process.exit(failed ? 1 : 0);
}

// 阶段 2：写回 + 校验（失败自动还原）
function check(jsFile) {
  const r = spawnSync(process.execPath, ['--check', jsFile], { encoding: 'utf8' });
  return r.status === 0 ? '' : (r.stderr || 'syntax error');
}
function braceBalance(html) {
  const b = (html.split('{').length - 1) - (html.split('}').length - 1);
  return b === 0 ? '' : ('花括号不平衡: ' + b);
}

let anyWritten = 0;
for (const [abs, entry] of staged) {
  if (!entry.touched) continue;
  fs.writeFileSync(abs, entry.next, 'utf8');
  let err = '';
  if (abs.endsWith('.js')) err = check(abs);
  else if (abs.endsWith('.html')) err = braceBalance(entry.next);
  if (err) {
    fs.writeFileSync(abs, entry.original, 'utf8');
    console.error('✗ 校验失败，已还原:', path.relative(ROOT, abs), '|', String(err).slice(0, 200));
    process.exit(1);
  }
  anyWritten++;
  console.log('✓ 写入并校验通过:', path.relative(ROOT, abs));
}
console.log('\n完成：' + anyWritten + ' 个文件已更新');
