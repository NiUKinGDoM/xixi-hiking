#!/usr/bin/env node
/**
 * ★2026-09-03 工程治理对策①：发布前回滚点快照
 * 把当前可发布态（www 7 文件 + assets 收款码 2 + build.gradle + MainActivity.java + AndroidManifest.xml）复制到
 *   backups/prev-<versionName>/   （例如 backups/prev-1.1.8.6/）
 * 用途：bump/构建/发布流程出问题时，用这 7+3 文件即可整体还原到发布前状态（v1.1.8.0 灵动事故救回同类场景）。
 * 用法：node prev-snapshot.js（在 bump 之前跑：快照 = 未 bump 的当前版，最稳）
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

function main() {
    const g = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
    const vm = (g.match(/versionName\s+"([^"]+)"/) || [])[1] || ('v' + Date.now());
    // 备份根 = 项目根 backups/（与既有 backups/prev-1.1.8.0-灵动前 同层；hiking-app3 只是主工程目录）
    const dest = path.join(ROOT, '..', 'backups', 'prev-' + vm);
    fs.mkdirSync(dest, { recursive: true });
    const www = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'share-bg.jpg', 'sw.js'];
    www.forEach(function (f) { fs.copyFileSync(path.join(ROOT, 'www', f), path.join(dest, f)); });
    // ★2026-09-10 收款码外置：快照须含 assets/（漏了回退点就缺码）
    const wwwAssets = ['support-qr-wechat.jpg', 'support-qr-alipay.jpg'];
    fs.mkdirSync(path.join(dest, 'assets'), { recursive: true });
    wwwAssets.forEach(function (f) { fs.copyFileSync(path.join(ROOT, 'www', 'assets', f), path.join(dest, 'assets', f)); });
    const m = path.join(ROOT, 'android', 'app', 'src', 'main');
    fs.copyFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), path.join(dest, 'build.gradle'));
    fs.copyFileSync(path.join(m, 'java', 'com', 'xixi', 'hiking', 'MainActivity.java'), path.join(dest, 'MainActivity.java'));
    fs.copyFileSync(path.join(m, 'AndroidManifest.xml'), path.join(dest, 'AndroidManifest.xml'));
    console.log('OK prev-snapshot 完成：' + dest);
    console.log('  内含：www 7 文件 + assets 收款码 2 + build.gradle + MainActivity.java + AndroidManifest.xml');
}
main();
