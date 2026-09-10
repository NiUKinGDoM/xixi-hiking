#!/usr/bin/env node
/**
 * tools/verify-apk.js — APK 发布前全面验证（★2026-09-10 新增）
 *
 * 为什么需要它：每次发版都要手写一遍 python 解包脚本（版本/签名/混淆/资源/ResGuard），
 *   而且反复踩「混淆后明文串查不到」的口径坑。本工具统一口径：
 *     · APK 内文件 → 只做「存在性 + 结构」检查（混淆会把字符串编码）
 *     · JS 字符串类改动 → 查 www 源文件（永远明文）
 *
 * 用法：
 *   node tools/verify-apk.js [apk路径]
 * 默认 APK：%TEMP%/hiking-build/android/app/build/outputs/apk/release/app-release.apk
 * 退出码：0 全过；1 有失败项
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

const ROOT = path.resolve(__dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const BT = path.join(PROJ, 'android-sdk/build-tools/34.0.0');
const JAVA = path.join(PROJ, 'jdk-21.0.12/bin/java.exe');
const SIGN_EXPECT = '9396fee4e13f3fd1f939d66820d0ca623187be62234fcfcc621577b63ccf8899';

const apk = process.argv[2] || path.join(os.tmpdir(), 'hiking-build/android/app/build/outputs/apk/release/app-release.apk');

if (!fs.existsSync(apk)) { console.error('✗ APK 不存在: ' + apk); process.exit(1); }
console.log('== verify-apk ==\nAPK: ' + apk + '  (' + (fs.statSync(apk).size / 1048576).toFixed(2) + ' MB)\n');

const results = [];
const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });

// ---------- 1) aapt 版本信息 ----------
const aapt = spawnSync(path.join(BT, 'aapt.exe'), ['dump', 'badging', apk], { encoding: 'utf8' });
const badging = aapt.stdout || '';
const mPkg = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
let apkVer = null, apkVc = null;
if (mPkg) {
  apkVer = mPkg[3]; apkVc = mPkg[2];
  ok('包信息: ' + mPkg[1] + ' v' + apkVer + ' (vc' + apkVc + ')', mPkg[1] === 'com.xixi.hiking');
} else {
  ok('aapt 读取包信息', false, 'aapt 输出异常');
}

// 与源码 app-core.js APP_VERSION / build.gradle versionCode 比对
const coreSrc = fs.readFileSync(path.join(ROOT, 'www/app-core.js'), 'utf8');
const srcVer = (coreSrc.match(/var APP_VERSION = '([\d.]+)';/) || [])[1];
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const gradleVc = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
const gradleVer = (gradle.match(/versionName\s+"([\d.]+)"/) || [])[1];
ok('三处版本一致（build.gradle / APP_VERSION / APK）', srcVer === apkVer && gradleVer === apkVer && gradleVc === apkVc,
  'src=' + srcVer + ' gradle=' + gradleVer + '/' + gradleVc + ' apk=' + apkVer + '/' + apkVc);

// ---------- 2) 签名 ----------
const sign = spawnSync(JAVA, ['-jar', path.join(BT, 'lib/apksigner.jar'), 'verify', '--print-certs', apk], { encoding: 'utf8' });
const mSign = (sign.stdout || '').match(/SHA-256 digest:\s*([0-9a-f]+)/i);
const signHash = mSign ? mSign[1].toLowerCase() : null;
ok('签名 = 白名单（App 内自校验会放行）', signHash === SIGN_EXPECT, signHash ? signHash.slice(0, 16) + '…' : '未取到签名');

// ---------- 3) 解包结构 ----------
// 用 node 内置 zlib 手写 zip 读取太啰嗦 → 借 python 的 zipfile（稳定）
const py = `
import zipfile, json, sys
z = zipfile.ZipFile(r'''${apk.replace(/\\/g, '/')}''')
names = z.namelist()
out = {'names': names}
for f in ['index.html','app-core.js','app-data.js','app-sync.js','app-init.js','sw.js','manifest.json']:
    try:
        out[f] = z.read('assets/public/' + f).decode('utf-8','ignore')
    except KeyError:
        out[f] = None
import hashlib
out['hashes'] = {}
for n in names:
    if n.startswith('assets/public/') and not n.endswith('/'):
        out['hashes'][n[len('assets/public/'):]] = hashlib.sha256(z.read(n)).hexdigest()
print(json.dumps(out, ensure_ascii=False))
`;
const pyRun = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 });
if (pyRun.status !== 0) {
  console.error('✗ 解包失败: ' + (pyRun.stderr || '').slice(0, 300));
  process.exit(1);
}
const Z = JSON.parse(pyRun.stdout);
const N = new Set(Z.names);
const has = (p) => N.has('assets/public/' + p);

ok('JS 已混淆入包', (Z['app-core.js'] || '').includes('var _0x'));
ok('index.html 版本号正确', (Z['index.html'] || '').includes('版本 ' + apkVer));
ok('index.html 无外部 CDN（离线自足）', !(Z['index.html'] || '').includes('gw.alipayobjects'));
ok('index.html 内联 @font-face + 本地字体路径',
  (Z['index.html'] || '').includes('@font-face') && (Z['index.html'] || '').includes('assets/fonts/material-icons.woff2'));
ok('favicon 已声明', (Z['index.html'] || '').includes('rel="icon"'));
ok('sw CACHE_NAME 版本化且收录离线资源',
  /xixi-hiking-v\d+/.test(Z['sw.js'] || '') &&
  (Z['sw.js'] || '').includes('assets/fonts/material-icons.woff2') &&
  (Z['sw.js'] || '').includes('assets/vendor/tailwind4.1.13.js') &&
  (Z['sw.js'] || '').includes('manifest.json'));
ok('app-data.js 无 base64 内联残留', !(Z['app-data.js'] || '').includes('data:image/jpeg;base64'));

const need = [
  ['assets/support-qr-wechat.jpg', '微信收款码'], ['assets/support-qr-alipay.jpg', '支付宝收款码'],
  ['assets/fonts/material-icons.woff2', '图标字体'], ['assets/vendor/tailwind4.1.13.js', 'Tailwind 运行时'],
  ['manifest.json', 'PWA manifest'], ['icon-192.png', 'PWA 图标 192'], ['icon-512.png', 'PWA 图标 512'],
  ['apple-touch-icon.png', 'iOS 图标'], ['share-bg.jpg', '分享背景'],
];
const missing = need.filter(([f]) => !has(f)).map(([f, l]) => l + '(' + f + ')');
ok('关键资源全部入包（' + need.length + ' 项）', missing.length === 0, missing.join(', '));

// ---------- 4) ResGuard 哈希匹配 ----------
const rg = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/xixi/hiking/ResGuard.java'), 'utf8');
const pairs = [...rg.matchAll(/\{"([^"]+)", "([0-9a-f]{64})"\}/g)].map((m) => [m[1], m[2]]);
const mm = pairs.filter(([f, exp]) => Z.hashes[f] !== exp).map(([f]) => f);
ok('ResGuard ' + pairs.length + ' 项与 APK 内容全匹配', pairs.length > 0 && mm.length === 0, mm.join(', '));

// ---------- 5) 源文件交叉验证（APK 内被混淆，只能查源码）----------
const syncSrc = fs.readFileSync(path.join(ROOT, 'www/app-sync.js'), 'utf8');
const corePos = (coreSrc.match(/style\.position = 'fixed'/g) || []).length;
const coreZ = (coreSrc.match(/style\.zIndex = '300'/g) || []).length;
const corePad = (coreSrc.match(/style\.padding = '12px 20px'/g) || []).length;
ok('[源] toast 内联 position/z-index/padding（各 3 处）', corePos === 3 && coreZ === 3 && corePad === 3,
  'pos=' + corePos + ' z=' + coreZ + ' pad=' + corePad);
ok('[源] loading toast 带 loading 变体类', syncSrc.includes('toast-glass loading'));

// ---------- 汇总 ----------
console.log('');
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log('  ' + (r.pass ? '✅' : '❌') + ' ' + r.name + (r.detail ? '   → ' + r.detail : ''));
console.log('\n' + (failed.length ? '❌ ' + failed.length + '/' + results.length + ' 项失败' : '✅ 全过（' + results.length + ' 项）'));
process.exit(failed.length ? 1 : 0);
