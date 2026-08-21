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

// 解析四段（1.X.X.X）
const parts = oldName.split('.').map(Number);
if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 10)) {
    console.error(`❌ 当前版本名非法: ${oldName}`); process.exit(1);
}
let [a, b, c, d] = parts;

// 第四段 +1（满 10 进位：每段 0~10 共 11 个值）
d++;
if (d > 10) { d = 0; c++; }
if (c > 10) { c = 0; b++; }
if (b > 10) { console.error('❌ 第二段满 10，版本号体系溢出'); process.exit(1); }
const newName = `${a}.${b}.${c}.${d}`;
const newVc = oldVc + 1;

// 同步 build.gradle
gradle = gradle.replace(`versionCode ${oldVc}`, `versionCode ${newVc}`);
gradle = gradle.replace(`versionName "${oldName}"`, `versionName "${newName}"`);
fs.writeFileSync(GRADLE, gradle, 'utf8');

// 同步 index.html（APP_VERSION + 版本显示）
let html = fs.readFileSync(HTML, 'utf8');
if (!html.includes(`var APP_VERSION = '${oldName}';`) || !html.includes(`>版本 ${oldName}<`)) {
    console.error(`❌ index.html 未找到旧版本 ${oldName}，已回滚 build.gradle`);
    fs.writeFileSync(GRADLE, gradle.replace(`versionCode ${newVc}`, `versionCode ${oldVc}`).replace(`versionName "${newName}"`, `versionName "${oldName}"`), 'utf8');
    process.exit(1);
}
html = html.replace(`var APP_VERSION = '${oldName}';`, `var APP_VERSION = '${newName}';`);
html = html.replace(`>版本 ${oldName}<`, `>版本 ${newName}<`);
fs.writeFileSync(HTML, html, 'utf8');

// 最终验证
gradle = fs.readFileSync(GRADLE, 'utf8');
html = fs.readFileSync(HTML, 'utf8');
const okG = gradle.includes(`versionCode ${newVc}`) && gradle.includes(`versionName "${newName}"`);
const okH = html.includes(`var APP_VERSION = '${newName}';`) && html.includes(`>版本 ${newName}<`);
if (!okG || !okH) { console.error('❌ 同步验证失败'); process.exit(1); }

console.log(`✅ bump 完成：v${oldName}（vc${oldVc}）→ v${newName}（vc${newVc}）`);
console.log(`   build.gradle ✓  APP_VERSION ✓  版本显示 ✓`);
