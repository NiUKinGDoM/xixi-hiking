#!/usr/bin/env node
/**
 * tools/doc-sync.js — 双端文档一键同步（★2026-09-14 新增）
 *
 * 为什么需要它：项目文档是**双端**的（主工程一份 + GH 副本 docs/ 一份）。
 *   `docaudit.js` 的 J 段只负责「检测」不一致，**修复一直是手动 cp** ——
 *   每次改完 PROJECT_STATUS 都得记得手动同步，漏了 docaudit 才报红，
 *   而且 `给新模型的提示词.md` 同样是双端的，**连检测都没覆盖到**。
 *   本工具把「检测 + 一键同步」补齐。
 *
 * 用法：
 *   node tools/doc-sync.js            # 只检测差异（只读，不动文件）
 *   node tools/doc-sync.js --apply    # 主工程 → 副本（覆盖副本侧）
 *   node tools/doc-sync.js --reverse  # 副本 → 主工程（反向，防止副本侧被误改后覆盖主工程）
 *
 * 退出码：0 = 双端一致 / 已同步；1 = 有差异（未 --apply 时）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');          // hiking-app3
const PROJ = path.resolve(ROOT, '..');               // 项目根
const GH = path.join(PROJ, 'backups/github-同步目录/xixi-hiking');

const APPLY = process.argv.includes('--apply');
const REVERSE = process.argv.includes('--reverse');

// 双端文档对照表：[显示名, 主工程侧, 副本侧]
const PAIRS = [
    ['README.md', path.join(ROOT, 'README.md'), path.join(GH, 'README.md')],
    ['CHANGELOG.md', path.join(ROOT, 'CHANGELOG.md'), path.join(GH, 'CHANGELOG.md')],
    ['docs/PROJECT_STATUS.md', path.join(PROJ, 'PROJECT_STATUS.md'), path.join(GH, 'docs/PROJECT_STATUS.md')],
    ['docs/给新模型的提示词.md', path.join(PROJ, '给新模型的提示词.md'), path.join(GH, 'docs/给新模型的提示词.md')],
    ['docs/DEVICE-CHECKLIST.md', path.join(ROOT, 'docs/DEVICE-CHECKLIST.md'), path.join(GH, 'docs/DEVICE-CHECKLIST.md')],
    // ★2026-09-18 补漏：本文件同样是双端的，此前未纳入（用户「整理所有文档」时发现）
    ['docs/方案-换机同步与登录体验.md', path.join(ROOT, 'docs/方案-换机同步与登录体验.md'), path.join(GH, 'docs/方案-换机同步与登录体验.md')],
    ['docs/版本变更记录-存档.md', path.join(ROOT, 'docs/版本变更记录-存档.md'), path.join(GH, 'docs/版本变更记录-存档.md')],
];

console.log('== doc-sync ==  ' + (APPLY ? '同步模式' : REVERSE ? '反向同步模式' : '检测模式') + '\n');

let diff = 0, missing = [], synced = 0;
for (const [name, a, b] of PAIRS) {
    const ea = fs.existsSync(a), eb = fs.existsSync(b);
    if (!ea || !eb) {
        const miss = !ea ? '主工程缺' : '副本缺';
        console.log('  ❌ ' + name.padEnd(28) + miss);
        missing.push(name + '（' + miss + '）');
        continue;
    }
    const same = Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
    if (same) { console.log('  ✅ ' + name.padEnd(28) + '一致'); continue; }
    diff++;
    if (!APPLY && !REVERSE) { console.log('  ⚠️  ' + name.padEnd(28) + '内容不一致'); continue; }

    const src = REVERSE ? b : a;
    const dst = REVERSE ? a : b;
    // 同步前记录双方大小，便于确认方向
    const sSrc = fs.statSync(src).size, sDst = fs.statSync(dst).size;
    fs.copyFileSync(src, dst);
    synced++;
    console.log('  →  ' + name.padEnd(28) + (REVERSE ? '副本→主工程' : '主工程→副本') + '  ' + sDst + 'B → ' + sSrc + 'B');
}

console.log('\n' + '='.repeat(50));
if (APPLY || REVERSE) {
    console.log('已同步 ' + synced + ' 个，一致 ' + (PAIRS.length - diff - missing.length) + ' 个' + (missing.length ? '，缺 ' + missing.length + ' 个' : ''));
    if (missing.length) { console.log('⚠ 缺失项需人工确认：'); missing.forEach((m) => console.log('   ' + m)); process.exit(1); }
    console.log('✅ 双端文档已一致（副本侧改动尚未 commit，需 ghsync --push 才会进远端）');
    process.exit(0);
}
if (missing.length) { console.log('❌ ' + missing.length + ' 项缺失：'); missing.forEach((m) => console.log('   ' + m)); process.exit(1); }
if (diff) {
    console.log('⚠ ' + diff + ' 项不一致 → 同步：node tools/doc-sync.js --apply');
    console.log('   （若副本侧才是最新，用 --reverse 反向同步）');
    process.exit(1);
}
console.log('✅ 双端文档全部一致');
