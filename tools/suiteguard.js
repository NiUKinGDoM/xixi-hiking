#!/usr/bin/env node
/**
 * tools/suiteguard.js —— 门禁套件一致性守卫（★2026-10-27 建）
 *
 * 为什么需要它：
 *   本项目有**两份 checkall 实现**：
 *     · tools/checkall.sh（bash，本机手动跑，独有 smoke 的 EBUSY 降级 + --online）
 *     · tools/checkall.js（Node，**ship.js prepare 发版流程跑的是这份**）
 *   2026-10-27 实测发现：theme / stress / docfresh 三套只加进了 .sh，
 *   **.js 里没有 ⇒ 发版时根本不跑**，连续几轮无人察觉。
 *   靠"记得两边都加"必然再漏，所以改成机器比对。
 *
 * 做法：分别从两份文件里抽出「套件 → 脚本文件」清单，逐条比对。
 *   · 只在 .sh 里 → 报红（发版不跑）
 *   · 只在 .js 里 → 报红（本机手动跑不到）
 *
 * 用法：node tools/suiteguard.js   （进 checkall，有差异即 exit 1）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };

const jsSrc = read(path.join(ROOT, 'tools', 'checkall.js'));
const shSrc = read(path.join(ROOT, 'tools', 'checkall.sh'));

if (!jsSrc || !shSrc) {
    console.log('❌ 读不到 checkall.js 或 checkall.sh');
    console.log('\n结果: 0 通过 / 1 失败');
    process.exit(1);
}

/** 从 checkall.js 的 SUITES 里抽 file 字段 */
function fromJs(src) {
    const out = [];
    const re = /\{\s*key:\s*'[^']+',\s*name:\s*'[^']*',\s*file:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) out.push(path.basename(m[1]));
    return out;
}

/** 从 checkall.sh 的 _run 调用里抽 tools/xxx 或根目录 test 文件 */
function fromSh(src) {
    const out = [];
    // _run "名称" "$NODE" tools/xxx.js [args]
    const re = /_run\s+"[^"]*"\s+"\$NODE"\s+([^\s]+)/g;
    let m;
    while ((m = re.exec(src))) {
        const f = m[1].replace(/^\$?\{?NODE\}?\s*/, '').trim();
        out.push(path.basename(f));
    }
    // 单独直跑的（如 bash tools/churn.sh 不算门禁，忽略）
    return out;
}

const jsList = fromJs(jsSrc);
const shList = fromSh(shSrc);

const uniq = a => Array.from(new Set(a));
const J = uniq(jsList), S = uniq(shList);

// 两份实现里允许的差异（都有正当理由的，写死在这里并注明）
const ALLOW = {
    // smoke.js 在 .sh 里由 run_smoke 显式调用（带 EBUSY 降级），不经过 _run ⇒ 认作等价
    'smoke.js': { js: true, sh: true },
    // siteaudit.js 只在 .sh --online 分支跑（需要网络，进发版流程不合适）
    'siteaudit.js': { js: false, sh: true, why: '仅 --online 手动跑，发版流程不跑网络体检' },
    // e2e/run.js 两份都有；churn 不是门禁
};

// 语义：ALLOW[f].js === false 表示「.js 里本来就不需要这一套」→ 只在 .sh 里算正常；
//       ALLOW[f].js === true  表示「.js 里应该有」→ 若实际没有，仍然报红。
const onlyJs = J.filter(f => !S.includes(f) && !(ALLOW[f] && ALLOW[f].sh === true));
const onlySh = S.filter(f => !J.includes(f) && !(ALLOW[f] && ALLOW[f].js === false));

console.log('== suiteguard ==  门禁套件一致性（checkall.sh ↔ checkall.js）');
console.log('  checkall.js 套件：' + J.length + ' 个 → ' + J.join(', '));
console.log('  checkall.sh 套件：' + S.length + ' 个 → ' + S.join(', '));

let fail = 0;
if (onlySh.length) {
    fail++;
    console.log('\n  ❌ 只在 .sh 里（**发版流程不会跑**）：' + onlySh.join(', '));
}
if (onlyJs.length) {
    fail++;
    console.log('\n  ❌ 只在 .js 里（**本机手动跑不到**）：' + onlyJs.join(', '));
}

// 允许的差异，明确打印出来，避免下次误判为"漏了"
const allowedNotes = Object.keys(ALLOW)
    .filter(k => ALLOW[k].why)
    .map(k => '  · ' + k + '：' + ALLOW[k].why);
if (allowedNotes.length) console.log('\n  （已知合理差异）\n' + allowedNotes.join('\n'));

if (!fail) console.log('\n  ✅ 两份套件清单一致');

console.log('\n结果: ' + (fail ? 0 : 1) + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
