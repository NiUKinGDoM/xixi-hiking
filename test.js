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
    ['normalizeRecordFields（数据自愈）', 'function normalizeRecordFields'],
    ['lowerText（搜索归一化）', 'function lowerText'],
    ['yearKeyOf（年份分组）', 'function yearKeyOf'],
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
    // ★2026-09-18 计划页引导卡必须说明「日历 / 列表」两种视图可切换、入口在右上角
    //   （此前只写了「日历上看清」——新用户不知道还能切列表；记录页引导卡早有「右上角的山册」对照）
    (/把下一个山头定好日子/.test(ih) && /右上角可切换/.test(ih) && /<b>日历<\/b>/.test(ih) && /<b>列表<\/b>/.test(ih)) ? ok('守卫：计划页引导卡说明视图可切换（日历/列表 + 右上角）') : bad('计划页引导卡缺少视图切换说明!');
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
    dj.includes('jd-lab') && dj.includes('jd-body') && dj.includes('color:#334155') ? ok('小日记 view 标签/正文加深（2026-09-18 再提一档到 #334155）') : bad('小日记色加深缺失!');
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
    // ★2026-09-18 配色抽成 changelogPalette()（更新弹窗共用）→ 断言改看函数名与分支
    cj.includes('function changelogPalette') && cj.includes('tagTx: IS_DARK') && cj.includes(">本次更新</span>") ? ok('更新日志颜色内联化(IS_DARK 分支)') : bad('changelog 内联色缺失!');
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
    const iInfo = ih.indexOf('.toast-glass.info {');
    (iInfo >= 0 && ih.slice(iInfo, iInfo + 260).includes('background: rgba(226, 232, 240') && ih.slice(iInfo, iInfo + 260).includes('border: 1px solid rgba(100, 116, 139, 0.55)')) ? ok('info toast 玻璃底+边框(与绿/红同款配方)') : bad('info toast 无底无框!');
    // ★2026-09-10 toast 配色/层级回归（实际出过：loading 漏加 loading 类 → 底色全透明；Tailwind z-[300] 未编译 → 被弹窗遮罩 260 盖住）
    (function () {
        const allHaveBg = ['success', 'error', 'info', 'loading'].every(function (k) {
            const idx = ih.indexOf('.toast-glass.' + k + ' {');
            return idx >= 0 && ih.slice(idx, idx + 200).indexOf('background:') >= 0;
        });
        allHaveBg ? ok('toast 四态均有底色(防透明提示复发)') : bad('有 toast 变体缺底色!');
        const toastsj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
        toastsj.indexOf('toast-glass loading') >= 0 ? ok('loading toast 带 loading 变体类') : bad('loading toast 缺变体类(会透明)!');
        const toastcj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
        const zCount = (toastcj.match(/style\.zIndex = '300'/g) || []).length;
        (zCount === 3 && toastsj.indexOf('z-index:300') >= 0) ? ok('toast 内联层级 300(高于弹窗 260)') : bad('toast 层级缺失 core=' + zCount);
        const pCount = (toastcj.match(/style\.position = 'fixed'/g) || []).length;
        (pCount === 3 && toastsj.indexOf('position:fixed') >= 0) ? ok('toast 内联 position:fixed(不依赖 Tailwind 类)') : bad('toast position 缺失 core=' + pCount);
        const padCount = (toastcj.match(/style\.padding = '12px 20px'/g) || []).length;
        (padCount === 3 && toastsj.indexOf('padding:12px 20px') >= 0) ? ok('toast 内联内边距 12px 20px(px-5 从未编译)') : bad('toast 内边距缺失 core=' + padCount);
        (ih.indexOf('.border-red-500 {') >= 0 && ih.indexOf('border-color: #ef4444') >= 0) ? ok('.border-red-500 已补 CSS 定义') : bad('border-red-500 无定义(校验红边不生效)!');
        const toastdj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
        (toastdj.indexOf("classList.remove('border-red-500')") >= 0) ? ok('border-red-500 校验通过后清除') : bad('border-red-500 只加不删!');
        (ih.match(/align-items:baseline/g) || []).length >= 3 ? ok('统计卡数字/单位基线对齐(内联)') : bad('统计卡基线对齐缺失!');
        (function () { var a = ih.indexOf('.toast-glass.info {'), b = ih.indexOf('.toast-glass.loading {'); var ma = ih.slice(a, a + 300).match(/background:\s*([^;]+);/), mb = ih.slice(b, b + 300).match(/background:\s*([^;]+);/); (ma && mb && ma[1].trim() === mb[1].trim()) ? ok('loading 与 info 同配方(中性色统一)') : bad('loading/info 配方不一致!'); })();
    })();
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

// 5o2. 2026-09-20 日历「完成/延期」（用户需求）+ 崩溃上报提示改静默（用户反馈打扰）
console.log('-- 5o2. 日历「完成/延期」+ 崩溃静默 --');
try {
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    dj.includes('function planIsDueOrOverdue') ? ok('守卫：「已到期」判定函数在') : bad('已到期判定函数缺失!');
    // ★2026-09-20 口径统一改为「共用 planDayDiff」：两个函数都调它，不再各自复制日差算法
    (/function planDayDiff[\s\S]{0,700}86400000\)/.test(dj) && /function planIsDueOrOverdue[\s\S]{0,200}planDayDiff\(createdAt\)/.test(dj) && /function planRelBadgeHtml[\s\S]{0,200}planDayDiff\(createdAt\)/.test(dj)) ? ok('守卫：到期判定与徽章同口径（共用 planDayDiff·无重复算法）') : bad('判定口径不一致或日差算法重复!');
    (dj.match(/planIsDueOrOverdue\(t\.createdAt\)/g) || []).length === 2 ? ok('守卫：日历明细双处接入（整月+单日）') : bad('日历接入处数不对!');
    dj.includes('function showCompleteOrDelayModal') ? ok('守卫：「完成/延期」弹窗函数在') : bad('弹窗函数缺失!');
    /showCompleteOrDelayModal[\s\S]{0,2200}markPlannedComplete\(tripId, tripName\)/.test(dj) ? ok('守卫：「完成」走既有 markPlannedComplete（转记录页+庆祝卡）') : bad('「完成」未接既有流程!');
    /showCompleteOrDelayModal[\s\S]{0,2200}openPlannedDetailModal\(tripId, 'edit'\)/.test(dj) ? ok('守卫：「延期」打开既有编辑计划弹窗') : bad('「延期」未打开编辑弹窗!');
    (dj.match(/data-complete-delay/g) || []).length >= 6 ? ok('守卫：「完成/延期」渲染与事件绑定齐全') : bad('按钮/事件缺失!');
    /data-complete="' \+ t\.id/.test(dj) ? ok('守卫：未过期计划保留原「完成」按钮（不受影响）') : bad('未过期计划按钮被改动!');
    dj.includes('width:calc(100vw - 44px);max-width:400px;box-sizing:border-box;') ? ok('守卫：「完成/延期」弹窗宽度显式锁定') : bad('弹窗宽度未锁（会随内容跳）!');
    (!/showInfoMessage\('已自动上报/.test(sj) && /\[静默\] 已自动上报崩溃报告/.test(sj)) ? ok('守卫：崩溃上报不再弹提示（改静默 + 留诊断日志）') : bad('崩溃上报提示仍在弹!');
    // ★2026-09-20 A+B：列表视图也接入（图标换 + 点击分岔）
    /const _planDue = planIsDueOrOverdue\(trip\.createdAt\)/.test(dj) ? ok('守卫：列表视图已接入到期判定') : bad('列表视图未接入!');
    /_planDue \? 'event_repeat' : 'check'/.test(dj) ? ok('守卫：列表到期按钮图标按状态切换') : bad('列表图标未切换!');
    /_planDue \? '完成 \/ 延期' : '标记为已完成'/.test(dj) ? ok('守卫：列表到期按钮 title 提示「完成 / 延期」') : bad('列表 title 未切换!');
    /complete-planned-btn[\s\S]{0,1400}planIsDueOrOverdue\(trip\.createdAt\)\) showCompleteOrDelayModal/.test(dj) ? ok('守卫：列表点 ✓ 按状态分岔到两个弹窗') : bad('列表点击未分岔!');
    // ★2026-09-20 深色下弹窗标题靛蓝图标加深（实测：内联 #4f46e5 在深色弹窗底上仅 2.64:1 → 浅靛 8.33:1）
    (function () {
        const ih2 = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
        ih2.includes('body.dark-mode .confirm-modal-title .material-icons[style*="#4f46e5"] { color: #a5b4fc !important; }') ? ok('守卫：深色弹窗标题靛蓝图标已加深（属性选择器精准命中）') : bad('深色弹窗标题靛蓝图标未加深!');

        // ★2026-09-20 更新日志「v1.2.2.5 条目」必须写明随版交付的列表视图「完成 / 延期」
        //   背景：A+B 随 v1.2.2.5 一起进包，但写文案时漏记 → 事后补记；本守卫防止以后编辑该条目时又把这半句删掉
        //   ★首版断言只查「列表视图」三个字 → 条目正文里本来就有（「以前列表视图只有…」），删掉小标题也能通过 = **假阳性**；现改为校验「完整小标题 + 【新增】分组」，反向验证已报红
        const ac5 = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
        const mC = ac5.match(/'v1\.2\.2\.5': '([\s\S]*?)',\s*\n\s*'v1\.2\.2\.4'/);
        const tC = mC ? mC[1] : '';
        tC.includes('【新增】') && tC.includes('- **列表视图的到期计划也能「完成 / 延期」了**') ? ok('守卫：v1.2.2.5 更新日志含列表视图「完成 / 延期」补记') : bad('v1.2.2.5 更新日志缺列表视图补记！');
    })();
} catch (e) { bad('5o2 检查失败: ' + e.message); }

// 5p. 2026-09-08 崩溃采集/上报 + 隐私政策（设计语言内）
console.log('-- 5p. 崩溃上报与隐私 --');
try {
    const cj = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
    const sj = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
    const ij = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
    const ih = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
    const dj = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
    const java = fs.readFileSync(path.join(__dirname, 'android/app/src/main/java/com/xixi/hiking/MainActivity.java'), 'utf8');
    cj.includes('hiking_crash_queue') && cj.includes('persistCrashEntry') ? ok('JS 崩溃持久队列(重启不丢)在') : bad('崩溃队列缺失!');
    cj.includes('__getCrashQueue') && cj.includes('__clearCrashQueue') ? ok('队列读写接口在') : bad('队列接口缺失!');
    cj.includes('崩溃记录（持久') ? ok('导出诊断含持久崩溃队列') : bad('导出未含队列!');
    sj.includes('function buildCrashReport') && sj.includes('function maybeUploadCrashReport') ? ok('崩溃报告构建+自动上报函数在') : bad('上报函数缺失!');
    sj.includes("getNativeCrashLog") && sj.includes("'xixi_crash_'") && sj.includes('当日已上报') ? ok('上报含原生日志+当日一次限制') : bad('上报细节缺失!');
    ij.includes('maybeUploadCrashReport();') ? ok('启动自动上报调用在') : bad('启动调用缺失!');
    java.includes('public String getNativeCrashLog()') && java.includes('public void clearNativeCrashLog()') && java.includes('readCrashLogText') ? ok('原生崩溃读/清桥在') : bad('原生桥缺失!');
    ih.includes('id="privacyPolicyBtn"') && ih.includes('隐私政策') ? ok('关于卡隐私政策入口在') : bad('隐私入口缺失!');
    dj.includes('function showPrivacyPolicyModal') && dj.includes('dmi-group') ? ok('隐私弹窗(玻璃条目式)在') : bad('隐私弹窗缺失!');
    dj.includes('id="privacy-close"') && dj.includes('联网行为') ? ok('隐私含联网披露(崩溃上报)') : bad('隐私联网说明缺失!');
    dj.includes('权限清单与用途') && dj.includes('计划与备份提醒') ? ok('隐私权限清单在(逐项说明用途)') : bad('隐私权限清单缺失!');
    // ★2026-09-18 隐私政策专业化：法律要素守卫（生效日期 / 用户权利 / 未成年人 / 适用法律 / 第三方披露）
    // ★2026-09-23 生效日期与 LEGAL_VERSION 强绑定（不再写死日期 —— 既防忘 bump，也防 bump 了没改正文）
(function () {
    var _lv = (dj.match(/const LEGAL_VERSION = '([^']+)'/) || [])[1];
    _lv && dj.includes('生效日期：' + _lv) && dj.includes('你的权利') && dj.includes('未成年人保护') && dj.includes('中华人民共和国法律')
      ? ok('隐私政策含法律要素(生效日期=LEGAL_VERSION/权利/未成年人/适用法律)')
      : bad('隐私政策法律要素缺失，或生效日期与 LEGAL_VERSION 不同步!');
})();
    dj.includes('信息共享、转让与公开披露') && dj.includes('不会</b>向任何第三方出售') ? ok('隐私政策含第三方共享披露条款') : bad('隐私政策缺少共享/披露条款!');
    // ★2026-09-18 免责声明：必须有责任限制 + 「法定责任优先」兜底（否则条款可能整体无效）
    dj.includes('责任限制') && dj.includes('不排除或限制依法不得排除') && dj.includes('中华人民共和国法律') ? ok('免责声明含责任限制+法定优先兜底条款') : bad('免责声明缺少责任限制/法定优先条款!');
    dj.includes('数据安全与备份责任') && dj.includes('开发者无法找回你未备份的数据') ? ok('免责声明含备份责任划分') : bad('免责声明缺少备份责任条款!');
    dj.includes('function showDisclaimerModal') && dj.includes('免责声明') && dj.includes('野山') && dj.includes('风险自担') && dj.includes('不是领队') ? ok('免责声明弹窗+户外安全条目在(野山/风险自担)') : bad('免责声明缺失!');
    ih.includes('id="disclaimerBtn"') && ih.includes('>免责声明<') ? ok('关于卡免责声明入口在') : bad('免责声明入口缺失!');
    ij.includes("disclaimerBtn") && ij.includes('showDisclaimerModal') ? ok('app-init 免责声明绑定在') : bad('免责声明绑定缺失!');
    dj.includes('function showSupportModal') && dj.includes('function saveSupportQr') && dj.includes("SUPPORT_QR_WECHAT = 'assets/support-qr-wechat.jpg'") && dj.includes("SUPPORT_QR_ALIPAY = 'assets/support-qr-alipay.jpg'") ? ok('支持作者弹窗+双码外置 assets 路径在') : bad('支持作者/外置路径缺失!');
    ih.includes('id="supportAuthorBtn"') && ih.includes('支持作者') ? ok('关于卡支持作者入口(浅红 check-go)在') : bad('支持作者入口缺失!');
    java.includes('saveQrToGallery') ? ok('原生保存相册桥在(MediaStore)') : bad('保存桥缺失!');
    dj.includes('>微信</button>') && dj.includes('>支付宝</button>') && !dj.includes('6.66 元') && !dj.includes('金额随意') ? ok('双渠道按钮(微信/支付宝)+无金额胶囊') : bad('渠道按钮/金额异常!');
    dj.includes('保存二维码到相册后') ? ok('保存相册说明小字在') : bad('说明缺失!');
} catch (e) { bad('5p 检查失败: ' + e.message); }

// 5q. 2026-09-08 安全纵深（防重打包/资源校验/备份关闭/混淆工具链）
console.log('-- 5q. 安全纵深 --');
try {
    const java = fs.readFileSync(path.join(__dirname, 'android/app/src/main/java/com/xixi/hiking/MainActivity.java'), 'utf8');
    const man = fs.readFileSync(path.join(__dirname, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const rg = fs.readFileSync(path.join(__dirname, 'android/app/src/main/java/com/xixi/hiking/ResGuard.java'), 'utf8');
    const sec = fs.readFileSync(path.join(__dirname, 'tools/security.js'), 'utf8');
    java.includes('verifyInstalledSignature') && java.includes('SIGN_EXPECT_SHA') && java.includes('sha256Hex') ? ok('防重打包签名自校验在') : bad('签名校验缺失!');
    man.includes('allowBackup="false"') && man.includes('fullBackupContent="false"') ? ok('系统备份已关闭(数据防拖库)') : bad('allowBackup 未关!');
    java.includes('verifyAssetsIntegrity') && rg.includes('HASHES') && rg.split('"index.html"').length === 2 ? ok('资源完整性校验+ResGuard 清单在') : bad('资源校验缺失!');
    java.includes('安装包校验失败') && java.includes('资源校验提示') ? ok('篡改提示对话框文案在') : bad('提示缺失!');
    sec.includes('javascript-obfuscator') && sec.includes("cmd === 'obf'") && sec.includes("cmd === 'hash'") ? ok('安全工具链(obf/hash)在') : bad('工具链缺失!');
} catch (e) { bad('5q 检查失败: ' + e.message); }

// 5r. 机制化自检（2026-09-10）：外部注入检测 / 文档版本一致 / Java 括号配平
console.log('-- 5r. 机制化自检 --');
try {
    const wwwDir = path.join(__dirname, 'www');
    const scanFiles = ['index.html', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js', 'sw.js'];
    const badMarks = [];
    scanFiles.forEach(f => {
        const t = fs.readFileSync(path.join(wwwDir, f), 'utf8');
        if (t.indexOf('data-page-node-id') >= 0) badMarks.push(f + ':data-page-node-id');
        if (t.indexOf('data-editor-injected') >= 0) badMarks.push(f + ':data-editor-injected');
    });
    badMarks.length === 0 ? ok('外部编辑器注入检测（无 data-page-node-id 等标记）') : bad('检测到外部注入标记: ' + badMarks.join(', '));
    const ps = fs.readFileSync(path.join(__dirname, '..', 'PROJECT_STATUS.md'), 'utf8');
    const m1 = ps.match(/最后更新：\d{4}-\d{2}-\d{2}（v([\d.]+) \/ vc(\d+)）/);
    const av = (fs.readFileSync(path.join(wwwDir, 'app-core.js'), 'utf8').match(/APP_VERSION = '([\d.]+)'/) || [])[1];
    (m1 && av && m1[1] === av) ? ok('文档版本一致（PROJECT_STATUS = ' + av + '）') : bad('文档版本不一致: PROJECT_STATUS=' + (m1 ? m1[1] : '?') + ' APP=' + av);
    const jv = fs.readFileSync(path.join(__dirname, 'android/app/src/main/java/com/xixi/hiking/MainActivity.java'), 'utf8');
    const bal = (jv.split('{').length - 1) - (jv.split('}').length - 1);
    bal === 0 ? ok('MainActivity 花括号配平') : bad('MainActivity 花括号不平衡: ' + bal);
    const qrFiles = ['assets/support-qr-wechat.jpg', 'assets/support-qr-alipay.jpg'];
    const qrMissing = qrFiles.filter(f => !fs.existsSync(path.join(wwwDir, f)));
    qrMissing.length === 0 ? ok('收款码外置文件在位（assets/ 两张）') : bad('收款码外置文件缺失: ' + qrMissing.join(', '));
    const adRaw2 = fs.readFileSync(path.join(wwwDir, 'app-data.js'), 'utf8');
    const swRaw = fs.readFileSync(path.join(wwwDir, 'sw.js'), 'utf8');
    swRaw.indexOf('assets/support-qr-wechat.jpg') >= 0 && swRaw.indexOf('assets/support-qr-alipay.jpg') >= 0 && /CACHE_NAME = 'xixi-hiking-v\d+'/.test(swRaw) ? ok('SW 离线收录收款码 + CACHE_NAME 版本化') : bad('SW 未收录收款码!');
    // ★2026-09-10 离线自足（野外无信号是徒步核心场景；原两个阿里 CDN 依赖曾致断网图标全失效+布局塌）
    const offIdx = fs.readFileSync(path.join(wwwDir, 'index.html'), 'utf8');
    offIdx.indexOf('gw.alipayobjects') < 0 ? ok('无外部 CDN 依赖（断网自足）') : bad('index.html 仍有外部 CDN 引用!');
    (offIdx.indexOf('@font-face') >= 0 && offIdx.indexOf('assets/fonts/material-icons.woff2') >= 0 && fs.existsSync(path.join(wwwDir, 'assets/fonts/material-icons.woff2'))) ? ok('图标字体本地化（@font-face + woff2 在位）') : bad('图标字体未本地化!');
    (fs.existsSync(path.join(wwwDir, 'assets/vendor/tailwind4.1.13.js')) && offIdx.indexOf('assets/vendor/tailwind4.1.13.js') >= 0) ? ok('Tailwind 运行时本地化') : bad('Tailwind 未本地化!');
    (offIdx.indexOf('rel="icon"') >= 0 && fs.existsSync(path.join(wwwDir, 'icon-192.png'))) ? ok('favicon 已声明（消除 404）') : bad('favicon 缺失!');
    (swRaw.indexOf('assets/fonts/material-icons.woff2') >= 0 && swRaw.indexOf('assets/vendor/tailwind4.1.13.js') >= 0 && swRaw.indexOf('manifest.json') >= 0) ? ok('SW 离线收录 字体/vendor/manifest') : bad('SW 未收录离线关键资源!');
    adRaw2.indexOf('function isIOSWeb') >= 0 && adRaw2.indexOf('长按二维码图片即可保存到相册') >= 0 ? ok('iOS 网页降级（保存二维码→提示长按）在') : bad('iOS 降级缺失!');
    const adRaw = fs.readFileSync(path.join(wwwDir, 'app-data.js'), 'utf8');
    adRaw.indexOf('data:image/jpeg;base64') < 0 ? ok('app-data 无 base64 内联残留（已瘦身）') : bad('app-data 仍有 base64 内联!');
} catch (e) { bad('5r 机制检查失败: ' + e.message); }

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

// 9.4 服务端文本转义（★2026-09-16 五项优化⑤ 安全加固：云端文件名 / 错误正文进 innerHTML 前必须过 esc()）
const escSrc = extractFn('escapeHtml'), escWrap = extractFn('esc');
if (escSrc && escWrap) {
    const escCtx = { String };
    vm.createContext(escCtx);
    vm.runInContext(escSrc, escCtx);
    vm.runInContext(escWrap, escCtx);
    const evil = '<img src=x onerror=alert(1)>';
    escCtx.esc(evil).indexOf('<') < 0 ? ok('转义：<img onerror> 标记被消解') : bad('转义失败: ' + escCtx.esc(evil));
    escCtx.esc('" onmouseover="x').indexOf('"') < 0 ? ok('转义：引号被消解（属性注入防护）') : bad('引号未转义');
    escCtx.esc(null) === '' ? ok('转义：null → 空串') : bad('null 转义失败: ' + escCtx.esc(null));
    escCtx.esc(0) === '0' ? ok('转义：数字 0 不丢') : bad('数字 0 被吞: ' + escCtx.esc(0));
} else { bad('esc/escapeHtml 提取失败'); }
// 9.4b 源码守卫：云端备份列表的文件名插值必须包在 esc(...) 里（防回退成裸插值）
(/\$\{esc\(formatSyncFileLabel\(f\.name\)\)\}/.test(allJs) && !/\$\{formatSyncFileLabel\(f\.name\)\}/.test(allJs))
    ? ok('守卫：云端文件名插值已转义（无裸插值）') : bad('云端文件名出现裸插值（未转义）');

// 9.5 日期健壮性（★2026-09-17 修复③：无效日期不得输出 NaN-NaN-NaN）
const fdtSrc = extractFn('formatDateTime'), fdtlSrc = extractFn('formatDateTimeLocal');
if (fdtSrc && fdtlSrc) {
    const dateCtx = { String };
    vm.createContext(dateCtx);
    vm.runInContext(fdtSrc, dateCtx);
    vm.runInContext(fdtlSrc, dateCtx);
    const fdt = dateCtx.formatDateTime, fdtl = dateCtx.formatDateTimeLocal;
    fdt('not-a-date') === '-' ? ok('日期：无效串 → "-"') : bad('无效日期未兜底: ' + fdt('not-a-date'));
    fdt('2026-13-45T99:99:99.000Z') === '-' ? ok('日期：越界日期 → "-"') : bad('越界日期未兜底: ' + fdt('2026-13-45T99:99:99.000Z'));
    fdt({}) === '-' ? ok('日期：非字符串（对象）→ "-"') : bad('对象日期未兜底');
    fdt(null) === '-' ? ok('日期：null → "-"') : bad('null 未兜底');
    fdtl('not-a-date') === '' ? ok('日期：本地格式无效串 → 空串') : bad('formatDateTimeLocal 未兜底: ' + fdtl('not-a-date'));
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fdt('2026-09-17T10:30:00.000Z')) ? ok('日期：正常值格式不变') : bad('正常日期格式被破坏: ' + fdt('2026-09-17T10:30:00.000Z'));
} else { bad('formatDateTime/formatDateTimeLocal 提取失败'); }
// 9.5b 源码守卫：崩溃上报的「当日」不得用 UTC 日期截断（★2026-09-17 修复④）
(!/toISOString\(\)\.slice\(0, *10\)/.test(allJs)) ? ok('守卫：无 UTC 日期截断（当日去重已用本地日期）') : bad('仍存在 toISOString().slice(0,10)（时区会差一天）');
// 9.5c 源码守卫：搜索匹配必须过 lowerText（★2026-09-17 修复②：裸 .toLowerCase() 在字段类型异常时抛 TypeError）
(!/(?<!String)\(r\.(name|notes|mood|weather|companions) *\|\| *''\)\.toLowerCase/.test(allJs)) ? ok('守卫：搜索匹配已归一化（无裸 toLowerCase）') : bad('搜索出现裸 toLowerCase（类型异常会崩）');
(!/\(t\.name *\|\| *''\)\.toLowerCase/.test(allJs)) ? ok('守卫：计划页搜索已归一化') : bad('计划页搜索出现裸 toLowerCase');
// 9.5d 源码守卫：保存校验必须是归一化而非严格 filter（★2026-09-17 修复①：严格 filter 会静默删用户记录）
(/function normalizeRecordFields/.test(allJs) && /normalizeRecordFields\(record\)/.test(allJs) && /normalizeRecordFields\(trip\)/.test(allJs)) ? ok('守卫：保存走归一化（记录+计划）') : bad('保存校验未走归一化（会静默删记录）');
(!/typeof (record|trip)\.difficulty === 'number' &&/.test(allJs)) ? ok('守卫：旧的严格 filter 已移除（加载+保存）') : bad('旧严格 filter 仍存在（会静默丢记录）');

// 9.5e 源码守卫：弹窗层级统一为 confirm-modal 体系（★2026-09-17 去掉旧的 Tailwind z-50 写法）
(!/inset-0 z-50/.test(allJs)) ? ok('守卫：弹窗不再用 Tailwind 拼装的 z-50 遮罩') : bad('仍有 inset-0 z-50 旧写法（层级会比 confirm-modal 低）');
(!/querySelectorAll\('\.confirm-modal, #/.test(allJs)) ? ok('守卫：closeOpenModals 不再用 id 特判（统一 .confirm-modal）') : bad('closeOpenModals 仍有 id 特判旧写法');
(!/sync-config-(toggle-btn|collapse)/.test(html)) ? ok('守卫：旧同步配置折叠区 CSS/类已彻底删除') : bad('index.html 仍残留旧折叠区样式（sync-config-toggle-btn/collapse）');
// 9.5f 源码守卫：弹窗按钮统一为标准体系（★2026-09-17 去掉 modal-option-btn/modal-cancel-btn 旧类）
(!/modal-(option|cancel)-btn/.test(allJs + html)) ? ok('守卫：弹窗按钮无旧类残留（已统一 check-go-btn/confirm-btn-cancel）') : bad('仍存在 modal-option-btn/modal-cancel-btn 旧类');
(/\.check-go-btn \{[^}]*border-radius: 12px/.test(html)) ? ok('守卫：.check-go-btn 基础定义自带圆角（全宽场景不塌成 0px）') : bad('.check-go-btn 缺基础圆角（全宽按钮会变直角）');
// 9.5g 源码守卫：山册彩边色值（★2026-09-18）——说明图例必须与卡片书脊逐一同色，且档位色差可辨
const cssBlockOf = (sel) => { const m = html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : null; };
const legendBg = (sel) => { const b = cssBlockOf(sel); const m = b && b.match(/background:\s*(#[0-9a-f]{6})/i); return m ? m[1].toLowerCase() : null; };
const ridgeColor = (sel) => { const b = cssBlockOf(sel); const m = b && b.match(/border-(?:right|right-color):\s*(?:4px\s+solid\s+)?(#[0-9a-f]{6})/i); return m ? m[1].toLowerCase() : null; };
const rgbDist = (a, b) => (a && b) ? Math.sqrt(Math.pow(parseInt(a.slice(1, 3), 16) - parseInt(b.slice(1, 3), 16), 2) + Math.pow(parseInt(a.slice(3, 5), 16) - parseInt(b.slice(3, 5), 16), 2) + Math.pow(parseInt(a.slice(5, 7), 16) - parseInt(b.slice(5, 7), 16), 2)) : -1;
const legL = [], legD = [], ridgeL = [], ridgeD = [];
for (let li = 1; li <= 5; li++) {
    legL.push(legendBg('.rl-' + li));
    legD.push(legendBg('body.dark-mode .rl-' + li));
    ridgeL.push(ridgeColor('.mb-card.mb-ridge-' + li));
    ridgeD.push(ridgeColor('body.dark-mode .mb-card.mb-ridge-' + li));
}
const sameAll = (a, b) => a.length === 5 && a.every((v, idx) => v && v === b[idx]);
const uniqAll = (a) => a.every(Boolean) && new Set(a).size === 5;
const minDist = (a) => { let mm = 9999; for (let di = 1; di < a.length; di++) { const d = rgbDist(a[di - 1], a[di]); if (d >= 0 && d < mm) mm = d; } return mm; };
sameAll(legL, ridgeL) ? ok('守卫：彩边图例与山册书脊同色（浅色 5 档）') : bad('彩边图例与书脊不一致(浅色) -> ' + JSON.stringify(legL) + ' vs ' + JSON.stringify(ridgeL));
sameAll(legD, ridgeD) ? ok('守卫：彩边图例与山册书脊同色（深色 5 档）') : bad('彩边图例与书脊不一致(深色) -> ' + JSON.stringify(legD) + ' vs ' + JSON.stringify(ridgeD));
uniqAll(legL) && uniqAll(legD) ? ok('守卫：彩边 5 档色值互不相同') : bad('彩边存在重复/缺失色值 -> ' + JSON.stringify(legL));
(minDist(legL) >= 35 && minDist(legD) >= 35) ? ok('守卫：彩边相邻档色差可辨（浅色 ' + minDist(legL).toFixed(1) + ' / 深色 ' + minDist(legD).toFixed(1) + '）') : bad('彩边相邻档色差过小 -> 浅色 ' + minDist(legL).toFixed(1) + ' 深色 ' + minDist(legD).toFixed(1));
// ★2026-09-18 源码守卫：更新弹窗必须与「更新日志」共用 renderChangelogBody（此前弹窗是纯文本，** 与 - 原样露出）
const syncJs2 = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
(/function showUpdateModal/.test(syncJs2) && /renderChangelogBody\(bodyText, pal\.CL, pal\.MUTED\)/.test(syncJs2)) ? ok('守卫：更新弹窗共用日志渲染器（不再露出 **）') : bad('更新弹窗未走 renderChangelogBody！');
/var pal = changelogPalette\(\);/.test(syncJs2) ? ok('守卫：更新弹窗与日志共用配色函数') : bad('更新弹窗未用 changelogPalette！');
// 条目编号渲染（圆点 → 1. 2. 3.，每组重置）
/itemNo = 0;/.test(allJs) && /itemNo\+\+/.test(allJs) && /'\.<\/span>'/.test(allJs) ? ok('守卫：更新日志条目按数字编号（每组重置）') : bad('条目编号渲染缺失！');
// ★2026-09-18 源码守卫：zip 备份必须带网盘配置（曾漏字段 → 完整备份导入后配置无效）
const syncJs3 = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
const initJs3 = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
/syncConfig: payload\.syncConfig,/.test(syncJs3) ? ok('守卫：zip 备份含网盘配置（完整备份/云端恢复都能配好）') : bad('zip 备份漏 syncConfig！导入后网盘配置会失效');
(!/recordsViewMode === 'mountain'\) return null/.test(initJs3)) ? ok('守卫：山册视图不再隐藏记录引导卡') : bad('山册视图仍会隐藏引导卡！');
// ★2026-09-18 源码守卫：原生外观收口（Chromium/Edge/iOS 系统控件外观不得残留）
const syncBlockCss = cssBlockOf('.sync-input') || '';
/appearance:\s*none/.test(syncBlockCss) ? ok('守卫：同步输入框已去原生外观（appearance:none）') : bad('.sync-input 缺 appearance:none（iOS 会露原生内阴影）');
(/input\[type="number"\]::-webkit-inner-spin-button/.test(html) && /input\[type="number"\]::-webkit-outer-spin-button/.test(html)) ? ok('守卫：数字框原生上下箭头已关闭') : bad('数字框未关原生 spinner（桌面 hover 会露箭头）');
(/::-ms-reveal/.test(html) && /::-ms-clear/.test(html)) ? ok('守卫：密码框原生「显示密码」按钮已隐藏') : bad('密码框未隐藏 ::-ms-reveal/::-ms-clear（Edge/WebView 会露小眼睛）');
(/-webkit-autofill/.test(html) && /body\.dark-mode input:-webkit-autofill/.test(html)) ? ok('守卫：自动填充底色已玻璃化（浅色+深色）') : bad('未处理自动填充底色（浏览器会刷系统浅黄底）');
(!/<select[\s>]/.test(html + allJs)) ? ok('守卫：全站无原生 <select>（统一自绘选择器弹窗）') : bad('出现原生 <select>，会露系统下拉框');
// ★2026-09-18 源码守卫：同意留存（隐私政策/免责声明需显式勾选 + 留存条款版本与时间戳）
const dataJsLegal = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
const initJsLegal = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');
(/const LEGAL_VERSION = '\d{4}-\d{2}-\d{2}'/.test(dataJsLegal)) ? ok('同意留存：条款版本常量在') : bad('LEGAL_VERSION 缺失!');
(/LEGAL_AGREE_KEY = 'hiking_legal_agree'/.test(dataJsLegal) && /function saveLegalAgreement/.test(dataJsLegal) && /new Date\(\)\.toISOString\(\)/.test(dataJsLegal)) ? ok('同意留存：记录条款版本 + ISO 时间戳') : bad('同意记录写入缺失!');
(/function showLegalConsentModal/.test(dataJsLegal) && /id="legalAgreeChk"/.test(dataJsLegal) && /id="legalAgree"/.test(dataJsLegal) && /id="legalLater"/.test(dataJsLegal)) ? ok('同意弹窗：显式勾选 + 同意/暂不同意按钮在') : bad('同意弹窗结构缺失!');
(/MutationObserver/.test(dataJsLegal) && /resolve\(false\)/.test(dataJsLegal)) ? ok('同意弹窗：防 Promise 永挂（脱离 DOM 即 resolve 兜底）') : bad('同意弹窗缺少永挂兜底!');
(/function hasAgreedLegal/.test(dataJsLegal) && /rec\.version === LEGAL_VERSION/.test(dataJsLegal)) ? ok('同意留存：条款版本变更会自动重新征求同意') : bad('同意版本校验缺失!');
(/你已于/.test(dataJsLegal) && /formatLegalStamp/.test(dataJsLegal)) ? ok('隐私政策弹窗展示同意时间（可查证）') : bad('同意记录未展示!');
(/maybePromptLegalConsent\(\)/.test(initJsLegal) && /maybePromptLegalConsent\(true\)/.test(initJsLegal)) ? ok('同意触发：启动 + 首次进关于应用') : bad('同意触发时机缺失!');
// ★2026-09-18 源码守卫：closeOpenModals 豁免机制（同意弹窗常驻下层，无需临时摘 DOM）
const syncJsPersist = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
const dataJsPersist = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
(/function closeOpenModals\(force\)/.test(syncJsPersist) && /hasAttribute\('data-persist'\)/.test(syncJsPersist)) ? ok('closeOpenModals 支持 data-persist 豁免 + force 强制清理') : bad('closeOpenModals 豁免机制缺失!');
(/modal\.setAttribute\('data-persist', '1'\)/.test(dataJsPersist)) ? ok('同意弹窗声明 data-persist（免被条款弹窗的 closeOpenModals 清掉）') : bad('同意弹窗未声明 data-persist!');
(!/detached/.test(dataJsPersist)) ? ok('同意弹窗不再依赖「临时摘 DOM + 挂回」的绕法') : bad('同意弹窗回退成了临时摘 DOM 的老方案!');
// ★2026-09-18 源码守卫：浅色弹窗内文字对比度
//   依据：弹窗卡片背景仅 rgba(255,255,255,0.08)，叠遮罩后**实测合成底色 ≈ rgb(184,184,184)**，
//   所以浅灰文字（#64748b 2.40:1 / #52606f 3.25:1 / #94a3b8 1.29:1）在这套玻璃卡上都不合格。
//   规则：卡片内的正文/标签色，按合成底色算 WCAG 对比度必须 ≥ 4.5:1。
const _linC = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const _relLum = (r, g, b) => 0.2126 * _linC(r) + 0.7152 * _linC(g) + 0.0722 * _linC(b);
const _DLG_BG = _relLum(184, 184, 184);   // 实测合成底色（截图取像素）
const _crOf = (hex) => {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return -1;
    const n = parseInt(hex.slice(1), 16);
    const l = _relLum((n >> 16) & 255, (n >> 8) & 255, n & 255);
    const a = Math.max(l, _DLG_BG), b = Math.min(l, _DLG_BG);
    return (a + 0.05) / (b + 0.05);
};
const _colorIn = (sel) => { const b = cssBlockOf(sel); const m = b && b.match(/color:\s*(#[0-9a-f]{6})/i); return m ? m[1].toLowerCase() : null; };
const _crCheck = (name, hex) => {
    const r = _crOf(hex);
    if (r < 0) { bad('弹窗文字对比度取色失败：' + name + '（' + hex + '）'); return; }
    (r >= 4.5) ? ok('弹窗文字对比度 ' + name + ' ' + hex + '（' + r.toFixed(2) + ':1）')
               : bad('弹窗文字对比度过低：' + name + ' ' + hex + ' 仅 ' + r.toFixed(2) + ':1（需 ≥4.5）');
};
[['dmi-title', _colorIn('.dmi-title')], ['dmi-body', _colorIn('.dmi-body')],
 ['legal-link', _colorIn('.legal-link')], ['sync-bind-steps b', _colorIn('.sync-bind-steps b')]].forEach(([n, h]) => _crCheck(n, h));
[['更新日志 MUTED', (allJs.match(/MUTED: IS_DARK \? '[^']*' : '(#[0-9a-f]{6})'/) || [])[1]],
 ['更新日志 tagTx', (allJs.match(/tagTx: IS_DARK \? '[^']*' : '(#[0-9a-f]{6})'/) || [])[1]],
 ['照片占用 sub', (allJs.match(/sub: IS_DARK \? '[^']*' : '(#[0-9a-f]{6})'/) || [])[1]],
 ['网盘信息 LB', (allJs.match(/const LB = IS_DARK \? '[^']*' : '(#[0-9a-f]{6})'/) || [])[1]]].forEach(([n, h]) => _crCheck(n, h));
// ★2026-09-20 彻查修复守卫（P1×3 + P2×3 + P3×4）—— 每一条都对应一个实测确认过的真问题
const _fixData = fs.readFileSync(path.join(__dirname, 'www/app-data.js'), 'utf8');
const _fixCore = fs.readFileSync(path.join(__dirname, 'www/app-core.js'), 'utf8');
const _fixSync = fs.readFileSync(path.join(__dirname, 'www/app-sync.js'), 'utf8');
const _fixInit = fs.readFileSync(path.join(__dirname, 'www/app-init.js'), 'utf8');

// ★2026-09-22 语义与一致性守卫（红色只给危险操作 / 标题不折行 / 输入框玻璃化 / 时间显示人话）
//   背景：用户 2026-09-22 实测反馈三条 —— ① 红色（.check-go-btn）被 9 处非危险操作误用；
//   ② 记录页标题被右侧按钮挤窄（窄屏折成竖排）；③ 编辑弹窗输入框是不透明白块 + 时间显示裸 ISO。
const _semH = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
{
  const _cases = [
    ['保存', /id="save-btn-' \+ r\.id \+ '" data-testid="save-button-' \+ r\.id \+ '" class="ripple-effect btn-click-effect glass-btn"/],
    ['编辑这条记录', /id="rd-edit-btn" class="glass-btn ripple-effect"/],
    ['引导·去记录页', /id="welcomeGoBtn" class="glass-btn ripple-effect"/],
    ['引导·记下第一笔', /id="rGoBtn" class="glass-btn ripple-effect"/],
    ['引导·添加一条计划', /id="pGoBtn" class="glass-btn ripple-effect"/],
    ['引导·去看看导出', /id="sGoBtn" class="glass-btn ripple-effect"/],
    ['绑定账号', /id="syncBindOpenBtn" class="glass-btn ripple-effect"/],
    ['支持作者', /id="supportAuthorBtn" class="ripple-effect glass-btn"/],
    ['选择器·确定', /class="glass-btn ripple-effect" id="dtpOk"/],
    ['照片弹窗·优化', /class="glass-btn ripple-effect" type="button" id="puOpt"/],
  ];
  _cases.forEach(function (c) {
    var re = new RegExp(c[1].source);
    re.test(_fixData) || re.test(_fixCore) || re.test(_semH)
      ? ok('守卫：「' + c[0] + '」已改中性（红色只给危险操作）')
      : bad('「' + c[0] + '」仍是危险红 —— .check-go-btn 只能用于危险操作!');
  });
}

// 危险操作必须保留红色
[/id="wipeAllBtn" class="ripple-effect check-go-btn"/,
 /class="check-go-btn ripple-effect" id="orphan-delete"/,
 /id="batchDeleteBtn" class="check-go-btn ripple-effect"/,
 /id="plannedBatchDeleteBtn" class="check-go-btn ripple-effect"/,
 // ★2026-09-22 行内删除钮曾要求为红；★2026-09-23 用户定案改「淡红图标」(.danger-subtle-btn)：去红底与红边框，只留红色图标/文字 —— 一列几十行红框会让红色失去警示力
 // ★2026-09-23 二次收口：确认真实危险操作也必须红（此前有 16 处非危险按钮误用红，已全部改中性）
 /class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-delete"/,
 /class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-planned-delete"/,
 /class="confirm-btn-delete check-go-btn ripple-effect" id="batch-confirm-delete"/,
 /class="confirm-btn-delete check-go-btn ripple-effect" id="pbatch-confirm-delete"/,
 /class="check-go-btn ripple-effect" id="wipe-go2"/,
 /class="check-go-btn ripple-effect" id="wipe-next1"/,
 /data-testid="delete-button-' \+ record\.id \+ '" class="danger-subtle-btn ripple-effect"/,
 /'<button class="danger-subtle-btn ripple-effect" data-del="' \+ t\.id \+ '" style="' \+ delStyle \+ '">删除<\/button>'/].every(function (re) { return re.test(_semH) || re.test(_fixData) || re.test(_fixCore); })   // ★orphan-delete 在 app-core.js
  ? ok('守卫：危险操作（抹掉足迹 / 清理 / 批量删除 / 确认删除）仍为红色')
  : bad('危险操作的红色被误改!');
// 行内删除＝「淡红图标」（不再是红框按钮；★2026-09-23 用户定案）
[/'<button class="danger-subtle-btn ripple-effect" data-del="' \+ t\.id \+ '" style="' \+ delStyle \+ '">删除<\/button>'/,
 /data-testid="delete-button-' \+ record\.id \+ '" class="danger-subtle-btn ripple-effect"/,
 /\.danger-subtle-btn\s*\{[^}]*background:\s*transparent\s*!important/].every(function (re) { return re.test(_fixData) || re.test(_semH); })
  ? ok('守卫：行内删除已改「淡红图标」（去红底/红边框）')
  : bad('行内删除又变回红框按钮 —— 每行都红等于没有警示力!');
// 弹窗底部按钮尺寸统一：.glass-btn 必须与取消 / 危险按钮同规则
//   ★2026-09-23 补漏：中性改造（check-go-btn → glass-btn）后漏掉 .glass-btn，
//   没内联尺寸的几个（日期「确定」/ 保存二维码 / 同意并继续 / 分享）与旁边取消按钮一大一小
(/\n\s*\.confirm-modal-buttons \.glass-btn\s*\{/.test(_semH) && _semH.indexOf(".confirm-modal-buttons .glass-btn:disabled") >= 0)
  ? ok('守卫：弹窗底部按钮尺寸统一（.glass-btn 已纳入，不再一大一小）')
  : bad('弹窗底部 .glass-btn 未纳入尺寸统一规则 —— 会与旁边的取消按钮一大一小!');
// 记录页删除按钮＝文字「删除」（与计划页同款；★2026-09-23 用户要求：不要红色垃圾桶图标）
/data-testid="delete-button-' \+ record\.id \+ '"[^>]*>删除<\/button>/.test(_fixData)
  ? ok('守卫：记录页删除按钮与计划页同款（文字「删除」，非图标）')
  : bad('记录页删除按钮又变回图标钮 —— 用户要求与计划页一致!');

// 标题不折行 + 不参与收缩（窄屏防竖排）
// 标题不折行 + 不参与收缩 + 标题行防挤压（窄屏不竖排 / 不横溢；实测 360 单行、320 换行兜底）
(/\.title-text \{ white-space: nowrap; \}/.test(_semH) && _semH.indexOf("#statsTitle, #heatmapTitle, #recordsTitle, #plannedTitle, #settingsTitle { flex-shrink: 0; }") >= 0 && _semH.indexOf("#plansTitle") < 0 && _semH.indexOf("#overviewTitle") < 0)
  ? ok('守卫：页标题 nowrap + 不收缩（防挤成竖排）')
  : bad('页标题防挤护缺失!');
(_semH.match(/class="panel-hdr flex /g) || []).length === 3
  ? ok('守卫：3 个页面标题行已挂 .panel-hdr')
  : bad('.panel-hdr 未挂到 3 个标题行!');
(/\.panel-hdr \{ flex-wrap: wrap; row-gap: 8px; \}/.test(_semH) && /\.panel-hdr > div:last-child \{ margin-left: auto; \}/.test(_semH))
  ? ok('守卫：标题行换行兜底（空间不足时控件组换行并右对齐）')
  : bad('标题行换行兜底缺失!');
(/@media \(max-width: 430px\) \{[\s\S]{0,400}?\.panel-hdr \.glass-btn \{ padding-left: 8px; padding-right: 8px; \}/.test(_semH))
  ? ok('守卫：窄屏标题行收紧（保持单行）')
  : bad('窄屏标题行收紧缺失!');

// 输入框玻璃化（不再是 0.95 不透明白块）
// ★2026-09-22 修正：原断言写死「background: rgba(255, 255, 255, 0.95)」（逗号后带空格），
//   而 .edit-merge-box 的内联样式是 background:rgba(255,255,255,0.95)（无空格）→ 断言漏判，
//   于是「时 / 分 · 里程」那两个白盒一直没跟着玻璃化（靠对比度像素实测才抓出来）。
//   → 断言一律用 \s* 容错空格，且必须覆盖 JS 模板里的内联样式。
(/background: rgba\(255, 255, 255, 0\.42\);/.test(_semH) && /backdrop-filter: blur\(2px\) saturate\(150%\);/.test(_semH) && !/background\s*:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.95\s*\)/.test(_semH))
  ? ok('守卫：输入框已玻璃化（半透明 + 全站玻璃配方）')
  : bad('输入框仍是不透明白块!');
// ★2026-09-22 复合白盒（时/分 · 里程）也必须是玻璃；浅色占位符必须够深（改玻璃底后像素实测对比度）
((_fixData.match(/class="edit-merge-box" style="[^"]*background:rgba\(255,255,255,0\.42\)[^"]*backdrop-filter:blur\(2px\) saturate\(150%\)/g) || []).length === 2)
  ? ok('守卫：时/分·里程复合框已玻璃化（不再是不透明白盒）')
  : bad('edit-merge-box 仍是不透明白盒!');
(_semH.indexOf('.edit-input::placeholder { color: rgba(51, 65, 85, 0.85); opacity: 1; }') >= 0 && _semH.indexOf('color: rgba(51, 65, 85, 0.85);') >= 0)
  ? ok('守卫：浅色占位符已提档（玻璃底上对比度达标）')
  : bad('浅色占位符太淡（玻璃底上看不清）!');
// ★2026-09-23 非危险按钮必须中性（「完成 / 编辑 / 保存 / 分享 / 同意 / 确定」等一律 glass-btn；红色只给会丢数据的操作）
//   背景：用户实测反馈「计划列表/日历的完成按钮也是红的」→ 复查发现共 16 处非危险按钮误用 check-go-btn
//   （完成/完成·延期 ×4、行内完成图标钮、计划详情 编辑/完成、计划编辑「保存」、确认完成、庆祝卡 ×3、分享、
//    同意并继续、保存二维码、用这条填充、去处理、dfOk/mwpOk/hmyp-ok 确定）
const _posCases = [
  /class=\"glass-btn ripple-effect\" data-complete=\"' \+ t\.id \+ '\"/,
  /class=\"glass-btn ripple-effect\" data-complete-delay=\"' \+ t\.id \+ '\"/,
  /id="pd-complete-btn" class="glass-btn ripple-effect"/,
  /id="pd-edit-btn" class="glass-btn ripple-effect"/,
  /data-testid="save-planned-button-\' \+ t\.id \+ \'" class="ripple-effect btn-click-effect glass-btn"/,
  /class="glass-btn ripple-effect" id="confirm-complete-ok"/,
  /class="glass-btn ripple-effect" id="legalAgree"/,
  /class="glass-btn ripple-effect" id="support-save"/,
  /ripple-effect hm-share-btn glass-btn" id="hm-share"/,
  /id="celebrateOkBtn" class="glass-btn ripple-effect"/,
  /class="glass-btn ripple-effect" id="apOk"/,
  /class="glass-btn ripple-effect" id="oc-go"/,
];
_posCases.every(function (re) { return re.test(_fixData); })
  ? ok('守卫：非危险按钮均为中性（完成/编辑/保存/分享/同意/确定等 16 处）')
  : bad('仍有非危险按钮在用危险红 —— .check-go-btn 只能给会丢数据的操作!');
(!/body\.dark-mode \.edit-input::placeholder[^}]*#94a3b8/.test(_semH) && /body\.dark-mode \.edit-input::placeholder[^}]*#cbd5e1/.test(_semH) && _semH.indexOf('color: rgba(203, 213, 225, 0.9);') >= 0)
  ? ok('守卫：深色占位符已提亮（时/分复合框上也达 AA）')
  : bad('深色占位符太暗（时/分空框看不清）!');

// 时间字段：显示人话 + data-iso 存真值
(/formatDateTimeLocal\(r\.createdAt\)\.replace\('T', ' '\)/.test(_fixData) && /formatDateTimeLocal\(t\.createdAt\)\.replace\('T', ' '\)/.test(_fixData) && /data-iso="' \+ formatDateTimeLocal\(r\.createdAt\) \+ '"/.test(_fixData))
  ? ok('守卫：时间显示人话 + data-iso 存 ISO 真值')
  : bad('时间显示人话/data-iso 缺失!');

// picker 兼容空格格式 + 写回 data-iso + 保存优先读 data-iso
(/\[T \]\(\\d\{2\}\):\(\\d\{2\}\)/.test(_fixData) && /input\.setAttribute\('data-iso', _iso\);/.test(_fixData) && (_fixData.match(/createdAtInput\.dataset\.iso \|\| createdAtInput\.value/g) || []).length === 2)
  ? ok('守卫：选择器写回/保存读取均走 data-iso（人话显示不会丢真值）')
  : bad('data-iso 链路不完整!');


(/\u8ddd\u79bb\u8865\u4e0b\u9650\/\u4e0a\u9650/.test(_fixData) && /Math\.min\(10000, Math\.max\(0, Math\.round\(\(parseFloat\(distanceInput\.value\)/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u8bb0\u5f55\u8ddd\u79bb\u5df2\u52a0\u4e0b\u9650/\u4e0a\u9650\uff08\u8d1f\u6570\u4e0d\u518d\u5165\u5e93\uff09') : bad('\u8ddd\u79bb\u7f3a\u4e0b\u9650\u9632\u62a4\uff01');
(/Math\.min\(1440, hh \* 60 \+ mm\)/.test(_fixData) && /Math\.min\(23, Math\.max\(0, parseInt\(\(durationHInput/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u7528\u65f6\u5df2\u52a0\u4e0a\u9650\uff08\u5c0f\u65f6\u226423\u3001\u603b\u65f6\u957f\u22641440\u5206\u949f\uff09') : bad('\u7528\u65f6\u7f3a\u4e0a\u9650\uff01');
(/record\.difficulty = Math\.min\(5, Math\.max\(1, parseInt\(difficultyInput\.value, 10\) \|\| 3\)\);/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u8bb0\u5f55\u96be\u5ea6\u4e0e\u8ba1\u5212\u8def\u5f84\u53e3\u5f84\u7edf\u4e00\uff081~5 \u94b3\u5236\uff09') : bad('\u8bb0\u5f55\u96be\u5ea6\u7f3a 1~5 \u94b3\u5236\uff01');
(/rec\.distance = \(isFinite\(ds\) && ds >= 0\)/.test(_fixData) && /rec\.duration = \(isFinite\(du\) && du >= 0\)/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u7edf\u4e00\u51c0\u5316\u5c42\u5df2\u8986\u76d6\u8ddd\u79bb/\u7528\u65f6\uff08\u9632\u810f\u6570\u636e\u4e0e\u65e7\u5907\u4efd\u5bfc\u5165\uff09') : bad('\u51c0\u5316\u5c42\u672a\u8986\u76d6\u8ddd\u79bb/\u7528\u65f6\uff01');
(/setItem: function \(key, value\) \{[\s\S]{0,400}?return true;/.test(_fixCore) && /return false; \}/.test(_fixCore)) ? ok('\u5b88\u536b\uff1aAppStore.setItem \u8fd4\u56de\u5e03\u5c14\uff08\u4e0d\u518d\u541e\u5f02\u5e38\uff09') : bad('setItem \u4ecd\u5728\u541e\u5f02\u5e38\uff01');
(/if \(_okRec === false\)\s*\{\s*showErrorMessage/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u8bb0\u5f55\u4fdd\u5b58\u5931\u8d25\u4f1a\u63d0\u793a\u7528\u6237\uff08\u9759\u9ed8\u4e22\u6570\u636e\u5df2\u4fee\uff09') : bad('\u4fdd\u5b58\u5931\u8d25\u4ecd\u65e0\u63d0\u793a\uff01');
(/if \(_okPlan === false\)\s*\{\s*showErrorMessage/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u8ba1\u5212\u4fdd\u5b58\u5931\u8d25\u4f1a\u63d0\u793a\u7528\u6237') : bad('\u8ba1\u5212\u4fdd\u5b58\u5931\u8d25\u65e0\u63d0\u793a\uff01');
(/hiking_sync_config/.test(_fixData) && /hiking_guide_seen_/.test(_fixData) && /hiking_yr_auto_/.test(_fixData) && /hiking_crash_queue/.test(_fixData) && /hiking_milestones_seen/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u62b9\u9664\u5df2\u8865\u6e05\u7f51\u76d8\u7ed1\u5b9a/\u5f15\u5bfc\u6807\u8bb0/\u91cc\u7a0b\u7891/\u5d29\u6e83\u961f\u5217') : bad('\u62b9\u9664\u6e05\u7406\u4e0d\u5b8c\u6574\uff01');
(/\u89e3\u9664\u7f51\u76d8\u7ed1\u5b9a/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u62b9\u9664\u786e\u8ba4\u6587\u6848\u5df2\u8bf4\u660e\u4f1a\u89e3\u9664\u7f51\u76d8\u7ed1\u5b9a') : bad('\u62b9\u9664\u6587\u6848\u672a\u8bf4\u660e\u7f51\u76d8\u7ed1\u5b9a\uff01');
(/importZipBackup\(u8\)\.catch\(/.test(_fixSync)) ? ok('\u5b88\u536b\uff1azip \u5bfc\u5165\u5931\u8d25\u4f1a\u63d0\u793a\uff08\u4e0d\u518d\u9759\u9ed8\uff09') : bad('zip \u5bfc\u5165\u4ecd\u65e0\u53cd\u9988\uff01');
(/catch \(eJ\) \{ showErrorMessage\('\u538b\u7f29\u5305\u5185\u7684\u6570\u636e\u6587\u4ef6\u5df2\u635f\u574f/.test(_fixSync)) ? ok('\u5b88\u536b\uff1azip \u5185\u6570\u636e\u6587\u4ef6\u635f\u574f\u6709\u660e\u786e\u63d0\u793a') : bad('zip \u5185 JSON \u635f\u574f\u65e0\u515c\u5e95\uff01');
(/key \+ '_corrupt'/.test(_fixCore)) ? ok('\u5b88\u536b\uff1a\u89e3\u6790\u5931\u8d25\u7684\u539f\u59cb\u4e32\u4f1a\u9694\u79bb\u4fdd\u5b58\uff08\u4e0d\u9759\u9ed8\u4e22\uff09') : bad('\u5b58\u50a8\u635f\u574f\u672a\u9694\u79bb\uff01');
(/hiking_records_corrupt/.test(_fixInit)) ? ok('\u5b88\u536b\uff1a\u542f\u52a8\u65f6\u4f1a\u63d0\u793a\u300c\u6570\u636e\u8bfb\u53d6\u5f02\u5e38\u5df2\u4fdd\u7559\u300d') : bad('\u542f\u52a8\u672a\u63d0\u793a\u9694\u79bb\u5907\u4efd\uff01');
(!/data-diff/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u6b7b\u5c5e\u6027 data-diff \u5df2\u6e05\u7406') : bad('data-diff \u6b7b\u5c5e\u6027\u4ecd\u5728\uff01');
(/fmtPlanDateKey\(new Date\(\)\)/.test(_fixData) && !/fmtPlanDateKey\(new Date\(\)\.toISOString\(\)\)/.test(_fixData)) ? ok('\u5b88\u536b\uff1a\u65e5\u5386 todayKey \u5df2\u4e0d\u518d\u7ed5 toISOString') : bad('todayKey \u4ecd\u5728\u7ed5 toISOString\uff01');
console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
