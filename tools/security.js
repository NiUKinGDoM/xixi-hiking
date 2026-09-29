// XiXiの徒步小记 · 安全工具（防破解纵深）
// 用法：
//   node tools/security.js obf  <srcDir> <outDir>   混淆 4 个业务 JS 到 outDir（源目录不动；其余文件原样拷贝）
//   node tools/security.js hash                     对 www 5 个核心资源算 SHA-256 → 更新 ResGuard.java（勿手改）
// 设计：
//   - www 源永远保持明文（测试/E2E 都读源），只对打进 APK 的副本混淆
//   - ResGuard.java 由 hash 命令自动生成，MainActivity 启动软校验（异常仅提示不退出）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const JAVA_DIR = path.join(ROOT, 'android/app/src/main/java/com/xixi/hiking');
const BUSINESS_JS = ['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js'];
const HASH_FILES = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'assets/support-qr-wechat.jpg', 'assets/support-qr-alipay.jpg', 'assets/fonts/material-icons.woff2', 'assets/vendor/tailwind4.1.13.js'];

function obfuscate(code, name) {
  const JavaScriptObfuscator = require('javascript-obfuscator');
  // 保守档：避免破坏运行（不开 selfDefending/controlFlowFlattening/deadCode 等激进项）
  const res = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,          // 全局函数名（window.xxx 跨文件调用）必须保留
    renameProperties: false,
    stringArray: true,
    stringArrayThreshold: 0.4,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    unicodeEscapeSequence: false,
    simplify: true,
    selfDefending: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    transformObjectKeys: false,
    numbersToExpressions: false,
    splitStrings: false,
    debugProtection: false,
    disableConsoleOutput: false,
    target: 'browser'
  });
  return res.getObfuscatedCode();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const cmd = process.argv[2];

if (cmd === 'obf') {
  const src = path.resolve(process.argv[3]);
  const out = path.resolve(process.argv[4]);
  if (!fs.existsSync(src) || !process.argv[4]) { console.error('用法: node security.js obf <srcDir> <outDir>'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  let obfCount = 0;
  for (const f of fs.readdirSync(src)) {
    const from = path.join(src, f);
    const to = path.join(out, f);
    if (fs.statSync(from).isFile()) {
      if (BUSINESS_JS.includes(f)) {
        fs.writeFileSync(to, obfuscate(fs.readFileSync(from, 'utf8'), f));
        obfCount++;
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }
  console.log('混淆完成: ' + obfCount + ' 个业务 JS → ' + out);
  // 输出混淆后大小
  for (const f of BUSINESS_JS) {
    const s = fs.statSync(path.join(out, f));
    console.log('  ' + f + ' → ' + Math.round(s.size / 1024) + 'KB');
  }
} else if (cmd === 'hash') {
  const hashDir = process.argv[3] ? path.resolve(process.argv[3]) : WWW;   // 默认 www 明文；打 APK 前须对混淆产物目录执行
  const entries = [];
  for (const f of HASH_FILES) entries.push('        {"' + f + '", "' + sha256(path.join(hashDir, f)) + '"}');
  const java = 'package com.xixi.hiking;\n' +
    '\n' +
    '// ★自动生成：发布前执行 node tools/security.js hash 更新本文件（勿手改，勿提交为旧值）\n' +
    '// 内容：核心资源 SHA-256 清单，供 MainActivity.verifyAssetsIntegrity 软校验（防篡改纵深）\n' +
    'public final class ResGuard {\n' +
    '    public static final String[][] HASHES = {\n' +
    entries.join(',\n') + '\n' +
    '    };\n' +
    '    private ResGuard() { }\n' +
    '}\n';
  const outFile = path.join(JAVA_DIR, 'ResGuard.java');
  fs.writeFileSync(outFile, java);
  console.log('ResGuard.java 已更新 (' + entries.length + ' 项): ' + outFile);
  for (const e of entries) console.log('  ' + e.replace(/"/g, '').replace(/\{|\}/g, ''));
  // ★2026-09-30 守卫：ResGuard.java 生成后，若构建目录存在旧副本且内容不一致 → 醒目报警
  //   背景：曾有构建脚本漏「拷 ResGuard.java 到构建目录」一步，导致 APK 内嵌旧哈希清单 →
  //   启动即弹「资源校验提示」误报（构建目录 18:08 旧值 vs 工程目录 23:55 新值，差 5 小时）。
  //   纯 fs 读取比对，不 spawn 子进程（沙箱 EBUSY 下也能跑）。
  try {
    const osMod = require('os');
    const buildJava = path.join(process.env.HIKING_BUILD_DIR || path.join(osMod.tmpdir(), 'hiking-build'),
        'android', 'app', 'src', 'main', 'java', 'com', 'xixi', 'hiking', 'ResGuard.java');
    if (fs.existsSync(buildJava)) {
      const same = fs.readFileSync(buildJava, 'utf8') === java;
      if (!same) {
        console.error('\n⚠ 守卫警报：构建目录的 ResGuard.java 与刚生成的不一致（陈旧）。');
        console.error('  构建目录: ' + buildJava);
        console.error('  发布前必须先同步（release.js 第⑤步会自动拷贝；手工/python 复刻构建请勿漏掉这一步）。\n');
      } else {
        console.log('守卫：构建目录 ResGuard.java 已同步（与工程目录一致）✅');
      }
    } else {
      console.log('守卫：构建目录尚无 ResGuard.java（首次构建，release.js 第⑤步会拷贝）');
    }
  } catch (e) { /* 守卫失败不影响 hash 主流程 */ }
} else {
  console.log('用法: node tools/security.js obf <srcDir> <outDir> | hash');
}
