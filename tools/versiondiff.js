#!/usr/bin/env node
/**
 * tools/versiondiff.js — 「已发布版 vs 当前工作区」改动清单（★2026-09-20 新增）
 *
 * 为什么需要它：
 *   v1.2.2.5 里**夹带了上一批未发的新增**（用户点名的 A+B：列表视图「完成 / 延期」），
 *   但写更新日志时把它当成「上一批已报告过」→ **漏写了一条用户可见的新功能**。
 *   根因：写文案那一刻没有一份**机械生成的、完整的**「本版到底改了什么」清单，
 *   全靠记忆对照 —— 记忆会漏，diff 不会。
 *
 *   本工具把「已发布版（GH 副本 = 上一次 push 的状态）vs 当前工作区」的差异按
 *   「应用代码 / 原生构建 / 测试工具 / 文档」四类列出来，作为写更新日志的核对清单。
 *   ★ 对照范围**严格对齐 `tools/ghsync.js` 的同步清单**（那才是「已发布版」的准确边界），
 *     否则会把构建产物、行尾差异这类噪声一起列出来（实测会多出 60+ 条无用项）。
 *
 * 用法：
 *   node tools/versiondiff.js            # 完整清单（文件 + 行数 + 关键新增行提示）
 *   node tools/versiondiff.js --brief    # 只列文件级清单（ship.js prepare 调用这个）
 *   node tools/versiondiff.js --strict   # 有差异时退出码 1（用于「发布后应干净」校验）
 *   node tools/versiondiff.js --notes    # 同时把清单留档到 tools/notes/<当前版本>-diff.txt（发版留档，事后可回溯「当时清单 vs 当时文案」）
 *
 * 退出码：0 = 已列出；1 = --strict 且有差异
 *
 * ★ 它只是**核对辅助**，不是自动门禁 —— 「这条改动要不要写进更新日志」仍需人来判断，
 *   但至少不会再有「整块改动压根没进清单」这种漏。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');            // hiking-app3
const PROJ = path.resolve(ROOT, '..');                 // 项目根
const GH = path.join(PROJ, 'backups/github-同步目录/xixi-hiking');

const BRIEF = process.argv.includes('--brief');
const STRICT = process.argv.includes('--strict');
const NOTES = process.argv.includes('--notes');

// ---- 同步清单：**必须与 tools/ghsync.js 保持一致**（那里是唯一权威）----
const WWW_FILES = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'share-bg.jpg', 'sw.js'];
const ROOT_FILES = ['README.md', 'CHANGELOG.md', 'prev-snapshot.js', 'bump.js', 'test.js', 'test-ui.js',
    '_test_p0p3.js', '_test_batch3.js'];
const ANDROID_FILES = ['android/app/build.gradle',
    'android/app/src/main/java/com/xixi/hiking/MainActivity.java',
    'android/app/src/main/java/com/xixi/hiking/ResGuard.java',
    'android/app/src/main/AndroidManifest.xml'];
const DIRS = [
    { src: 'tools', dst: 'tools', ok: (f) => f.endsWith('.js') || f.endsWith('.py') },
    { src: 'e2e', dst: 'e2e', ok: (f) => f.endsWith('.js') },
    { src: 'docs', dst: 'docs', ok: (f) => f.endsWith('.md') },
];
// 路径不同的双端文档
const MAP = [
    ['PROJECT_STATUS.md', path.join(PROJ, 'PROJECT_STATUS.md'), path.join(GH, 'docs/PROJECT_STATUS.md')],
    ['给新模型的提示词.md', path.join(PROJ, '给新模型的提示词.md'), path.join(GH, 'docs/给新模型的提示词.md')],
];
// 每次发版新生成的文案存档，不参与对照
const IGNORE = [/^tools\/notes\//];

function groupOf(rel) {
    if (rel.startsWith('www/')) return 'app';
    if (rel.startsWith('android/')) return 'native';
    if (rel === 'test.js' || rel === 'test-ui.js' || rel === '_test_p0p3.js' || rel === '_test_batch3.js'
        || rel === 'bump.js' || rel === 'prev-snapshot.js'
        || rel.startsWith('e2e/') || rel.startsWith('tools/')) return 'tool';
    return 'doc';
}

// ---- 组装对照清单：[显示名, 主工程路径, 副本路径] ----
function walkList(baseRel, ok, side, out) {
    const abs = path.join(side, baseRel);
    if (!fs.existsSync(abs)) return out;
    const rec = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            const r = path.relative(side, p).replace(/\\/g, '/');
            if (e.isDirectory()) { rec(p); continue; }
            if (!ok || ok(e.name)) out.push(r);
        }
    };
    rec(abs);
    return out;
}
const PAIRS = [];   // [rel显示名, 主工程绝对路径, 副本绝对路径]
for (const f of WWW_FILES) PAIRS.push(['www/' + f, path.join(ROOT, 'www', f), path.join(GH, 'www', f)]);
for (const f of ROOT_FILES) PAIRS.push([f, path.join(ROOT, f), path.join(GH, f)]);
for (const f of ANDROID_FILES) PAIRS.push([f, path.join(ROOT, f), path.join(GH, f)]);
for (const d of DIRS) {
    for (const r of walkList(d.src, d.ok, ROOT, [])) {
        const sub = r.slice(d.src.length + 1);
        PAIRS.push([r, path.join(ROOT, r), path.join(GH, d.dst, sub)]);
    }
}
// www/assets 全量
for (const r of walkList('www/assets', null, ROOT, [])) {
    PAIRS.push([r, path.join(ROOT, r), path.join(GH, r)]);
}
for (const [name, a, b] of MAP) PAIRS.push([name, a, b]);

// ---- 比较（忽略纯行尾差异，否则 CRLF/LF 会造出大量假差异）----
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
function compare(a, b) {
    if (!fs.existsSync(a) && !fs.existsSync(b)) return null;
    if (!fs.existsSync(a)) return { st: 'D' };                       // 副本有、主工程无
    if (!fs.existsSync(b)) return { st: 'A' };                       // 主工程新增
    const ba = fs.readFileSync(a), bb = fs.readFileSync(b);
    if (Buffer.compare(ba, bb) === 0) return null;
    // a = 主工程（新） / b = 副本（已发布 = 旧），add/del 以「主工程相对副本」为准
    const A = norm(ba.toString('utf8')).split('\n'), B = norm(bb.toString('utf8')).split('\n');
    if (A.join('\n') === B.join('\n')) return { st: '~' };           // 仅行尾差异
    const cNew = new Map(), cOld = new Map();
    A.forEach((l) => cNew.set(l, (cNew.get(l) || 0) + 1));
    B.forEach((l) => cOld.set(l, (cOld.get(l) || 0) + 1));
    let add = 0, del = 0;
    for (const [l, n] of cNew) add += Math.max(0, n - (cOld.get(l) || 0));
    for (const [l, n] of cOld) del += Math.max(0, n - (cNew.get(l) || 0));
    // 新增行提示：只挑「像是有意义的改动」的行（含中文 / 函数 / 属性）
    const added = [];
    for (const l of A) {
        const t = l.trim();
        if (!t || added.includes(t)) continue;
        if (!/[\u4e00-\u9fa5]|function |data-|id="/.test(t)) continue;
        if ((cNew.get(l) || 0) <= (cOld.get(l) || 0)) continue;      // 不是净增
        added.push(t.length > 100 ? t.slice(0, 100) + '…' : t);
        if (added.length >= 3) break;
    }
    return { st: 'M', add, del, added };
}

// ---- 输出 ----
function ver(file) {
    try { return (fs.readFileSync(file, 'utf8').match(/APP_VERSION = '([\d.]+)'/) || [])[1] || '?'; }
    catch (e) { return '?'; }
}
const groups = { app: [], native: [], tool: [], doc: [] };
for (const [name, a, b] of PAIRS) {
    const d = compare(a, b);
    if (d && d.st !== '~') groups[groupOf(name)].push(Object.assign({ rel: name }, d));
}

const TITLES = {
    app: '应用代码 www/  ← ★每一项都要能在更新日志里找到对应描述',
    native: '原生与构建 android/（影响 App 行为，需写【内部】或用户可见条目）',
    tool: '测试与工具链（通常写【内部】或不必写）',
    doc: '文档（发布时由 docrelease 同步，一般不必逐条写）',
};
console.log('== versiondiff ==  已发布版 v' + ver(path.join(GH, 'www/app-core.js'))
    + '  →  当前工作区 v' + ver(path.join(ROOT, 'www/app-core.js')));
console.log('   对照基准：backups/github-同步目录/xixi-hiking（= 上一次 push 的状态）');
console.log('   对照范围：与 ghsync.js 的同步清单一致（构建产物/行尾差异不参与）\n');

let total = 0, appChanged = 0;
const out = [];
for (const key of ['app', 'native', 'tool', 'doc']) {
    const list = groups[key].sort((x, y) => x.rel.localeCompare(y.rel));
    if (!list.length) continue;
    out.push('【' + TITLES[key] + '】');
    for (const it of list) {
        total++;
        if (key === 'app') appChanged++;
        out.push('  ' + it.st + '  ' + it.rel + (it.st === 'M' ? '  +' + it.add + ' / -' + it.del : ''));
        if (!BRIEF && it.added) for (const h of it.added) out.push('        · ' + h);
    }
    out.push('');
}

if (!total) {
    console.log('✅ 与已发布版完全一致（无待发改动）');
    process.exit(0);
}
console.log(out.join('\n').replace(/\n+$/, ''));
console.log('\n' + '='.repeat(64));
console.log('共 ' + total + ' 个文件有差异，其中**应用代码 www/ ' + appChanged + ' 个**');
if (NOTES) {
    // ★2026-09-20 留档：把本次清单存成 tools/notes/<当前版本>-diff.txt
    //   用途：事后可对照「当时的清单」与「当时的文案」，查出是否有整条漏写（v1.2.2.5 漏写 A+B 就是这类）。
    const diffNote = path.join(__dirname, 'notes', 'v' + ver(path.join(ROOT, 'www/app-core.js')) + '-diff.txt');
    const head = ['本次发版改动清单（tools/versiondiff.js --notes 自动生成），写更新日志时需逐行核对',
        '甲方：已发布版 v' + ver(path.join(GH, 'www/app-core.js')) + '  乙方：当前工作区 v' + ver(path.join(ROOT, 'www/app-core.js')),
        '清单来源时间：' + new Date().toISOString().slice(0, 16).replace('T', ' '),
        '★规则：下面每一行都要能对应到文案里的一条；对不上就要么补文案、要么在【内部】里说明为何不用写。', ''];
    fs.writeFileSync(diffNote, head.concat(out.map((l) => l.replace(/\s+$/, ''))).join('\n') + '\n', 'utf8');
    console.log('清单已留档：' + path.relative(PROJ, diffNote).replace(/\\/g, '/'));
}
if (appChanged) {
    console.log('⚠ 写更新日志前请逐项核对下面两问：');
    console.log('   ① www/ 每个改动文件，在本版文案里都有对应条目吗？');
    console.log('   ② 上一版之后遗留、跨版未发的改动，也一并算进本版了吗？');
}
if (STRICT && total) process.exit(1);
