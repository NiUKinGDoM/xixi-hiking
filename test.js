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
    // ★2026-08-30 方案A：主 JS 拆外部文件，脚本块 = 内联 + 4 个外部文件（按加载顺序）
    ['www/app-core.js', 'www/app-data.js', 'www/app-sync.js', 'www/app-init.js'].forEach(f => scripts.push(fs.readFileSync(path.join(__dirname, f), 'utf8')));
    let allOk = true;
    scripts.forEach((s, i) => { try { new vm.Script(s); } catch (e) { allOk = false; bad(`script块${i}: ${e.message}`); } });
    allOk ? ok(`全部 ${scripts.length} 个 script 块语法通过`) : bad('存在语法错误');
} catch (e) { bad('读文件失败: ' + e.message); }

// 2. 关键函数存在性
console.log('-- 2. 关键功能完整性 --');
const html = fs.readFileSync(HTML, 'utf8');
// ★2026-08-30 方案A：allJs = 内联 script 内容 + 4 个外部 JS（关键函数/死代码/版本/单测均针对 JS 内容）
const allJs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n') + '\n;\n' +
    ['www/app-core.js', 'www/app-data.js', 'www/app-sync.js', 'www/app-init.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
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
critical.forEach(([name, sig]) => allJs.includes(sig) ? ok(name) : bad(name + ' 缺失!'));

// 3. 死标识符残留（历史清理清单，出现即报）
console.log('-- 3. 死代码残留扫描 --');
const deadTokens = [
    'lingguang.storage.', 'searchTimers', 'searchResults', 'searchCache', 'cacheExpiry',
    'performSearch', 'searchLocation', 'performAISearch', 'dataFetchWithRetry',
    'DATAFETCH', 'CALLLLM', 'search-dropdown', 'search-option', 'search-loading',
    'CACHE_DURATION', 'MAX_CACHE_SIZE', 'getCacheKey', 'setCache', 'formatSettingsBrackets'
];
deadTokens.forEach(t => {
    const c = allJs.split(t).length - 1;
    c === 0 ? ok(`无残留: ${t}`) : bad(`残留 ${t}: ${c} 处`);
});
// lingguang（允许 AppStore 注释里的说明文字出现，但不得出现在运行代码中）
const lingCount = (allJs.split('lingguang').length - 1) - (allJs.split('去灵光化').length - 1) - 2;
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
    const h1 = allJs.includes(`var APP_VERSION = '${vn}';`);
    const h2 = html.includes(`>版本 ${vn}<`);
    // 校验版本名四段 0~10 合法（公式对齐因历史错位不校验，见 bump.js 注释）
    const parts = vn.split('.').map(Number);
    const legal = parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 10);
    legal ? ok(`版本名格式合法 (${vn}, vc${vc})`) : bad(`版本名非法: ${vn}`);
    h1 && h2 ? ok(`index.html 版本显示同步 (${vn})`) : bad('index.html 版本未同步!');
} catch (e) { bad('版本检查失败: ' + e.message); }

// 5b. schema 迁移框架（P0-2）
console.log('-- 5b. schema 迁移框架 --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    cj.includes('const DATA_SCHEMA_VERSION = 1') ? ok('DATA_SCHEMA_VERSION=1 已定义') : bad('DATA_SCHEMA_VERSION 缺失!');
    cj.includes('RECORD_SCHEMA_MIGRATIONS = []') && cj.includes('TRIP_SCHEMA_MIGRATIONS = []') ? ok('迁移链数组已注册') : bad('迁移链缺失!');
    cj.includes('function applySchemaMigrations') ? ok('迁移执行器存在') : bad('applySchemaMigrations 缺失!');
    dj.includes('applySchemaMigrations(data.trips, TRIP_SCHEMA_MIGRATIONS)') ? ok('计划加载接入迁移') : bad('计划迁移未接入!');
    dj.includes('version: DATA_SCHEMA_VERSION, records') ? ok('记录保存写 version') : bad('记录保存未写 version!');
    dj.includes('version: DATA_SCHEMA_VERSION, trips') ? ok('计划保存写 version') : bad('计划保存未写 version!');
    ij.includes('applySchemaMigrations(storageData.value.records, RECORD_SCHEMA_MIGRATIONS)') ? ok('记录加载接入迁移') : bad('记录迁移未接入!');
} catch (e) { bad('schema 检查失败: ' + e.message); }

// 5c. 照片 GC（P0-3）
console.log('-- 5c. 照片 GC --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    cj.includes('function photoCountOrphans') ? ok('photoCountOrphans 只读扫描存在') : bad('photoCountOrphans 缺失!');
    cj.includes('function confirmDeleteOrphanPhotos') ? ok('清理确认入口存在') : bad('confirmDeleteOrphanPhotos 缺失!');
    cj.includes("Promise.all([photoGetUsage(), photoCountOrphans()])") ? ok('占用统计联动孤立扫描') : bad('refreshPhotoUsage 未联动!');
    !ih.includes('photoCleanBtn') && !cj.includes('photoCleanBtn') ? ok('行内快捷清理按钮已删(入口统一弹窗优化)') : bad('photoCleanBtn 残留!');
} catch (e) { bad('照片 GC 检查失败: ' + e.message); }

// 5d. P1 体验项（P1-5 示例 / P1-6 三步引导 / P1-7 本地备份）
console.log('-- 5d. P1 体验项 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    dj.includes('function loadSampleData') ? ok('loadSampleData 示例函数存在') : bad('loadSampleData 缺失!');
    ij.includes('function showTabGuides') && ij.includes('GUIDE_CARDS') ? ok('分页引导逻辑在') : bad('showTabGuides 缺失!');
    ih.includes('id="guideRecords"') && ih.includes('id="guidePlans"') && ih.includes('id="guideSettings"') && ih.includes('id="welcomeDemoBtn"') ? ok('四页引导卡 DOM 在位') : bad('引导卡 DOM 缺失!');
    ih.includes('wb-guide-close') && ij.includes('function dismissGuide(cardId)') ? ok('引导 ✕ 逐卡关闭机制在') : bad('✕ 关闭缺失!');
    sj.includes('function autoLocalBackupIfDue') ? ok('每周自动备份函数存在') : bad('autoLocalBackupIfDue 缺失!');
    !sj.includes('localBackupBtn') ? ok('手动「立即本地备份」按钮已移除（用户要求）') : bad('localBackupBtn 残留!');
    sj.includes('localBackupBtn') === false && dj.includes('每满 7 天') ? ok('自动备份说明已迁入数据管理 i 弹窗') : bad('自动备份说明缺失!');
    ij.includes("autoLocalBackupIfDue") ? ok('启动已挂自动备份钩子') : bad('启动钩子缺失!');
} catch (e) { bad('P1 检查失败: ' + e.message); }

// 5e. v1.1.9.7 新功能源码断言（字号/全文搜索/抹掉数据/过期关怀/回忆册PDF/小日记）
console.log('-- 5e. v1.1.9.7 新功能 --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    dj.includes("(r.notes || '').toLowerCase().indexOf(q)") && dj.includes("(r.mood || '')") ? ok('搜索扩展小日记/心情等字段') : bad('全文搜索缺失!');
    dj.includes('function confirmWipeAllData') && dj.includes('function wipeAllDataExecute') ? ok('抹掉数据双重确认存在') : bad('wipe 函数缺失!');
    ih.includes('id="wipeAllBtn"') ? ok('设置页抹掉按钮在位') : bad('wipeAllBtn 缺失!');
    dj.includes('function maybeShowOverdueCare') ? ok('计划过期关怀函数存在') : bad('maybeShowOverdueCare 缺失!');
    dj.includes('edit-notes-') && dj.includes('小日记') ? ok('记录弹窗小日记(textarea/view)在位') : bad('小日记缺失!');
    dj.includes('id="edit-notes-') || dj.includes("`edit-notes-${id}`") ? ok('小日记保存回写接入') : bad('notes 保存缺失!');
    sj.includes('@media print') && sj.includes('另存为 PDF') ? ok('回忆册打印样式+PDF说明') : bad('回忆册打印缺失!');
    ih.includes('.pl-overdue') ? ok('过期红标样式在位') : bad('pl-overdue 缺失!');
    ij.includes('maybeShowOverdueCare') ? ok('启动挂过期关怀') : bad('关怀调用缺失!');
} catch (e) { bad('5e 检查失败: ' + e.message); }

// 5f. 2026-09-06 装机反馈第二波修复（深色用时里程框 / 导出说明迁 i / 引导 ✕ 四卡齐）
console.log('-- 5f. 09-06 反馈修复 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    dj.includes('edit-merge-box') ? ok('用时/里程复合框带 edit-merge-box') : bad('edit-merge-box 缺失!');
    ih.includes('body.dark-mode .edit-merge-box') && ih.includes('background: rgba(55, 65, 81, 0.9) !important;') ? ok('深色模式盒底深灰化规则在') : bad('dark edit-merge-box CSS 缺失!');
    ih.includes('.edit-input::placeholder') && ih.includes('body.dark-mode .edit-input::placeholder') ? ok('输入框占位深色提亮规则在') : bad('placeholder dark 规则缺失!');
    sj.includes('function showExportModal') && !/本地自动备份已开启/.test(sj) ? ok('导出弹窗内自动备份说明已移除') : bad('导出弹窗仍含说明!');
    dj.includes('本地自动备份') && dj.includes('每满 7 天') && dj.includes('function showDataInfoModal') ? ok('i 弹窗含本地自动备份条目') : bad('i 弹窗缺备份条目!');
    ih.includes('id="welcomeClose"') && ih.includes('class="wb-guide-close"') ? ok('概览引导卡 ✕ 带 wb-guide-close(委托可关)') : bad('welcomeClose 缺 wb-guide-close!');
    ij.includes('bindTabGuides') && ij.includes('addNewPlannedTrip') ? ok('引导计划按钮可达计划添加') : bad('引导按钮代码缺失!');
} catch (e) { bad('5f 检查失败: ' + e.message); }

// 5g. 2026-09-06 定稿 v3（过期弹窗两按钮 / 引导每卡独立 ✕ + 重启恢复）
console.log('-- 5g. 09-06 定稿v3 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    dj.includes('function maybeShowOverdueCare') && dj.includes('oc-go') && dj.includes('oc-ignore') && !dj.includes('oc-shift') ? ok('过期弹窗只留 去处理/忽略(顺延已删)') : bad('过期弹窗按钮不对!');
    dj.includes('去计划页改个日期或删掉吧') ? ok('过期文案同步更新') : bad('过期文案未更新!');
    ij.includes('function dismissGuide(cardId)') && ij.includes("'hiking_guide_seen_' + cardId") ? ok('引导 ✕ 逐卡独立(dismissGuide)') : bad('dismissGuide 缺失!');
    ij.includes('guideSeen[id]') && ij.includes("(id === want && !guideSeen[id])") ? ok('显示判定=当前页且该卡未关') : bad('per-card 判定缺失!');
    ij.includes('function loadGuideSeenState') && ij.includes("hiking_guide_seen_' + GUIDE_CARDS[i]") ? ok('重启逐卡 seen 恢复') : bad('loadGuideSeenState 缺失!');
    ij.includes('function resetGuideSeen') ? ok('resetGuideSeen 测试钩子在') : bad('resetGuideSeen 缺失!');
    ih.includes('class="guide-sub-btn"') && ih.includes('padding:7px 16px') && ih.includes('body.dark-mode .guide-sub-btn') ? ok('引导次按钮同尺寸+dark 适配') : bad('guide-sub-btn 缺失!');
} catch (e) { bad('5g 检查失败: ' + e.message); }

// 5h. 2026-09-06 概览单位 + 小日记字色 + i 弹窗间距（v1.1.9.9）
console.log('-- 5h. 09-06 概览单位等 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    ih.includes('id="totalCount"') && ih.includes('次</span>') && ih.includes('total-count-value') ? ok('总记录数带「次」单位(HTML span)') : bad('总记录单位缺失!');
    ih.includes('id="avgDifficultyMiniU"') && ih.includes('.stat-unit') && ih.includes('avgDifficultyMini') ? ok('平均难度级单位=stat-unit 小字') : bad('难度单位缺失!');
    ih.includes('id="totalDistance"') && ih.includes('stat-unit">km') && ih.includes('id="maxElevation"') && ih.includes('stat-unit">m') ? ok('总里程km/最高海拔m 单位小字化') : bad('km/m 单位未拆!');
    dj.includes('var durationHTML = function') && dj.includes('<span class=\"stat-unit\">h</span>') ? ok('时长 h/m 单位小字渲染函数在') : bad('durationHTML 缺失!');
    ih.includes('.about-logo') && ih.includes('font-size: 60px') ? ok('App 主 logo 放大至 60px(用户定稿)') : bad('logo 未放大!');
    dj.includes('jd-lab') && dj.includes('jd-body') && dj.includes('color:#52606f') ? ok('小日记 view 标签/正文加深') : bad('小日记色加深缺失!');
    ih.includes('.record-detail-modal .jd-body') && ih.includes('body.dark-mode .record-detail-modal .jd-body { color: #e5e7eb !important; }') ? ok('小日记 dark 适配 CSS') : bad('jd dark CSS 缺失!');
    dj.includes('margin-bottom:16px') && dj.includes('数据管理说明') ? ok('i 弹窗内容与按钮间距拉开(16px)') : bad('i 弹窗间距未改!');
} catch (e) { bad('5h 检查失败: ' + e.message); }

// 5i. 2026-09-06 保存铁律（只有点保存才算保存；取消/点空白关闭一律丢弃）
console.log('-- 5i. 保存铁律 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    dj.includes('detailModalMode === \'edit\') { try { cancelEdit(); }') && dj.includes('保存铁律') ? ok('记录编辑弹窗点空白=取消(丢弃)') : bad('记录 backdrop 铁律缺失!');
    dj.includes('if (isEdit) { try { cancelPlannedEdit(); }') ? ok('计划编辑弹窗点空白=取消(丢弃)') : bad('计划 backdrop 铁律缺失!');
    dj.includes('function cancelEdit') && dj.includes("editingRecord.name === ''") ? ok('cancelEdit 删空草稿逻辑在') : bad('cancelEdit 缺失!');
    dj.includes('function cancelPlannedEdit') && dj.includes('!trip.name') ? ok('cancelPlannedEdit 删空计划草稿逻辑在') : bad('cancelPlannedEdit 缺失!');
} catch (e) { bad('5i 检查失败: ' + e.message); }

// 5j. 2026-09-06 更新日志弹窗三版（标题无版本号 / 本次·上次·上上次 / dark 适配）
console.log('-- 5j. 更新日志三版 --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    cj.includes('history_edu</span>更新日志</div>') ? ok('更新日志标题去掉版本号') : bad('标题仍带版本号!');
    cj.includes('j === 0') && cj.includes('本次更新') && !cj.includes('上次更新') ? ok('徽章仅本次(上次/上上次无标签)') : bad('徽章逻辑不对!');
    cj.includes('parts.length < 3') ? ok('取最近三个版本逻辑在') : bad('三版截取缺失!');
    cj.includes('var CL = {') && cj.includes('tagTx: IS_DARK') && cj.includes(">本次更新</span>") ? ok('更新日志颜色内联化(IS_DARK 分支)') : bad('changelog 内联色缺失!');
    ih.includes('function showChangelogModal') || !ih.includes('#changelogBody .clb') ? ok('cl 依赖 CSS 已清(与照片弹窗同防真机失效)') : bad('cl CSS 残留!');
    cj.includes('function showInfoMessage') ? ok('中性信息 toast(showInfoMessage)在') : bad('showInfoMessage 缺失!');
    cj.includes('showInfoMessage(cleanMsgs') ? ok('俏皮话改中性 toast') : bad('俏皮话未用中性!');
} catch (e) { bad('5j 检查失败: ' + e.message); }

// 5l. 2026-09-07 P0 照片库上限（占用行开详情弹窗 / 300MB 警示 / TOP 排行）
console.log('-- 5l. 照片库上限 --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    cj.includes('PHOTO_LIMIT_BYTES = 300 * 1048576') ? ok('300MB 建议上限常量在') : bad('PHOTO_LIMIT_BYTES 缺失!');
    cj.includes('function openPhotoUsageDetailModal') && cj.includes('id="puModal"') ? ok('详情弹窗含样式锚点 id=puModal') : bad('详情弹窗/id 缺失!');
    !cj.includes('computePhotoTopRecords') && !cj.includes('pu-tr') && !cj.includes('最占空间的记录') ? ok('TOP10 排行已整体移除') : bad('TOP10 残留!');
    cj.includes('IS_DARK') && cj.includes('border-radius:16px;padding:14px 16px') && cj.includes('font-size:28px;font-weight:800') && cj.includes("' + P.cardBg + '") ? ok('统计卡/容量条样式 JS 内联(真机 CSS 失效兜底)') : bad('内联样式缺失!');
    cj.includes('warning_amber') && cj.includes('pu-warn') && cj.includes('超过建议的 300 MB') ? ok('超限警示内联渲染在位') : bad('警示缺失!');
    cj.includes('function bindPhotoUsageRow') && cj.includes('_docBound') ? ok('行绑定+委托兜底在') : bad('绑定缺失!');
    cj.includes('id="puOpt"') && cj.includes("'优化'") && cj.includes('id="puClose"') ? ok('底部双钮(知道了灰蓝+优化check-go红)在') : bad('双钮缺失!');
    cj.includes('别点啦，这里没有缓存要清') && cj.includes('非要再点一下才放心吗') && cj.includes('Math.random() * cleanMsgs.length') ? ok('无缓存俏皮 toast 随机轮换在') : bad('俏皮 toast 缺失!');
    ih.includes('id="photoUsageRow"') ? ok('设置行在位') : bad('行缺失!');
    !ih.includes('#puModal') ? ok('失效 #puModal CSS 已清(样式全内联)') : bad('#puModal CSS 残留!');
    ij.includes('bindPhotoUsageRow();') ? ok('init 已绑定照片占用行') : bad('init 绑定缺失!');
} catch (e) { bad('5l 检查失败: ' + e.message); }

// 5m. 2026-09-07 更新包直装（下载完退出后同版本再点 = 直接安装不重下）
console.log('-- 5m. 更新直装 --');
try {
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    const java = fs.readFileSync(path.join(__dirname, 'android/app/src/main/java/com/xixi/hiking/MainActivity.java'), 'utf8');
    sj.includes("PENDING_APK_TAG_KEY = 'hiking_pending_apk_tag'") ? ok('待装版本记忆 key 在') : bad('记忆 key 缺失!');
    sj.includes('hasLocalApkFor') && sj.includes('rememberLocalApkTag') && sj.includes('clearLocalApkTag') ? ok('直装记忆三函数在') : bad('记忆函数缺失!');
    sj.includes("'立即安装'") && sj.includes('installLocalUpdate') && sj.includes('不用重新下载') ? ok('弹窗直装态(立即安装+提示)在') : bad('直装弹窗缺失!');
    sj.includes("state === 'downloaded'") && sj.includes('rememberLocalApkTag') ? ok('下载完成记版本(直装依据)') : bad('downloaded 记忆缺失!');
    sj.includes("state === 'no_local_apk'") && sj.includes('clearLocalApkTag') ? ok('本地包失效→清记+自动重下') : bad('no_local_apk 兜底缺失!');
    java.includes('public void installDownloadedApk()') && java.includes('xixi_update.apk') && java.includes('no_local_apk') ? ok('原生直装桥(installDownloadedApk)在') : bad('原生直装桥缺失!');
} catch (e) { bad('5m 检查失败: ' + e.message); }

// 5n. ★2026-09-07 CSS 健康回归（误删事故防复发：曾删 cl 段连带吞掉按钮/toast 全量样式）
console.log('-- 5n. CSS 健康 --');
try {
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    const styles = [...ih.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    const allBalanced = styles.every(st => {
        // 容错计数：多余 } 忽略，结束深度必须 0（缺 } 必暴露）
        let d = 0;
        for (const ch of st) { if (ch === '{') d++; else if (ch === '}' && d > 0) d--; }
        return d === 0 && st.split('{').length === st.split('}').length;
    });
    allBalanced ? ok('style 块花括号配平(容错仿真深度0)') : bad('style 括号不平衡! 按钮/toast 样式会崩!');
    ih.includes('.confirm-btn-cancel {') && ih.includes('.confirm-btn-delete {') && ih.includes('.confirm-modal-buttons {') ? ok('confirm 按钮系 CSS 在(取消/操作/按钮区)') : bad('confirm 按钮 CSS 缺失!');
    ih.includes('.toast-glass.success {') && ih.includes('.toast-glass.error {') && ih.includes('.toast-glass.info {') && ih.includes('.toast-glass.loading {') ? ok('toast 四态 CSS 在(success/error/info/loading)') : bad('toast CSS 缺失!');
    ih.includes('.view-caption {') && ih.includes('.stat-card {') && ih.includes('.table-row-advanced {') && ih.includes('#photoUsageRow:active {') ? ok('弹窗/表行/占用行样式在') : bad('通用样式缺失!');
    !ih.includes('#changelogBody') ? ok('cl 依赖 CSS 保持 0 残留') : bad('cl CSS 复现!');
    const msgIdx = ih.indexOf('.confirm-modal-message {');
    const puIdx = ih.indexOf('#photoUsageRow:active');
    (msgIdx >= 0 && puIdx > msgIdx && ih.slice(msgIdx, puIdx).includes('}')) ? ok('.confirm-modal-message 规则已闭合') : bad('.confirm-modal-message 未闭合(历史坏块)!');
} catch (e) { bad('5n 检查失败: ' + e.message); }

// 5o. 2026-09-07 计划三态徽章（过期红/今天靛蓝/明天天蓝；列表+日历明细通用）
console.log('-- 5o. 计划三态徽章 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    dj.includes('function planRelBadgeHtml') ? ok('通用徽章函数 planRelBadgeHtml 在') : bad('徽章函数缺失!');
    dj.includes('class="pl-today"') && dj.includes('class="pl-tomorrow"') && dj.includes('class="pl-overdue"') ? ok('三态徽章 html 在(过期/今天/明天)') : bad('三态徽章缺失!');
    dj.indexOf('planRelBadgeHtml(trip.createdAt)') > 0 ? ok('列表行已接三态徽章') : bad('列表未接!');
    const m1 = dj.indexOf('planRelBadgeHtml(t.createdAt)');
    const m2 = dj.lastIndexOf('planRelBadgeHtml(t.createdAt)');
    m2 > m1 ? ok('日历明细双处接入(整月/单日)') : bad('日历接入不全!');
    ih.includes('.pl-today {') && ih.includes('.pl-tomorrow {') && ih.includes('.dark-mode .pl-today') ? ok('pl-today/tomorrow CSS 在(含 dark)') : bad('徽章 CSS 缺失!');
} catch (e) { bad('5o 检查失败: ' + e.message); }

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

// 7. 数据层逻辑测试（纯函数：版本进位 / 备份文件名 / 云端清理排序）
console.log('-- 7. 数据层逻辑 --');
// 7.1 版本名进位（每段 0~10 共 11 值，满 10 进位）——与 bump.js 逻辑一致
const bumpName = (name) => {
    let [a, b, c, d] = name.split('.').map(Number);
    d++;
    if (d > 10) { d = 0; c++; }
    if (c > 10) { c = 0; b++; }
    return `${a}.${b}.${c}.${d}`;
};
const bumpCases = [
    ['1.1.1.4', '1.1.1.5'],
    ['1.1.1.9', '1.1.1.10'],
    ['1.1.1.10', '1.1.2.0'],
    ['1.1.10.10', '1.2.0.0'],
];
let bumpOk = true;
bumpCases.forEach(([from, to]) => { if (bumpName(from) !== to) { bumpOk = false; bad(`版本进位失败: ${from} → ${bumpName(from)} ≠ ${to}`); } });
bumpOk ? ok(`版本进位逻辑 (${bumpCases.length} 组，含满10进位)`) : bad('版本进位有错误');

// 7.2 备份文件名格式（buildSyncFileName 产出的模式）
const backupNameRe = /^xixi_hiking_backup_\d{8}_\d{6}\.html$/;
const testNames = ['xixi_hiking_backup_20260821_103000.html', 'xixi_hiking_backup_20260821.html', 'other.html'];
(testNames[0] && backupNameRe.test(testNames[0]) ? ok('备份文件名格式 (xixi_hiking_backup_YYYYMMDD_HHMMSS.html)') : bad('备份文件名格式测试失败'));
(!backupNameRe.test(testNames[1]) && !backupNameRe.test(testNames[2])) ? ok('备份文件名非法名拒绝') : bad('非法备份名未拒绝');

// 7.3 云端清理「保留最近 2 份」排序逻辑（文件名字典序=时间序，删最旧）
const cloudClean = (files) => {
    const sorted = files.slice().sort((a, b) => a.localeCompare(b));
    return sorted.slice(0, files.length - 2); // 要删除的最旧文件
};
const f1 = 'xixi_hiking_backup_20260801_100000.html';
const f2 = 'xixi_hiking_backup_20260815_100000.html';
const f3 = 'xixi_hiking_backup_20260821_100000.html';
const cleanResult = cloudClean([f1, f2, f3]);
(cleanResult.length === 1 && cleanResult[0] === f1) ? ok('云端清理：3 份留 2 删最旧') : bad('云端清理逻辑错误: ' + JSON.stringify(cleanResult));
(cloudClean([f1, f2]).length === 0) ? ok('云端清理：2 份不删') : bad('云端清理：≤2 份不应删');
(cloudClean([f1, f2, f3, f2]).length === 2) ? ok('云端清理：4 份删 2') : bad('云端清理：4 份逻辑错误');

// ===== 9. 数据层单测（2026-08-25：提取纯函数真实执行，非静态检查） =====
console.log('-- 9. 数据层单测 --');
const htmlSrc = allJs; // ★2026-08-30 方案A：函数在外部 JS 文件中
function extractFn(fnName) {
    const start = htmlSrc.indexOf('function ' + fnName + '(');
    if (start < 0) return null;
    const open = htmlSrc.indexOf('{', start);
    if (open < 0) return null;
    let depth = 1, i = open + 1;
    while (depth > 0 && i < htmlSrc.length) {
        if (htmlSrc[i] === '{') depth++;
        else if (htmlSrc[i] === '}') depth--;
        i++;
    }
    return htmlSrc.slice(start, i);
}
// 9.1 formatDuration 用时格式化（分钟->h/m）
const fdSrc = extractFn('formatDuration');
if (fdSrc) {
    const fdCtx = {};
    vm.createContext(fdCtx);
    vm.runInContext(fdSrc, fdCtx);
    const fd = fdCtx.formatDuration;
    fd(150) === '2h30m' ? ok('formatDuration: 150分->2h30m') : bad('formatDuration 150分->' + fd(150));
    fd(45) === '45m' ? ok('formatDuration: 45分->45m') : bad('formatDuration 45分->' + fd(45));
    fd(120) === '2h' ? ok('formatDuration: 120分->2h') : bad('formatDuration 120分->' + fd(120));
    fd(0) === '' ? ok('formatDuration: 0->空') : bad('formatDuration 0->' + fd(0));
} else { bad('formatDuration 函数提取失败'); }
// 9.2 WebDAV 密码加密往返（含中文）
const encSrc = extractFn('encPwd'), decSrc = extractFn('decPwd');
if (encSrc && decSrc) {
    const pwdCtx = { btoa: btoa, atob: atob };   // vm 沙箱注入 base64 全局
    vm.createContext(pwdCtx);
    vm.runInContext(encSrc, pwdCtx);
    vm.runInContext(decSrc, pwdCtx);
    const enc = pwdCtx.encPwd, dec = pwdCtx.decPwd;
    const plain = 'Abc123中文密码!@#';
    const cipher = enc(plain);
    (cipher !== plain && cipher.indexOf('xk1:') === 0) ? ok('密码加密：已混淆非明文') : bad('密码加密失败: ' + cipher);
    dec(cipher) === plain ? ok('密码解密：往返一致') : bad('密码解密失败: ' + dec(cipher));
    dec('') === '' ? ok('密码解密：空串兼容') : bad('密码解密空串失败');
    dec('legacy_plain') === 'legacy_plain' ? ok('密码解密：老明文兼容') : bad('老明文兼容失败');
} else { bad('encPwd/decPwd 提取失败'); }
// 9.3 记录统计逻辑（mock 数据：总里程/总用时/平均难度）
const mockRecords = [
    { distance: 5.2, duration: 150, elevation: 800, difficulty: 3 },
    { distance: 3.5, duration: 90, elevation: 500, difficulty: 2 },
    { distance: 0, duration: 0, elevation: 1200, difficulty: 5 }
];
const totalDist = mockRecords.reduce((a, r) => a + (r.distance || 0), 0);
const totalDur = mockRecords.reduce((a, r) => a + (r.duration || 0), 0);
const avgDiff = (mockRecords.reduce((a, r) => a + r.difficulty, 0) / mockRecords.length).toFixed(1);
(totalDist === 8.7) ? ok('统计：总里程 8.7km') : bad('总里程计算: ' + totalDist);
(totalDur === 240) ? ok('统计：总用时 240 分钟') : bad('总用时计算: ' + totalDur);
(avgDiff === '3.3') ? ok('统计：平均难度 3.3') : bad('平均难度: ' + avgDiff);

console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
