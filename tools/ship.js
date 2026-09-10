#!/usr/bin/env node
/**
 * tools/ship.js — 发布流程编排（★2026-09-10 新增）
 *
 * 把「发版」拆成两段，各自一条命令；任一步骤失败立即停止（不带着问题往下走）。
 *
 *   node tools/ship.js prepare --builtin <BUILTIN文案> --doc <文档条目文案> [--dry-run]
 *       ① 核对远程无撞车 → ② 回退点快照 → ③ bump → ④ BUILTIN 注入
 *       → ⑤ 发布文档三处同步 → ⑥ 全套自检 → ⑦ 代码审计 → ⑧ release.js 构建 → ⑨ APK 验证
 *
 *   node tools/ship.js publish <tag> <Release文案> [--dry-run]
 *       ① GH 副本同步 + push（触发 CF Pages 自动部署）→ ② 建 Release + 上传 APK + 下载验证
 *       → ③ 校验 pages.dev 已上新版本
 *
 * 用法示例：
 *   node tools/ship.js prepare --builtin tools/notes/1.2.0.3-builtin.txt --doc tools/notes/1.2.0.3-doc.txt
 *   node tools/ship.js publish v1.2.0.3 tools/notes/1.2.0.3-release.md
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const env = { ...process.env, NODE_PATH: 'C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules' };

const args = process.argv.slice(2);
const mode = args[0];
const DRY = args.includes('--dry-run');
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

function run(label, cmd, cmdArgs, opts = {}) {
  console.log('\n▶ ' + label);
  if (DRY) { console.log('   [DRY] ' + path.basename(cmd) + ' ' + cmdArgs.join(' ')); return { ok: true, out: '' }; }
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64, ...opts });
  const out = (r.stdout || '') + (r.stderr || '');
  if (out.trim()) console.log(out.trim().split('\n').slice(-12).map((l) => '   ' + l).join('\n'));
  if (r.status !== 0) { console.error('\n✗ 「' + label + '」失败（退出码 ' + r.status + '），流程中止'); process.exit(1); }
  return { ok: true, out };
}

function readVer() {
  const g = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
  return { vc: (g.match(/versionCode\s+(\d+)/) || [])[1], ver: (g.match(/versionName\s+"([\d.]+)"/) || [])[1] };
}

function remoteLatest() {
  const p = spawnSync('python', ['-c', `
import urllib.request, json
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
op.addheaders = [('User-Agent','xixi-ship'), ('Accept','application/vnd.github+json')]
r = json.loads(op.open('https://api.github.com/repos/NIUKinGDoM/xixi-hiking/releases/latest'.replace('NIUKinGDoM','NiUKinGDoM'), timeout=20).read())
print(r['tag_name'])
`], { encoding: 'utf8' });
  return (p.stdout || '').trim();
}

// ============================ prepare ============================
if (mode === 'prepare') {
  const builtinFile = opt('--builtin');
  const docFile = opt('--doc');
  if (!builtinFile || !docFile) {
    console.error('用法: node tools/ship.js prepare --builtin <BUILTIN文案> --doc <文档条目文案> [--dry-run]');
    process.exit(1);
  }
  // 路径解析：支持绝对路径与相对主工程路径
  const absOf = (f) => (path.isAbsolute(f) ? f : path.join(ROOT, f));
  const bAbs = absOf(builtinFile);
  const dAbs = absOf(docFile);
  for (const f of [bAbs, dAbs]) {
    if (!fs.existsSync(f)) { console.error('✗ 文案文件不存在: ' + f); process.exit(1); }
  }

  const cur = readVer();
  console.log('== ship prepare ==');
  console.log('当前版本: v' + cur.ver + ' (vc' + cur.vc + ')');

  // ① 远程撞车检查
  const latest = remoteLatest();
  console.log('远程最新 Release: ' + (latest || '(未取到)'));
  if (latest && latest === 'v' + cur.ver) {
    console.log('✅ 远程与本地一致，无撞车');
  } else if (latest) {
    console.log('⚠ 远程(' + latest + ') 与本地(v' + cur.ver + ') 不一致——若为并行会话/网页直改，请先核对再继续');
  }

  // ② 回退点
  run('回退点快照（prev-snapshot）', NODE, ['prev-snapshot.js']);
  // ③ bump
  run('版本号自增（bump）', NODE, ['bump.js']);
  const next = readVer();
  console.log('   → 新版本: v' + next.ver + ' (vc' + next.vc + ')');

  // ④ BUILTIN
  run('BUILTIN 更新日志注入', NODE, ['tools/builtin.js', next.ver, bAbs]);
  // ⑤ 文档三处
  run('发布文档同步（PROJECT_STATUS×2 + CHANGELOG）', NODE, ['tools/docrelease.js', next.ver, next.vc, dAbs]);
  // ⑥ 全套自检
  run('全套自检（checkall）', NODE, ['tools/checkall.js']);
  // ⑦ 审计门禁
  run('代码审计（audit）', NODE, ['tools/audit.js']);
  // ⑧ 构建
  run('发布构建（release.js 一条龙）', NODE, ['tools/release.js']);
  // ⑨ APK 验证
  run('APK 全面验证（verify-apk）', NODE, ['tools/verify-apk.js']);

  console.log('\n✅ prepare 完成 → v' + next.ver + ' (vc' + next.vc + ') 已构建并验证');
  console.log('👉 下一步：给用户网页版验收 → 用户说「同步」后执行');
  console.log('   node tools/ship.js publish v' + next.ver + ' <Release文案>');
  process.exit(0);
}

// ============================ publish ============================
if (mode === 'publish') {
  const tag = args[1];
  const bodyFile = args[2];
  if (!tag || !/^v[\d.]+$/.test(tag)) {
    console.error('用法: node tools/ship.js publish <tag, 如 v1.2.0.3> <Release文案文件> [--dry-run]');
    process.exit(1);
  }
  console.log('== ship publish ==');
  console.log('tag: ' + tag);

  // ① GH 副本同步 + push
  run('GH 副本同步 + push（触发 CF Pages 部署）', NODE, ['tools/ghsync.js', '-m', 'release: ' + tag, '--push']);
  // ② Release + 上传 + 下载验证 + 清理本地 APK
  run('建 Release + 上传 APK + 下载验证', NODE, ['tools/ghrelease.js', tag, bodyFile || '']);

  // ③ pages.dev 校验
  console.log('\n▶ 校验 pages.dev 自动部署（最多等 2 分钟）');
  if (DRY) {
    console.log('   [DRY] curl https://xixi-hiking.pages.dev/app-core.js');
  } else {
    const py = `
import urllib.request, time, re, sys
url = 'https://xixi-hiking.pages.dev/app-core.js'
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for i in range(8):
    try:
        t = op.open(url + '?v=' + str(int(time.time())), timeout=20).read().decode('utf-8','ignore')
        m = re.search(r"APP_VERSION = '([\\d.]+)'", t)
        if m and m.group(1) == '${tag.replace('v', '')}':
            print('OK ' + m.group(1)); sys.exit(0)
        print('wait: ' + (m.group(1) if m else '?')); time.sleep(15)
    except Exception as e:
        print('retry: ' + str(e)[:50]); time.sleep(15)
print('TIMEOUT'); sys.exit(1)
`;
    const r = spawnSync('python', ['-c', py], { encoding: 'utf8' });
    const out = (r.stdout || '').trim();
    console.log('   ' + out.split('\n').slice(-1)[0]);
    if (r.status !== 0) console.log('⚠ pages.dev 未在等待窗口内更新，请稍后手动确认');
    else console.log('✅ pages.dev 已部署 ' + tag);
  }

  console.log('\n✅ publish 完成：' + tag);
  process.exit(0);
}

console.error('用法:');
console.error('  node tools/ship.js prepare --builtin <BUILTIN文案> --doc <文档条目文案> [--dry-run]');
console.error('  node tools/ship.js publish <tag> <Release文案> [--dry-run]');
process.exit(1);
