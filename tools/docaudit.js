#!/usr/bin/env node
/**
 * tools/docaudit.js — 文档体检（2026-09-10 建）
 *
 * 检查：A 代码块配对 / B 表格列数一致 / C 标题层级跳跃 / D 行尾空白
 *      E 连续空行 / F 超长行 / G 乱码字符 / H 版本号与 APP_VERSION 一致性
 *      I 反引号路径存在性 / J 双端（主工程 vs GH 副本）一致性
 *
 * 用法：node tools/docaudit.js [--json]
 * ★定位：格式类为确定性结论；版本号/路径为信号（历史段落可能合法地提到旧版本）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');          // hiking-app3
const PROJ = path.join(ROOT, '..');               // 项目根
const GH = path.join(PROJ, 'backups', 'github-同步目录', 'xixi-hiking');
const JSON_OUT = process.argv.indexOf('--json') >= 0;

const DOCS = [
    { name: 'PROJECT_STATUS.md', file: path.join(PROJ, 'PROJECT_STATUS.md') },
    { name: 'memory/MEMORY.md', file: path.join(PROJ, '.workbuddy', 'memory', 'MEMORY.md') },
    { name: 'README.md', file: path.join(ROOT, 'README.md') },
    { name: 'CHANGELOG.md', file: path.join(ROOT, 'CHANGELOG.md') },
    { name: 'docs/DEVICE-CHECKLIST.md', file: path.join(ROOT, 'docs', 'DEVICE-CHECKLIST.md') },
];
// 当日日志也查格式（不查版本号）
const LOGS = [];
try {
    fs.readdirSync(path.join(PROJ, '.workbuddy', 'memory'))
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort().slice(-2)
        .forEach((f) => LOGS.push({ name: 'memory/' + f, file: path.join(PROJ, '.workbuddy', 'memory', f), log: true }));
} catch (e) {}

const APP_VER = (fs.readFileSync(path.join(ROOT, 'www', 'app-core.js'), 'utf8').match(/APP_VERSION = '([\d.]+)'/) || [])[1];
const report = [];
const add = (doc, kind, items) => { if (items.length) report.push({ doc, kind, items }); };

DOCS.concat(LOGS).forEach((d) => {
    if (!fs.existsSync(d.file)) { add(d.name, '文件缺失', ['未找到 ' + d.file]); return; }
    const raw = fs.readFileSync(d.file, 'utf8');
    const lines = raw.split('\n');

    // A. 代码块配对
    const fences = lines.filter((l) => /^\s*```/.test(l)).length;
    if (fences % 2 !== 0) add(d.name, 'A 代码块未配对', ['``` 共 ' + fences + ' 个（应为偶数）']);

    // B. 表格列数一致 + C. 标题层级跳跃
    let inCode = false, tableRows = [], lastLevel = 0;
    const tableBad = [], headingJump = [];
    lines.forEach((ln, i) => {
        if (/^\s*```/.test(ln)) { inCode = !inCode; return; }
        if (inCode) return;
        if (/^\s*\|.*\|\s*$/.test(ln)) {
            const cols = ln.trim().replace(/^\||\|$/g, '').split('|').length;
            tableRows.push({ i: i + 1, cols, ln });
        } else {
            if (tableRows.length > 2) {
                const uniq = [...new Set(tableRows.map((r) => r.cols))];
                if (uniq.length > 1) tableBad.push('表格（起 L' + tableRows[0].i + '）列数不一致: ' + tableRows.map((r) => r.cols).join('/'));
            }
            tableRows = [];
        }
        const h = /^(#{1,6})\s/.exec(ln);
        if (h) {
            const lv = h[1].length;
            if (lastLevel && lv > lastLevel + 1) headingJump.push('L' + (i + 1) + ' ' + '#'.repeat(lv) + '（上一级为 ' + '#'.repeat(lastLevel) + '）');
            lastLevel = lv;
        }
    });
    add(d.name, 'B 表格列数不一致', tableBad);
    add(d.name, 'C 标题层级跳跃', headingJump);

    // D. 行尾空白 / E. 连续空行 / F. 超长行 / G. 乱码
    const trailing = [], blanks = [], longLines = [], mojibake = [];
    let blankRun = 0, inCode2 = false;
    lines.forEach((ln, i) => {
        if (/^\s*```/.test(ln)) inCode2 = !inCode2;
        // 排除 Markdown 硬换行（行尾恰好 2 个空格是有意语法）
        if (/[ \t]+$/.test(ln) && ln.trim() && !/ {2}$/.test(ln)) trailing.push('L' + (i + 1));
        if (ln.trim() === '') { blankRun++; if (blankRun === 3) blanks.push('L' + (i + 1)); } else blankRun = 0;
        if (!inCode2 && ln.length > 400) longLines.push('L' + (i + 1) + '（' + ln.length + ' 字符）');   // 版本历史条目/规范说明天然较长，仅提示
        if (/[\uFFFD]|鈽|锛|鐨|銆/.test(ln)) mojibake.push('L' + (i + 1) + ' ' + ln.slice(0, 60));
    });
    add(d.name, 'D 行尾空白', trailing.slice(0, 8));
    add(d.name, 'E 连续 3+ 空行', blanks.slice(0, 5));
    add(d.name, 'F 超长行(>400)', longLines.slice(0, 6));
    add(d.name, 'G 疑似乱码', mojibake.slice(0, 5));

    // H. 版本号一致性（跳过日志）
    if (!d.log) {
        const vers = [...new Set((raw.match(/v\d+\.\d+\.\d+\.\d+/g) || []))];
        const others = vers.filter((v) => v.slice(1) !== APP_VER);
        if (others.length) add(d.name, 'H 出现非当前版本号（信号）', ['当前 APP_VERSION=' + APP_VER + '；文中另有: ' + others.join(', ')]);
    }

    // I. 反引号内路径存在性（候选含 www/ 前缀与 GH 副本；"教训/错放/反面"所在行跳过）
    const missing = [];
    const seen = new Set();
    lines.forEach((ln) => {
        if (/教训|错放|反面|勿|禁止|别把/.test(ln)) return;   // 反面教材里的路径本就该"不存在"
        [...ln.matchAll(/`([^`\n]+)`/g)].forEach((m) => {
            const p = m[1].trim();
            if (!/^(www|tools|e2e|docs|android|assets|backups|\.workbuddy)[\w./\-]*\.\w+$/.test(p)) return;
            if (seen.has(p)) return;
            seen.add(p);
            const cand = [
                path.join(ROOT, p), path.join(PROJ, p),
                path.join(ROOT, 'www', p), path.join(GH, p), path.join(GH, 'www', p),
            ];
            if (!cand.some((c) => fs.existsSync(c))) missing.push(p);
        });
    });
    add(d.name, 'I 反引号路径不存在', missing.slice(0, 8));
});

// J. 双端一致性
const PAIRS = [
    ['README.md', path.join(ROOT, 'README.md'), path.join(GH, 'README.md')],
    ['CHANGELOG.md', path.join(ROOT, 'CHANGELOG.md'), path.join(GH, 'CHANGELOG.md')],
    ['docs/PROJECT_STATUS.md', path.join(PROJ, 'PROJECT_STATUS.md'), path.join(GH, 'docs', 'PROJECT_STATUS.md')],
    ['docs/DEVICE-CHECKLIST.md', path.join(ROOT, 'docs', 'DEVICE-CHECKLIST.md'), path.join(GH, 'docs', 'DEVICE-CHECKLIST.md')],
];
const dual = [];
PAIRS.forEach(([n, a, b]) => {
    if (!fs.existsSync(a) || !fs.existsSync(b)) { dual.push(n + ' 缺一侧（' + (fs.existsSync(a) ? '副本缺' : '主工程缺') + '）'); return; }
    if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) dual.push(n + ' 双端内容不一致');
});

if (JSON_OUT) {
    console.log(JSON.stringify({ appVersion: APP_VER, report, dual }, null, 1));
} else {
    console.log('== docaudit（文档体检）== 当前 APP_VERSION = ' + APP_VER + '\n');
    const docs = [...new Set(report.map((r) => r.doc))];
    if (!report.length) console.log('✅ 5 份文档格式检查全部通过');
    docs.forEach((doc) => {
        console.log('【' + doc + '】');
        report.filter((r) => r.doc === doc).forEach((r) => {
            console.log('  ⚠ ' + r.kind + ' → ' + r.items.length + ' 项');
            r.items.slice(0, 8).forEach((it) => console.log('      ' + it));
        });
    });
    console.log('\n【J 双端一致性】');
    if (dual.length) dual.forEach((x) => console.log('  ⚠ ' + x));
    else console.log('  ✅ 主工程与 GH 副本 4 组文档完全一致');
}
