#!/usr/bin/env node
/**
 * tools/ghsync.js — 主工程 → GitHub 副本 同步一条龙（2026-09-10 建）
 *
 * 目的：终结每轮发版手写「逐文件 cp + 循环 diff + git add/commit（+push）」的重复劳动。
 * 用法：
 *   node tools/ghsync.js --dry-run              只列将同步的文件 + diff 核对，不写不改
 *   node tools/ghsync.js -m "commit 消息"        同步 + diff 核对 + git add -A + commit
 *   node tools/ghsync.js -m "..." --push        再 push master（token 由 tools/ghtoken.py 读）
 *   node tools/ghsync.js --push-only            跳过同步，只 push
 * 说明：
 *   - www/ 与 docs/、tools/*.js、e2e/*.js 为整目录同步（新增文件自动带上，不会再漏）
 *   - e2e/shots（视觉基线截图）**不同步**（体积大、属本地工具基线）
 *   - 铁律：commit 前必须 diff 核对零差异（关键约定 3c）；commit 前确认 git 身份
 *     = NiUKinGDoM / NiUKinGDoM@users.noreply.github.com（曾因乱改邮箱生出幽灵 Contributors）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORKSPACE = path.join(ROOT, '..');
const GH = path.join(WORKSPACE, 'backups', 'github-同步目录', 'xixi-hiking');
const REPO_URL = 'https://github.com/NiUKinGDoM/xixi-hiking.git';

const has = (n) => process.argv.indexOf('--' + n) >= 0;
const argOf = (n) => { const i = process.argv.indexOf('-' + n); return i >= 0 ? process.argv[i + 1] : null; };
const DRY = has('dry-run');

// ---- 同步清单 ----
const WWW_FILES = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'share-bg.jpg', 'sw.js'];
const ROOT_FILES = ['README.md', 'CHANGELOG.md', 'prev-snapshot.js', 'bump.js', 'test.js', 'test-ui.js'];
const ANDROID_FILES = [
  'android/app/build.gradle',
  'android/app/src/main/java/com/xixi/hiking/MainActivity.java',
  'android/app/src/main/java/com/xixi/hiking/ResGuard.java',
  'android/app/src/main/AndroidManifest.xml',
];
// 整目录同步（相对主工程）
const DIRS = [
  { src: 'tools', dst: 'tools', filter: (f) => f.endsWith('.js') || f.endsWith('.py') },
  { src: 'e2e', dst: 'e2e', filter: (f) => f.endsWith('.js') },
  { src: 'docs', dst: 'docs', filter: (f) => f.endsWith('.md') },
];

function walkCopy(srcDir, dstDir, filter, plan) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const sp = path.join(srcDir, name), dp = path.join(dstDir, name);
    if (fs.statSync(sp).isDirectory()) { walkCopy(sp, dp, filter, plan); continue; }
    if (filter && !filter(name)) continue;
    plan.push([sp, dp]);
  }
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// ---- 组装计划 ----
const plan = [];
for (const f of WWW_FILES) plan.push([path.join(ROOT, 'www', f), path.join(GH, 'www', f)]);
// assets 全量（★2026-09-10 改递归：assets 下已有 fonts/ vendor/ 子目录，原先只遍历一级会把目录当文件复制 → EPERM copyfile）
const assetsDir = path.join(ROOT, 'www', 'assets');
walkCopy(assetsDir, path.join(GH, 'www', 'assets'), null, plan);
for (const f of ROOT_FILES) plan.push([path.join(ROOT, f), path.join(GH, f)]);
for (const f of ANDROID_FILES) plan.push([path.join(ROOT, f), path.join(GH, f)]);
for (const d of DIRS) walkCopy(path.join(ROOT, d.src), path.join(GH, d.dst), d.filter, plan);

// ---- diff 核对清单（必须零差异）----
// 递归收集 assets 下所有文件的相对路径（diff 核对用；★2026-09-10 改递归避免把子目录当文件）
function listAssets(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const sp = path.join(dir, name);
    if (fs.statSync(sp).isDirectory()) listAssets(sp, base + name + '/', out);
    else out.push('www/assets/' + base + name);
  }
  return out;
}
const CHECK = WWW_FILES.map((f) => 'www/' + f)
  .concat(listAssets(assetsDir, '', []))
  .concat(['docs/PROJECT_STATUS.md']);

console.log(`== ghsync ${DRY ? '(DRY-RUN) ' : ''}==`);
console.log(`主工程: ${ROOT}`);
console.log(`GHT 副本: ${GH}\n`);

// 0) 环境检查
if (!fs.existsSync(GH)) { console.error('✗ GH 副本不存在: ' + GH); process.exit(1); }
const missingSrc = plan.filter(([s]) => !fs.existsSync(s));
if (missingSrc.length) {
  console.log('⚠ 源文件缺失（跳过）: ' + missingSrc.map(([s]) => rel(s)).join(', '));
}
const realPlan = plan.filter(([s]) => fs.existsSync(s));

// 1) 复制
let copied = 0;
for (const [s, d] of realPlan) {
  const same = fs.existsSync(d) && fs.readFileSync(s).equals(fs.readFileSync(d));
  if (same) continue;
  if (!DRY) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  copied++;
}
console.log(`同步文件: ${realPlan.length} 个（变化 ${copied} 个${DRY ? '，未写入' : '，已写入'}）`);

// 2) diff 核对（写后必零差异）
let mismatch = [];
for (const r of CHECK) {
  const a = path.join(ROOT, r), b = path.join(GH, r);
  if (!fs.existsSync(a)) continue;
  if (!fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))) mismatch.push(r);
}
if (mismatch.length) {
  if (DRY) {
    console.log('⚠ dry-run：以下文件待同步（尚未写入，故 diff 不一致属预期）:\n   ' + mismatch.join(', '));
    console.log('\n[DRY-RUN] 结束，未提交');
    process.exit(0);
  }
  console.log('❌ diff 核对不一致: ' + mismatch.join(', '));
  process.exit(1);
}
console.log('✅ diff 核对：关键文件零差异（' + CHECK.length + ' 项）');

if (DRY) { console.log('\n[DRY-RUN] 结束，未提交'); process.exit(0); }

// 3) git 身份 + 提交
const git = (args, opts) => spawnSync('git', args, Object.assign({ cwd: GH, encoding: 'utf8' }, opts || {}));
const name = (git(['config', 'user.name']).stdout || '').trim();
const email = (git(['config', 'user.email']).stdout || '').trim();
if (name !== 'NiUKinGDoM' || email !== 'NiUKinGDoM@users.noreply.github.com') {
  console.log(`⚠ git 身份异常：${name} <${email}> → 自动纠正为 NiUKinGDoM（防幽灵 Contributors）`);
  git(['config', 'user.name', 'NiUKinGDoM']);
  git(['config', 'user.email', 'NiUKinGDoM@users.noreply.github.com']);
}

if (!has('push-only')) {
  git(['add', '-A']);
  const st = git(['status', '--short']).stdout || '';
  if (!st.trim()) {
    console.log('（工作区无变化，跳过 commit）');
  } else {
    const msg = argOf('m') || 'chore: sync from main project';
    const c = git(['commit', '-m', msg]);
    console.log((c.stdout || '').split('\n').filter(Boolean).slice(0, 2).join('\n'));
    if (c.status !== 0) { console.error('✗ commit 失败:\n' + (c.stderr || '')); process.exit(1); }
  }
  console.log('本地提交: ' + (git(['log', '--oneline', '-1']).stdout || '').trim());
}

// 4) push（可选）
if (has('push') || has('push-only')) {
  const py = spawnSync('python', [path.join(__dirname, 'ghtoken.py')], { encoding: 'utf8', cwd: ROOT });
  const token = (py.stdout || '').trim();
  if (!token) { console.error('✗ 取 token 失败: ' + (py.stderr || '').trim()); process.exit(1); }
  const url = `https://x-access-token:${token}@github.com/NiUKinGDoM/xixi-hiking.git`;
  const env = Object.assign({}, process.env, { GIT_SSL_NO_VERIFY: 'true' });
  const BASE = ['-c', 'credential.helper=', '-c', 'http.proxy=', '-c', 'https.proxy='];
  const doPush = (extra) => spawnSync('git', BASE.concat(extra || [], ['push', url, 'master']), {
    cwd: GH, encoding: 'utf8', env,
  });

  // ★容错：直连失败时，探测可用 IP 并用 http.curloptResolve 钉住重试
  // 背景（2026-09-10 实测）：本机 DNS 解析到的 github.com IP 会 TCP 超时，
  // 但同段其他 IP 正常；表现是「codeload/pages.dev 通、github.com/api 不通」，
  // 极易被误判为"节点坏了/被墙"。git 2.42+ 支持 http.curloptResolve 直指可用 IP。
  const IP_CANDIDATES = [
    '20.205.243.166', '140.82.112.3', '140.82.113.3', '140.82.114.3',
    '140.82.116.3', '20.27.177.113', '20.200.245.247', '20.233.83.145', '4.208.26.197',
  ];
  // ★2026-09-11 修复：探测必须绕开环境代理。
  //   本机（沙箱）会注入 https_proxy（本次为 127.0.0.1:50083），而该代理对 github.com
  //   直接返回 502 CONNECT tunnel failed → 所有候选 IP 都被误判为不可用，
  //   于是永远走不到「钉 IP 重试 push」那一步（而 push 本身已用 -c http.proxy= 清空代理，两者语义必须一致）。
  const probeEnv = Object.assign({}, env);
  for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete probeEnv[k];
  const probeIp = (ip) => {
    const r = spawnSync('curl', [
      '-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w', '%{http_code}', '--max-time', '5',
      '--noproxy', '*',
      '--resolve', `github.com:443:${ip}`, 'https://github.com',
    ], { encoding: 'utf8', env: probeEnv });
    return (r.stdout || '').trim();
  };

  let p = doPush();
  let out = ((p.stdout || '') + (p.stderr || '')).trim();
  if (p.status !== 0) {
    console.log('⚠ 直连 push 失败，开始探测可用 IP（同段其他 IP 常常是通的）...');
    // hosts 劫持检测（2026-09-10 本机实测真凶）：Steam++/Watt Toolkit 类加速器会把
    // github.com 写进 hosts 指向 127.0.0.1，其本地反代没运行时域名全部"连接被拒"。
    try {
      const hf = process.platform === 'win32' ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/hosts';
      if (/^\s*127\.0\.0\.1\s+github\.com\s*$/m.test(fs.readFileSync(hf, 'utf8'))) {
        console.log('   ⚠ 检测到 github.com 被 hosts 劫持到 127.0.0.1（Steam++/Watt Toolkit 加速器未运行）');
        console.log('     → 自动绕过：钉真实 IP（彻底解决可清理 hosts 中的 Steam++ 段）');
      }
    } catch (e) { /* hosts 不可读则跳过检测 */ }
    // 收集最多 3 个 HTTP 可达的 IP，逐个试 push。
    // ★实测教训：HTTP 200 ≠ git smart protocol 可用（140.82.112.3 曾 HTTP 通但 git push 超时），
    //   所以找到第一个可用 IP 就单发一次是不够的，必须轮试。
    const good = [];
    for (const ip of IP_CANDIDATES) {
      const code = probeIp(ip);
      if (code === '200') { good.push(ip); console.log(`  ✓ ${ip} 可达（200）`); }
      else console.log(`  ✗ ${ip}（${code || 'timeout'}）`);
      if (good.length >= 3) break;
    }
    if (!good.length) {
      console.error('✗ 候选 IP 全部不可用 → 请检查网络或切换代理节点（见 MEMORY「网络排障顺序」）');
      process.exit(1);
    }
    for (const ip of good) {
      console.log(`→ 钉 ${ip} 重试 push...`);
      p = doPush(['-c', `http.curloptResolve=github.com:443:${ip}`, '-c', `http.curloptResolve=api.github.com:443:${ip}`]);
      out = ((p.stdout || '') + (p.stderr || '')).trim();
      if (p.status === 0) break;
      console.log(`   ✗ ${ip} 未能完成 push，换下一个`);
    }
  }
  console.log(out.split('\n').slice(-3).join('\n'));
  if (p.status !== 0) { console.error('✗ push 失败（直连与钉 IP 均失败：见 MEMORY「网络排障顺序」）'); process.exit(1); }
  console.log('✅ 已 push ' + REPO_URL + ' master（若为发布推送，CF Pages 会自动部署）');
}
