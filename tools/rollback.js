#!/usr/bin/env node
/**
 * tools/rollback.js — 一键回退到历史回退点（★2026-09-14 新增）
 *
 * 背景：`prev-snapshot.js` 每次发版前会在 `backups/prev-<版本>/` 留一份源码快照
 *   （index.html + 4 个 app-*.js + assets + build.gradle + 原生文件 + share-bg.jpg）。
 *   但真出事要回退时，得手动逐个 cp 回来、还得自己记住哪些文件 —— 容易漏、也容易
 *   在慌乱中覆盖错东西。本工具把「看有哪些回退点 / 看差异 / 安全回滚」做成一条命令。
 *
 * 用法：
 *   node tools/rollback.js                     # 列出所有回退点 + 当前版本
 *   node tools/rollback.js 1.2.0.3             # 预览：该回退点相对当前有哪些差异
 *   node tools/rollback.js 1.2.0.3 --apply     # 执行回滚（先自动备份当前状态！）
 *
 * ★ 安全设计（这是危险操作，默认不动手）：
 *   ① 不加 --apply 只预览，绝不写文件
 *   ② 执行前先把「当前状态」整份备份到 backups/pre-rollback-<时间戳>/
 *   ③ 只覆盖回退点里存在的文件，不删除多余文件
 *   ④ 回滚后提示必须重新走发版流程（版本号不可复用，要 bump 新号）
 *
 * 退出码：0 成功；1 参数/环境问题
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const BK = path.join(PROJ, 'backups');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ver = args.find((a) => !a.startsWith('--'));

// 回退点目录：backups/prev-<版本>
function listPrev() {
    if (!fs.existsSync(BK)) return [];
    return fs.readdirSync(BK)
        .filter((d) => /^prev-[\d.]+$/.test(d))
        .map((d) => ({ name: d, ver: d.replace(/^prev-/, ''), dir: path.join(BK, d) }))
        .sort((a, b) => a.ver.localeCompare(b.ver, undefined, { numeric: true }));
}

const prevs = listPrev();

// 当前版本
const g = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const curVn = (g.match(/versionName\s+"([\d.]+)"/) || [])[1];

if (!ver) {
    console.log('== rollback ==  当前版本 v' + curVn + '\n');
    if (!prevs.length) { console.log('（backups/ 下没有 prev-<版本> 回退点）'); process.exit(1); }
    console.log('可用回退点（新 → 旧）：');
    prevs.slice().reverse().forEach((p) => {
        const files = fs.readdirSync(p.dir);
        const t = fs.statSync(p.dir).mtime.toLocaleString();
        console.log('  prev-' + p.ver.padEnd(12) + files.length + ' 个文件  ' + t);
    });
    console.log('\n预览：node tools/rollback.js <版本>      例：node tools/rollback.js ' + prevs[prevs.length - 1].ver);
    console.log('执行：node tools/rollback.js <版本> --apply   ⚠ 会覆盖当前源码（执行前自动备份）');
    process.exit(0);
}

const target = prevs.find((p) => p.ver === ver);
if (!target) {
    console.error('✗ 找不到回退点 prev-' + ver + '（用 node tools/rollback.js 看可用列表）');
    process.exit(1);
}

// 回退点内的文件 → 主工程内对应位置
const MAP = [
    ['index.html', 'www/index.html'],
    ['app-core.js', 'www/app-core.js'],
    ['app-data.js', 'www/app-data.js'],
    ['app-sync.js', 'www/app-sync.js'],
    ['app-init.js', 'www/app-init.js'],
    ['share-bg.jpg', 'www/share-bg.jpg'],
    ['build.gradle', 'android/app/build.gradle'],
    ['AndroidManifest.xml', 'android/app/src/main/AndroidManifest.xml'],
    ['MainActivity.java', 'android/app/src/main/java/com/xixi/hiking/MainActivity.java'],
];
const ASSETS = ['support-qr-wechat.jpg', 'support-qr-alipay.jpg', 'fonts/material-icons.woff2', 'vendor/tailwind4.1.13.js'];

const plan = [];
for (const [src, dst] of MAP) {
    const s = path.join(target.dir, src);
    if (fs.existsSync(s)) plan.push({ src: s, dst: path.join(ROOT, dst), label: dst });
}
for (const a of ASSETS) {
    const s = path.join(target.dir, 'assets', a);
    if (fs.existsSync(s)) plan.push({ src: s, dst: path.join(ROOT, 'www/assets', a), label: 'www/assets/' + a });
}

console.log('== rollback ==  回退点 prev-' + ver + '  →  当前 v' + curVn + '\n');
let diffCount = 0;
plan.forEach((p) => {
    const same = fs.existsSync(p.dst) && Buffer.compare(fs.readFileSync(p.src), fs.readFileSync(p.dst)) === 0;
    if (!same) diffCount++;
    console.log('  ' + (same ? '= 相同  ' : '≠ 有差异') + '  ' + p.label);
});
console.log('\n共 ' + plan.length + ' 个文件，' + diffCount + ' 个有差异');

if (!APPLY) {
    console.log('\n（预览模式，未改动任何文件）');
    console.log('确认要回滚请加 --apply：node tools/rollback.js ' + ver + ' --apply');
    process.exit(0);
}

// ---- 执行：先备份当前状态 ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeDir = path.join(BK, 'pre-rollback-' + stamp);
fs.mkdirSync(safeDir, { recursive: true });
let backed = 0;
plan.forEach((p) => {
    if (!fs.existsSync(p.dst)) return;
    const rel = path.relative(ROOT, p.dst);
    const out = path.join(safeDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(p.dst, out);
    backed++;
});
console.log('\n✅ 当前状态已备份 ' + backed + ' 个文件 → ' + path.relative(PROJ, safeDir));

// ---- 覆盖 ----
let done = 0;
plan.forEach((p) => {
    fs.mkdirSync(path.dirname(p.dst), { recursive: true });
    fs.copyFileSync(p.src, p.dst);
    done++;
});
console.log('✅ 已回滚 ' + done + ' 个文件到 prev-' + ver);

console.log('\n⚠ 回滚后必读：');
console.log('   1. 回滚点里的版本号是旧的 —— **已发布的版本号不可复用**，再发版必须 bump 新号');
console.log('   2. 跑一遍自检确认：node tools/checkall.js');
console.log('   3. 若之前已 push 过问题版本，需要用 ghsync 同步回滚后的源码 + 补发 Release');
console.log('   4. 想撤销本次回滚：从上面备份目录把文件 cp 回来即可');
