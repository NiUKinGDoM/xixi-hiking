#!/usr/bin/env node
/**
 * ★2026-09-03 P0（＋添加弹窗：从历史复制/直接新建）+ P3（年度回顾和去年比·统一版）集成验证（jsdom）
 * 用法：node _test_p0p3.js（发布前跑；不计入 test.js/test-ui.js 正式集）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules/jsdom');

let html = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');
html = html.replace(/<style>[\s\S]*?<\/style>/gi, '');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js'].forEach(f => scripts.push(fs.readFileSync(path.join(__dirname, 'www', f), 'utf8')));
const allJs = scripts.join('\n;\n');

const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    beforeParse(window) {
        window.matchMedia = window.matchMedia || function (q) {
            return { matches: false, media: q, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
        };
        if (!window.URL.createObjectURL) window.URL.createObjectURL = function () { return 'blob:mock'; };
        if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = function () {};
        delete window.Capacitor;
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
function text(sel) { const el = document.querySelector(sel); return el ? el.textContent : ''; }
function count(sel) { return document.querySelectorAll(sel).length; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); }

(async function () {
    console.log('== P0 ＋添加弹窗(从历史复制) + P3 年度回顾和去年比(统一版) ==');
    try {
        window.eval(allJs + `
            window.__testSetRecords = function (arr) { records = arr; };
            window.__getStateAll = function () { return { records: (records || []), plannedTrips: (plannedTrips || []) }; };
            window.__setSearch = function (q) { searchQuery = q; };
            window.__testSetPlanned = function (a) { plannedTrips = a; };

            window.__getState = function () {
                return { editingId: editingId, editingPhotoIds: (editingPhotoIds || []).slice(), records: (records || []).slice() };
            };
            window.__testToast = '';
            var _se = showErrorMessage;
            showErrorMessage = function (msg, dur) { window.__testToast = msg || ''; if (_se) try { _se(msg, dur); } catch (e) {} };
            // ★2026-09-10 同时捕获中性信息 toast（部分提示由红改灰蓝，语义更准；断言只关心文案）
            var _si = showInfoMessage;
            showInfoMessage = function (msg, dur) { window.__testToast = msg || ''; if (_si) try { _si(msg, dur); } catch (e) {} };
        `);
    } catch (e) {
        console.error('EVAL ERROR:', e.message);
        process.exit(1);
    }
    try { await window.init(); } catch (e) { console.error('init warn:', e.message); }
    await delay(30);
    try { localStorage.clear(); } catch (e) { /* 忽略 */ }

    console.log('\n-- P0 ＋添加（从历史记录复制 / 直接新建）--');
    document.querySelector('.tab-btn[data-tab="records"]').click();
    await delay(30);
    // P2 ★2026-09-06 分页引导 v3（用户定稿：✕ 只关当前页那张卡；每卡独立记忆；按钮统一同尺寸）
    function __rmAnyModal() {
        document.querySelectorAll('.record-detail-modal, .confirm-modal, #exportModal').forEach(function (m) { if (m.parentNode) m.parentNode.removeChild(m); });
    }
    window.welcomeBannerShown = false;
    try { window.AppStore.removeItem('welcome_seen_v1'); } catch (e5) { /* 忽略 */ }
    ['hiking_guide_seen_welcomeBanner', 'hiking_guide_seen_guideRecords', 'hiking_guide_seen_guidePlans', 'hiking_guide_seen_guideSettings'].forEach(function (k) { try { window.AppStore.removeItem(k); } catch (e6) { /* 忽略 */ } });
    if (typeof window.resetGuideSeen === 'function') window.resetGuideSeen();
    window.__testSetRecords([]);
    window.__testSetPlanned([]);
    __rmAnyModal();
    const wb2 = document.getElementById('welcomeBanner');
    const gRec = document.getElementById('guideRecords');
    const gPl = document.getElementById('guidePlans');
    const gSt = document.getElementById('guideSettings');
    const tabBtnO = document.querySelector('.tab-btn[data-tab="overview"]');
    const tabBtnP = document.querySelector('.tab-btn[data-tab="plans"]');
    const tabBtnS = document.querySelector('.tab-btn[data-tab="settings"]');
    // 0) 零记录在概览 → 概览卡显示、其它页卡隐藏
    if (tabBtnO) { click(tabBtnO); await delay(40); }
    assert('零记录概览页显示引导卡', !!wb2 && wb2.style.display === 'block', wb2 ? wb2.style.display : 'no banner');
    assert('其它页卡此刻隐藏', gRec && gRec.style.display === 'none' && gPl.style.display === 'none' && gSt.style.display === 'none', (gRec?gRec.style.display:'x') + '/' + (gPl?gPl.style.display:'x') + '/' + (gSt?gSt.style.display:'x'));
    // 1) 概览主按钮「去记录页，写下第一笔」→ 跳记录页 + 引导跟随 + 自动弹记录编辑弹窗（直达）
    click(document.getElementById('welcomeGoBtn'));
    await delay(150);
    assert('概览卡隐藏(已离开概览页)', wb2.style.display === 'none', wb2.style.display);
    assert('记录页引导卡出现(跟随切页)', gRec && gRec.style.display === 'block', gRec ? gRec.style.display : 'no');
    await delay(420);
    const wgModal = document.querySelector('.record-detail-modal');
    assert('直达：自动打开记录编辑弹窗', !!wgModal && !!wgModal.querySelector('input[id^="edit-name-"]'), wgModal ? 'modal ok' : 'no modal');
    window.cancelEdit(); __rmAnyModal(); await delay(60);
    assert('取消后草稿删除且无弹窗残留', window.__getState().records.length === 0 && !document.querySelector('.record-detail-modal'));
    // 2) 记录页卡两个按钮：同尺寸(等高 padding 一致)；「记下第一笔」直达弹窗且卡不消失
    const rgB = document.getElementById('rGoBtn');
    const rmB = document.getElementById('rMbBtn');
    assert('卡内两按钮同尺寸(同 padding/font-size/圆角)', !!rgB && !!rmB && rgB.style.padding === '7px 16px' && rmB.style.padding === '7px 16px' && rgB.style.fontSize === '13px' && rmB.style.fontSize === '13px' && rmB.style.borderRadius === '12px', (rmB?rmB.style.padding+'/'+rmB.style.fontSize:'no rm'));
    click(rgB);
    await delay(80);
    const rgModal = document.querySelector('.record-detail-modal');
    assert('记录卡主按钮直达添加弹窗', !!rgModal && !!rgModal.querySelector('input[id^="edit-name-"]'));
    assert('点按钮后引导卡仍在(不消失)', gRec && gRec.style.display === 'block', gRec ? gRec.style.display : 'no');
    window.cancelEdit(); __rmAnyModal(); await delay(40);
    // 3) 记录卡次按钮「去山册看看」→ 切山册视图（卡不打扰）；切回列表卡回来
    click(rmB);
    await delay(80);
    assert('直达：切到山册视图', window.recordsViewMode === 'mountain', 'mode=' + window.recordsViewMode);
    assert('山册视图下记录卡隐藏(不打扰)', gRec && gRec.style.display === 'none', gRec ? gRec.style.display : 'no');
    window.recordsViewMode = 'list'; window.applyRecordsView(); await delay(40);
    assert('切回列表视图记录卡重现', gRec && gRec.style.display === 'block', gRec ? gRec.style.display : 'no');
    // 4) 切计划页 → 计划卡；主按钮「添加一条计划」→ 直达计划编辑弹窗
    if (tabBtnP) { click(tabBtnP); await delay(60); }
    assert('计划页显示计划引导卡', gPl && gPl.style.display === 'block', gPl ? gPl.style.display : 'no');
    click(document.getElementById('pGoBtn'));
    await delay(90);
    const pPlans = window.__getStateAll().plannedTrips;
    assert('直达：已新建计划草稿+编辑弹窗', pPlans.length === 1 && pPlans[0].name === '' && !!document.querySelector('.record-detail-modal'), 'plans=' + pPlans.length);
    if (typeof window.cancelPlannedEdit === 'function') { try { window.cancelPlannedEdit(); } catch (e8) { /* 忽略 */ } }
    __rmAnyModal(); window.__testSetPlanned([]); await delay(40);
    // 5) 切设置页 → 设置卡；主按钮「去看看导出」→ 直达导出弹窗（无自动备份说明）
    if (tabBtnS) { click(tabBtnS); await delay(60); }
    assert('设置页显示设置引导卡', gSt && gSt.style.display === 'block', gSt ? gSt.style.display : 'no');
    click(document.getElementById('sGoBtn'));
    await delay(60);
    const exM = document.getElementById('exportModal');
    assert('直达：导出备份弹窗打开', !!exM);
    assert('导出弹窗内已无自动备份说明(已迁走)', exM.textContent.indexOf('每满 7 天') < 0, exM.textContent.slice(0, 40));
    const exClose = document.getElementById('closeExportModal'); if (exClose) click(exClose);
    await delay(30);
    // 5b) 数据管理 i 弹窗含「本地自动备份」条目（迁移成功）
    window.showDataInfoModal(); await delay(40);
    const dmi = document.querySelector('.confirm-modal');
    assert('数据管理 i 弹窗含 本地自动备份 条目', !!dmi && dmi.textContent.indexOf('本地自动备份') >= 0 && dmi.textContent.indexOf('每满 7 天') >= 0, dmi ? dmi.textContent.slice(0, 60) : 'no');
    __rmAnyModal();
    // 6) ★v3 核心：✕ 只关当前页那张卡，其它页卡切过去照常显示（逐卡独立）
    // 6a) 设置页 ✕ → 只 gSt 关
    const stClose = gSt ? gSt.querySelector('.wb-guide-close') : null;
    if (stClose) click(stClose); await delay(30);
    assert('设置卡 ✕ 后仅设置卡隐藏', gSt && gSt.style.display === 'none', gSt ? gSt.style.display : 'no');
    if (tabBtnP) { click(tabBtnP); await delay(50); }
    assert('计划卡不受设置卡 ✕ 影响(仍显示)', gPl && gPl.style.display === 'block', gPl ? gPl.style.display : 'no');
    // 6b) 计划页 ✕ → 只 gPl 关
    const plClose = gPl ? gPl.querySelector('.wb-guide-close') : null;
    if (plClose) click(plClose); await delay(30);
    assert('计划卡 ✕ 后仅计划卡隐藏', gPl && gPl.style.display === 'none', gPl ? gPl.style.display : 'no');
    // 6c) 记录页卡仍显示 → ✕ → 仅记录卡关
    click(document.querySelector('.tab-btn[data-tab="records"]'));
    await delay(50);
    assert('记录卡仍未受前两卡 ✕ 影响(仍显示)', gRec && gRec.style.display === 'block', gRec ? gRec.style.display : 'no');
    const recClose = gRec ? gRec.querySelector('.wb-guide-close') : null;
    if (recClose) click(recClose); await delay(30);
    assert('记录卡 ✕ 后仅记录卡隐藏', gRec && gRec.style.display === 'none', gRec ? gRec.style.display : 'no');
    // 6d) 概览卡仍显示 → ✕ → 四卡全关
    if (tabBtnO) { click(tabBtnO); await delay(50); }
    assert('概览卡仍未受前三卡 ✕ 影响(仍显示)', wb2 && wb2.style.display === 'block', wb2 ? wb2.style.display : 'no');
    const wbClose = wb2 ? wb2.querySelector('.wb-guide-close') : null;
    if (wbClose) click(wbClose); await delay(30);
    assert('概览卡 ✕ 后四卡全隐藏', wb2.style.display === 'none' && gRec.style.display === 'none' && gPl.style.display === 'none' && gSt.style.display === 'none', wb2.style.display + '/' + gRec.style.display + '/' + gPl.style.display + '/' + gSt.style.display);
    assert('逐卡独立存储写入', window.AppStore.getItem('hiking_guide_seen_welcomeBanner') === true && window.AppStore.getItem('hiking_guide_seen_guideSettings') === true && !window.AppStore.getItem('welcome_seen_v1'), String(window.AppStore.getItem('hiking_guide_seen_welcomeBanner')) + '/' + String(window.AppStore.getItem('hiking_guide_seen_guideSettings')));
    // 6e) 全部 ✕ 后切任意页均无卡（重启态由 loadGuideSeenState 保证，见源码断言）
    if (tabBtnP) { click(tabBtnP); await delay(50); }
    assert('全 ✕ 后切页不再出现任何卡', gPl && gPl.style.display === 'none', gPl ? gPl.style.display : 'no');
    // 7) 示例按钮（先看看示例）：重置后显示 → 点击载入 3 条示例 + 跳记录页卡跟随（不自关）→ ✕ 记录卡
    if (typeof window.resetGuideSeen === 'function') window.resetGuideSeen();
    ['hiking_guide_seen_welcomeBanner', 'hiking_guide_seen_guideRecords', 'hiking_guide_seen_guidePlans', 'hiking_guide_seen_guideSettings'].forEach(function (k) { try { window.AppStore.removeItem(k); } catch (e9) { /* 忽略 */ } });
    window.__testSetRecords([]);
    if (tabBtnO) { click(tabBtnO); await delay(50); }
    assert('重置后概览卡可见(示例入口就绪)', wb2 && wb2.style.display === 'block', wb2 ? wb2.style.display : 'no');
    click(document.getElementById('welcomeDemoBtn'));
    await delay(200);
    assert('点示例灌入 3 条记录', window.__getState().records.length >= 3, 'n=' + window.__getState().records.length);
    assert('载示例后跳记录页且记录卡显示(不自动关闭)', gRec && gRec.style.display === 'block', gRec ? gRec.style.display : 'no');
    const recClose2 = gRec ? gRec.querySelector('.wb-guide-close') : null;
    if (recClose2) click(recClose2); await delay(30);
    assert('✕ 记录卡后隐藏', gRec && gRec.style.display === 'none', gRec ? gRec.style.display : 'no');
    // 8) 复位（后续段自行注入数据）
    window.__testSetRecords([]); window.__testSetPlanned([]);
    __rmAnyModal();
    if (typeof window.resetGuideSeen === 'function') window.resetGuideSeen();
    ['hiking_guide_seen_welcomeBanner', 'hiking_guide_seen_guideRecords', 'hiking_guide_seen_guidePlans', 'hiking_guide_seen_guideSettings'].forEach(function (k) { try { window.AppStore.removeItem(k); } catch (eA) { /* 忽略 */ } });
    try { window.AppStore.setItem('welcome_seen_v1', true); } catch (eB) { /* 忽略 */ }  // 全 seen 收尾，防影响后续
    window.welcomeBannerShown = true;
    // 0) 完全没有历史 → 点＋直接空白草稿（不弹窗）
    window.__testSetRecords([]);
    window.handleAddRecordFlow();
    await delay(40);
    let st0 = window.__getState();
    assert('无历史时直接空白新建(不弹窗)', !!st0.editingId && count('.confirm-modal .hcm-list') === 0, 'editingId=' + st0.editingId);
    window.cancelEdit();
    await delay(40);
    assert('空白草稿取消即删除', window.__getState().records.length === 0);
    // 有 2 条历史
    window.__testSetRecords([
        { id: 'r1', name: '华山', difficulty: 4, elevation: 2154, distance: 12.5, duration: 300, mood: '开心', weather: '晴', companions: '小明', photos: ['p1'], createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-02T08:00:00.000Z' },
        { id: 'r2', name: '太白山', difficulty: 5, elevation: 3767, distance: 28.4, duration: 540, mood: '累并快乐', weather: '多云', companions: '小红', createdAt: '2025-06-01T08:00:00.000Z', updatedAt: '2025-06-02T08:00:00.000Z' }
    ]);
    window.recordPage = 1;
    window.renderTable();
    await delay(40);
    // 0b) ★2026-09-04 阅读态 v2：点行开居中详情弹窗 → 阅读态 → 编辑 → 保存
    const huaRow = document.getElementById('row-r1');
    assert('列表瘦身：行含名称与删除钮', !!huaRow && !!document.getElementById('delete-btn-r1') && !document.getElementById('photos-btn-r1') && !huaRow.querySelector('td[data-label="海拔"]'));
    click(huaRow);
    await delay(60);
    const rdMdl = document.querySelector('.record-detail-modal');
    assert('点行打开详情弹窗', !!rdMdl && rdMdl.style.display !== 'none');
    assert('阅读态显示山名', !!rdMdl && rdMdl.textContent.indexOf('华山') >= 0);
    assert('阅读态无编辑控件', !!rdMdl && !rdMdl.querySelector('#edit-name-r1'));
    const rdEditBtn = rdMdl ? rdMdl.querySelector('#rd-edit-btn') : null;
    click(rdEditBtn);
    await delay(40);
    assert('点编辑切换为编辑态(名称框出现)', !!document.getElementById('edit-name-r1') && document.getElementById('edit-name-r1').value === '华山', 'name=' + (document.getElementById('edit-name-r1') || {}).value);
    const r1Name = document.getElementById('edit-name-r1');
    if (r1Name) r1Name.value = '华山(改)';
    click(document.getElementById('save-btn-r1'));
    await delay(60);
    assert('弹窗内保存后记录更新且弹窗关闭', window.__getState().records.find(function (r) { return r.id === 'r1'; }).name === '华山(改)' && count('.record-detail-modal') === 0);
    window.__testSetRecords([{ id: 'r1', name: '华山', difficulty: 4, elevation: 2154, distance: 12.5, duration: 300, mood: '开心', weather: '晴', companions: '小明', photos: ['p1'], createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-02T08:00:00.000Z' }, { id: 'r2', name: '太白山', difficulty: 5, elevation: 3767, distance: 28.4, duration: 540, mood: '累并快乐', weather: '多云', companions: '小红', createdAt: '2025-06-01T08:00:00.000Z', updatedAt: '2025-06-02T08:00:00.000Z' }]);
    window.renderTable();
    await delay(40);
    // 1) 编辑已有记录：不出现任何复制条/弹窗
    window.startEdit('r1');
    await delay(60);
    assert('编辑已有记录：行内无复制条', count('.copy-bar, #copy-bar-r1') === 0, 'copybars=' + count('.copy-bar'));
    assert('编辑已有记录：无弹窗打扰', count('.confirm-modal .hcm-list') === 0);
    window.cancelEdit();
    await delay(40);
    // 2) ＋添加 → 弹 v3 卡：独立「直接新建」行 + 下拉(历史复制) + 确认键
    const t0 = Date.now();
    click(document.getElementById('addBtn'));
    await delay(30);
    assert('＋添加弹出弹窗', !!document.getElementById('apField'));
    assert('弹窗标题=添加徒步记录', text('.confirm-modal .confirm-modal-title').indexOf('添加徒步记录') >= 0, text('.confirm-modal .confirm-modal-title'));
    assert('「直接新建」独立可见(不在下拉内)', !!document.getElementById('apNew') && !!document.getElementById('apNew').closest('.ap-fold') === false);
    assert('下拉列表初始收起', !document.getElementById('apFold').classList.contains('open'));
    assert('列表含 2 条历史', count('.confirm-modal .hcm-item') === 2);
    assert('行含 山名+日期+meta', text('.hcm-list').indexOf('太白山') >= 0 && text('.hcm-list').indexOf('2025-06-01') >= 0 && text('.hcm-list').indexOf('困难') >= 0, text('.hcm-list').slice(0, 80));
    assert('确认键存在且初始禁用', !!document.getElementById('apOk') && document.getElementById('apOk').disabled === true);
    // 3) 独立「直接新建」→ 空白草稿（无需展开下拉）
    click(document.getElementById('apNew'));
    await delay(60);
    let st = window.__getState();
    const emptyId = st.editingId;
    const emptyRec = st.records.find(r => r.id === emptyId);
    assert('直接新建：进入空白草稿编辑', !!emptyId && emptyRec && emptyRec.name === '' && st.records.length === 3);
    window.cancelEdit();
    await delay(40);
    assert('取消后空白草稿删除', window.__getState().records.length === 2);
    // 4) 下拉单选 → 确认键 → 复制填充
    click(document.getElementById('addBtn'));
    await delay(30);
    click(document.getElementById('apField'));
    await delay(20);
    assert('点栏展开(.open)', document.getElementById('apFold').classList.contains('open'));
    const items = document.querySelectorAll('.confirm-modal .hcm-item');
    let selItem = null;
    items.forEach(function (it) { if (it.textContent.indexOf('太白山') >= 0) selItem = it; });
    click(selItem);
    await delay(20);
    assert('选中收起且高亮(sel+圆点)', selItem.classList.contains('sel') && selItem.querySelector('.hcm-dot') && !document.getElementById('apFold').classList.contains('open'));
    assert('选中后栏文本=山名·日期', text('#apMain').indexOf('太白山') >= 0, text('#apMain'));
    assert('选中后确认键可用', document.getElementById('apOk').disabled === false);
    click(document.getElementById('apOk'));
    await delay(220); // addNewRecord(RAF) + 120ms 填值
    const st2 = window.__getState();
    const rNew = st2.editingId;
    const nameIn = document.getElementById('edit-name-' + rNew);
    const eleIn = document.getElementById('edit-elevation-' + rNew);
    const diffIn = document.getElementById('edit-difficulty-' + rNew);
    const disIn = document.getElementById('edit-distance-' + rNew);
    const dhIn = document.getElementById('edit-duration-h-' + rNew);
    const dmIn = document.getElementById('edit-duration-m-' + rNew);
    const moodIn = document.getElementById('edit-mood-' + rNew);
    const wIn = document.getElementById('edit-weather-' + rNew);
    const cIn = document.getElementById('edit-companions-' + rNew);
    assert('弹窗已关闭', count('.confirm-modal .hcm-list') === 0);
    assert('草稿已建且进入编辑', !!rNew);
    const dstMem = st2.records.find(r => r.id === rNew);
    assert('记录对象未保存(点保存才入库)', dstMem.name === '' && dstMem.difficulty === 3);
    assert('名称/海拔/难度带出(难度=N级 档名)', nameIn.value === '太白山' && eleIn.value === '3767' && diffIn.value === '5级 困难', nameIn.value + '/' + eleIn.value + '/' + diffIn.value);
    assert('里程/用时带出', disIn.value === '28.4' && dhIn.value === '9' && dmIn.value === '0', disIn.value + '/' + dhIn.value + '/' + dmIn.value);
    assert('心情/天气/同行带出', moodIn.value === '累并快乐' && wIn.value === '多云' && cIn.value === '小红');
    assert('日期输入框=今天(不复制)', document.getElementById('edit-created-at-' + rNew).value.indexOf(String(new Date().getFullYear())) >= 0);
    assert('照片不复制', count('#photo-thumbs-' + rNew + ' img.photo-thumb-img') === 0 && st2.editingPhotoIds.length === 0);
    assert('单条照片上限放开到 24', typeof window.MAX_RECORD_PHOTOS === 'number' && window.MAX_RECORD_PHOTOS === 24, 'MAX=' + window.MAX_RECORD_PHOTOS);
    assert('带出字段高亮', nameIn.classList.contains('copy-filled') && eleIn.classList.contains('copy-filled'));
    // 1b) ★2026-09-04 难度改玻璃弹窗：点击难度框 → df 弹窗 → 选 4 级 → value 更新
    click(diffIn);
    await delay(30);
    // jsdom 对内联 onclick 触发不稳：没弹则直接调函数（真机 onclick 绑定可靠）
    if (!document.querySelector('.confirm-modal .df-grid')) {
        try { window.openDifficultyPicker('edit-difficulty-' + rNew); } catch (e) { }
        await delay(30);
    }
    assert('点难度框弹出玻璃弹窗', !!document.querySelector('.confirm-modal .df-grid'), '无 df 弹窗');
    assert('弹窗含 5 个难度档', count('.df-opt') === 5, 'df-opt=' + count('.df-opt'));
    assert('当前档(5级)已选中', document.querySelectorAll('.df-opt.selected').length === 1 && document.querySelector('.df-opt.selected').getAttribute('data-v') === '5');
    click(document.querySelector('.df-opt[data-v="4"]'));
    click(document.getElementById('dfOk'));
    await delay(20);
    assert('确定后难度值=4级 较难', diffIn.value === '4级 较难', 'value=' + diffIn.value);
    assert('难度框带深浅双色变量', diffIn.style.getPropertyValue('--dfc-light') === '#f97316' && diffIn.style.getPropertyValue('--dfc-dark') === '#fb923c', diffIn.style.cssText);
    assert('难度框有 difficulty-color 类(深色亮色覆盖)', diffIn.classList.contains('difficulty-color'));
    // 保存入库（难度 4）
    click(document.getElementById('save-btn-' + rNew));
    await delay(40);
    const saved = window.__getState().records.find(r => r.id === rNew);
    assert('点保存后记录入库(难度4)', saved && saved.name === '太白山' && saved.difficulty === 4 && saved.distance === 28.4 && saved.duration === 540, saved ? JSON.stringify(saved) : 'null');
    const dt2 = new Date(saved.createdAt).getTime();
    assert('保存后日期保持今天(不复制)', Math.abs(dt2 - Date.now()) < 90000, saved.createdAt);

    console.log('\n-- P3 年度回顾(统一版) --');
    document.querySelector('.tab-btn[data-tab="overview"]').click();
    await delay(30);
    window.__testSetRecords([
        { id: 'y1', name: '华山', difficulty: 4, elevation: 2154, distance: 12.5, duration: 300, createdAt: '2025-08-01T08:00:00.000Z', updatedAt: '2025-08-02T08:00:00.000Z' },
        { id: 'y2', name: '太白山', difficulty: 5, elevation: 3767, distance: 28.4, duration: 540, createdAt: '2024-06-01T08:00:00.000Z', updatedAt: '2024-06-02T08:00:00.000Z' },
        { id: 'y3', name: '翠华山', difficulty: 3, elevation: 2132, distance: 8.2, duration: 200, createdAt: '2024-09-15T08:00:00.000Z', updatedAt: '2024-09-16T08:00:00.000Z' },
        { id: 'y4', name: '华山', difficulty: 4, elevation: 2154, distance: 10.0, duration: 250, createdAt: '2024-04-10T08:00:00.000Z', updatedAt: '2024-04-11T08:00:00.000Z' }
    ]);
    window.openYearReview(2025);
    await delay(40);
    const panel = document.getElementById('yearReviewPanel');
    assert('弹窗打开', panel && panel.style.display === 'flex');
    const head = document.querySelector('.yr-head');
    assert('头部无关闭按钮', !head.querySelector('#yearReviewCloseBtn'));
    assert('头部标题=年度回顾', text('.yr-head .yr-title').indexOf('年度回顾') >= 0);
    assert('年份切换=玻璃图标钮', head.querySelector('#yearPrevBtn') && head.querySelector('#yearPrevBtn').className.indexOf('icon-glass-btn') >= 0);
    const foot = document.querySelector('.yr-foot');
    const footClose = foot ? foot.querySelector('#yearReviewCloseBtn') : null;
    assert('关闭按钮在底部(confirm-btn-cancel)', !!footClose && footClose.textContent === '关闭' && footClose.className.indexOf('confirm-btn-cancel') >= 0);
    const cmp = document.getElementById('yrCompareToggle');
    assert('开关按钮无圆点无胶囊(方角)', !!cmp && text('#yrCompareText') === '和去年比' && !cmp.querySelector('.ydot'));
    assert('今年版 6 指标 3 列', count('#yearReviewContent .yr-metric') === 6);
    assert('今年版文本面板=年度之最', text('#yearReviewContent .yr-tab .tt').indexOf('年度之最') >= 0);
    assert('今年版无柱状/无对比行', count('#yearReviewContent .yr-bar, #yearReviewContent .yvo') === 0);
    click(cmp);
    await delay(30);
    assert('点亮(on)', cmp.classList.contains('on') && text('#yrCompareText') === '只看今年');
    assert('对比版 5 格去年划线值', count('#yearReviewContent .yold') === 5);
    assert('增幅出现(±%)', /[+\-%]/.test(text('#yearReviewContent')), text('#yearReviewContent .yvo').slice(0, 60));
    assert('一年小结面板', text('#yearReviewContent .yr-tab .tt').indexOf('一年小结') >= 0 && text('#yearReviewContent .yr-tab').indexOf('2025 年') >= 0);
    click(cmp);
    await delay(30);
    assert('再点回单版', !cmp.classList.contains('on') && count('#yearReviewContent .yvo') === 0);
    click(document.getElementById('yearPrevBtn'));
    await delay(30);
    assert('切到 2024', text('#yearReviewYear') === '2024');
    click(cmp);
    await delay(30);
    assert('去年(2023)无数据不点亮', !cmp.classList.contains('on') && window.__testToast.indexOf('2023 年还没有记录') >= 0, window.__testToast);
    click(footClose);
    await delay(20);
    assert('底部关闭可关弹窗', panel.style.display === 'none');

    console.log('\n== 新增段：山册照片回忆横排带 + 同步健康行 ==');
    // 山册：华山 2 条记录共 3 张照片；太白山 1 条无照片
    window.__testSetRecords([
        { id: 'm1', name: '华山', createdAt: '2026-08-09T08:00:00', photos: ['p-a', 'p-b'], distance: 11.8, duration: 390, difficulty: 3, elevation: 2154 },
        { id: 'm2', name: '华山', createdAt: '2026-05-02T07:30:00', photos: ['p-c'], distance: 10.5, duration: 360, difficulty: 3, elevation: 2154 },
        { id: 'm3', name: '太白山', createdAt: '2026-05-17T09:00:00', photos: [], distance: 15, duration: 540, difficulty: 5, elevation: 3771 }
    ]);
    recordsViewMode = 'mountain';
    await delay(20);
    window.renderMountainBook();
    await delay(20);
    const cards = document.querySelectorAll('.mb-card');
    assert('山册渲染 2 卡', cards.length === 2, 'cards=' + cards.length);
    const huaCard = Array.from(cards).find(c => c.textContent.indexOf('华山') >= 0);
    assert('华山卡存在', !!huaCard);
    function drawerOf(card) {
        const row = card ? card.closest('.mb-row') : null;
        const mtn = card ? card.getAttribute('data-mountain') : '';
        return row ? row.querySelector('.mb-drawer[data-mountain="' + mtn + '"]') : null;
    }
    const huaDr = drawerOf(huaCard);
    assert('华山卡同行有抽屉', !!huaDr);
    assert('华山抽屉含照片带', !!huaDr && !!huaDr.querySelector('.mb-photos'));
    assert('华山照片带 3 张', !!huaDr && huaDr.querySelectorAll('.mbp-item').length === 3, huaDr ? String(huaDr.querySelectorAll('.mbp-item').length) : '0');
    assert('照片占位 img 带 data-pid', !!huaDr && !!huaDr.querySelector('.mbp-item img[data-pid="p-b"]'));
    assert('照片带标题=张数·最近记录日期', !!huaDr && /3 张 · 2026-08-09/.test(huaDr.querySelector('.mb-photos-cnt').textContent), huaDr ? huaDr.querySelector('.mb-photos-cnt').textContent : '');
    assert('照片不再有日期角标', !!huaDr && huaDr.querySelectorAll('.mbp-date').length === 0);
    assert('无逐条记录行(时间+跳转已删)', !!huaDr && huaDr.querySelectorAll('.mb-record, .mb-che').length === 0);
    const tbCard = Array.from(cards).find(c => c.textContent.indexOf('太白山') >= 0);
    const tbDr = drawerOf(tbCard);
    assert('太白山抽屉存在', !!tbDr);
    assert('无照片山抽屉无照片带', !!tbDr && !tbDr.querySelector('.mb-photos'), tbDr ? 'unexpected photos' : 'no drawer');
    assert('抽屉默认收起', !!huaDr && !huaDr.classList.contains('open'));
    assert('集章序号按首登先后：华山 01', !!huaCard && huaCard.querySelector('.mb-seal').textContent === '01', huaCard ? huaCard.querySelector('.mb-seal').textContent : '');
    assert('集章序号：太白山 02', !!tbCard && tbCard.querySelector('.mb-seal').textContent === '02', tbCard ? tbCard.querySelector('.mb-seal').textContent : '');
    assert('次数点阵已删除', !!huaCard && huaCard.querySelectorAll('.mb-dot').length === 0 && huaCard.querySelectorAll('.mb-dots').length === 0);
    assert('徽章胶囊已移除', !!huaCard && huaCard.querySelectorAll('.mb-badge').length === 0);
    assert('海拔书脊色带：华山 2154m → ridge-3', !!huaCard && huaCard.classList.contains('mb-ridge-3'), huaCard ? huaCard.className : '');
    assert('海拔书脊色带：太白山 3771m → ridge-4', !!tbCard && tbCard.classList.contains('mb-ridge-4'), tbCard ? tbCard.className : '');
    assert('默认收起(无 .open)', !!huaCard && !huaCard.classList.contains('open'));
    click(huaCard.querySelector('.mb-head'));
    await delay(20);
    assert('点山名展开(.open)', !!huaCard && huaCard.classList.contains('open'));
    assert('点开对应抽屉(.open)', !!huaDr && huaDr.classList.contains('open'));
    const phItem = huaDr ? huaDr.querySelector('.mbp-item') : null;
    let lbErr = '';
    try { if (phItem) click(phItem); await delay(30); } catch (e) { lbErr = e.message; }
    const lbEl = window.photoLightboxEl || document.getElementById('photoLightbox');
    assert('点照片打开灯箱不炸', lbErr === '' && !!lbEl && lbEl.style.display === 'flex', lbErr || (lbEl ? 'display=' + lbEl.style.display : 'no lightbox'));
    if (lbEl) lbEl.style.display = 'none'; // 关闭灯箱避免影响后续
    // 同步健康行（未配置 WebDAV → 灰点 + 引导文案）
    if (typeof window.updateSyncHealthRow === 'function') { try { await window.updateSyncHealthRow(); } catch (e) {} }
    await delay(20);
    const hrRow = document.getElementById('syncHealthRow');
    const hrTxt = document.getElementById('syncHealthText');
    const hrDot = document.getElementById('syncHealthDot');
    assert('同步健康行存在', !!hrRow && !!hrTxt && !!hrDot);
    assert('未配置显示引导文案', !!hrTxt && hrTxt.textContent.indexOf('还没连接云端') >= 0, hrTxt ? hrTxt.textContent : '');
    assert('未配置圆点灰色', !!hrDot && hrDot.style.background.replace(/\s/g, '') === 'rgb(148,163,184)', hrDot ? hrDot.style.background : '');
    // ★2026-09-03 A/B/C 布局：统计主次分离 + 热力图前置 + 年回入口归位
    await delay(20);
    const ovMainCards = document.querySelectorAll('#tab-overview .stat-card');
    const hpEl = document.getElementById('heatmapPanel');
    assert('概览主卡精简为 4 张', ovMainCards.length === 4, 'cards=' + ovMainCards.length);
    assert('矮副卡含平均难度/平均用时', !!document.getElementById('avgDifficultyMini') && !!document.getElementById('avgDurationMini') && !!document.getElementById('avgElevation'));
    assert('副卡三格容器存在', !!document.querySelector('.ov-mini-row') && document.querySelectorAll('.ov-mini').length === 3);
    assert('年回按钮已迁入徒步足迹卡', !!hpEl && !!hpEl.querySelector('#yearReviewOpenBtn'));
    assert('统计标题行已无年回按钮', !document.querySelector('#statsTitle #yearReviewOpenBtn'));
    assert('难度分布卡已删除', !document.getElementById('difficultyChart') && !document.getElementById('chartLabels'));
    const totClimb = document.getElementById('totalClimbCard');
    assert('总爬升独立卡已随精简移除', !totClimb);
    // 累计爬升回到热力图底部汇总行；行文去掉年月日期前缀（顶部选择器已显示），只留 次数 · 累计爬升
    let hmErr = '';
    try {
        const curRecs = window.__getState().records;
        curRecs.push({ id: '__hmclimb', name: '测试山', createdAt: new Date().toISOString(), elevation: 500, difficulty: 3 });
        window.__testSetRecords(curRecs);
        window.initHeatmap();
        await delay(20);
    } catch (e) { hmErr = e.message; }
    const sumTxt = document.getElementById('hmSummary') ? document.getElementById('hmSummary').textContent : '';
    assert('热力图汇总=前缀(本月/年月)+次数·累计爬升', hmErr === '' && /(本月|\d{4}\s*年\s*\d{1,2}\s*月)?\s*徒步\s*\d+\s*次/.test(sumTxt) && sumTxt.indexOf('累计爬升') >= 0, hmErr || sumTxt);
    // ★2026-09-03 年月单框弹窗（替代原两个下拉 select）
    const ymBtn2 = document.getElementById('hmYmBtn');
    const ymTxt0 = document.getElementById('hmYmText');
    assert('年月单框按钮存在且含年月文本', !!ymBtn2 && !!ymTxt0 && /\d{4}年\d{1,2}月/.test(ymTxt0.textContent), ymTxt0 ? ymTxt0.textContent : '');
    assert('双下拉 select 已移除', !document.getElementById('hmYear') && !document.getElementById('hmMonth'));
    let pkErr = '';
    try { click(ymBtn2); await delay(30); } catch (e) { pkErr = e.message; }
    const pkTitle = document.querySelector('.confirm-modal-title');
    const pkM = document.querySelectorAll('.hmyp-m');
    const pkY = document.querySelectorAll('.hmyp-yr');
    assert('点年月框弹「选择年月」(12月格+年份chips)', pkErr === '' && !!pkTitle && pkTitle.textContent.indexOf('选择年月') >= 0 && pkM.length === 12 && pkY.length >= 1, pkErr || (pkTitle ? 'grid 异常' : '弹窗缺失'));
    const selM = document.querySelector('.hmyp-m:not(.no)');
    let okErr = '';
    try { if (selM) click(selM); const okB = document.getElementById('hmyp-ok'); if (okB) click(okB); await delay(30); } catch (e) { okErr = e.message; }
    const afterTxt = ymTxt0 ? ymTxt0.textContent : '';
    assert('确定后年月框文本更新', okErr === '' && /\d{4}年\d{1,2}月/.test(afterTxt), okErr || afterTxt || 'no text');

    // ★2026-09-04 沉淀：v1.1.9.2 功能回归（diffLabel/徽章深色/照片横滑/编辑布局顺序/caption 纯文字/批量 checkbox 移操作列）
    console.log('\n== 新增段：v1.1.9.2 功能回归 ==');
    try {
        // 0) 备份数据并注入一条带照片记录 r9x
        const _bk = (window.__getState ? window.__getState() : { records: [] });
        const _orig = (_bk.records || []).slice();
        const _newRec = _orig.concat([{ id: 'r9x', name: '照片测试山', difficulty: 4, elevation: 1500, duration: 120, distance: 5.2, mood: '开心', weather: '晴', companions: '测试伴', photos: ['px1', 'px2', 'px3'], createdAt: '2026-08-20T09:30:00.000Z', updatedAt: '2026-08-20T09:30:00.000Z' }]);
        window.__testSetRecords(_newRec);
        // 1) 纯函数
        assert('diffLabel(5)=5级 困难', window.diffLabel(5) === '5级 困难', window.diffLabel(5));
        assert('diffLabel(2)=2级 较易', window.diffLabel(2) === '2级 较易', window.diffLabel(2));
        assert('rdDifficultyColorDeep(4)=#9a3412', window.rdDifficultyColorDeep(4) === '#9a3412', window.rdDifficultyColorDeep(4));
        assert('rdDifficultyColorDeep(5)=#991b1b', window.rdDifficultyColorDeep(5) === '#991b1b', window.rdDifficultyColorDeep(5));
        // 2) view 弹窗：照片墙横滑容器 + 难度徽章深色
        window.recordsViewMode = 'list';
        window.renderTable();
        await delay(60);
        window.openRecordDetailModal('r9x', 'view');
        await delay(80);
        const pBox = document.getElementById('rd-photos-r9x');
        assert('详情照片墙为横滑容器(flex+overflow-x)', !!pBox && pBox.style.display === 'flex' && pBox.style.overflowX === 'auto', pBox ? pBox.style.display + '/' + pBox.style.overflowX : 'none');
        const pImgs = pBox ? pBox.querySelectorAll('img') : [];
        assert('照片墙 3 张 92px 固定缩略图', pImgs.length === 3 && pImgs[0] && pImgs[0].style.width === '92px', 'n=' + pImgs.length);
        const dChip = document.querySelector('.record-detail-modal #rd-body .rd-chip');
        assert('难度徽章深色 700', !!dChip && window.getComputedStyle(dChip).color === 'rgb(154, 52, 18)', dChip ? window.getComputedStyle(dChip).color : 'no chip');
        document.querySelectorAll('.record-detail-modal').forEach(function (m) { m.parentNode.removeChild(m); });
        // 3) edit 弹窗：字段顺序 + 难度「N级 档名」+ 1:1
        window.openRecordDetailModal('r9x', 'edit');
        await delay(80);
        const eIds = Array.from(document.querySelectorAll('.record-detail-modal input')).map(function (i) { return i.id; });
        const eExp = ['edit-name-r9x', 'edit-elevation-r9x', 'edit-difficulty-r9x', 'edit-mood-r9x', 'edit-weather-r9x', 'edit-companions-r9x', 'edit-duration-h-r9x', 'edit-duration-m-r9x', 'edit-distance-r9x', 'edit-created-at-r9x'];
        const eGot = eIds.filter(function (id) { return eExp.indexOf(id) >= 0; });
        assert('记录编辑字段顺序=名称→海拔难度→心情天气同行→用时里程→日期', JSON.stringify(eGot) === JSON.stringify(eExp), eGot.join(','));
        const eDf = document.getElementById('edit-difficulty-r9x');
        assert('难度框显示 4级 较难', eDf && eDf.value === '4级 较难', eDf ? eDf.value : 'none');
        assert('海拔/难度 1:1 flex', document.getElementById('edit-elevation-r9x').style.flexGrow === '1' && !!eDf && eDf.style.flexGrow === '1');
        document.querySelectorAll('.record-detail-modal').forEach(function (m) { m.parentNode.removeChild(m); });
        // 4) caption：纯文字无 icon + 模式文案切换
        window.recordsViewMode = 'list';
        window.applyRecordsView();
        const rcTxt = document.getElementById('recordsViewCaptionText');
        const rc = document.getElementById('recordsViewCaption');
        assert('记录 caption 纯文字列表文案(无 icon)', !!rcTxt && rcTxt.textContent.indexOf('列表视图') === 0 && !rc.querySelector('.material-icons'), rc ? rc.innerHTML.slice(0, 60) : 'none');
        window.recordsViewMode = 'mountain';
        window.applyRecordsView();
        assert('切山册 caption 文案切换', rcTxt.textContent.indexOf('山册视图') === 0, rcTxt.textContent);
        // ★2026-09-18 山册顶部常驻色带图例（彩边说明入口已按用户要求移除，只留这行图例）
        // ★2026-09-18 山册顶部常驻图例 + 关于页入口
        window.recordsViewMode = 'mountain';
        window.applyRecordsView();
        await delay(90);
        const mbWrap = document.getElementById('mountainBookView');
        const mbLegend = mbWrap ? mbWrap.querySelector('.mb-legend') : null;
        assert('山册顶部常驻色带图例', !!mbLegend, mbLegend ? 'ok' : 'none');
        const mbItems = mbLegend ? mbLegend.querySelectorAll('.mb-legend-item').length : 0;
        assert('顶部图例 5 档齐全', mbItems === 5, 'items=' + mbItems);
        const mbCls = mbLegend ? Array.from(mbLegend.querySelectorAll('.ridge-legend-bar')).map(function (b) {
            const hit = Array.from(b.classList).filter(function (c) { return /^rl-\d$/.test(c); });
            return hit[0] || '?';
        }) : [];
        assert('顶部图例档位有序 rl-1…rl-5', mbCls.join(',') === 'rl-1,rl-2,rl-3,rl-4,rl-5', mbCls.join(','));
        window.recordsViewMode = 'list';
        window.applyRecordsView();
        window.recordsViewMode = 'list';
        window.applyRecordsView();
        const plTxt = document.getElementById('plansViewCaptionText');
        window.applyPlansView();
        assert('计划 caption 纯文字日历文案(无 icon)', !!plTxt && plTxt.textContent.indexOf('日历视图') === 0 && !document.getElementById('plansViewCaption').querySelector('.material-icons'), plTxt ? plTxt.textContent : 'none');
        // 5) 批量多选 checkbox 移操作列（真实入口）
        window.renderTable();
        await delay(60);
        window.toggleBatchMode();
        await delay(60);
        const brow = document.getElementById('row-r9x');
        assert('批量模式行存在', !!brow);
        if (brow) {
            const bName = brow.querySelector('td[data-label="名称"]');
            const bOp = brow.querySelector('td[data-label="操作"]');
            assert('批量勾选框在操作列(名称列无)', !!bOp.querySelector('input.batch-check') && !bName.querySelector('input'), bOp ? bOp.innerHTML.slice(0, 70) : 'no op td');
            const bc = bOp.querySelector('input.batch-check');
            assert('勾选框玻璃类且无深红 accent', !!bc && !(bc.getAttribute('style') || '').match(/accent-color/), bc ? (bc.getAttribute('style') || '') : 'no cb');
        }
        window.toggleBatchMode();
        await delay(40);
        // 恢复原数据
        window.__testSetRecords(_orig);
    } catch (e) { console.log('ERR-v1192:', e.message); }

    // ★2026-09-05 沉淀：v1.1.9.7 新功能回归（小日记/全文搜索/字号三档/抹掉数据/过期关怀/回忆册PDF）
    console.log('\n== 新增段：v1.1.9.7 新功能 ==');
    try {
        const __bkRec = window.__testGetAll ? window.__testGetAll() : ((window.__getState ? window.__getState() : null));
        // 1) 小日记：edit 弹窗有 textarea → 写入保存 → 记录 notes → view 弹窗展示
        window.__testSetRecords([{ id: 'n1', name: '测试山', difficulty: 2, elevation: 900, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' }]);
        window.renderTable();
        await delay(50);
        window.openRecordDetailModal('n1', 'edit');
        await delay(60);
        const nt = document.getElementById('edit-notes-n1');
        assert('编辑弹窗含小日记 textarea', !!nt, 'no textarea');
        if (nt) {
            nt.value = '山顶风很大，云海美哭了。';
            document.getElementById('save-btn-n1').click();
            await delay(80);
            const savedR = (window.__getStateAll().records).find(function (r) { return r.id === 'n1'; });
            assert('保存后记录带小日记 notes', savedR && savedR.notes === '山顶风很大，云海美哭了。', savedR ? savedR.notes : 'no notes');
            window.openRecordDetailModal('n1', 'view');
            await delay(60);
            const viewTxt = document.getElementById('rd-body').textContent;
            assert('view 弹窗展示小日记内容', viewTxt.indexOf('山顶风很大') >= 0, viewTxt.slice(0, 60));
            // 清空小日记 → 删键
            window.openRecordDetailModal('n1', 'edit');
            await delay(50);
            const nt2 = document.getElementById('edit-notes-n1');
            nt2.value = '   ';
            document.getElementById('save-btn-n1').click();
            await delay(60);
            assert('清空后 notes 键删除', !(window.__getStateAll().records).find(function (r) { return r.id === 'n1'; }).notes, 'notes not removed');
        }
        document.querySelectorAll('.record-detail-modal').forEach(function (m) { m.parentNode.removeChild(m); });
        // 2) 全文搜索：搜 notes 命中
        window.__testSetRecords([{ id: 'f1', name: '无名小山', notes: '那天遇见野生羚牛', mood: '惊讶', createdAt: '2026-07-05T09:00:00.000Z', updatedAt: '2026-07-05T09:00:00.000Z' }]);
        window.__setSearch('羚牛');
        window.renderTable();
        await delay(50);
        const rowF = document.getElementById('row-f1');
        assert('按小日记内容全文搜索命中', !!rowF, 'not found by notes');
        window.__setSearch('惊讶');
        window.renderTable();
        await delay(40);
        assert('按心情搜索命中', !!document.getElementById('row-f1'), 'not found by mood');
        window.__setSearch('');
        window.__testSetRecords([]);
        // 4) 抹掉数据：第一层确认出现
        window.confirmWipeAllData();
        await delay(40);
        const wm = document.querySelector('.confirm-modal');
        assert('抹掉数据第一层确认弹窗', wm && wm.textContent.indexOf('抹掉所有足迹') >= 0, wm ? wm.textContent.slice(0, 40) : 'no modal');
        const wnext = document.getElementById('wipe-next1');
        assert('第一层有继续按钮', !!wnext);
        if (wnext) { wnext.click(); await delay(40); }
        assert('第二层最后确认弹窗', !!document.getElementById('wipe-go2'), 'no second modal');
        if (document.getElementById('wipe-cancel2')) { document.getElementById('wipe-cancel2').click(); }
        await delay(30);
        assert('取消后弹窗关闭且数据仍在', !document.querySelector('.confirm-modal'), 'modal still there');
        // 5) 计划过期关怀（★2026-09-06 定稿：只留 去处理/忽略 两按钮，顺延入口已删）
        const pastDay = new Date(Date.now() - 86400000).toISOString();
        window.__testSetPlanned([{ id: 'o1', name: '过期小测', createdAt: pastDay, updatedAt: pastDay }]);
        window.maybeShowOverdueCare();
        await delay(40);
        const oc = document.querySelector('.confirm-modal');
        assert('过期关怀弹窗出现', oc && oc.textContent.indexOf('过期') >= 0, oc ? oc.textContent.slice(0, 40) : 'no care modal');
        assert('弹窗只留 去处理/忽略 两按钮(无顺延)', !!document.getElementById('oc-go') && !!document.getElementById('oc-ignore') && !document.getElementById('oc-shift'), 'go=' + !!document.getElementById('oc-go') + ' ig=' + !!document.getElementById('oc-ignore') + ' shift=' + !!document.getElementById('oc-shift'));
        assert('去处理按钮跳计划页', oc && oc.textContent.indexOf('去处理') >= 0 && oc.textContent.indexOf('去计划页改个日期') >= 0, oc ? oc.textContent.slice(0, 60) : '');
        // 点忽略 → 关闭且计划日期不变
        const ocIg = document.getElementById('oc-ignore');
        if (ocIg) { ocIg.click(); await delay(40); }
        const o1t = (window.__getStateAll().plannedTrips).find(function (t) { return t.id === 'o1'; });
        assert('点忽略后弹窗关闭、计划未改动', !document.querySelector('.confirm-modal') && o1t && o1t.createdAt === pastDay, o1t ? o1t.createdAt.slice(0, 10) : 'no trip');
        // 计划行渲染出过期红标（独立计划验证展示，与弹窗无关）
        const pastDay2 = new Date(Date.now() - 2 * 86400000).toISOString();
        window.plansViewMode = 'list';
        window.__testSetPlanned([{ id: 'o2', name: '真过期计划', createdAt: pastDay2, updatedAt: pastDay2 }]);
        window.renderPlannedTripsTable();
        await delay(60);
        const oRow = document.getElementById('planned-row-o2');
        assert('计划列表行含过期红标', oRow && oRow.textContent.indexOf('已过期 2 天') >= 0, oRow ? oRow.textContent.slice(0, 60) : 'no row');
        window.__testSetPlanned([]);
        // 6) 回忆册打印样式
        const mHtml = window.buildBackupHTMLString({ records: [{ id: 'x', name: '样山' }], plannedTrips: [], photos: {}, exportedAt: Date.now() });
        assert('回忆册 HTML 含打印样式与 PDF 说明', mHtml.indexOf('@media print') >= 0 && mHtml.indexOf('另存为 PDF') >= 0 && mHtml.indexOf('backup-data') >= 0, 'len=' + mHtml.length);
    } catch (e) { console.log('ERR-v1197:', e.message); }

    // ★2026-09-06 保存铁律：只有点「保存」按钮才算保存 —— 取消/点空白关闭一律丢弃（改动不写、草稿删除）
    console.log('\n== 新增段：保存铁律 ==');
    try {
        // 1) 编辑已有记录 → 改名称 → 点空白(遮罩)关闭 → 改动未保存
        window.__testSetRecords([{ id: 's1', name: '老山', difficulty: 2, elevation: 800, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' }]);
        window.renderTable(); await delay(50);
        window.openRecordDetailModal('s1', 'edit'); await delay(60);
        const nm1 = document.getElementById('edit-name-s1');
        if (nm1) nm1.value = '改成新山';
        assert('编辑弹窗打开且名称已改(未保存)', nm1 && nm1.value === '改成新山', nm1 ? nm1.value : 'no input');
        const mEl1 = document.querySelector('.record-detail-modal');
        if (mEl1) click(mEl1);   // 点遮罩 = 点空白处
        await delay(80);
        const s1r = (window.__getState().records).find(function (r) { return r.id === 's1'; });
        assert('点空白关闭后改动未保存(仍为老山)', s1r && s1r.name === '老山', s1r ? s1r.name : 'lost');
        assert('点空白关闭后编辑弹窗已关', !document.querySelector('.record-detail-modal'));
        // 2) 新建空白草稿 → 点空白关闭 → 草稿被删除（等同取消，不留空记录）
        window.__testSetRecords([]);
        window.addNewRecord(); await delay(60);
        assert('新建空白草稿已建(1条)', window.__getState().records.length === 1, 'n=' + window.__getState().records.length);
        const mEl2 = document.querySelector('.record-detail-modal');
        if (mEl2) click(mEl2);
        await delay(80);
        assert('空白草稿点空白关闭后已删除(未保存)', window.__getState().records.length === 0, 'n=' + window.__getState().records.length);
        assert('无弹窗残留', !document.querySelector('.record-detail-modal'));
        // 3) 计划：新建空计划草稿 → 点空白 → 草稿删
        window.__testSetPlanned([]);
        window.addNewPlannedTrip(); await delay(60);
        assert('新建计划草稿已建(1条)', window.__getStateAll().plannedTrips.length === 1);
        const mEl3 = document.querySelector('.record-detail-modal');
        if (mEl3) click(mEl3);
        await delay(80);
        assert('计划草稿点空白关闭后已删除', window.__getStateAll().plannedTrips.length === 0, 'n=' + window.__getStateAll().plannedTrips.length);
        // 4) 计划编辑已有 → 改名称 → 点「取消」按钮 → 未保存（等同 backdrop，均走 cancelPlannedEdit）
        window.__testSetPlanned([{ id: 'p1', name: '老计划', difficulty: 3, elevation: 2604, createdAt: '2026-09-10T09:00:00.000Z', updatedAt: '2026-09-10T09:00:00.000Z' }]);
        window.renderPlannedTripsTable(); await delay(50);
        window.openPlannedDetailModal('p1', 'edit'); await delay(60);
        const pn1 = document.getElementById('edit-planned-name-p1');
        if (pn1) pn1.value = '新计划名';
        assert('计划编辑弹窗打开且名称已改(未保存)', pn1 && pn1.value === '新计划名', pn1 ? pn1.value : 'no input');
        const pc1 = document.getElementById('cancel-planned-btn-p1');
        if (pc1) click(pc1);   // 取消按钮 = 不保存
        await delay(80);
        const p1r = (window.__getStateAll().plannedTrips).find(function (t) { return t.id === 'p1'; });
        assert('计划取消后改动未保存(仍为老计划)', p1r && p1r.name === '老计划', p1r ? p1r.name : 'lost');
        window.__testSetRecords([]);
        window.__testSetPlanned([]);
    } catch (e) { console.log('ERR-saverule:', e.message); }

    // ★2026-09-06 更新日志弹窗：标题去版本号 + 内容三版（本次/上次/上上次）
    console.log('\n== 新增段：更新日志三版 ==');
    try {
        window.showChangelogModal();
        await delay(50);
        const clT = document.querySelector('.confirm-modal .confirm-modal-title');
        const clB = document.getElementById('changelogBody');
        assert('更新日志标题无版本号', clT && clT.textContent.indexOf('更新日志') >= 0 && clT.textContent.indexOf('v1.1') < 0, clT ? clT.textContent : 'no title');
        const clTxt = clB ? clB.textContent : '';
        const clHtml = clB ? clB.innerHTML : '';
        // ★2026-09-07 版本断言动态化：取 BUILTIN_CHANGELOG 前三个 key（本次/上次/上上次），bump 后无需手改测试
        const bkeys = Object.keys(window.BUILTIN_CHANGELOG || {});
        const cVer = (bkeys[0] || '').replace('v', '');
        const pVer = (bkeys[1] || '').replace('v', '');
        const p2Ver = (bkeys[2] || '').replace('v', '');
        assert('内容含本次版本(' + cVer + ')+本次徽章', cVer && clTxt.indexOf(cVer) >= 0 && clTxt.indexOf('本次更新') >= 0, clTxt.slice(0, 60));
        assert('内容含上次版本(' + pVer + ')(无徽章)', pVer && clTxt.indexOf(pVer) >= 0 && clTxt.indexOf('上次更新') < 0, 'no ' + pVer);
        assert('内容含上上次版本(' + p2Ver + ')(无徽章)', p2Ver && clTxt.indexOf(p2Ver) >= 0 && clTxt.indexOf('上上次更新') < 0, 'no ' + p2Ver);
        assert('徽章只出现一次(本次,颜色内联)', (clHtml.match(/本次更新/g) || []).length === 1 && clHtml.indexOf('color:' + (document.body.classList.contains('dark-mode') ? '#a5b4fc' : '#4f46e5')) >= 0, 'badge 异常');
        // ★2026-09-18 排版守卫：分组标题 + 缩进子条目（此前整段纯文本堆一起，用户报「字都堆在一起」）
        const clHead = clHtml.match(/【[^】]{1,14}】<\/div>/g) || [];
        assert('更新日志按分组标题渲染(' + clHead.length + ')', clHead.length >= 3, 'heads=' + clHead.length);
        const clItems = clHtml.match(/[0-9]+\.<\/span>/g) || [];
        assert('更新日志条目按编号列表渲染(' + clItems.length + ')', clItems.length >= 5, 'items=' + clItems.length);
        const clStrong = clHtml.match(/<strong /g) || [];
        assert('小标题转粗体(' + clStrong.length + ')', clStrong.length >= 3, 'strong=' + clStrong.length);
        assert('无 markdown 残留(** / ##)', clTxt.indexOf('**') < 0 && !/^##\s/m.test(clTxt), 'md leaked');
        assert('Made by 只在末尾一次', (clTxt.match(/Made by XiXi/g) || []).length === 1, 'sign=' + (clTxt.match(/Made by XiXi/g) || []).length);
        // ★2026-09-18 更新弹窗与更新日志共用渲染器（曾出现：弹窗仍是纯文本，** 原样露出）
        try {
            console.log('  ⓘ 环境检测：typeof showUpdateModal =', typeof showUpdateModal, '/ renderChangelogBody =', typeof renderChangelogBody);
            if (typeof showUpdateModal === 'function') {
                showUpdateModal({ tag: '9.9.9', body: '【新增】\n- **测试条目** —— 说明文字\nMade by XiXi 💛' });
                await delay(80);
                const umBody = document.querySelector('.confirm-modal .confirm-modal-message');
                const umHtml = umBody ? umBody.innerHTML : '';
                assert('更新弹窗按编号+粗体渲染', /[0-9]+\.<\/span>/.test(umHtml) && umHtml.indexOf('<strong ') >= 0, umHtml.slice(0, 70));
                assert('更新弹窗无 ** 残留', umHtml.indexOf('**') < 0, 'md leaked');
                const umClose = document.getElementById('updateLaterBtn');
                if (umClose) click(umClose);
                await delay(40);
            } else {
                console.log('  ⓘ 更新弹窗运行时断言跳过（jsdom 无 showUpdateModal）→ 由 test.js 源码守卫覆盖');
            }
        } catch (e) { console.log('ERR-updmodal:', e.message); }
        // 关闭
        const clClose = document.getElementById('changelogClose');
        if (clClose) click(clClose); await delay(20);
        assert('更新日志弹窗可关闭', !document.querySelector('#changelogBody'));
    } catch (e) { console.log('ERR-clog:', e.message); }

    // ★2026-09-07 P0 照片库上限：详情弹窗（统计卡/容量条/超限警示/TOP排行）纯函数 + 行点击开弹窗
    console.log('\n== 新增段：照片占用上限 ==');
    try {
        // 1) 大小格式/超限判定
        assert('300MB 未超限判 false', window.photoOverLimit(300 * 1048576) === false);
        assert('300MB+1 超限判 true', window.photoOverLimit(300 * 1048576 + 1) === true);
        assert('photoSizeParts MB 格式', window.photoSizeParts(100 * 1048576).u === 'MB');
        assert('photoSizeParts KB 格式', window.photoSizeParts(500 * 1024).u === 'KB');
        // 2) 设置页行点击 → confirm-modal 详情弹窗（jsdom 无 IDB → 0 照片兜底仍渲染完整结构）
        const puRow = document.getElementById('photoUsageRow');
        assert('照片占用行在位且可点', !!puRow && puRow.style.cursor === 'pointer', puRow ? puRow.style.cursor : 'no row');
        if (puRow) click(puRow);
        await delay(120);
        const puM2 = document.querySelector('.confirm-modal');
        const puSc = document.getElementById('puScroll');
        const puContent = document.querySelector('#puModal');   // ★样式锚点 id（CSS 全挂 #puModal 前缀，缺它=全部裸排=排版乱 bug 回归项）
        assert('弹窗内容带 id=puModal(样式生效锚点)', !!puContent, 'no #puModal');
        assert('行点击打开详情弹窗(标题=照片占用+共0张)', !!puM2 && puM2.textContent.indexOf('照片占用') >= 0 && puM2.textContent.indexOf('共 0 张') >= 0, puM2 ? puM2.textContent.slice(0, 40) : 'no modal');
        assert('统计卡渲染(pu-card 存在)', !!puSc && !!puSc.querySelector('.pu-card'), puSc ? puSc.innerHTML.slice(0, 60) : 'no scroll');
        assert('容量条渲染(pu-meter 存在)', !!puSc && !!puSc.querySelector('.pu-meter'), 'no meter');
        assert('统计数字=0', !!puSc && puSc.querySelector('.pu-num') && puSc.querySelector('.pu-num').textContent.indexOf('0') >= 0, puSc ? (puSc.querySelector('.pu-num') || {}).textContent : 'no num');
        assert('警示条在位(未超限隐藏)', !!puSc && !!puSc.querySelector('.pu-warn') && puSc.querySelector('.pu-warn').className.indexOf('on') < 0, 'no warn');
        assert('TOP10 排行已移除(无 pu-tr)', !puSc || !puSc.querySelector('.pu-tr'), 'top still here');
        assert('无榜单标题(最占空间的记录已删)', !puM2 || puM2.textContent.indexOf('最占空间的记录') < 0, puM2 ? puM2.textContent.slice(0, 60) : '');
        // 底部双钮：知道了=灰蓝关闭；优化=check-go 红（只删孤立缓存，动作走 confirmDeleteOrphanPhotos）
        const puCloseB = document.getElementById('puClose');
        const puOptB = document.getElementById('puOpt');
        assert('知道了=灰蓝次钮', !!puCloseB && puCloseB.className.indexOf('confirm-btn-cancel') >= 0 && puCloseB.textContent.indexOf('知道了') >= 0, puCloseB ? puCloseB.className : 'no close');
        assert('优化=check-go 红钮', !!puOptB && puOptB.className.indexOf('check-go-btn') >= 0 && puOptB.textContent.indexOf('优化') >= 0 && puOptB.textContent.indexOf('去清理') < 0, puOptB ? puOptB.textContent : 'no opt');
        if (puOptB) click(puOptB); await delay(120);
        // ★2026-09-08 断言放宽：俏皮话随机五连（文案不锁死），只验证 弹窗关 + 中性 info toast 出现
        assert('点优化(无孤立)→弹窗关+俏皮中性提示', !document.querySelector('#puScroll') && !!document.querySelector('.info-message'), document.body.textContent.slice(0, 60));
        // 再开一次弹窗验证知道了可关
        if (document.getElementById('photoUsageRow')) { click(document.getElementById('photoUsageRow')); await delay(120); }
        const puCloseB2 = document.getElementById('puClose');
        if (puCloseB2) click(puCloseB2); await delay(30);
        assert('弹窗可关闭', !document.querySelector('#puScroll'));
    } catch (e) { console.log('ERR-pu:', e.message); }

    // ★2026-09-07 更新直装：同版本已下载过 → 弹窗「立即安装」；未下载/版本不符 → 「立即更新」
    console.log('\n== 新增段：更新直装 ==');
    try {
        window.clearLocalApkTag();
        // 1) 无本地记录 → 立即更新
        window.showUpdateModal({ tag: '1.1.99.0', body: '测试版内容' });
        await delay(40);
        const m1 = document.querySelector('.confirm-modal');
        const b1 = document.getElementById('updateNowBtn');
        assert('无本地记录时按钮=立即更新', !!m1 && b1 && b1.textContent.indexOf('立即更新') >= 0 && b1.textContent.indexOf('立即安装') < 0, b1 ? b1.textContent : 'no btn');
        document.querySelectorAll('.confirm-modal').forEach(function (m) { m.parentNode.removeChild(m); });
        // 2) 记录同版本 → 立即安装 + 绿提示
        window.rememberLocalApkTag('v1.1.99.0');
        window.showUpdateModal({ tag: '1.1.99.0', body: '测试版内容' });
        await delay(40);
        const b2 = document.getElementById('updateNowBtn');
        const m2 = document.querySelector('.confirm-modal');
        assert('同版本已下载→按钮=立即安装', !!b2 && b2.textContent.indexOf('立即安装') >= 0, b2 ? b2.textContent : 'no btn');
        assert('直装绿提示(不用重新下载)', !!m2 && m2.textContent.indexOf('不用重新下载') >= 0, m2 ? m2.textContent.slice(0, 60) : '');
        document.querySelectorAll('.confirm-modal').forEach(function (m) { m.parentNode.removeChild(m); });
        window.clearLocalApkTag();
    } catch (e) { console.log('ERR-lapk:', e.message); }

    // ===== ★2026-09-14 新增功能：那年今日 + 里程碑纪念 =====
    try {
        // ① 那年今日：往年同一天有记录 → 卡片显示（只认往年，不含今年）
        const nowD = new Date();
        const lastYearIso = new Date(nowD.getFullYear() - 1, nowD.getMonth(), nowD.getDate(), 10, 0, 0).toISOString();
        window.__testSetRecords([
            { id: 'otd1', name: '去年的山', createdAt: lastYearIso, distance: 12.5, difficulty: 3, mood: '开心', weather: '晴', photos: [] },
            { id: 'otd2', name: '今年的山', createdAt: new Date().toISOString(), distance: 5 }
        ]);
        window.onThisDayFp = '';
        window.renderOnThisDay();
        const otdCard = document.getElementById('onThisDayCard');
        const otdBody = document.getElementById('onThisDayBody');
        assert('那年今日-有历史→卡片显示', !!otdCard && otdCard.style.display === 'block', otdCard ? otdCard.style.display : 'no card');
        assert('那年今日-含去年山名', !!otdBody && otdBody.innerHTML.indexOf('去年的山') >= 0);
        assert('那年今日-年份文案正确', !!otdBody && /1 年前的今天/.test(otdBody.innerHTML));
        assert('那年今日-不含今年记录', !!otdBody && otdBody.innerHTML.indexOf('今年的山') < 0);
        assert('那年今日-可点击行存在', !!document.getElementById('onThisDayRow'));

        // ② 那年今日：无历史 → 整卡隐藏且内容清空（不占位）
        window.__testSetRecords([{ id: 'otd3', name: '只有今年', createdAt: new Date().toISOString() }]);
        window.onThisDayFp = '';
        window.renderOnThisDay();
        assert('那年今日-无历史→整卡隐藏', otdCard.style.display === 'none', otdCard.style.display);
        assert('那年今日-无历史→内容清空', otdBody.innerHTML === '');

        // ③ 里程碑统计口径：山峰按名称去重、里程累加
        window.__testSetRecords([
            { id: 'm1', name: 'A', distance: 30 }, { id: 'm2', name: 'A', distance: 20 }, { id: 'm3', name: 'B', distance: 50 }
        ]);
        const mst = window.milestoneStats();
        assert('里程碑-山峰按名称去重', mst.peaks === 2, JSON.stringify(mst));
        assert('里程碑-累计里程', mst.km === 100, JSON.stringify(mst));

        // ④ 里程碑达成 → 弹层 + 彩屑 + 持久化
        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([{ id: 'm4', name: '首座山', distance: 5 }]);
        window.checkMilestones();
        const msOv = document.getElementById('celebrateOverlay');
        assert('里程碑-达成→弹层出现', !!msOv);
        assert('里程碑-文案含档位名', !!msOv && msOv.textContent.indexOf('第 1 座山') >= 0, msOv ? msOv.textContent.slice(0, 40) : '');
        assert('里程碑-彩屑已生成(>=400)', !!msOv && msOv.querySelectorAll('div').length >= 400, msOv ? String(msOv.querySelectorAll('div').length) : '0');
        assert('里程碑-已达成档位持久化', String(window.localStorage.getItem('hiking_milestones')).indexOf('peaks_1') >= 0, String(window.localStorage.getItem('hiking_milestones')));
        const msBtn = document.getElementById('celebrateOkBtn');
        if (msBtn) msBtn.click();
        assert('里程碑-关闭后弹层移除', !document.getElementById('celebrateOverlay'));

        // ⑤ 里程碑不重复弹（已达成档位不再触发）
        window.checkMilestones();
        assert('里程碑-重复调用不再弹', !document.getElementById('celebrateOverlay'));

        // ⑥ 回归：彩屑提取为共用函数后，计划完成庆祝仍正常
        window.showPlanCompleteCelebration('测试计划', null);
        const pcOv = document.getElementById('celebrateOverlay');
        assert('回归-计划完成庆祝仍可用', !!pcOv && pcOv.textContent.indexOf('完成') >= 0 && pcOv.textContent.indexOf('继续补全') >= 0, pcOv ? pcOv.textContent.slice(0, 30) : '');
        const pcBtn = document.getElementById('celebrateOkBtn');
        if (pcBtn) pcBtn.click();

        window.localStorage.removeItem('hiking_milestones');
        window.onThisDayFp = '';
    } catch (e) { console.log('ERR-newfeat:', e.message); }
    // ===== ★2026-09-15 里程碑补领 + 「我的里程碑」一览 =====
    try {
        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([
            { id: 'q1', name: '太白山', distance: 60, updatedAt: '2026-01-10T09:00:00.000Z' },
            { id: 'q2', name: '华山', distance: 60, updatedAt: '2026-02-10T09:00:00.000Z' }
        ]);
        window.renderMilestoneEntry();
        assert('里程碑入口-存在', !!document.getElementById('milestoneEntry'));
        // ★2026-09-15 补领时机改为「启动 + 切到概览页」→ checkMilestones(true)
        //   原在 updateStatistics() 内，会抢在 saveRecord 末尾的庆祝之前把新档位标记掉 → 已移出
        window.checkMilestones(true);
        assert('补检查-不弹窗打扰', !document.getElementById('celebrateOverlay'));
        assert('补检查-入口计数已更新', document.getElementById('milestoneEntryCount').textContent === ('2 / ' + window.MILESTONES.length), document.getElementById('milestoneEntryCount').textContent);
        assert('补检查-入口红点提示', document.getElementById('milestoneNewDot').style.display === 'block', document.getElementById('milestoneNewDot').style.display);
        assert('补检查-已持久化两项', String(window.localStorage.getItem('hiking_milestones')).indexOf('km_100') >= 0);

        // ★2026-09-15 Bug 回归：saveRecord() 真实顺序是 updateStatistics() → checkMilestones()，
        //   必须仍能弹庆祝（原 bug：updateStatistics 内的静默补领抢先吃掉新档位 → 庆祝卡与彩带永不出现）
        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([
            { id: 'z1', name: 'Z山', distance: 60, updatedAt: '2026-03-01T09:00:00.000Z' },
            { id: 'z2', name: 'Y山', distance: 60, updatedAt: '2026-03-02T09:00:00.000Z' }
        ]);
        window.updateStatistics();
        assert('庆祝回归-统计不再抢先补领', window.localStorage.getItem('hiking_milestones') === null, String(window.localStorage.getItem('hiking_milestones')));
        window.checkMilestones();
        assert('庆祝回归-庆祝卡如期弹出', !!document.getElementById('celebrateOverlay'));
        const rgBtn = document.getElementById('celebrateOkBtn');
        if (rgBtn) rgBtn.click();
        assert('庆祝回归-关闭后已落盘', String(window.localStorage.getItem('hiking_milestones')).indexOf('km_100') >= 0);
        // 彩屑：单档庆祝卡必须带 400 粒下落粒子（庆祝丢失时彩带也会一并丢）
        window.showMilestoneCelebration(window.MILESTONES[0], window.milestoneStats());
        const cfOv = document.getElementById('celebrateOverlay');
        let cfN = 0;
        if (cfOv) cfOv.querySelectorAll(':scope > div').forEach(function (el) {
            if (String(el.className || '').indexOf('confirm-modal-content') < 0) cfN++;
        });
        assert('庆祝回归-彩屑 400 粒', cfN === 400, String(cfN));
        const cfBtn = document.getElementById('celebrateOkBtn');
        if (cfBtn) cfBtn.click();

        // 保存记录场景（非静默）：一次达成多个 → 汇总卡
        window.localStorage.removeItem('hiking_milestones');
        window.checkMilestones();
        const smOv = document.getElementById('celebrateOverlay');
        assert('非静默-汇总卡出现', !!smOv, smOv ? smOv.textContent.slice(0, 30) : 'no');
        assert('非静默-文案含解锁数量', !!smOv && smOv.textContent.indexOf('解锁了 2 个') >= 0, smOv ? smOv.textContent.slice(0, 40) : '');
        assert('非静默-按钮=去看看', !!smOv && smOv.textContent.indexOf('去看看') >= 0);

        const smBtn = document.getElementById('celebrateOkBtn');
        if (smBtn) smBtn.click();
        assert('汇总卡关闭', !document.getElementById('celebrateOverlay'));
        assert('一览弹窗已打开', !!document.getElementById('msListClose'));
        assert('一览-打开后红点清除', document.getElementById('milestoneNewDot').style.display === 'none', document.getElementById('milestoneNewDot').style.display);
        const mlBody = document.querySelector('.confirm-modal-content');
        const mlIcons = mlBody ? (mlBody.innerHTML.match(/material-icons/g) || []).length : 0;
        assert('一览-8 档全列(含标题图标)', mlIcons === window.MILESTONES.length + 1, String(mlIcons));
        assert('一览-含已达成标记', !!mlBody && mlBody.textContent.indexOf('已达成') >= 0);
        assert('一览-含未达成进度', !!mlBody && /\d+ \/ \d+/.test(mlBody.textContent));
        const mlClose = document.getElementById('msListClose');
        if (mlClose) mlClose.click();
        assert('一览可关闭', !document.getElementById('msListClose'));

        const msEntry = document.getElementById('milestoneEntry');
        if (msEntry) msEntry.click();
        assert('点入口→打开一览', !!document.getElementById('msListClose'));
        const mlClose2 = document.getElementById('msListClose');
        if (mlClose2) mlClose2.click();

        // 回归：单个达成仍走庆祝卡，不是汇总卡
        window.localStorage.removeItem('hiking_milestones');
        window.localStorage.setItem('hiking_milestones', JSON.stringify(['peaks_1', 'km_100']));
        window.__testSetRecords([
            { id: 'r1', name: 'A', distance: 1, updatedAt: '2026-04-01T00:00:00.000Z' },
            { id: 'r2', name: 'B', distance: 1, updatedAt: '2026-04-02T00:00:00.000Z' },
            { id: 'r3', name: 'C', distance: 1, updatedAt: '2026-04-03T00:00:00.000Z' },
            { id: 'r4', name: 'D', distance: 1, updatedAt: '2026-04-04T00:00:00.000Z' },
            { id: 'r5', name: 'E', distance: 1, updatedAt: '2026-04-05T00:00:00.000Z' }
        ]);
        window.checkMilestones();
        const singleOv = document.getElementById('celebrateOverlay');
        assert('单个达成→庆祝卡', !!singleOv && singleOv.textContent.indexOf('第 5 座山') >= 0, singleOv ? singleOv.textContent.slice(0, 30) : '');
        assert('单个达成→非汇总卡', !!singleOv && singleOv.textContent.indexOf('解锁了') < 0);
        const singleBtn = document.getElementById('celebrateOkBtn');
        if (singleBtn) singleBtn.click();

        window.localStorage.removeItem('hiking_milestones');
    } catch (e) { console.log('ERR-ms2:', e.message); }
    // ===== ★2026-09-15 里程碑扩展：高度挑战 + 收集类（五岳 / 四季 / 天气 / 难度） =====
    try {
        assert('山名归一化-华山', window.normalizePeakName('华山') === '华山');
        assert('山名归一化-西岳华山→华山', window.normalizePeakName('西岳华山') === '华山');
        assert('山名归一化-少华山不误判', window.normalizePeakName('少华山') === '少华山');
        assert('山名归一化-去括号', window.normalizePeakName('华山（陕西）') === '华山');
        assert('山名归一化-去方位前缀', window.normalizePeakName('东岳泰山') === '泰山');
        assert('里程碑总档位数(>=16)', window.MILESTONES.length >= 16, String(window.MILESTONES.length));

        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([
            { id: 'x1', name: '华山', elevation: 2154, distance: 8, difficulty: 3, weather: '晴', createdAt: '2026-03-15T09:00:00.000Z' },
            { id: 'x2', name: '西岳华山', elevation: 2154, distance: 8, difficulty: 3, weather: '晴', createdAt: '2026-03-16T09:00:00.000Z' },
            { id: 'x3', name: '少华山', elevation: 1664, distance: 6, difficulty: 2, weather: '多云', createdAt: '2026-06-15T09:00:00.000Z' },
            { id: 'x4', name: '太白山', elevation: 3767, distance: 12, difficulty: 5, weather: '阴', createdAt: '2026-09-15T09:00:00.000Z' },
            { id: 'x5', name: '翠华山', elevation: 1600, distance: 5, difficulty: 1, weather: '雨', createdAt: '2026-12-15T09:00:00.000Z' },
            { id: 'x6', name: '南五台', elevation: 1688, distance: 5, difficulty: 4, weather: '雪', createdAt: '2027-01-15T09:00:00.000Z' }
        ]);
        const mst2 = window.milestoneStats();
        assert('五岳-少华山不误判(命中仅1)', Object.keys(mst2.wuyue).length === 1, Object.keys(mst2.wuyue).join(','));
        assert('五岳-西岳华山算数', !!mst2.wuyue['华山']);
        assert('统计-最高海拔', mst2.maxAlt === 3767, String(mst2.maxAlt));
        assert('统计-四季齐', Object.keys(mst2.season).length === 4, Object.keys(mst2.season).join(','));
        assert('统计-天气齐', Object.keys(mst2.weather).length === 5, Object.keys(mst2.weather).join(','));
        assert('统计-难度齐', Object.keys(mst2.difficulty).length === 5, Object.keys(mst2.difficulty).join(','));

        window.checkMilestones(true);
        const done2 = window.localStorage.getItem('hiking_milestones') || '';
        assert('补领-高度档达成', done2.indexOf('alt_3000') >= 0, done2);
        assert('补领-四季达成', done2.indexOf('season') >= 0);
        assert('补领-天气达成', done2.indexOf('weather') >= 0);
        assert('补领-难度达成', done2.indexOf('difficulty') >= 0);
        assert('补领-4000米未达成', done2.indexOf('alt_4000') < 0);
        assert('补领-五岳未集齐', done2.indexOf('wuyue') < 0);

        window.showMilestoneList();
        const lm2 = document.querySelector('.confirm-modal-content');
        const icons2 = lm2 ? (lm2.innerHTML.match(/material-icons/g) || []).length : 0;
        assert('一览-全档位列齐(含标题图标)', icons2 === window.MILESTONES.length + 1, String(icons2) + '/' + String(window.MILESTONES.length + 1));
        assert('一览-含五岳清单', !!lm2 && lm2.textContent.indexOf('泰山') >= 0 && lm2.textContent.indexOf('嵩山') >= 0);
        assert('一览-已达成项带勾', !!lm2 && lm2.innerHTML.indexOf('\u2713') >= 0);
        const lc2 = document.getElementById('msListClose');
        if (lc2) lc2.click();
        window.localStorage.removeItem('hiking_milestones');
        // 陕西名山组（含别名兼容；少华山不算）
        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([
            { id: 's1', name: '华山', elevation: 2154, distance: 8, updatedAt: '2026-03-15T09:00:00.000Z' },
            { id: 's2', name: '南五台', distance: 6, updatedAt: '2026-06-15T09:00:00.000Z' },
            { id: 's3', name: '太白山', elevation: 3767, distance: 12, updatedAt: '2026-09-15T09:00:00.000Z' },
            { id: 's4', name: '少华山', distance: 5, updatedAt: '2026-12-15T09:00:00.000Z' }
        ]);
        const stShx = window.milestoneStats();
        assert('档位总数=17', window.MILESTONES.length === 17, String(window.MILESTONES.length));
        assert('陕西名山-命中3(少华山不算)', Object.keys(stShx.shaanxi).length === 3, Object.keys(stShx.shaanxi).join(','));
        assert('陕西名山-含华山', !!stShx.shaanxi['华山']);
        assert('陕西名山-含太白山', !!stShx.shaanxi['太白山']);
        assert('陕西名山-含南五台山', !!stShx.shaanxi['南五台山']);
        assert('陕西名山-不含少华山', !stShx.shaanxi['少华山']);
        window.__testSetRecords([{ id: 's5', name: '南五台山', distance: 5, updatedAt: '2026-01-01T00:00:00.000Z' }]);
        assert('陕西名山-别名「南五台山」算', !!window.milestoneStats().shaanxi['南五台山']);
        window.__testSetRecords([{ id: 's6', name: '翠华', distance: 5, updatedAt: '2026-01-01T00:00:00.000Z' }]);
        assert('陕西名山-别名「翠华」算', !!window.milestoneStats().shaanxi['翠华山']);
        window.__testSetRecords([{ id: 's7', name: '西岳华山', distance: 5, updatedAt: '2026-01-01T00:00:00.000Z' }]);
        const stShx2 = window.milestoneStats();
        assert('「西岳华山」同时算五岳与陕西', !!stShx2.wuyue['华山'] && !!stShx2.shaanxi['华山']);
        window.localStorage.removeItem('hiking_milestones');
    } catch (e) { console.log('ERR-msext:', e.message); }

    // ===== ★2026-09-15 三修回归：天气识别 / 成就可变 / 一览滚动条 / 入口渐入 =====
    try {
        // ① 天气识别：记录里存的是 emoji（WEATHER_OPTIONS），此前只按文本匹配 → 永远收集不到
        window.localStorage.removeItem('hiking_milestones');
        window.localStorage.removeItem('hiking_milestones_seen');
        window.__testSetRecords([
            { id: 'w1', name: 'A', weather: '☀️', distance: 1 },
            { id: 'w2', name: 'B', weather: '🌤️', distance: 1 },
            { id: 'w3', name: 'C', weather: '☁️', distance: 1 },
            { id: 'w4', name: 'D', weather: '🌧️', distance: 1 },
            { id: 'w5', name: 'E', weather: '❄️', distance: 1 }
        ]);
        let stW = window.milestoneStats().weather;
        assert('天气-emoji 识别齐全(5/5)', Object.keys(stW).length === 5, Object.keys(stW).join(','));
        assert('天气-emoji 映射为天气名', !!stW['晴'] && !!stW['雪'] && !!stW['多云'], Object.keys(stW).join(','));
        assert('天气-旧文本数据兼容', window.normWeather('晴') === '晴' && window.normWeather('晴天') === '晴' && window.normWeather('') === null);
        assert('天气-天气收藏家可达成', window.getMilestoneDone().indexOf('weather') >= 0);

        // ② 成就可变：删记录后成就自动失效（不再是「一次达成永久锁定」）
        window.localStorage.removeItem('hiking_milestones');
        window.__testSetRecords([
            { id: 'v1', name: '华山', distance: 1 },
            { id: 'v2', name: '太白山', distance: 1 },
            { id: 'v3', name: '翠华山', distance: 1 },
            { id: 'v4', name: '南五台山', distance: 1 }
        ]);
        assert('可变-删前陕西名山已达成', window.getMilestoneDone().indexOf('shaanxi') >= 0);
        window.renderMilestoneEntry();
        const cntBefore = document.getElementById('milestoneEntryCount').textContent;
        // 删掉华山
        window.__testSetRecords([
            { id: 'v2', name: '太白山', distance: 1 },
            { id: 'v3', name: '翠华山', distance: 1 },
            { id: 'v4', name: '南五台山', distance: 1 }
        ]);
        assert('可变-删后陕西名山失效', window.getMilestoneDone().indexOf('shaanxi') < 0);
        assert('可变-删后进度退回 3/4', Object.keys(window.milestoneStats().shaanxi).length === 3);
        window.updateStatistics();
        const cntAfter = document.getElementById('milestoneEntryCount').textContent;
        assert('可变-入口计数随之下调', cntAfter !== cntBefore, cntBefore + ' -> ' + cntAfter);
        window.showMilestoneList();
        let shxRow = '';
        document.querySelectorAll('.ms-scroll > div').forEach(function (r) { if (r.textContent.indexOf('陕西名山') >= 0) shxRow = r.textContent.replace(/\s+/g, ' '); });
        assert('可变-一览中已不是已达成', shxRow.indexOf('已达成') < 0, shxRow.slice(0, 40));
        const lc3 = document.getElementById('msListClose');
        if (lc3) lc3.click();

        // ③ 一览滚动条不再越出圆角：卡片 flex 列 + 行列表放进内嵌滚动容器
        window.showMilestoneList();
        let msCard = null;
        document.querySelectorAll('.modal-backdrop-animate').forEach(function (n) { if (n.querySelector('#msListClose')) msCard = n.firstElementChild; });
        const msCs = msCard ? getComputedStyle(msCard) : null;
        const msScr = msCard ? msCard.querySelector('.ms-scroll') : null;
        assert('一览-卡片为 flex 列', !!msCs && msCs.display === 'flex' && msCs.flexDirection === 'column', msCs ? msCs.display + '/' + msCs.flexDirection : 'no');
        assert('一览-卡片裁剪滚动条', !!msCs && msCs.overflow === 'hidden', msCs ? msCs.overflow : 'no');
        assert('一览-内嵌滚动容器含全部档位', !!msScr && msScr.children.length === window.MILESTONES.length, msScr ? String(msScr.children.length) : 'no');
        assert('一览-滚动容器右内缩(不越圆角)', !!msCs && msCs.paddingRight === '20px', msCs ? msCs.paddingRight : 'no');
        const lc4 = document.getElementById('msListClose');
        if (lc4) lc4.click();

        // ④ 入口卡与其它卡片一致 fadeInUp 渐入
        const mEntry = document.getElementById('milestoneEntry');
        const mEntryCs = mEntry ? getComputedStyle(mEntry) : null;
        assert('入口-与统计卡同款渐入动画', !!mEntryCs && mEntryCs.animationName === 'fadeInUp' && mEntryCs.animationFillMode === 'forwards', mEntryCs ? mEntryCs.animationName : 'no');

        window.localStorage.removeItem('hiking_milestones');
        window.localStorage.removeItem('hiking_milestones_seen');
    } catch (e) { console.log('ERR-ms3:', e.message); }
    console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
