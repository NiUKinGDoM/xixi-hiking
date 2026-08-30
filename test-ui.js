#!/usr/bin/env node
/**
 * ★2026-08-28 UI 层自动化测试（jsdom 渲染真实 DOM）
 * 用法：node test-ui.js（发布/修改 UI 逻辑后必跑）
 * 覆盖：渲染 / 搜索过滤（input 事件全链路）/ 分页 / 徽标 / 空态 / 批量 / 键盘 offset / 转义 / 版本比较
 * 环境：jsdom（隔离 workspace 安装）；AppStore=localStorage（jsdom 原生支持）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules/jsdom');

let html = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
html = html.replace(/<style>[\s\S]*?<\/style>/gi, ''); // jsdom 不解析 Tailwind v4 CSS，DOM 结构不受影响
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
// ★2026-08-30 方案A：主 JS 拆外部文件，追加 4 个外部 JS（按加载顺序）
['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js'].forEach(f => scripts.push(fs.readFileSync(path.join(__dirname, 'www', f), 'utf8')));
const allJs = scripts.join('\n;\n');

const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    beforeParse(window) {
        // 浏览器 API mock（jsdom 缺失项）
        window.matchMedia = window.matchMedia || function (q) {
            return { matches: false, media: q, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
        };
        if (!window.URL.createObjectURL) window.URL.createObjectURL = function () { return 'blob:mock'; };
        if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = function () {};
        delete window.Capacitor; // 走网页版路径（无原生桥）
        // canvas mock（jsdom 无 canvas，fitSelectWidth/initHeatmap 需要 2d context）
        window.HTMLCanvasElement.prototype.getContext = function () {
            return {
                font: '', fillStyle: '', textAlign: '', strokeStyle: '',
                measureText: function (t) { return { width: String(t).length * 10 }; },
                fillText: function () {}, strokeText: function () {}, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, arc: function () {}, arcTo: function () {}, closePath: function () {}, fill: function () {}, stroke: function () {}, save: function () {}, restore: function () {}, translate: function () {}, scale: function () {}, rotate: function () {}, clearRect: function () {}, drawImage: function () {}, getImageData: function () { return { data: new Uint8ClampedArray(4) }; }, createLinearGradient: function () { return { addColorStop: function () {} }; }, clip: function () {}, setTransform: function () {}, rect: function () {}, quadraticCurveTo: function () {}, bezierCurveTo: function () {}, toDataURL: function () { return 'data:image/png;base64,'; }
            };
        };
    }
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function assert(name, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function rowCount(id) { const t = document.getElementById(id); return t ? t.querySelectorAll('tr').length : -1; }
function text(id) { const el = document.getElementById(id); return el ? el.textContent : ''; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function visible(id) { const el = document.getElementById(id); return el && getComputedStyle ? true : (el ? true : false); }

(async function () {
    console.log('== 加载 index.html 并初始化（jsdom）==');
    try {
        // 测试钩子与主脚本同一词法环境（可读写顶层 let 变量）
        window.eval(allJs + `
            window.__testSetRecords = function (arr) { records = arr; };
            window.__testSetPlanned = function (arr) { plannedTrips = arr; };
            window.__testSetSearch = function (q) { searchQuery = q; };
        `);
    } catch (e) {
        console.error('EVAL ERROR:', e.message);
        process.exit(1);
    }
    try { await window.init(); } catch (e) { console.error('init warn:', e.message); }
    await delay(30);

    console.log('\n== 1. 工具函数 ==');
    assert('escapeHtml 全转义', window.escapeHtml('<b>"x"&\'</b>') === '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;', window.escapeHtml('<b>"x"&\'</b>'));
    assert('versionGreater 数值比较', window.versionGreater('1.1.10.0', '1.1.9.9') === true);
    assert('versionGreater 相等返回 false', window.versionGreater('1.1.6.4', '1.1.6.4') === false);

    console.log('\n== 2. 记录页渲染/搜索/分页/徽标/空态 ==');
    document.querySelector('.tab-btn[data-tab=\"records\"]').click();
    await delay(30);
    window.__testSetRecords([
        { id: 'r1', name: '华山', elevation: 2154, difficulty: 4, createdAt: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z' },
        { id: 'r2', name: '太白山', elevation: 3767, difficulty: 5, createdAt: '2026-06-01T08:00:00.000Z', updatedAt: '2026-06-01T08:00:00.000Z' },
        { id: 'r3', name: '翠华山', elevation: 2132, difficulty: 3, createdAt: '2026-07-01T08:00:00.000Z', updatedAt: '2026-07-01T08:00:00.000Z' }
    ]);
    window.renderTable();
    await delay(30);
    assert('3 条记录渲染 3 行', rowCount('recordsTable') === 3, 'rows=' + rowCount('recordsTable'));
    assert('徽标显示总计', text('recordsTotalBadge').indexOf('总计: 3条') >= 0, text('recordsTotalBadge'));

    // 搜索：走真实 input 事件全链路（事件 → syncSearchAndRefresh → renderTable）
    window.__testSetSearch('');
    const input = document.getElementById('globalSearchInput');
    input.value = '华山';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await delay(40);
    assert('搜索"华山"模糊匹配 2 行(华山+翠华山)', rowCount('recordsTable') === 2, 'rows=' + rowCount('recordsTable'));
    assert('徽标显示匹配数', text('recordsTotalBadge').indexOf('匹配 2 / 共 3 条') >= 0, text('recordsTotalBadge'));
    assert('结果行含华山不含太白山', text('recordsTable').indexOf('华山') >= 0 && text('recordsTable').indexOf('太白山') < 0);

    input.value = '不存在的山';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await delay(40);
    assert('搜索无结果空态提示', text('emptyState').indexOf('没有找到匹配的记录') >= 0, text('emptyState'));

    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await delay(40);
    assert('清空恢复全部', rowCount('recordsTable') === 3, 'rows=' + rowCount('recordsTable'));

    // 分页：11 条 → 第一页 10 行
    const many = [];
    for (let i = 1; i <= 11; i++) many.push({ id: 'm' + i, name: '山' + i, elevation: 1000 + i, difficulty: 3, createdAt: '2026-01-' + String(i).padStart(2, '0') + 'T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    window.__testSetRecords(many);
    window.renderTable();
    await delay(30);
    assert('11 条分页第一页 10 行', rowCount('recordsTable') === 10, 'rows=' + rowCount('recordsTable'));
    const pager = document.getElementById('recordsPager');
    assert('分页控件显示', pager && pager.style.display !== 'none', pager ? pager.style.display : 'null');

    console.log('\n== 3. 计划页渲染/搜索 ==');
    document.querySelector('.tab-btn[data-tab=\"plans\"]').click();
    await delay(30);
    window.__testSetPlanned([
        { id: 'p1', name: '华山', elevation: 2154, difficulty: 4, createdAt: '2026-09-01' },
        { id: 'p2', name: '骊山', elevation: 1302, difficulty: 2, createdAt: '2026-09-15' }
    ]);
    window.renderPlannedTripsTable();
    await delay(30);
    assert('2 条计划渲染 2 行', rowCount('plannedTripsTable') === 2, 'rows=' + rowCount('plannedTripsTable'));
    window.__testSetSearch('骊山');
    window.renderPlannedTripsTable();
    await delay(30);
    assert('计划搜索过滤到 1 行', rowCount('plannedTripsTable') === 1, 'rows=' + rowCount('plannedTripsTable'));
    assert('计划徽标匹配数', text('plannedTotalBadge').indexOf('匹配 1 / 共 2 条') >= 0, text('plannedTotalBadge'));

    console.log('\n== 4. 键盘 offset（__onImeHeight 全链路）==');
    window.__onImeHeight(600); // 物理 px，jsdom DPR=1 → 600 → 60vh 上限截断
    await delay(10);
    const bar = document.getElementById('globalSearchBar');
    const container = document.querySelector('.container');
    assert('键盘弹出搜索框上移', bar && bar.style.bottom !== '' && bar.style.bottom.indexOf('px') >= 0, bar ? bar.style.bottom : 'null');
    assert('键盘弹出列表让位', container && container.style.paddingBottom !== '', container ? container.style.paddingBottom : 'null');
    window.__onImeHeight(0); // 键盘收起
    await delay(10);
    assert('键盘收起搜索框归位', bar && bar.style.bottom === '', bar ? bar.style.bottom : 'null');
    assert('键盘收起列表归位', container && container.style.paddingBottom === '', container ? container.style.paddingBottom : 'null');

    console.log('\n== 5. 批量模式 ==');
    document.querySelector('.tab-btn[data-tab=\"records\"]').click();
    await delay(30);
    window.__testSetRecords([{ id: 'b1', name: '批量山', elevation: 1000, difficulty: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    window.renderTable();
    await delay(30);
    window.toggleBatchMode();
    await delay(50);
    const cb = document.querySelector('.batch-check');
    assert('批量模式出现勾选框', !!cb, 'cb=' + !!cb);
    window.toggleBatchMode();
    await delay(50);

    console.log('\n== 6. 弹窗防重入（2026-08-29 叠加修复回归）==');
    // 导出弹窗连开两次 → 只应存在 1 个
    window.showExportModal();
    window.showExportModal();
    await delay(30);
    assert('导出弹窗连开两次仅 1 个', document.querySelectorAll('#exportModal').length === 1, 'count=' + document.querySelectorAll('#exportModal').length);
    document.getElementById('closeExportModal').click();
    await delay(10);
    assert('导出弹窗关闭按钮可正常关闭', !document.getElementById('exportModal'));

    // 管理弹窗连开两次 → 只应存在 1 个 .confirm-modal
    const demoFiles = [{ name: 'xixi-hiking-backup-20260828_120000.html' }, { name: 'xixi-hiking-backup-20260828_130000.html' }];
    window.showManageBackupsModal(demoFiles);
    window.showManageBackupsModal(demoFiles);
    await delay(30);
    assert('管理弹窗连开两次仅 1 个', document.querySelectorAll('.confirm-modal').length === 1, 'count=' + document.querySelectorAll('.confirm-modal').length);
    document.getElementById('manageCloseBtn').click();
    await delay(10);
    assert('管理弹窗关闭按钮可正常关闭', document.querySelectorAll('.confirm-modal').length === 0);

    // 下载选择弹窗连开两次 → 只应存在 1 个（2026-08-29 下载按钮同款修复回归）
    window.showRestoreFileModal(demoFiles);
    window.showRestoreFileModal(demoFiles);
    await delay(30);
    assert('下载弹窗连开两次仅 1 个', document.querySelectorAll('.confirm-modal').length === 1, 'count=' + document.querySelectorAll('.confirm-modal').length);
    document.getElementById('restoreCancelBtn').click();
    await delay(10);
    assert('下载弹窗关闭按钮可正常关闭', document.querySelectorAll('.confirm-modal').length === 0);

    console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
