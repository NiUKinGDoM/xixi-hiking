#!/usr/bin/env node
/**
 * ★2026-08-21 bump 脚本化：一条命令完成版本号四处同步
 * 用法：node bump.js
 * 自动：versionCode+1 + versionName 第四段+1（满10进位，每段0~10共11值）+ 同步 build.gradle + index.html(APP_VERSION + 版本显示) + 校验
 * ⚠️ 历史说明：v1.1.1.0~1.1.1.4（vc132~136）为错位命名（比公式 +1，D4=10 曾误当 0），已发布固定，本脚本延续该序列不再用公式反推。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GRADLE = path.join(ROOT, 'android/app/build.gradle');
const HTML = path.join(ROOT, 'www/index.html');

let gradle = fs.readFileSync(GRADLE, 'utf8');
const vcMatch = gradle.match(/versionCode\s+(\d+)/);
const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
if (!vcMatch || !nameMatch) { console.error('❌ build.gradle 找不到 versionCode/versionName'); process.exit(1); }
const oldVc = parseInt(vcMatch[1], 10);
const oldName = nameMatch[1];

// ★2026-10-23 支持第五段「重发号」（用户定：同号重发要在版本号上再补一位，1.2.5.4 → 1.2.5.4.1 → .2…）
//   默认（正常升号）：第四段 +1，**丢弃第五段**（1.2.5.4.1 → 1.2.5.5）
//   --resend（同号重发）：第五段 +1；四段版本则追加 .1
//   ★第五段只用 1~10，满了必须改用正常升号（否则版本号体系会乱）
const RESEND = process.argv.indexOf('--resend') >= 0;
const parts = oldName.split('.').map(Number);
const is5 = parts.length === 5;
if (!(parts.length === 4 || is5) || parts.some(p => isNaN(p) || p < 0 || p > 10)) {
    console.error(`❌ 当前版本名非法: ${oldName}（须为 4 段或 5 段、每段 0~10）`); process.exit(1);
}

let newName;
if (RESEND) {
    if (is5) {
        parts[4] += 1;
        if (parts[4] > 10) { console.error('❌ 第五段已满 10，请改用正常升号（不带 --resend）'); process.exit(1); }
        newName = parts.join('.');
    } else {
        newName = oldName + '.1';        // 1.2.5.4 → 1.2.5.4.1
    }
} else {
    let [a, b, c, d] = parts;
    // 第四段 +1（满 10 进位：每段 0~10 共 11 个值）；第五段（重发号）自然归零
    d++;
    if (d > 10) { d = 0; c++; }
    if (c > 10) { c = 0; b++; }
    if (b > 10) { console.error('❌ 第二段满 10，版本号体系溢出'); process.exit(1); }
    newName = `${a}.${b}.${c}.${d}`;
}
const newVc = oldVc + 1;

// 同步 build.gradle
gradle = gradle.replace(`versionCode ${oldVc}`, `versionCode ${newVc}`);
gradle = gradle.replace(`versionName "${oldName}"`, `versionName "${newName}"`);
fs.writeFileSync(GRADLE, gradle, 'utf8');

// 同步 index.html + app-core.js（★2026-08-30 方案A：APP_VERSION 移入 app-core.js，版本显示仍在 index.html）
const CORE_JS = path.join(ROOT, 'www/app-core.js');
let html = fs.readFileSync(HTML, 'utf8');
let coreJs = fs.readFileSync(CORE_JS, 'utf8');
if (!coreJs.includes(`var APP_VERSION = '${oldName}';`) || !html.includes(`>版本 ${oldName}<`)) {
    console.error(`❌ 未找到旧版本 ${oldName}（app-core.js APP_VERSION / index.html 版本显示），已回滚 build.gradle`);
    fs.writeFileSync(GRADLE, gradle.replace(`versionCode ${newVc}`, `versionCode ${oldVc}`).replace(`versionName "${newName}"`, `versionName "${oldName}"`), 'utf8');
    process.exit(1);
}
coreJs = coreJs.replace(`var APP_VERSION = '${oldName}';`, `var APP_VERSION = '${newName}';`);
fs.writeFileSync(CORE_JS, coreJs, 'utf8');
html = html.replace(`>版本 ${oldName}<`, `>版本 ${newName}<`);
fs.writeFileSync(HTML, html, 'utf8');

// 最终验证
gradle = fs.readFileSync(GRADLE, 'utf8');
html = fs.readFileSync(HTML, 'utf8');
coreJs = fs.readFileSync(CORE_JS, 'utf8');
const okG = gradle.includes(`versionCode ${newVc}`) && gradle.includes(`versionName "${newName}"`);
const okH = coreJs.includes(`var APP_VERSION = '${newName}';`) && html.includes(`>版本 ${newName}<`);
if (!okG || !okH) { console.error('❌ 同步验证失败'); process.exit(1); }

console.log(`✅ bump 完成：v${oldName}（vc${oldVc}）→ v${newName}（vc${newVc}）`);
console.log(`   build.gradle ✓  app-core.js APP_VERSION ✓  版本显示 ✓`);
