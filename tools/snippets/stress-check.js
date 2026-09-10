/* 压力与泄漏实测：反复开关弹窗残留 / 大列表渲染耗时 / 长会话内存
 * 用法：node e2e/inspect.js --file tools/snippets/stress-check.js --wait 1500
 */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function count(sel) { return document.querySelectorAll(sel).length; }

return (async function () {
    var out = {};

    // ========== A. DOM 泄漏：反复开关各类弹窗 15 轮 ==========
    var probeId = null;
    try {
        if (!records.length && typeof loadSampleData === 'function') { loadSampleData(); await sleep(300); }
        probeId = records.length ? records[0].id : null;
    } catch (e) { out.setupErr = e.message; }

    out.before = { modal: count('.confirm-modal-content'), backdrop: count('.modal-backdrop-animate'), toast: count('.toast-glass') };
    try {
        for (var i = 0; i < 15; i++) {
            if (probeId && typeof openRecordDetailModal === 'function') { openRecordDetailModal(probeId, 'view'); if (typeof closeRecordDetailModal === 'function') closeRecordDetailModal(); }
            if (typeof showChangelogModal === 'function') { showChangelogModal(); }
            if (typeof showPrivacyPolicyModal === 'function') { showPrivacyPolicyModal(); }
            if (typeof showDisclaimerModal === 'function') { showDisclaimerModal(); }
            if (typeof showSupportModal === 'function') { showSupportModal(); }
            if (typeof closeOpenModals === 'function') closeOpenModals();
            if (typeof showInfoMessage === 'function') showInfoMessage('泄漏测试' + i, 60);
            await sleep(12);
        }
        await sleep(700);
        out.after = { modal: count('.confirm-modal-content'), backdrop: count('.modal-backdrop-animate'), toast: count('.toast-glass') };
        out.leak = {
            modal: out.after.modal - out.before.modal,
            backdrop: out.after.backdrop - out.before.backdrop,
            toast: out.after.toast - out.before.toast
        };
    } catch (e) { out.loopErr = e.message; }

    // ========== B. 大列表渲染耗时（分页 10 条，灌 500 条）==========
    try {
        var orig = records.slice();
        var bulk = [];
        for (var k = 0; k < 500; k++) {
            bulk.push({ id: 'bulk-' + k, name: '压力测试山 ' + k, createdAt: Date.now() - k * 86400000, elevation: 1000 + k, distance: 5 + k, duration: 3600, difficulty: (k % 5) + 1, photos: [] });
        }
        records.length = 0;
        Array.prototype.push.apply(records, bulk);
        // ★用双 rAF 等渲染真正落地（用 sleep 会把等待时间算进耗时 → 数据无意义）
        function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); }
        var t0 = performance.now();
        renderTable();
        await nextFrame();
        out.bulkRenderMs = Math.round(performance.now() - t0);
        out.bulkRows = count('#recordsTable tr');
        out.bulkStats = ((document.getElementById('recordsTotalBadge') || {}).textContent || '').slice(0, 30);

        // 搜索性能（500 条上过滤）
        var t1 = performance.now();
        if (typeof performSearch === 'function') { performSearch('压力测试山 3'); } else if (typeof filterRecords === 'function') { filterRecords('压力测试山 3'); }
        else { var el = document.getElementById('searchInput'); if (el) { el.value = '压力测试山 3'; el.dispatchEvent(new Event('input', { bubbles: true })); } }
        await nextFrame(); await nextFrame();
        out.searchMs = Math.round(performance.now() - t1);
        out.searchRows = count('#recordsTable tr');

        // 恢复
        if (el = document.getElementById('searchInput')) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        records.length = 0;
        Array.prototype.push.apply(records, orig);
        renderTable();
        await sleep(400);
        out.restored = records.length;
    } catch (e) { out.bulkErr = e.message; }

    // ========== C. 长会话：定时器/监听数量（可间接看 cleanup）==========
    try {
        out.cleanupFns = (typeof cleanupFunctions !== 'undefined' && cleanupFunctions && cleanupFunctions.length) ? cleanupFunctions.length : 'n/a';
    } catch (e) { out.cleanupFns = 'err'; }

    return out;
})();
