#!/usr/bin/env node
/**
 * tools/status.js — 一键项目状态核对（★2026-09-14 新增）
 *
 * 为什么需要它：交接文档「⚡ 开工前 30 秒」要求每次开工必须核对
 *   ① 版本三处一致 ② 远程 releases/latest（防并行会话抢先发）
 *   ③ 主工程 vs GH 副本差异 ④ 未提交改动 ⑤ 当前版本是否有 BUILTIN 条目
 * 这几件事以前要手动跑 4~5 条命令、来回看输出。本工具一次跑完并给结论。
 *
 * 用法：
 *   node tools/status.js            # 完整核对
 *   node tools/status.js --offline  # 跳过远程查询（无网时用）
 *
 * 退出码：0 = 全部一致；1 = 有需要关注的地方
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const GH = path.join(PROJ, 'backups/github-同步目录/xixi-hiking');
const OFFLINE = process.argv.includes('--offline');
const REPO = 'NiUKinGDoM/xixi-hiking';

const issues = [];
const ok = (s) => console.log('  ✅ ' + s);
const warn = (s) => { console.log('  ⚠️  ' + s); issues.push(s); };
const bad = (s) => { console.log('  ❌ ' + s); issues.push(s); };

console.log('== status ==  ' + new Date().toLocaleString());

// ---------- ① 版本三处 ----------
console.log('\n【版本三处】');
const g = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const vc = (g.match(/versionCode\s+(\d+)/) || [])[1];
const vn = (g.match(/versionName\s+"([\d.]+)"/) || [])[1];
const core = fs.readFileSync(path.join(ROOT, 'www/app-core.js'), 'utf8');
const av = (core.match(/APP_VERSION\s*=\s*'([\d.]+)'/) || [])[1];
const idx = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
const iv = (idx.match(/class="about-version">版本\s*([\d.]+)/) || [])[1];

console.log('  build.gradle  : vc' + vc + ' / ' + vn);
console.log('  app-core.js   : ' + av);
console.log('  index.html    : ' + iv);
if (vn && vn === av && av === iv) ok('三处一致 → v' + av + ' (vc' + vc + ')');
else bad('三处不一致！' + [vn, av, iv].join(' / '));

// ---------- ② BUILTIN 条目 ----------
console.log('\n【BUILTIN 更新日志】');
if (core.indexOf("'" + 'v' + av + "'") >= 0 || core.indexOf('"v' + av + '"') >= 0) ok('v' + av + ' 有条目');
else warn('v' + av + ' 缺 BUILTIN 条目（App 内「更新日志」会少这一版）');

// ---------- ③ 本地 git ----------
console.log('\n【本地 git（GH 副本）】');
if (!fs.existsSync(GH)) { warn('GH 副本不存在: ' + GH); }
else {
    const head = spawnSync('git', ['log', '--oneline', '-1'], { cwd: GH, encoding: 'utf8' });
    const st = spawnSync('git', ['status', '--short'], { cwd: GH, encoding: 'utf8' });
    const dirty = (st.stdout || '').trim();
    console.log('  HEAD: ' + (head.stdout || '').trim());
    if (dirty) {
        const n = dirty.split('\n').length;
        warn(n + ' 个未提交（ghsync 尚未同步）');
        dirty.split('\n').slice(0, 5).forEach((l) => console.log('       ' + l));
    } else ok('工作区干净');
}

// ---------- ④ 主工程 vs 副本 ----------
console.log('\n【主工程 vs GH 副本】');
const dr = spawnSync(process.execPath, [path.join(ROOT, 'tools/ghsync.js'), '--dry-run'], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, NODE_PATH: 'C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules' },
});
const dout = (dr.stdout || '') + (dr.stderr || '');
const mm = dout.match(/同步文件:\s*(\d+)\s*个（变化\s*(\d+)\s*个/);
if (mm) {
    console.log('  同步 ' + mm[1] + ' 个文件，变化 ' + mm[2] + ' 个');
    if (mm[2] === '0') ok('主工程与副本零差异');
    else warn(mm[2] + ' 个文件待同步到副本');
} else warn('ghsync --dry-run 输出无法解析');

// ---------- ⑤ 远程 releases/latest ----------
console.log('\n【远程 Release】');
if (OFFLINE) console.log('  （--offline 跳过）');
else {
    const r = spawnSync('curl', ['-s', '--noproxy', '*', '-m', '20',
        '-H', 'User-Agent: status-check',
        'https://api.github.com/repos/' + REPO + '/releases/latest'], { encoding: 'utf8' });
    const out = r.stdout || '';
    const tag = (out.match(/"tag_name"\s*:\s*"([^"]+)"/) || [])[1];
    if (tag) {
        console.log('  远程 latest: ' + tag);
        if (tag === 'v' + av) ok('远程 = 本地（v' + av + '）');
        else warn('远程 ' + tag + ' ≠ 本地 v' + av + '—— 若有并行会话/自动化已发过，先查清再 bump');
    } else {
        console.log('  （API 取不到，尝试 git ls-remote）');
        const g2 = spawnSync('git', ['-c', 'credential.helper=', '-c', 'http.proxy=', '-c', 'https.proxy=',
            'ls-remote', 'origin', 'HEAD'], { cwd: GH, encoding: 'utf8' });
        const h = (g2.stdout || '').split(/\s+/)[0];
        if (h) console.log('  远端 HEAD: ' + h.slice(0, 8));
        else warn('远程查询失败（网络问题，非代码问题）');
    }
}

// ---------- 汇总 ----------
console.log('\n' + '='.repeat(46));
if (issues.length) {
    console.log('⚠ ' + issues.length + ' 项需要关注：');
    issues.forEach((s, i) => console.log('   ' + (i + 1) + '. ' + s));
    process.exit(1);
}
console.log('✅ 全部一致，可以开工');
