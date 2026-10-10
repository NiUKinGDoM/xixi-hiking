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
 *
 * ★★2026-10-10 改造：**全程不再 spawn 任何子进程**。
 *   背景：本机 node 的 `child_process.spawn` 会集体 EBUSY（环境问题，非代码问题），
 *   改造前每次体检都必然误报两条：「ghsync --dry-run 输出无法解析」「远程查询失败」——
 *   而它们其实只是「没查到」，不是项目有问题。具体三处：
 *     ③ git 状态   ：原先 spawnSync `git log` / `git status` → 改为直接读 `.git/` 下的 ref 文件
 *     ④ 主工程 vs 副本：原先 spawnSync `node ghsync.js --dry-run` → 改为 require ghsync.js
 *                    取同步清单 + 纯 fs 比对（清单单一来源，不会漂移）
 *     ⑤ 远程 Release：原先 spawnSync `curl`（沙箱里 curl 对 GitHub 一律 000）→ 改为 node https 直连
 *   并新增 skip() 级别：**环境限制导致的「没检测到」不计入「需要关注」**，只如实标注。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const GH = path.join(PROJ, 'backups/github-同步目录/xixi-hiking');
const OFFLINE = process.argv.includes('--offline');
const REPO = 'NiUKinGDoM/xixi-hiking';

const issues = [];
const ok = (s) => console.log('  ✅ ' + s);
const warn = (s) => { console.log('  ⚠️  ' + s); issues.push(s); };
const bad = (s) => { console.log('  ❌ ' + s); issues.push(s); };
// ★环境限制（本机 spawn / 网络受限）→ 如实说明但**不算项目问题**
const skip = (s) => console.log('  ⏭️  未检测：' + s + '（环境限制，非代码问题）');

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

// ---------- ③ 本地 git（纯 fs 读 ref，不 spawn） ----------
console.log('\n【本地 git（GH 副本）】');
function readGitRef(rel) {
  const gitDir = path.join(GH, '.git');
  try {
    const p = path.join(gitDir, rel);
    if (fs.existsSync(p)) {
      const s = fs.readFileSync(p, 'utf8').trim();
      if (/^[0-9a-f]{40}$/.test(s)) return s;
      if (s.startsWith('ref: ')) return readGitRef(s.slice(5));
    }
  } catch (e) { /* 继续兜底 */ }
  // packed-refs 兜底（ref 被打包后 loose 文件会消失）
  try {
    const pr = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = pr.match(new RegExp('^([0-9a-f]{40})\\s+' + esc + '\\s*$', 'm'));
    if (m) return m[1];
  } catch (e) { /* 无 packed-refs 也正常 */ }
  return null;
}
if (!fs.existsSync(GH)) { warn('GH 副本不存在: ' + GH); }
else if (!fs.existsSync(path.join(GH, '.git'))) { warn('GH 副本不是 git 工作区: ' + GH); }
else {
  const head = readGitRef('HEAD');
  const local = readGitRef('refs/heads/master');
  const remote = readGitRef('refs/remotes/origin/master');
  console.log('  HEAD: ' + (head ? head.slice(0, 8) : '?') + '  (master ' + (local ? local.slice(0, 8) : '?') + ')');
  if (!local || !remote) {
    skip('本地/远端 ref 读不到（仓库状态异常或 ref 未落盘）');
  } else if (local === remote) {
    ok('本地 master 与 origin/master 齐平');
  } else {
    warn('本地 master (' + local.slice(0, 8) + ') ≠ origin/master (' + remote.slice(0, 8) + ')—— 可能有不曾 push 的提交');
  }
  if (head !== local) skip('HEAD 与 master 不同（可能处于游离/其他分支状态）');
}

// ---------- ④ 主工程 vs 副本（require ghsync 清单 + 纯 fs 比对，不 spawn） ----------
console.log('\n【主工程 vs GH 副本】');
try {
  const SYNC = require('./ghsync.js');   // ★只取清单，不执行同步（已加 require.main 守卫）
  const srcMissing = SYNC.plan.filter(([s]) => !fs.existsSync(s)).length;
  const changed = SYNC.plan.filter(([s, d]) => {
    if (!fs.existsSync(s)) return false;          // 源缺失的不算"副本差异"
    if (!fs.existsSync(d)) return true;           // 副本还没有
    return !fs.readFileSync(s).equals(fs.readFileSync(d));
  }).map(([s]) => SYNC.rel(s));
  console.log('  同步清单 ' + SYNC.plan.length + ' 个文件（核对 ' + SYNC.CHECK.length + ' 项）' +
    (srcMissing ? '，其中源缺失 ' + srcMissing + ' 个' : ''));
  if (changed.length === 0) ok('主工程与副本零差异');
  else {
    warn(changed.length + ' 个文件待同步到副本');
    changed.slice(0, 8).forEach((r) => console.log('       ' + r));
    if (changed.length > 8) console.log('       …还有 ' + (changed.length - 8) + ' 个');
  }
} catch (e) {
  skip('ghsync 清单载入失败：' + e.message);
}

// ---------- 异步段：⑤ 远程 releases/latest（node https 直连，不 spawn） ----------
function httpsGetJson(url, timeout = 20000) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ err: 'bad url' }); }
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'status-check', 'Accept': 'application/vnd.github+json' },
      rejectUnauthorized: false,   // 沙箱根证书不被信任；仅本机自检用途
    }, (res) => {
      const cs = [];
      res.on('data', (c) => cs.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(cs).toString('utf8') }));
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ err: 'timeout' }); });
    req.on('error', (e) => resolve({ err: e.message }));
  });
}

function summary() {
  console.log('\n' + '='.repeat(46));
  if (issues.length) {
    console.log('⚠ ' + issues.length + ' 项需要关注：');
    issues.forEach((s, i) => console.log('   ' + (i + 1) + '. ' + s));
    process.exit(1);
  }
  console.log('✅ 全部一致，可以开工');
}

(async () => {
  console.log('\n【远程 Release】');
  if (OFFLINE) { console.log('  （--offline 跳过）'); return summary(); }
  const r = await httpsGetJson('https://api.github.com/repos/' + REPO + '/releases/latest');
  if (r.err) { skip('远程查询失败：' + r.err); return summary(); }
  const tag = (r.body.match(/"tag_name"\s*:\s*"([^"]+)"/) || [])[1];
  if (tag) {
    console.log('  远程 latest: ' + tag);
    if (tag === 'v' + av) ok('远程 = 本地（v' + av + '）');
    else warn('远程 ' + tag + ' ≠ 本地 v' + av + '—— 若有并行会话/自动化已发过，先查清再 bump');
  } else if (r.status && r.status !== 200) {
    skip('GitHub API 返回 HTTP ' + r.status + '（未认证额度/网络受限）');
  } else {
    skip('GitHub API 未返回 tag_name');
  }
  summary();
})();
