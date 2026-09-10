/* 健壮性实测：XSS/转义 + 错误提示骚扰 + 边界数据
 * 用法：node e2e/inspect.js --file tools/snippets/robust-check.js
 * ★不污染数据：结束时把探测记录移除
 */
var MAL = '<img src=x onerror="window.__xssFired=1">';
var MAL2 = '<script>window.__xssFired2=1<\/script>';
var out = { stages: [] };
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

return (async function () {
    // ========== A. XSS / 转义实测 ==========
    var probeId = 'xss-probe-' + Date.now();
    var before = records.length;
    try {
        records.push({
            id: probeId, name: 'XSS探测' + MAL, createdAt: Date.now(),
            elevation: 1234, distance: 5.5, duration: 3600, difficulty: 3,
            mood: MAL, weather: MAL2, companions: [MAL], photos: [],
            notes: '小日记正文' + MAL2 + '<b>粗体</b>'
        });
        out.stages.push('注入探测记录（' + before + '→' + records.length + '）');
    } catch (e) { out.stages.push('注入失败: ' + e.message); }

    // 路径1：记录列表
    try { renderTable(); await sleep(260); } catch (e) { out.stages.push('renderTable: ' + e.message); }
    // 路径2：记录详情弹窗
    try { openRecordDetailModal(probeId, 'view'); await sleep(160); } catch (e) { out.stages.push('详情: ' + e.message); }
    var detailHasImg = document.querySelectorAll('.confirm-modal-content img[src="x"]').length;
    try { closeRecordDetailModal(); await sleep(80); } catch (e) {}
    // 路径3：我的山册
    try { renderMountainBook(); await sleep(160); } catch (e) { out.stages.push('山册: ' + e.message); }
    // 路径4：年度回顾
    try { openYearReview(new Date().getFullYear()); await sleep(160); } catch (e) { out.stages.push('年回: ' + e.message); }

    out.xssFired = !!window.__xssFired;
    out.xss2Fired = !!window.__xssFired2;
    out.anyRawImgTag = document.querySelectorAll('img[src="x"]').length;      // 若被当 HTML 解析会 >0
    out.malLiteralVisible = (document.body.textContent || '').indexOf('XSS探测<img') >= 0;  // 转义生效=显示字面文本

    // 清理探测记录
    try {
        var i = records.findIndex(function (r) { return r.id === probeId; });
        if (i >= 0) records.splice(i, 1);
        if (typeof closeOpenModals === 'function') closeOpenModals();
        renderTable();
        out.stages.push('已清理探测记录（回到 ' + records.length + ' 条）');
    } catch (e) { out.stages.push('清理失败: ' + e.message); }

    // ========== B. 资源加载失败是否触发"出错了"骚扰 ==========
    var img = document.createElement('img');
    img.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px;';
    img.src = '/__definitely_missing_resource__.png';
    document.body.appendChild(img);
    await sleep(900);
    var bodyTxt = document.body.textContent || '';
    out.resourceErrToast = bodyTxt.indexOf('出错了') >= 0;
    out.resourceErrToastText = (bodyTxt.match(/出错了[^\n]{0,40}/) || [''])[0];
    img.remove();

    // ========== C. 边界数据 ==========
    var edge = {};
    try {
        var tmp = records.slice();
        records.push({ id: 'edge-1', name: '', createdAt: Date.now(), notes: '', photos: [] });   // 空名
        records.push({ id: 'edge-2', name: 'A'.repeat(300), createdAt: Date.now(), notes: 'B'.repeat(3000), photos: [] }); // 超长
        records.push({ id: 'edge-3', createdAt: 0, name: '零时间戳', photos: null });              // 异常时间/空照片
        renderTable();
        await sleep(240);
        edge.noThrow = true;
        edge.rows = document.querySelectorAll('#recordsTable tr').length;
        edge.longNameTruncated = !!document.querySelector('.rd-name-main');
        var i1 = records.findIndex(function (r) { return r.id === 'edge-1'; });
        if (i1 >= 0) records.splice(i1, 3);
        renderTable();
        await sleep(200);
    } catch (e) { edge.err = e.message; }
    out.edge = edge;

    return out;
})();
