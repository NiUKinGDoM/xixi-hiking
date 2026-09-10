#!/usr/bin/env node
/**
 * tools/audit.js — 代码审计（四项优化的「①设计统一 / ⑤查 bug」自动化）（2026-09-10 建）
 *
 * 把"靠记忆+肉眼"的优化巡检变成一条命令。检查项：
 *   A. Tailwind 任意值类（z-[300] / max-w-[90vw] …）是否真的编译进了 CSS ★曾有真 bug
 *   B. JS 里 className 用到的类名是否在 CSS 中有定义（未定义=样式不生效）★曾有真 bug（loading）
 *   C. 自定义 CSS 段里定义了却无人引用的类（死 CSS，advisory）
 *   D. 残留物：console.log / debugger / base64 内联 / 临时文件
 *   E. index.html 重复 id
 * 用法：
 *   node tools/audit.js            全量
 *   node tools/audit.js --css      只跑 A/B/C
 *   node tools/audit.js --residue  只跑 D/E
 * 退出码：D/E 命中 → 1（可当门禁）；A/B/C 仅提示（静态存在性≠实际生效，须用 e2e/inspect.js 实测确认）
 * CSS 分区依据：index.html 两个 <style>——第 1 个=自定义（含分区注释），第 2 个以 `/*! tailwindcss` 开头=编译产物
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const JS_FILES = ['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js'];
const has = (n) => process.argv.indexOf('--' + n) >= 0;
const onlyCss = has('css'), onlyRes = has('residue');
const runCss = !onlyRes, runRes = !onlyCss;

const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const jsMap = {};
for (const f of JS_FILES) jsMap[f] = fs.readFileSync(path.join(WWW, f), 'utf8');
const allJs = Object.values(jsMap).join('\n');

// ---- 切 CSS 分区 ----
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const twIdx = styleBlocks.findIndex((b) => /^[\s\S]{0,80}\/\*!\s*tailwindcss/.test(b));
const tailwind = twIdx >= 0 ? styleBlocks[twIdx] : '';
const custom = styleBlocks.filter((_, i) => i !== twIdx).join('\n');
console.log(`== audit ==  自定义CSS ${custom.length}B | Tailwind ${tailwind.length}B\n`);

let fail = false;
const out = [];

// ---- 工具：类名是否真的在 CSS 里有定义 ----
// ★关键：Tailwind 会把特殊字符转义输出（text-[13px] → .text-\[13px\]、md:grid-cols-2 → .md\:grid-cols-2），
//   直接子串搜索会漏判 → 必须先去掉反斜杠再搜（2026-09-10 修正：原版把 text-[13px]/grid-cols-2 误报为死类）
const customN = custom.replace(/\\/g, '');
const tailwindN = tailwind.replace(/\\/g, '');
function inCss(cssN, cls) {
  if (cssN.indexOf('.' + cls) >= 0) return true;            // 类选择器
  if (cssN.indexOf('"' + cls + '"') >= 0) return true;      // [class*="cls"] 属性选择器
  if (cssN.indexOf("'" + cls + "'") >= 0) return true;
  return false;
}

// 收集所有类名 token（HTML class="" + JS className / classList.add / classList.toggle / className +=）
function collectTokens() {
  const set = new Map(); // token -> [来源]
  const push = (raw, src) => {
    if (!raw) return;
    for (const t of String(raw).split(/\s+/)) {
      if (!t || t.indexOf('${') >= 0) continue;
      if (!set.has(t)) set.set(t, new Set());
      set.get(t).add(src);
    }
  };
  for (const m of html.matchAll(/class="([^"]*)"/g)) push(m[1], 'html');
  for (const m of html.matchAll(/class='([^']*)'/g)) push(m[1], 'html');
  for (const [f, src] of Object.entries(jsMap)) {
    for (const m of src.matchAll(/className\s*=\s*['"`]([^'"`]*)['"`]/g)) push(m[1], f);
    for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) {
      for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) push(q[1], f);
    }
  }
  return set;
}
const tokens = collectTokens();

// ================= A. Tailwind 任意值类是否编译 =================
if (runCss) {
  const arb = [...tokens.keys()].filter((t) => t.indexOf('[') >= 0);
  const dead = arb.filter((t) => !inCss(tailwindN, t) && !inCss(customN, t));
  out.push(`A. Tailwind 任意值类（信号）：用到 ${arb.length} 个，CSS 中查无编译 ${dead.length} 个`);
  if (dead.length) { out.push('   ⚠ 查无编译（信号，非结论）：可能由自定义 CSS 兜底、或由 Tailwind 运行时（assets/vendor/tailwind4.1.13.js）在浏览器里生成 → 须用 e2e/inspect.js 实测 computed 值确认: ' + dead.join(', ')); }

  // ================= B. JS className 类名是否有 CSS 定义 =================
  const UNDEF_IGNORE = new Set([]); // 已知"仅作 JS 钩子、无样式"的类可加进来
  const candidates = [...tokens.keys()].filter((t) =>
    !t.startsWith('[') && /^[a-z][a-z0-9-]*$/i.test(t) && t.length > 2 &&
    !t.startsWith('material') && !['flex', 'hidden', 'fixed', 'relative', 'absolute', 'block', 'inline', 'grid'].includes(t)
  );
  const undef = candidates.filter((t) => !inCss(customN, t) && !inCss(tailwindN, t) && !UNDEF_IGNORE.has(t));
  out.push(`B. 类名定义检查：检查 ${candidates.length} 个，CSS 中查无定义 ${undef.length} 个`);
  if (undef.length) out.push('   ⚠ 查无定义（多为纯 JS 钩子类，需肉眼确认；若本该有样式则=bug）:\n      ' + undef.join(', '));

  // ================= C. 死 CSS（自定义段定义但无人引用）=================
  const defined = new Set();
  for (const m of custom.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) defined.add(m[1]);
  const haystack = html + '\n' + allJs;
  const deadCss = [...defined].filter((c) => {
    if (tokens.has(c)) return false;
    // 宽松：文中出现即算被引用（模板拼接/字符串拼接场景）
    return haystack.indexOf(c) < 0;
  });
  out.push(`C. 死 CSS（advisory）：自定义段定义 ${defined.size} 个类，完全无引用 ${deadCss.length} 个`);
  if (deadCss.length) out.push('   ℹ 无任何引用（可考虑清理，注意模板拼接场景）:\n      ' + deadCss.join(', '));
}

// ================= D. 残留物 =================
if (runRes) {
  const probs = [];
  for (const [f, src] of Object.entries(jsMap)) {
    src.split('\n').forEach((ln, i) => {
      if (/console\.log\(/.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) probs.push(`${f}:${i + 1} console.log`);
      if (/\bdebugger\b/.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) probs.push(`${f}:${i + 1} debugger`);
    });
    if (/data:image\/[a-z]+;base64,/.test(src)) probs.push(f + ' 仍有 base64 内联图片（应走 assets/）');
    if (/data-page-node-id|data-editor-injected/.test(src)) probs.push(f + ' 含外部编辑器注入标记');
  }
  const leftovers = [];
  for (const d of ['www', 'e2e', 'tools', '.']) {
    const dir = path.join(ROOT, d === '.' ? '..' : d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.(b64|tmp)$/.test(f) || /^dbg.*\.js$/.test(f) || /patches?-.*\.json$/.test(f) || /^qr_.*\.txt$/.test(f)) leftovers.push(path.join(d, f));
    }
  }
  const shotsLatest = fs.existsSync(path.join(ROOT, 'e2e', 'shots'))
    ? fs.readdirSync(path.join(ROOT, 'e2e', 'shots')).filter((f) => f.endsWith('.latest.png')) : [];
  out.push(`D. 残留物：代码 ${probs.length} 项 / 临时文件 ${leftovers.length} 项 / 未清理截图 ${shotsLatest.length} 项`);
  if (probs.length) { out.push('   ❌ ' + probs.join('\n      ')); fail = true; }
  if (leftovers.length) { out.push('   ⚠ 临时文件: ' + leftovers.join(', ')); }
  if (shotsLatest.length) { out.push('   ⚠ .latest.png 未清: ' + shotsLatest.slice(0, 5).join(', ')); }

  // ================= E. 重复 id =================
  const ids = {};
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids[m[1]] = (ids[m[1]] || 0) + 1;
  const dup = Object.entries(ids).filter(([, n]) => n > 1);
  out.push(`E. index.html 重复 id：${dup.length} 个`);
  if (dup.length) { out.push('   ❌ ' + dup.map(([k, n]) => `${k}×${n}`).join(', ')); fail = true; }
}

// ================= F. 外部依赖（离线自足）=================
{
  const externals = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u));
  const uniq = [...new Set(externals)];
  out.push(`F. 外部依赖（离线自足）：${uniq.length} 处`);
  if (uniq.length) { out.push('   X 断网时这些资源不可用（图标字体/Tailwind 运行时曾因此整片失效，徒步野外=常态）: ' + uniq.slice(0, 6).join(', ')); fail = true; }
}

console.log(out.join('\n'));
console.log('\n' + (fail ? '❌ 有关键问题（D 残留 / E 重复 id）' : '✅ 确定性项通过（A/B/C 为信号，须 e2e/inspect.js 实测确认）'));
process.exit(fail ? 1 : 0);
