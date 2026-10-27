#!/usr/bin/env node
/**
 * tools/docfresh.js —— 文档新鲜度守卫（★2026-10-27 建，治「每次发版都漏改几份文档」）
 *
 * 核心思路：**不维护"要改哪些文档"的清单**（清单在脑子里必漏），
 *           改为扫描所有文档的「当前状态」表述，与代码里的唯一真值比对。
 *
 * 真值来源：APP_VERSION（app-core.js）/ versionCode（build.gradle）/
 *           CACHE_NAME（sw.js）/ script+link 清单（index.html）/ 各文件行数。
 *
 * 用法：node tools/docfresh.js          # 只检查（漂移则 exit 1，可进 checkall）
 *       node tools/docfresh.js --fix    # 自动修（保守）
 *
 * ★★ 关键设计：**按行判断，历史行一律跳过**
 *   文档里到处都是历史陈述（"app.css 6300 行 → 拆成 3 个文件"、"当时 CACHE_NAME 是 v44"、
 *   "曾经写着 v1.2.2.10 严重过期"）。把这些改成现值 = 把历史改成错的。
 *   判据：该行含 → / 曾经 / 原来 / 旧 / 之前 / 历史 / 拆 / 时 / 事故 等标记 → 视为历史行，不动。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const FIX = process.argv.includes('--fix');

const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };

// ---------- 真值 ----------
const coreSrc = read(path.join(ROOT, 'www', 'app-core.js'));
const VER = (coreSrc.match(/APP_VERSION\s*=\s*['"]([\d.]+)['"]/) || [])[1];
const VC = (read(path.join(ROOT, 'android', 'app', 'build.gradle')).match(/versionCode\s+(\d+)/) || [])[1];
const SW = (read(path.join(ROOT, 'www', 'sw.js')).match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/) || [])[1];

const html = read(path.join(ROOT, 'www', 'index.html'));
const JS_LIST = [], CSS_LIST = [];
let m;
const reJs = /<script[^>]+src=["']([^"']*app-[^"']*\.js)["']/g;
while ((m = reJs.exec(html))) JS_LIST.push(path.basename(m[1]));
const reCss = /<link[^>]+href=["']([^"']*app[^"']*\.css)["']/g;
while ((m = reCss.exec(html))) CSS_LIST.push(path.basename(m[1]));

const LINE_OF = {};
['index.html', 'app.css', 'app-modal.css', 'app-form.css', 'app-core.js', 'app-data.js',
 'app-data-detail.js', 'app-data-lightbox.js', 'app-data-heatmap.js', 'app-data-plans.js',
 'app-data-plan-detail.js', 'app-sync.js', 'app-init.js', 'sw.js'].forEach(f => {
    const s = read(path.join(ROOT, 'www', f));
    if (s) LINE_OF[f] = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
});

if (!VER || !VC || !SW) {
    console.error('❌ 取不到真值（APP_VERSION / versionCode / CACHE_NAME）');
    process.exit(2);
}

// ---------- 扫描范围 ----------
const SKIP_DIR = ['node_modules', 'backups', '.git', 'android-sdk', 'gradle-8.2.1',
    'jdk-21.0.12', 'build', 'dist', 'android'];
const HISTORY_FILE = [
    /memory[\\\/]\d{4}-\d{2}-\d{2}\.md$/,
    /版本变更记录-存档\.md$/,
    /tools[\\\/]notes[\\\/].*-(doc|release|diff)\.(txt|md)$/,
    /tools[\\\/]notes[\\\/](converge-|dlstat-history|code-map\.md)/,
];
const isHistoryFile = p => HISTORY_FILE.some(re => re.test(p));

const targets = [];
(function walk(dir, d) {
    if (d > 4) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
        if (SKIP_DIR.includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p, d + 1); continue; }
        if (/\.(md|html)$/i.test(e.name)) targets.push(p);
    }
})(PROJ, 0);

// ---------- 历史行判据 ----------
const HIST_MARK = /→|->|曾经|原来|原先|旧|之前|以前|历史|拆|已删|事故|过期|当时|时是|当时是|改前|改后/;

// ---------- 规则（都作用于「单行」）----------
const RULES = [
    {
        id: '当前版本号',
        // 仅这些前缀后的版本号视为「当前状态」
        re: /(当前版本\s*|最后更新[：:]\s*\d{4}-\d{2}-\d{2}（|★\*\*本版\s*|真值[：:]\s*)(v?\d+\.\d+\.\d+\.\d+)(（vc\d+）|\s*\/\s*vc\d+)/g,
        fix: (full, pre, oldV, post) => pre + (oldV.startsWith('v') ? 'v' : '') + VER + '（vc' + VC + '）',
    },
    {
        id: 'CACHE_NAME 现值',
        // 只在明确是「当前/此刻的 sw」语境下改（同行须含"当前"或"真值"或行首列举）
        re: /CACHE_NAME\s*=\s*['"]?xixi-hiking-v(\d+)['"]?/g,
        requireCtx: /当前|真值|现为/,
        fix: (full) => full.replace(/v\d+/, SW.replace('xixi-hiking-', '')),
    },
    {
        id: 'JS 文件数',
        re: /(\d+)\s*个\s*JS/g,
        fix: (full, n) => (String(n) === String(JS_LIST.length) ? full : JS_LIST.length + ' 个 JS'),
    },
    {
        id: 'CSS 文件数',
        re: /(\d+)\s*个\s*CSS/g,
        fix: (full, n) => (String(n) === String(CSS_LIST.length) ? full : CSS_LIST.length + ' 个 CSS'),
    },
    {
        id: '文件行数',
        re: /\b(app[a-z-]*\.js|app[a-z-]*\.css|index\.html|sw\.js)\s+(\d{3,5})\s*行/g,
        fix: (full, f, n) => {
            const real = LINE_OF[f];
            if (!real || String(real) === String(n)) return full;
            return f + ' ' + real + ' 行';
        },
    },
];

// ---------- 执行 ----------
const drift = [], hist = [];
let fixed = 0;

for (const p of targets) {
    const src = read(p);
    if (!src) continue;
    const rel = path.relative(PROJ, p);
    const histFile = isHistoryFile(p);
    const outLines = [];
    const hits = [];

    for (const line of src.split('\n')) {
        // 历史行 / 历史文件：只检测、不改
        if (HIST_MARK.test(line)) {
            for (const rule of RULES) {
                const re = new RegExp(rule.re.source, rule.re.flags);
                let mm;
                while ((mm = re.exec(line))) {
                    if (rule.requireCtx && !rule.requireCtx.test(line)) continue;
                    const rep = rule.fix.apply(null, mm);
                    if (rep !== mm[0]) hits.push({ rule: rule.id, line: line.trim() });
                }
            }
            outLines.push(line);
            continue;
        }
        let nl = line;
        for (const rule of RULES) {
            if (rule.requireCtx && !rule.requireCtx.test(nl)) continue;
            nl = nl.replace(new RegExp(rule.re.source, rule.re.flags), (...args) => {
                const rep = rule.fix.apply(null, args);
                if (rep !== args[0]) hits.push({ rule: rule.id, from: args[0].trim(), to: rep.trim() });
                return rep;
            });
        }
        outLines.push(nl);
    }

    if (!hits.length) continue;
    if (histFile) { drift.push({ file: rel, histHits: hits, auto: false }); continue; }

    const newSrc = outLines.join('\n');
    if (newSrc !== src) {
        drift.push({ file: rel, fixedHits: hits.filter(h => h.to), auto: true });
        if (FIX) { try { fs.writeFileSync(p, newSrc, 'utf8'); fixed++; } catch (e) { } }
    } else {
        // 只命中历史行 → 只提示
        hist.push({ file: rel, hits });
    }
}

// ---------- 输出 ----------
const fixable = drift.filter(d => d.auto);
const manual = drift.filter(d => !d.auto);

console.log('== docfresh ==  文档新鲜度检查');
console.log('真值：v' + VER + ' / vc' + VC + ' / ' + SW + ' / ' + JS_LIST.length + ' JS / ' + CSS_LIST.length + ' CSS');
console.log('扫描：' + targets.length + ' 份文档\n');

if (!fixable.length && !manual.length) {
    console.log('✅ 所有「当前状态」表述均与代码一致');
} else {
    if (fixable.length) {
        console.log((FIX ? '已修正 ' : '可自动修正 ') + fixable.length + ' 份：');
        fixable.forEach(d => {
            console.log('  · ' + d.file);
            (d.fixedHits || []).slice(0, 4).forEach(h => console.log('      [' + h.rule + '] ' + h.from + '  →  ' + h.to));
        });
    }
    if (manual.length) {
        console.log('\n需人工判断 ' + manual.length + ' 份（历史类文件，不自动改）：');
        manual.forEach(d => console.log('  · ' + d.file + '（' + d.histHits.length + ' 处）'));
    }
    if (!FIX && fixable.length) console.log('\n修复：node tools/docfresh.js --fix');
}

if (hist.length) {
    console.log('\n⏭ 仅历史行命中（正确保持原样，未计入漂移）：' + hist.map(d => d.file).join(', '));
}

// 只检查模式下：有可自动修的漂移 → exit 1（CI/checkall 用）
const failCount = !FIX && fixable.length ? 1 : 0;
console.log('\n结果: ' + (failCount ? 0 : 1) + ' 通过 / ' + failCount + ' 失败');
process.exit(failCount ? 1 : 0);
