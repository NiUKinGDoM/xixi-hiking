#!/usr/bin/env node
/**
 * tools/designcheck.js — 设计一致性体检（★2026-09-14 新增；2026-09-16 五项优化①扩维）
 *
 * 为什么需要它：本项目 Tailwind 是**冻结快照**、自定义 CSS 又各自为政，
 * 「圆角/字体漂移」靠肉眼扫代码根本扫不出来 —— 2026-09-11 那次
 * 「统计卡 14px / ov-mini 13px 悄悄偏离规范」就是这么漏掉的，直到
 * 用户反馈「设计不统一」才发现，还得回头翻 git 才想起是 9/3 自己调的。
 * 2026-09-16 又漏了同类问题：`.settings-group` 玻璃配方写成 saturate(120%)、
 * `.switch-slider` 写成 blur(4px)——同一个「统一玻璃配方」的活儿只统一了一半。
 * → 所以本次把**玻璃配方**和**层级**也纳入体检，避免第三次手漏。
 *
 * 本工具做法：用真实浏览器（e2e/inspect.js）实测**每个可见元素**的
 * computed 圆角 / 字体 / 玻璃配方 / 层级，与下面的「项目设计规范表」比对。
 * 扫描逻辑在 tools/snippets/design-scan.js（单一事实来源，本文件只负责切 tab 与比对）。
 *
 * 用法：
 *   node tools/designcheck.js           # 体检并打印报告（圆角/字体/玻璃偏离 → 退出码 1）
 *   node tools/designcheck.js --quiet   # 只打印偏离项
 *
 * 规范表维护：改设计规范时**先改这里**，再改 CSS —— 让表始终是唯一事实来源。
 */
const fs = require('fs');
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
    // 玻璃配方：全站统一 blur(2px) saturate(150%)（★项目铁律；禁光泽带/角部反光/内光晕）
    glass: { 'blur(2px) saturate(1.5)': '统一玻璃配方' },
    // 层级规范（实测到的值应在此表内；表外值只警告不失败，因为运行时元素可能临时出现）
    zIndex: {
        '-1': '背景光斑 aurora-bg', '1': '容器 container', '11': '行内输入 edit-input',
        '40': '底部导航', '45': '全局搜索栏', '50': '顶栏', '90': '记录详情弹窗',
        '100': '确认弹窗 / 遮罩', '101': '弹窗内输入聚焦', '260': '年度回顾全屏页', '300': 'toast（运行时显示）',
    },
};

const TABS = ['overview', 'records', 'plans', 'settings'];
// 扫描逻辑来自片段文件（改扫描维度只改它）
const SCAN_SNIPPET = fs.readFileSync(path.join(ROOT, 'tools/snippets/design-scan.js'), 'utf8');

function scanTab(tab) {
    const snippet = "if (typeof switchTab === 'function') { try { switchTab('" + tab + "'); } catch (e) {} }\n" + SCAN_SNIPPET;
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
const radii = {}, fonts = {}, glass = {}, zIndex = {};
let scanned = 0, failed = [];
function mergeInto(target, d, extra) {
    for (const k in d) {
        if (!target[k]) target[k] = { count: 0, sample: [] };
        target[k].count += d[k].count;
        d[k].sample.forEach(function (s) {
            if (target[k].sample.length < 6 && target[k].sample.indexOf(s) < 0) target[k].sample.push(s);
        });
    }
}
for (const t of TABS) {
    const d = scanTab(t);
    if (!d) { failed.push(t); continue; }
    scanned++;
    mergeInto(radii, d.radii || {});
    mergeInto(glass, d.glass || {});
    mergeInto(zIndex, d.zIndex || {});
    for (const k in (d.fonts || {})) fonts[k] = (fonts[k] || 0) + d.fonts[k];
}

if (!scanned) { console.error('✗ 设计扫描失败（4 个 tab 都没拿到数据）—— 检查 e2e/inspect.js 能否单独运行'); process.exit(1); }

const driftR = [], driftF = [], driftG = [], warnZ = [];
for (const k in radii) if (!(k in SPEC.radius) && !(k in SPEC.radiusExtra)) driftR.push(k);
for (const k in fonts) if (!(k in SPEC.font) && !(k in SPEC.fontExtra)) driftF.push(k);
for (const k in glass) if (!(k in SPEC.glass)) driftG.push(k);
for (const k in zIndex) if (!(k in SPEC.zIndex)) warnZ.push(k);

const byCount = (m) => (a, b) => m[b].count - m[a].count;

if (!QUIET) {
    console.log('== designcheck ==  扫描 ' + scanned + '/4 页' + (failed.length ? '（失败: ' + failed.join(',') + '）' : ''));
    console.log('\n【圆角】');
    Object.keys(radii).sort(byCount(radii)).forEach(function (k) {
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
    console.log('\n【玻璃配方】');
    Object.keys(glass).sort(byCount(glass)).forEach(function (k) {
        const tag = k in SPEC.glass ? '✅ ' + SPEC.glass[k] : '⚠️  规范外';
        console.log('  ' + tag.padEnd(22) + k.padEnd(30) + '×' + String(glass[k].count).padEnd(5) + glass[k].sample.slice(0, 3).join(', '));
    });
    console.log('\n【层级】');
    Object.keys(zIndex).sort(function (a, b) { return (Number(a) || 0) - (Number(b) || 0); }).forEach(function (k) {
        const tag = k in SPEC.zIndex ? '✅ ' + SPEC.zIndex[k] : '⚠️  表外';
        console.log('  ' + tag.padEnd(22) + ('z=' + k).padEnd(10) + '×' + String(zIndex[k].count).padEnd(5) + zIndex[k].sample.slice(0, 3).join(', '));
    });
}

const hardDrift = driftR.length + driftF.length + driftG.length;
if (hardDrift) {
    console.log('\n⚠ 发现规范外取值（圆角/字体/玻璃 = 硬性偏离）：');
    if (driftR.length) console.log('   圆角: ' + driftR.map(function (k) { return k + '×' + radii[k].count + '（' + radii[k].sample.slice(0, 2).join(', ') + '）'; }).join('  '));
    if (driftF.length) console.log('   字体: ' + driftF.join(', '));
    if (driftG.length) console.log('   玻璃: ' + driftG.map(function (k) { return k + '×' + glass[k].count + '（' + glass[k].sample.slice(0, 2).join(', ') + '）'; }).join('  '));
    console.log('   → 要么改回规范档位，要么把该值加进 tools/designcheck.js 的 SPEC 并注明用途');
}
if (warnZ.length) {
    console.log('\n· 层级表外值（警告，非失败）：' + warnZ.map(function (k) { return 'z=' + k + '×' + zIndex[k].count + '（' + zIndex[k].sample.slice(0, 2).join(', ') + '）'; }).join('  '));
    console.log('   → 若是新增的固定层级，请补进 SPEC.zIndex');
}
if (hardDrift) process.exit(1);
console.log('\n✅ 全部符合规范表（圆角 / 字体 / 玻璃配方' + (warnZ.length ? '；层级见表外警告' : ' / 层级') + '）');
