#!/usr/bin/env node
/**
 * tools/modalwidth.js — 弹窗内联宽度锁定体检（★2026-09-18 新增）
 *
 * 为什么需要它（同一个坑踩了两次）：
 *   `.modal-backdrop-animate` 的 `display:grid + place-items:center` **覆盖了**
 *   `.confirm-modal` 的 flex → 弹窗宽度变成按内容 max-content 自适应，
 *   所以**只写 `max-width` 不写 `width` 的弹窗会随内容/字体/设备漂移**。
 *   · v1.2.1.6：绑定账号弹窗切「其他 WebDAV」实测 340px ↔ 276.6px（用户报障）
 *   · v1.2.1.7：肉眼 grep 又扫出 10 处同类隐患（选择日期时间/难度/年月/确认/
 *     支持作者/同步状态/更新日志…）
 *   → 与其每次手工 grep，不如固化成体检项，随 checkall 一起跑。
 *
 * 判定规则（对每个含 `confirm-modal-content` 的标签）：
 *   ① 内联 style 出现 `max-width: N` ⇒ 必须同时有 `width:`（**非** max-width）
 *   ② 有 `width: calc(100vw - N)` ⇒ 必须同时有 `box-sizing: border-box`
 *      （否则 padding 会把这 100vw 撑破，弹窗溢出屏幕）
 *
 * 用法：
 *   node tools/modalwidth.js            # 体检并打印报告（有偏离 → 退出码 1）
 *   node tools/modalwidth.js --quiet    # 只打印偏离项
 *   node tools/modalwidth.js --list     # 列出全部弹窗容器及其宽度写法
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUIET = process.argv.includes('--quiet');
const LIST = process.argv.includes('--list');

const FILES = ['www/index.html', 'www/app-core.js', 'www/app-data.js', 'www/app-sync.js', 'www/app-init.js'];

// 一眼看出这是哪个弹窗：取同标签内的 id，其次取其后的 title 文案
function describe(tag, src, tagEnd) {
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    let after = src.slice(tagEnd, tagEnd + 260);
    const title = (after.match(/>([^<>{}]{2,28})</) || [])[1];
    return (id ? '#' + id : '') + (title ? (id ? ' · ' : '') + title.trim() : '') || '(无标识)';
}

let pass = 0, fail = 0;
const rows = [], bad = [];

for (const rel of FILES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const re = /<[^>]*confirm-modal-content[^>]*>/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const tag = m[0];
        const style = (tag.match(/style="([^"]*)"/) || [])[1] || '';
        const hasMaxW = /max-width\s*:/.test(style);
        const hasWidth = /(^|;)\s*width\s*:/.test(style);
        const hasCalc = /width\s*:\s*calc\(100vw/.test(style);
        const hasBox = /box-sizing\s*:\s*border-box/.test(style);
        const line = src.slice(0, m.index).split('\n').length;
        const why = [];
        if (hasMaxW && !hasWidth) why.push('只写了 max-width 没有显式 width（grid 自适应用下宽度不确定）');
        if (hasCalc && !hasBox) why.push('width: calc(100vw - N) 缺 box-sizing: border-box（padding 会撑破）');
        const rec = { rel, line, name: describe(tag, src, m.index + tag.length), style, why };
        rows.push(rec);
        if (why.length) { fail++; bad.push(rec); } else pass++;
    }
}

if (LIST) {
    for (const r of rows) console.log(`  ${r.rel}:${r.line}  ${r.name}\n      ${r.style || '(无内联 style)'}`);
    console.log('');
}

if (bad.length) {
    console.log('⚠ 弹窗宽度写法偏离（' + bad.length + ' 处）：');
    for (const r of bad) {
        console.log(`  ${r.rel}:${r.line}  ${r.name}`);
        console.log(`      写法: ${r.style || '(无内联 style)'}`);
        for (const w of r.why) console.log(`      → ${w}`);
    }
    console.log('');
    console.log('  修法：加 `width:calc(100vw - 44px);box-sizing:border-box;`（照抄导出弹窗那套）');
} else if (!QUIET) {
    console.log('✅ 弹窗宽度写法全部合规（共 ' + pass + ' 个弹窗容器：凡有明确宽度意图者均已锁定 width）');
}

console.log(`===== 内联弹窗宽度: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
