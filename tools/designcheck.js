#!/usr/bin/env node
/**
 * tools/designcheck.js — 设计一致性体检（★2026-09-14 新增）
 *
 * 为什么需要它：本项目 Tailwind 是**冻结快照**、自定义 CSS 又各自为政，
 * 「圆角/字体漂移」靠肉眼扫代码根本扫不出来 —— 2026-09-11 那次
 * 「统计卡 14px / ov-mini 13px 悄悄偏离规范」就是这么漏掉的，直到
 * 用户反馈「设计不统一」才发现，还得回头翻 git 才想起是 9/3 自己调的。
 *
 * 本工具做法：用真实浏览器（e2e/inspect.js）实测**每个可见元素**的
 * computed 圆角与字体，与下面的「项目设计规范表」比对，列出所有偏离项。
 *
 * 用法：
 *   node tools/designcheck.js           # 体检并打印报告（偏离项退出码 1）
 *   node tools/designcheck.js --quiet   # 只打印偏离项
 *
 * 规范表维护：改设计规范时**先改这里**，再改 CSS —— 让表始终是唯一事实来源。
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const QUIET = process.argv.includes('--quiet');

// ============ 项目设计规范表（唯一事实来源，改设计先改这里）============
const SPEC = {
    // 圆角档位：卡片 20 / 子项 16 / 按钮 12 / 输入框 10 / 滚动条 4
    radius: { '20px': '卡片', '16px': '子项', '12px': '按钮', '10px': '输入框', '4px': '滚动条' },
    // 合理但非档位（小元素/胶囊/圆形）
    radiusExtra: { '8px': '小元素(热力图格/徽章)', '999px': '胶囊', '50%': '圆形' },
    // 字体：主字体 SimSun；图标字体与等宽字体为功能性例外
    font: { 'SimSun': '主字体', 'Material Icons': '图标', 'JetBrains Mono': '等宽' },
    fontExtra: { 'ui-sans-serif': '系统兜底' },
};

const TABS = ['overview', 'records', 'plans', 'settings'];

function scanTab(tab) {
    const snippet = `
var radii = {}, fonts = {};
function __scan() {
  document.querySelectorAll('*').forEach(function (e) {
    if (!e.getClientRects || e.getClientRects().length === 0) return;
    var cs = getComputedStyle(e);
    var r = cs.borderTopLeftRadius;
    if (r && r !== '0px') {
      if (!radii[r]) radii[r] = { count: 0, sample: [] };
      radii[r].count++;
      if (radii[r].sample.length < 4) {
        var cls = (typeof e.className === 'string' ? e.className : '').split(/\\s+/).filter(Boolean).slice(0,2).join('.');
        radii[r].sample.push(e.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      }
    }
    var f = cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();
    fonts[f] = (fonts[f] || 0) + 1;
  });
}
if (typeof switchTab === 'function') { try { switchTab('${tab}'); } catch (e) {} }
__scan();
return { radii: radii, fonts: fonts };
`;
    const r = spawnSync(NODE, [path.join(ROOT, 'e2e/inspect.js'), '--inline', snippet], {
        cwd: ROOT,
        env: { ...process.env, NODE_PATH: 'C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules' },
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    const out = (r.stdout || '').trim();
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// 汇总 4 个 tab（各 tab 元素重叠，取各值最大计数即可反映"是否在用"）
const radii = {}, fonts = {};
let scanned = 0, failed = [];
for (const t of TABS) {
    const d = scanTab(t);
    if (!d) { failed.push(t); continue; }
    scanned++;
    for (const k in d.radii) {
        if (!radii[k]) radii[k] = { count: 0, sample: [] };
        radii[k].count += d.radii[k].count;
        d.radii[k].sample.forEach(function (s) { if (radii[k].sample.length < 6 && radii[k].sample.indexOf(s) < 0) radii[k].sample.push(s); });
    }
    for (const k in d.fonts) fonts[k] = (fonts[k] || 0) + d.fonts[k];
}

if (!scanned) { console.error('✗ 设计扫描失败（4 个 tab 都没拿到数据）—— 检查 e2e/inspect.js 能否单独运行'); process.exit(1); }

const driftR = [], driftF = [];
for (const k in radii) if (!(k in SPEC.radius) && !(k in SPEC.radiusExtra)) driftR.push(k);
for (const k in fonts) if (!(k in SPEC.font) && !(k in SPEC.fontExtra)) driftF.push(k);

if (!QUIET) {
    console.log('== designcheck ==  扫描 ' + scanned + '/4 页' + (failed.length ? '（失败: ' + failed.join(',') + '）' : ''));
    console.log('\n【圆角】');
    Object.keys(radii).sort(function (a, b) { return radii[b].count - radii[a].count; }).forEach(function (k) {
        const inSpec = k in SPEC.radius, inExtra = k in SPEC.radiusExtra;
        const tag = inSpec ? '✅ ' + SPEC.radius[k] : (inExtra ? '·  ' + SPEC.radiusExtra[k] : '⚠️  规范外');
        console.log('  ' + tag.padEnd(22) + k.padEnd(8) + '×' + String(radii[k].count).padEnd(5) + radii[k].sample.slice(0, 3).join(', '));
    });
    console.log('\n【字体】');
    Object.keys(fonts).sort(function (a, b) { return fonts[b] - fonts[a]; }).forEach(function (k) {
        const inSpec = k in SPEC.font, inExtra = k in SPEC.fontExtra;
        const tag = inSpec ? '✅ ' + SPEC.font[k] : (inExtra ? '·  ' + SPEC.fontExtra[k] : '⚠️  规范外');
        console.log('  ' + tag.padEnd(22) + k.padEnd(20) + '×' + fonts[k]);
    });
}

if (driftR.length || driftF.length) {
    console.log('\n⚠ 发现规范外取值：');
    if (driftR.length) console.log('   圆角: ' + driftR.map(function (k) { return k + '×' + radii[k].count + '（' + radii[k].sample.slice(0, 2).join(', ') + '）'; }).join('  '));
    if (driftF.length) console.log('   字体: ' + driftF.join(', '));
    console.log('   → 要么改回规范档位，要么把该值加进 tools/designcheck.js 的 radiusExtra/fontExtra 并注明用途');
    process.exit(1);
}
console.log('\n✅ 全部符合规范表');
