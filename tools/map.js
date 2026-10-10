#!/usr/bin/env node
/**
 * tools/map.js —— 代码地图生成器（★2026-10-10 新增）
 *
 * 解决什么问题：
 *   `www/app-data.js` 5000+ 行、`www/index.html` 726 行 + `www/app.css` 6000 行
 *   （★2026-10-10 CSS 已从 index.html 外置到 app.css）。
 *   改一个函数要在大文件里翻半天 —— 这是"零构建手写"路线的必然代价。
 *   办法：**先给一张地图** —— 改之前先查这里定位（JS 函数 + 样式分区都索引）。
 *
 * 用法：
 *   node tools/map.js            # 生成/刷新 tools/notes/code-map.md
 *   node tools/map.js --check     # 检查地图是否已过期（文件行数变了就提示重跑）
 *   node tools/map.js --stdout    # 直接打印，不写文件
 *
 * 说明：
 *   · 索引 **顶层函数**（缩进 ≤ 4 的 function / const xx = function|=>）
 *   · index.html 索引 <style>/<script> 段；**app.css 索引样式分区注释**（改样式先跳这里）
 *   · 地图头部记录了各文件行数 —— 行数变了就说明地图过期（--check 靠这个判断）
 *   · **地图是派生产物，不进版本库**（`tools/notes/*.md` 不在 ghsync 同步清单里，
 *     与 `tools/notes/<版本>-release.md` 的约定一致）→ 新机器/新会话第一条命令跑一下即可生成
 *   · 不 spawn 任何子进程（本机 spawn 会集体 EBUSY）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'notes', 'code-map.md');
const JS_FILES = ['index.html', 'app.css', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'sw.js'];

function read(rel) {
  const p = path.join(ROOT, 'www', rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function lines(s) { return s.split(/\r?\n/); }

// ---------- JS：顶层函数索引 ----------
const RE_FN = /^(\s{0,4})(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const RE_ASSIGN = /^(\s{0,4})const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/;

function fnIndex(rel) {
  const arr = lines(read(rel));
  const hits = [];
  arr.forEach((ln, i) => {
    const m = RE_FN.exec(ln) || RE_ASSIGN.exec(ln);
    if (m) hits.push({ name: m[2], line: i + 1, indent: m[1].length });
  });
  return hits.map((h, k) => ({
    name: h.name, from: h.line,
    to: k + 1 < hits.length ? hits[k + 1].line - 1 : arr.length,
    indent: h.indent,
  })).filter((h) => h.indent <= 4);
}

// ---------- HTML：CSS 分区 / style / script 段 ----------
const RE_CSS_SEC = /^\s*\/\*\s*[=★\-\s]*([^*]{2,60}?)\s*[=★\-\s]*\*\/\s*$/;

function htmlIndex(rel) {
  const arr = lines(read(rel));
  const out = [];
  arr.forEach((ln, i) => {
    const n = i + 1;
    if (/<style[^>]*>/.test(ln)) out.push({ line: n, kind: 'style 段', name: ln.trim().slice(0, 70) });
    else if (/<\/style>/.test(ln)) out.push({ line: n, kind: 'style 结束', name: '' });
    else if (/<script[^>]*>/.test(ln)) out.push({ line: n, kind: 'script 段', name: ln.trim().slice(0, 70) });
    else {
      const m = RE_CSS_SEC.exec(ln);
      if (m) out.push({ line: n, kind: 'CSS 分区', name: m[1] });
    }
  });
  return out;
}

// ---------- CSS：样式分区注释索引（★2026-10-10 起样式已外置 www/app.css）----------
function cssIndex(rel) {
  const arr = lines(read(rel));
  const out = [];
  arr.forEach((ln, i) => {
    const m = RE_CSS_SEC.exec(ln);
    if (m) out.push({ line: i + 1, kind: 'CSS 分区', name: m[1] });
  });
  return out;
}

function build() {
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const L = [];
  L.push('# 代码地图（自动生成 · 勿手改）');
  L.push('');
  L.push('> 由 `node tools/map.js` 生成于 ' + stamp);
  L.push('> **用途**：改 `www/` 前先查这里定位，别在 6700 行里瞎翻。');
  L.push('> **过期判据**：下方「文件行数」与实际不符 = 地图过期 → 重跑本工具。');
  L.push('');

  L.push('## 文件行数');
  L.push('');
  L.push('| 文件 | 行数 | 顶层函数数 |');
  L.push('|---|---|---|');
  const rows = JS_FILES.map((f) => ({ f, n: lines(read(f)).length, fn: fnIndex(f).length }));
  rows.forEach((r) => L.push('| `www/' + r.f + '` | ' + r.n + ' | ' + r.fn + ' |'));
  L.push('');

  for (const f of JS_FILES) {
    const src = read(f);
    if (!src) continue;
    L.push('## www/' + f + '（' + lines(src).length + ' 行）');
    L.push('');

    if (f === 'index.html') {
      const h = htmlIndex(f);
      if (h.length) {
        L.push('### CSS / script 分区');
        L.push('');
        L.push('| 行 | 类型 | 名称 |');
        L.push('|---|---|---|');
        h.forEach((x) => L.push('| ' + x.line + ' | ' + x.kind + ' | ' + (x.name || '—') + ' |'));
        L.push('');
      }
    }

    if (f === 'app.css') {
      const c = cssIndex(f);
      if (c.length) {
        L.push('### 样式分区（改样式先跳到这里）');
        L.push('');
        L.push('| 行 | 类型 | 名称 |');
        L.push('|---|---|---|');
        c.forEach((x) => L.push('| ' + x.line + ' | ' + x.kind + ' | ' + (x.name || '—') + ' |'));
        L.push('');
      }
    }

    const fn = fnIndex(f);
    if (fn.length) {
      L.push('### 顶层函数');
      L.push('');
      L.push('| 起 | 止 | 行数 | 函数 |');
      L.push('|---|---|---|---|');
      fn.forEach((x) => L.push('| ' + x.from + ' | ' + x.to + ' | ' + (x.to - x.from + 1) + ' | `' + x.name + '()` |'));
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push('> 只有**顶层**函数（缩进 ≤ 4）。要找嵌套/局部函数，用编辑器全文搜索更快。');
  L.push('> 行号基于生成时的版本；改动代码后重跑本工具即可刷新。');
  return { text: L.join('\n'), rows };
}

// ---------- CLI ----------
function main() {
  const args = process.argv.slice(2);
  const { text, rows } = build();

  if (args.includes('--stdout')) { console.log(text); return; }

  if (args.includes('--check')) {
    if (!fs.existsSync(OUT)) {
      console.error('❌ 地图不存在（' + path.relative(ROOT, OUT) + '）→ 运行 node tools/map.js');
      process.exit(1);
    }
    const cur = fs.readFileSync(OUT, 'utf8');
    const lineBy = {};
    cur.split('\n').forEach((l) => {
      const m = l.match(/^\| `www\/([^`]+)` \| (\d+) \|/);
      if (m) lineBy[m[1]] = Number(m[2]);
    });
    const stale = rows.filter((r) => lineBy[r.f] !== r.n);
    if (stale.length) {
      console.error('❌ 地图已过期（这些文件行数变了）：' + stale.map((s) => s.f).join(', '));
      console.error('   → 运行 node tools/map.js 刷新');
      process.exit(1);
    }
    console.log('✅ 代码地图是最新的（' + rows.length + ' 个文件）');
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text, 'utf8');
  console.log('✅ 已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/'));
  rows.forEach((r) => console.log('   www/' + r.f + '  ' + r.n + ' 行 / ' + r.fn + ' 个顶层函数'));
}

module.exports = { build, fnIndex, htmlIndex };

if (require.main === module) main();
