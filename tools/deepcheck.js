#!/usr/bin/env node
/**
 * tools/deepcheck.js — 深度静态排查（2026-09-10 建）
 *
 * 覆盖：① 疑似死代码（函数只定义未被引用）② XSS 风险（innerHTML 拼接未转义）
 *      ③ 定时器/监听器泄漏 ④ 存储写入无兜底 ⑤ 全局污染 ⑥ TODO/FIXME 残留
 *      ⑦ 超大行（base64 残留） ⑧ 重复 id 事件重复绑定风险
 *
 * 用法：
 *   node tools/deepcheck.js           # 人读输出
 *   node tools/deepcheck.js --json    # 机器读
 *
 * ★定位：全部为「信号」——静态分析必有误报/漏报，确定性结论一律以
 *   `node e2e/inspect.js` 浏览器实测为准。本工具只负责"缩小可疑范围"。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const JS_FILES = ['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js'];
const JSON_OUT = process.argv.indexOf('--json') >= 0;

const files = {};
JS_FILES.forEach((f) => { files[f] = fs.readFileSync(path.join(WWW, f), 'utf8'); });
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
// ★死代码判定必须把「测试与工具脚本」也算进来 —— 曾因只扫 www/ 把测试钩子 resetGuideSeen 误判成死代码删掉，
//   导致 test.js 1 条 + P0P3 2 条用例失败（是断言救回来的）。凡"删除"类结论一律先跑 checkall 验证。
let auxSrc = '';
['test.js', 'test-ui.js', '_test_p0p3.js'].forEach((f) => { try { auxSrc += fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) {} });
try {
  fs.readdirSync(path.join(ROOT, 'e2e')).filter((f) => f.endsWith('.js')).forEach((f) => { try { auxSrc += fs.readFileSync(path.join(ROOT, 'e2e', f), 'utf8'); } catch (e) {} });
} catch (e) {}
const all = Object.values(files).join('\n') + '\n' + html + '\n' + auxSrc;

const report = [];
const sig = (title, items, note) => report.push({ title, items, note });

/* ---------- ① 疑似死代码：函数定义但全文只出现 1 次 ---------- */
{
  const defs = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(src))) defs.push({ name: m[1], file: f });
  });
  const dead = [];
  defs.forEach(({ name, file }) => {
    // 统计名字在"全部 JS + HTML"中出现的次数（含 typeof 检查 / addEventListener 引用 / onclick 属性）
    const hits = (all.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
    if (hits <= 1) dead.push(name + ' @' + file);
  });
  sig('① 疑似死代码（函数仅定义、全文无引用）', dead, '可能是动态字符串调用/将来要用 → 确认无引用再删');
}

/* ---------- ② XSS 风险：innerHTML 拼接未转义 ---------- */
{
  const risky = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    // ★按"表达式"而非"单行"判断：拼接常跨多行，转义函数可能在后续行（曾因此误报 21 项）
    const re = /\.innerHTML\s*=|insertAdjacentHTML\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      const tail = src.slice(m.index, m.index + 2000);
      const semi = tail.indexOf(';');
      const expr = semi > 0 ? tail.slice(0, semi) : tail;
      const hasVar = /\+|\$\{/.test(expr);
      const safe = /escapeHtml|esc\(|sanitize|encodeURI|Number\(|parseInt|JSON\.stringify|textContent/.test(expr);
      if (hasVar && !safe) risky.push(f + ':' + line + ' ' + expr.replace(/\s+/g, ' ').slice(0, 105));
    }
  });
  sig('② XSS 风险（innerHTML 拼接、表达式内未见转义函数）', risky, '确认右侧数据来源；项目统一用 escapeHtml（app-sync.js 定义、全局共享）');
}

/* ---------- ③ 定时器 / 事件监听 ---------- */
{
  const timers = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    const setI = (src.match(/setInterval\s*\(/g) || []).length;
    const clrI = (src.match(/clearInterval\s*\(/g) || []).length;
    const setT = (src.match(/setTimeout\s*\(/g) || []).length;
    if (setI > 0) timers.push(f + ': setInterval×' + setI + ' / clearInterval×' + clrI + (clrI < setI ? ' ⚠ 可能未清' : ' ✓'));
    if (setT > 20) timers.push(f + ': setTimeout×' + setT + '（数量多，注意长延时未清）');
  });
  // 监听器：同一事件在同一文件重复 addEventListener 到不同元素是正常的；这里只看 window/document 级
  const dupWin = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    const evts = {};
    const re = /(?:window|document)\.addEventListener\s*\(\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) evts[m[1]] = (evts[m[1]] || 0) + 1;
    Object.entries(evts).forEach(([e, n]) => { if (n > 1) dupWin.push(f + ': window/document 上 [' + e + '] ×' + n); });
  });
  sig('③ 定时器 / 全局监听', timers.concat(dupWin), '重复绑同一事件到 window/document 可能重复执行');
}

/* ---------- ④ 存储写入无兜底 ---------- */
{
  const bad = [];
  JS_FILES.forEach((f) => {
    const lines = files[f].split('\n');
    lines.forEach((ln, i) => {
      if (!/(localStorage|sessionStorage)\.setItem/.test(ln)) return;
      const ctx = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      if (!/try\s*\{/.test(ctx)) bad.push(f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 100));
    });
  });
  sig('④ 存储写入未见 try 兜底', bad, '写入失败（配额满/隐私模式）会抛异常中断流程');
}

/* ---------- ⑤ 全局污染 ---------- */
{
  const globals = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    const re = /window\.([A-Za-z_$][\w$]*)\s*=/g;
    let m; const seen = {};
    while ((m = re.exec(src))) seen[m[1]] = (seen[m[1]] || 0) + 1;
    Object.keys(seen).forEach((k) => globals.push('window.' + k + ' @' + f));
  });
  sig('⑤ 挂到 window 的全局（预期内为跨文件调用/桥接）', globals, '逐个确认是否都必要');
}

/* ---------- ⑥ TODO / FIXME / 调试残留 ---------- */
{
  const todo = [];
  JS_FILES.concat(['index.html', 'sw.js']).forEach((f) => {
    const src = f === 'sw.js' ? fs.readFileSync(path.join(WWW, f), 'utf8') : (files[f] || html);
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (/TODO|FIXME|XXX|HACK/.test(ln)) todo.push(f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 100));
      if (/\bconsole\.(log|debug|warn)\s*\(/.test(ln) && !/^\s*\/\//.test(ln)) todo.push(f + ':' + (i + 1) + ' [console] ' + ln.trim().slice(0, 90));
      if (/\bdebugger\b/.test(ln)) todo.push(f + ':' + (i + 1) + ' [debugger]');
    });
  });
  sig('⑥ TODO/FIXME/调试残留', todo);
}

/* ---------- ⑦ 超大行（base64 残留 / 压缩混入） ---------- */
{
  const big = [];
  JS_FILES.concat(['index.html']).forEach((f) => {
    const src = files[f] || html;
    src.split('\n').forEach((ln, i) => {
      if (ln.length > 8000) big.push(f + ':' + (i + 1) + ' 行长 ' + ln.length + ' 字符' + (/base64/.test(ln) ? '（疑似 base64）' : ''));
    });
  });
  sig('⑦ 超大行（>8000 字符）', big);
}

/* ---------- ⑧ 事件绑定：同 id 重复 addEventListener ---------- */
{
  const dup = [];
  JS_FILES.forEach((f) => {
    const src = files[f];
    const re = /getElementById\(\s*'([^']+)'\s*\)\s*\.addEventListener/g;
    const seen = {};
    let m;
    while ((m = re.exec(src))) seen[m[1]] = (seen[m[1]] || 0) + 1;
    Object.entries(seen).forEach(([id, n]) => { if (n > 1) dup.push(f + ': #' + id + ' 绑定 ×' + n); });
  });
  sig('⑧ 同 id 重复绑定事件', dup, '若在不同时机重复绑定会叠加执行');
}

/* ---------- 输出 ---------- */
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log('== deepcheck（深度静态排查 · 信号级）==\n');
  let total = 0;
  report.forEach((r) => {
    const n = r.items.length;
    total += n;
    console.log((n ? '⚠ ' : '✅ ') + r.title + ' → ' + (n ? n + ' 项' : '0'));
    r.items.slice(0, 12).forEach((it) => console.log('    ' + it));
    if (n > 12) console.log('    … 其余 ' + (n - 12) + ' 项');
    if (n && r.note) console.log('    ↳ ' + r.note);
    console.log('');
  });
  console.log('合计信号 ' + total + ' 项；★静态信号≠bug，确定性结论用 node e2e/inspect.js 实测。');
}
