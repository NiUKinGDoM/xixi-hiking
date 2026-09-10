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
const HASH_FILES = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'assets/support-qr-wechat.jpg', 'assets/support-qr-alipay.jpg'];

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
} else {
  console.log('用法: node tools/security.js obf <srcDir> <outDir> | hash');
}
