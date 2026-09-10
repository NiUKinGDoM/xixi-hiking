#!/usr/bin/env node
/**
 * tools/release.js —— 发布构建一条龙（2026-09-10 固化）
 *
 * 把「同步 → 混淆 → 哈希 → 拷贝原生文件 → gradle 构建」从手抄 8 步变一条命令，
 * 消除"漏一步/顺序错/路径写错"这类人为失误。
 *
 * 用法：
 *   node tools/release.js                # 全流程（同步 + 安全两步 + 构建）
 *   node tools/release.js --skip-build   # 只做同步 + 混淆 + 哈希（快速）
 *   node tools/release.js --no-obf       # 跳过混淆（仅调试用，正式发布不要用）
 *
 * 依赖环境变量（默认值按本机约定）：
 *   HIKING_BUILD_DIR   构建目录，默认 %TEMP%/hiking-build
 *   JAVA_HOME_DIR      JDK 目录，默认 <项目根>/jdk-21.0.12
 *   GRADLE_LIB         gradle-launcher jar，默认 <项目根>/gradle-8.2.1/lib/gradle-launcher-8.2.1.jar
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const noObf = args.includes('--no-obf');

const BUILD_DIR = process.env.HIKING_BUILD_DIR || path.join(os.tmpdir(), 'hiking-build');
const TEMP_ANDROID = path.join(BUILD_DIR, 'android');
const TEMP_ASSETS = path.join(TEMP_ANDROID, 'app/src/main/assets/public');
const TEMP_JAVA = path.join(TEMP_ANDROID, 'app/src/main/java/com/xixi/hiking');
const JDK = process.env.JAVA_HOME_DIR || path.join(PROJ, 'jdk-21.0.12');
const GRADLE_LIB = process.env.GRADLE_LIB || path.join(PROJ, 'gradle-8.2.1/lib/gradle-launcher-8.2.1.jar');

// ★ 同步清单（2026-09-10 起 7 文件 + assets/ 收款码 → 共 9 个文件 + assets 目录整体复制）
const WWW_FILES = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'share-bg.jpg', 'sw.js'];
const WWW_ASSETS = ['support-qr-wechat.jpg', 'support-qr-alipay.jpg'];

function fail(msg) { console.error('\n✗ ' + msg); process.exit(1); }
function run(cmd, argv, opts) {
  const r = spawnSync(cmd, argv, Object.assign({ stdio: 'inherit', encoding: 'utf8' }, opts || {}));
  return r.status === 0;
}
function cp(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// ① 同步 www → 主工程 assets
console.log('① 同步 www → android assets …');
WWW_FILES.forEach(f => {
  const src = path.join(ROOT, 'www', f);
  if (!fs.existsSync(src)) fail('缺少文件: ' + src);
  cp(src, path.join(ROOT, 'android/app/src/main/assets/public', f));
});
WWW_ASSETS.forEach(f => {
  const src = path.join(ROOT, 'www/assets', f);
  if (!fs.existsSync(src)) fail('缺少资源: ' + src);
  cp(src, path.join(ROOT, 'android/app/src/main/assets/public/assets', f));
});

// ② 同步 www → 构建目录（整目录复制，含 assets）
console.log('② 同步 www → 构建目录 …');
if (fs.existsSync(TEMP_ASSETS)) fs.rmSync(TEMP_ASSETS, { recursive: true, force: true });
fs.mkdirSync(path.dirname(TEMP_ASSETS), { recursive: true });
fs.cpSync(path.join(ROOT, 'www'), TEMP_ASSETS, { recursive: true });
WWW_FILES.concat(WWW_ASSETS.map(f => 'assets/' + f)).forEach(f => {
  if (!fs.existsSync(path.join(TEMP_ASSETS, f))) fail('构建目录缺文件: ' + f);
});

// ③ 混淆（仅打 APK 的副本；www 源与测试永远明文）
if (!noObf) {
  console.log('③ 混淆打包副本 …');
  const ok = run(process.execPath, [path.join(ROOT, 'tools/security.js'), 'obf', TEMP_ASSETS, TEMP_ASSETS], {
    env: Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || '' })
  });
  if (!ok) fail('混淆失败');
} else {
  console.log('③ 已跳过混淆（--no-obf，勿用于正式发布）');
}

// ④ 资源哈希 → ResGuard.java（对混淆后目录执行）
console.log('④ 生成资源哈希 ResGuard.java …');
if (!run(process.execPath, [path.join(ROOT, 'tools/security.js'), 'hash', TEMP_ASSETS])) fail('哈希生成失败');

// ⑤ 同步原生文件到构建目录
console.log('⑤ 同步 build.gradle / ResGuard / MainActivity / Manifest …');
['build.gradle'].forEach(f => cp(path.join(ROOT, 'android/app', f), path.join(TEMP_ANDROID, 'app', f)));
['ResGuard.java', 'MainActivity.java'].forEach(f => cp(path.join(ROOT, 'android/app/src/main/java/com/xixi/hiking', f), path.join(TEMP_JAVA, f)));
cp(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), path.join(TEMP_ANDROID, 'app/src/main/AndroidManifest.xml'));

if (skipBuild) {
  console.log('\n✅ 同步 + 安全两步完成（--skip-build，未构建）');
  process.exit(0);
}

// ⑥ gradle 构建（固定 --rerun-tasks：增量缓存不感知 assets 内容变化）
console.log('⑥ gradle assembleRelease（--rerun-tasks 全量）…');
const javaExe = path.join(JDK, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
if (!fs.existsSync(javaExe)) fail('找不到 java: ' + javaExe);
const ok = run(javaExe, [
  '-Dorg.gradle.appname=gradle',
  '-classpath', GRADLE_LIB,
  'org.gradle.launcher.GradleMain', 'assembleRelease',
  '--no-daemon', '--rerun-tasks',
  '--project-cache-dir', path.join(BUILD_DIR, 'gradle-project-cache')
], {
  cwd: TEMP_ANDROID,
  env: Object.assign({}, process.env, {
    GRADLE_USER_HOME: path.join(BUILD_DIR, 'gradle-home'),
    ANDROID_USER_HOME: path.join(BUILD_DIR, 'android-user-home')
  })
});
if (!ok) fail('gradle 构建失败（详见构建输出）');

const apk = path.join(TEMP_ANDROID, 'app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apk)) fail('构建结束但未找到 APK: ' + apk);
console.log('\n✅ 构建完成：' + apk + '（' + (fs.statSync(apk).size / 1048576).toFixed(2) + ' MB）');
console.log('   下一步：aapt/apksigner 验证 → GH 副本同步 commit push → Release 上传 → 删除本地 APK');
