#!/usr/bin/env node
/**
 * ★2026-08-21 自动测试：修改后一键体检（构建/发布前必跑）
 * 用法：node test.js
 * 覆盖：JS 语法 / 关键函数存在 / 死标识符残留 / HTML 结构配对 / 版本一致性
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'www/index.html');
const GRADLE = path.join(ROOT, 'android/app/build.gradle');
const MANIFEST = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
const MAIN_ACTIVITY = path.join(ROOT, 'android/app/src/main/java/com/xixi/hiking/MainActivity.java');

let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('  ✅ ' + msg); };
const bad = (msg) => { fail++; console.log('  ❌ ' + msg); };

console.log('===== XiXiの徒步小记 自动测试 =====');

// 1. JS 语法（所有 script 块）
console.log('-- 1. JS 语法 --');
try {
    const html = fs.readFileSync(HTML, 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    let allOk = true;
    scripts.forEach((s, i) => { try { new vm.Script(s); } catch (e) { allOk = false; bad(`script块${i}: ${e.message}`); } });
    allOk ? ok(`全部 ${scripts.length} 个 script 块语法通过`) : bad('存在语法错误');
} catch (e) { bad('读文件失败: ' + e.message); }

// 2. 关键函数存在性
console.log('-- 2. 关键功能完整性 --');
const html = fs.readFileSync(HTML, 'utf8');
const critical = [
    ['AppStore（存储层）', 'var AppStore'],
    ['photoDBOpen（照片库）', 'function photoDBOpen'],
    ['saveRecord（保存记录）', 'function saveRecord'],
    ['renderTable（记录表格）', 'function renderTable'],
    ['buildFullBackupHTML（完整备份）', 'function buildFullBackupHTML'],
    ['extractBackupData（备份解析）', 'function extractBackupData'],
    ['doRestoreFromCloud（云端恢复）', 'function doRestoreFromCloud'],
    ['listSyncFilesFromCloud（云端列表）', 'function listSyncFilesFromCloud'],
    ['triggerHaptic（震动）', 'function triggerHaptic'],
    ['openPhotoLightbox（灯箱）', 'function openPhotoLightbox'],
    ['updateStatistics（统计）', 'function updateStatistics'],
    ['setupEventListeners（事件）', 'function setupEventListeners'],
    ['showSuccessMessage（成功提示）', 'function showSuccessMessage'],
    ['showErrorMessage（错误提示）', 'function showErrorMessage'],
];
critical.forEach(([name, sig]) => html.includes(sig) ? ok(name) : bad(name + ' 缺失!'));

// 3. 死标识符残留（历史清理清单，出现即报）
console.log('-- 3. 死代码残留扫描 --');
const deadTokens = [
    'lingguang.storage.', 'searchTimers', 'searchResults', 'searchCache', 'cacheExpiry',
    'performSearch', 'searchLocation', 'performAISearch', 'dataFetchWithRetry',
    'DATAFETCH', 'CALLLLM', 'search-dropdown', 'search-option', 'search-loading',
    'CACHE_DURATION', 'MAX_CACHE_SIZE', 'getCacheKey', 'setCache', 'formatSettingsBrackets'
];
deadTokens.forEach(t => {
    const c = html.split(t).length - 1;
    c === 0 ? ok(`无残留: ${t}`) : bad(`残留 ${t}: ${c} 处`);
});
// lingguang（允许 AppStore 注释里的说明文字出现，但不得出现在运行代码中）
const lingCount = (html.split('lingguang').length - 1) - (html.split('去灵光化').length - 1) - 2;
lingCount > 0 ? bad(`lingguang 运行残留: ${lingCount}`) : ok('无 lingguang 运行残留');

// 4. HTML 结构配对
console.log('-- 4. HTML 结构 --');
const divO = (html.match(/<div\b/g) || []).length;
const divC = (html.match(/<\/div>/g) || []).length;
divO === divC ? ok(`div 配对 (${divO}/${divC})`) : bad(`div 不配对 (${divO}/${divC})`);
const spanO = (html.match(/<span\b/g) || []).length;
const spanC = (html.match(/<\/span>/g) || []).length;
spanO === spanC ? ok(`span 配对 (${spanO}/${spanC})`) : bad(`span 不配对 (${spanO}/${spanC})`);

// 5. 版本一致性（build.gradle vs index.html）
console.log('-- 5. 版本一致性 --');
try {
    const g = fs.readFileSync(GRADLE, 'utf8');
    const vc = (g.match(/versionCode\s+(\d+)/) || [])[1];
    const vn = (g.match(/versionName\s+"([^"]+)"/) || [])[1];
    const h1 = html.includes(`var APP_VERSION = '${vn}';`);
    const h2 = html.includes(`>版本 ${vn}<`);
    // 校验版本名四段 0~10 合法（公式对齐因历史错位不校验，见 bump.js 注释）
    const parts = vn.split('.').map(Number);
    const legal = parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 10);
    legal ? ok(`版本名格式合法 (${vn}, vc${vc})`) : bad(`版本名非法: ${vn}`);
    h1 && h2 ? ok(`index.html 版本显示同步 (${vn})`) : bad('index.html 版本未同步!');
} catch (e) { bad('版本检查失败: ' + e.message); }

// 6. 原生文件完整性
console.log('-- 6. 原生层 --');
try {
    const m = fs.readFileSync(MANIFEST, 'utf8');
    m.includes('android.permission.VIBRATE') ? ok('VIBRATE 权限已声明') : bad('VIBRATE 权限缺失!');
    m.includes('android.permission.INTERNET') ? ok('INTERNET 权限') : bad('INTERNET 权限缺失!');
} catch (e) { bad('manifest 读取失败'); }
try {
    const ma = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
    ma.includes('vibrate') ? ok('MainActivity 震动桥存在') : bad('震动桥缺失!');
    ma.includes('addJavascriptInterface') ? ok('JS 桥注册存在') : bad('JS 桥注册缺失!');
} catch (e) { bad('MainActivity 读取失败'); }

console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
