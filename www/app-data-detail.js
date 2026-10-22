// ============================================================================
// 记录阅读态详情弹窗 v2（点行看详情、弹窗内编辑）
// ★2026-10-22 从 app-data.js 按功能边界拆出（原 5464 行单文件 → 6 个文件）。
//   拆分为纯物理切分：所有函数/变量仍在全局作用域，加载顺序与拆分前一致，行为不变。
// ============================================================================

// ===== ★2026-09-04 阅读态 v2：居中详情弹窗（列表瘦身为 名称+操作，点行看详情，弹窗内编辑）=====
// 全局：当前打开的详情弹窗记录 id 与模式（null=无；view=阅读 / edit=编辑）
var detailModalRecordId = null;
var detailModalMode = 'view';
// 弹窗内编辑临时照片列表（与行内编辑共用 editingPhotoIds 全局——photoThumbsHTML/灯箱/保存都读它）
// 弹窗 DOM 引用
var recordDetailModalEl = null;

function closeRecordDetailModal() {
    if (recordDetailModalEl && recordDetailModalEl.parentNode) {
        try { recordDetailModalEl.parentNode.removeChild(recordDetailModalEl); } catch (e) { /* 忽略 */ }
    }
    recordDetailModalEl = null;
    detailModalRecordId = null;
    detailModalMode = 'view';
}

// 阅读态徽章颜色（难度沿用现有色系；心情/天气中性玻璃）
function rdDifficultyColor(d) {
    return { 1: '#10b981', 2: '#84cc16', 3: '#f59e0b', 4: '#f97316', 5: '#dc2626' }[d] || '#f59e0b';
}
// ★2026-09-04 弹窗难度徽章文字色（700 档深色）：白底浅色模式下 500 档亮色对比不足看不清；dark 由 CSS .rd-chip !important 覆盖为亮字
function rdDifficultyColorDeep(d) {
    return { 1: '#047857', 2: '#3f6212', 3: '#92400e', 4: '#9a3412', 5: '#991b1b' }[d] || '#92400e';
}
// ★2026-09-04 编辑框难度文案「N级 档名」（如 5级 困难）：value 前缀数字保证 parseInt 兼容保存/复制/弹窗 current
function diffLabel(d) {
    var n = Math.min(5, Math.max(1, parseInt(d, 10) || 3));
    return n + '级 ' + ({ 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' })[n];
}

// 阅读态弹窗 body（点行默认）
function recordViewBodyHTML(r) {
    var durTxt = (Number(r.duration) || 0) ? formatDuration(Number(r.duration)) : '—';
    var kmTxt = (Number(r.distance) || 0) ? Number(r.distance).toFixed(1) + 'km' : '—';
    var elTxt = (Number(r.elevation) || 0) ? r.elevation + 'm' : '—';
    var mateTxt = (r.companions && String(r.companions).trim()) ? escapeHtml(String(r.companions).trim()) : '—';
    var dColor = rdDifficultyColor(Number(r.difficulty));
    var diffName = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' }[Number(r.difficulty)] || '中等';
    // 照片墙（只读，点开灯箱查看）
    var photosHtml = '';
    if (r.photos && r.photos.length) {
        // ★2026-09-04 展示弹窗照片墙改横向滑动条（原 3 列网格贴满）：一排缩略图可左右滑，与山册照片回忆同款交互
        var cells = r.photos.slice(0, 24).map(function (pid) {
            return '<img data-pid="' + pid + '" data-record="' + r.id + '" style="width:92px;height:92px;object-fit:cover;border-radius:10px;background:#e2e8f0;cursor:pointer;flex-shrink:0;display:block;" alt="照片">';
        }).join('');
        photosHtml = '<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;-webkit-overflow-scrolling:touch;" id="rd-photos-' + r.id + '">' + cells + '</div>';
    }
    return '' +
        '<div class="rd-head" style="display:flex;align-items:baseline;gap:8px;margin:2px 0 6px;">' +
        '<span class="rd-name" style="font-size:20px;font-weight:700;color:#1e293b;line-height:1.35;">' + escapeHtml(r.name) + '</span>' +
        '<span class="rd-no" style="font-size:13px;color:#475569;flex-shrink:0;font-weight:500;">' + fmtYMD(r.createdAt) + '</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">' +
        '<span class="rd-chip" style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:99px;color:' + rdDifficultyColorDeep(Number(r.difficulty)) + ';border:1px solid ' + dColor + '66;background:' + dColor + '14;">难度 ' + r.difficulty + ' 级 · ' + diffName + '</span>' +
        (r.mood ? '<span class="rd-chip" style="font-size:12px;font-weight:500;padding:2px 10px;border-radius:99px;background:rgba(148,163,184,0.14);border:1px solid rgba(148,163,184,0.4);color:#334155;">心情 ' + escapeHtml(r.mood) + '</span>' : '') +
        (r.weather ? '<span class="rd-chip" style="font-size:12px;font-weight:500;padding:2px 10px;border-radius:99px;background:rgba(148,163,184,0.14);border:1px solid rgba(148,163,184,0.4);color:#334155;">天气 ' + escapeHtml(r.weather) + '</span>' : '') +
        '</div>' +
        photosHtml +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">最高海拔</div><div style="font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">' + elTxt + '</div></div>' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">里程</div><div style="font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">' + kmTxt + '</div></div>' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">用时</div><div style="font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">' + durTxt + '</div></div>' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">同行人</div><div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + mateTxt + '</div></div>' +
        '</div>' +
        // ★2026-09-05 小日记：记录弹窗里的回忆段落（编辑时写的 notes；有内容才展示）
        // ★2026-09-06 小日记字色提亮：标签/图标加深至 #334155（原 #64748b 偏浅）、正文加深 #1e293b；dark 由 .jd-lab/.jd-body CSS 覆盖
        (r.notes && String(r.notes).trim() ? '<div style="background:rgba(148,163,184,0.1);border-radius:12px;padding:10px 12px;margin-bottom:14px;"><div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;"><span class="material-icons jd-ic" style="font-size:14px;color:#334155;">edit_note</span><span class="jd-lab" style="font-size:12px;color:#334155;letter-spacing:0.3px;">小日记</span></div><div class="jd-body" style="font-size:13px;color:#1e293b;line-height:1.75;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(String(r.notes).trim()) + '</div></div>' : '') +
        '<button id="rd-edit-btn" class="glass-btn ripple-effect" type="button" style="width:100%;padding:10px 0;border-radius:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">编辑这条记录</button>';
}

// 编辑态弹窗 body（与行内编辑同 id 体系：保存/照片/日期/难度/心情/天气全复用）
function recordEditBodyHTML(r) {
    var recordCancelStyle2 = (document.body.classList.contains('dark-mode'))
        ? 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
        : 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';
    return '' +
        '<div style="display:flex;flex-direction:column;gap:7px;">' +
        // 名称（全宽）
        '<input type="text" id="edit-name-' + r.id + '" value="' + escapeHtml(r.name) + '" data-testid="edit-name-' + r.id + '" class="edit-input input-glow" placeholder="输入名称" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="next">' +
        // 海拔 + 难度 一行（★2026-09-04 1:1 均分，难度框显示「N级 档名」）
        '<div style="display:flex;gap:8px;">' +
        '<input type="number" id="edit-elevation-' + r.id + '" value="' + (r.elevation || 0) + '" data-testid="edit-elevation-' + r.id + '" class="edit-input input-glow" style="flex:1;min-width:0;" min="0" placeholder="海拔" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next">' +
        '<input type="text" id="edit-difficulty-' + r.id + '" data-testid="edit-difficulty-' + r.id + '" value="' + diffLabel(r.difficulty || 3) + '" class="edit-input input-glow difficulty-color"' + ' readonly style="flex:1;min-width:0;cursor:pointer;font-weight:600;text-align:center;--dfc-light:' + getDifficultyColor(r.difficulty || 3) + ';--dfc-dark:' + getDifficultyColorDark(r.difficulty || 3) + ';" onclick="openDifficultyPicker(\'edit-difficulty-' + r.id + '\')" title="点击选择难度" enterkeyhint="done">' +
        '</div>' +
        // 心情/天气/同行人 一行
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
        '<input type="text" id="edit-mood-' + r.id + '" class="edit-input input-glow" style="flex:1;min-width:0;text-align:center;" value="' + (r.mood || '') + '" placeholder="心情" readonly title="心情（可选）">' +
        '<input type="text" id="edit-weather-' + r.id + '" class="edit-input input-glow" style="flex:1;min-width:0;text-align:center;" value="' + (r.weather || '') + '" placeholder="天气" readonly title="天气（可选）">' +
        '<input type="text" id="edit-companions-' + r.id + '" placeholder="同行人" class="edit-input input-glow" style="flex:1;min-width:0;text-align:center;" value="' + escapeHtml(r.companions || '') + '">' +
        '</div>' +
        // 用时 + 里程 一行（★2026-09-04 均匀分布）
        '<div style="display:flex;gap:8px;align-items:center;">' +
        '<div class="edit-merge-box" style="display:flex;flex:1;min-width:0;align-items:center;gap:2px;background:rgba(255,255,255,0.42);-webkit-backdrop-filter:blur(2px) saturate(150%);backdrop-filter:blur(2px) saturate(150%);border:1px solid rgba(148,163,184,0.2);border-radius:10px;padding:0 6px;">' +
        '<input type="number" id="edit-duration-h-' + r.id + '" placeholder="时" class="edit-input input-glow" style="flex:1;min-width:0;border:none;background:transparent;padding:8px 2px;text-align:center;" value="' + (r.duration ? Math.floor(Number(r.duration) / 60) : '') + '" min="0" max="23" step="1" inputmode="numeric" title="小时">' +
        '<span class="edit-unit">时</span>' +
        '<input type="number" id="edit-duration-m-' + r.id + '" placeholder="分" class="edit-input input-glow" style="flex:1;min-width:0;border:none;background:transparent;padding:8px 2px;text-align:center;" value="' + (r.duration ? Number(r.duration) % 60 : '') + '" min="0" max="59" step="1" inputmode="numeric" title="分钟">' +
        '<span class="edit-unit">分</span></div>' +
        '<div class="edit-merge-box" style="display:flex;flex:1;min-width:0;align-items:center;gap:2px;background:rgba(255,255,255,0.42);-webkit-backdrop-filter:blur(2px) saturate(150%);backdrop-filter:blur(2px) saturate(150%);border:1px solid rgba(148,163,184,0.2);border-radius:10px;padding:0 8px;">' +
        '<input type="number" id="edit-distance-' + r.id + '" placeholder="里程" class="edit-input input-glow" style="flex:1;min-width:0;border:none;background:transparent;padding:8px 2px;text-align:center;" value="' + (r.distance || '') + '" min="0" step="0.01" inputmode="decimal" title="里程（公里，最多两位小数）">' +
        '<span class="edit-unit">km</span></div>' +
        '</div>' +
        // 日期时间（★2026-09-04 移至末位：时/分/里程下方整行）
        '<input type="text" id="edit-created-at-' + r.id + '" value="' + formatDateTimeLocal(r.createdAt).replace('T', ' ') + '" data-iso="' + formatDateTimeLocal(r.createdAt) + '" data-testid="edit-created-at-' + r.id + '" class="edit-input input-glow" readonly style="cursor:pointer;font-weight:400;text-align:center;color:' + (document.body.classList.contains('dark-mode') ? '#e5e7eb' : '#334155') + ';" onclick="openDateTimePicker(this.id, this.value)" enterkeyhint="done" title="点击选择日期时间">' +
        // ★2026-09-05 小日记：编辑时可写（notes 字段，textarea 玻璃同 edit-input；dark 由 .dark-mode .edit-input 覆盖）
        '<div style="display:flex;flex-direction:column;gap:6px;"><div style="display:flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;color:#64748b;">edit_note</span><span class="rd-ph-lab" style="font-size:12px;color:#334155;">小日记（可选）</span></div>' +
        '<textarea id="edit-notes-' + r.id + '" class="edit-input input-glow" rows="3" maxlength="2000" placeholder="写点这天的见闻、心情、路上故事…（保存后显示在记录里）" style="width:100%;box-sizing:border-box;resize:none;border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.7;min-height:48px;font-family:inherit;">' + escapeHtml(r.notes || '') + '</textarea></div>' +
        // 照片区（层叠卡 + 灯箱管理）
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;"><span style="display:flex;flex-direction:column;align-items:flex-start;margin-right:4px;"><span class="rd-ph-lab" style="font-size:12px;color:#334155;line-height:1.3;">照片</span><span class="rd-ph-hint">最多 24 张</span></span>' +
        '<div id="photo-thumbs-' + r.id + '" style="display:flex;align-items:center;">' + photoThumbsHTML(editingPhotoIds, r.id) + '</div>' +
        '</div>' +
        // 操作按钮
        '<div style="display:flex;gap:10px;margin-top:2px;">' +
        '<button id="cancel-btn-' + r.id + '" data-testid="cancel-button-' + r.id + '" class="ripple-effect btn-click-effect confirm-btn-cancel" style="' + recordCancelStyle2 + '">取消</button>' +
        '<button id="save-btn-' + r.id + '" data-testid="save-button-' + r.id + '" class="ripple-effect btn-click-effect glass-btn" style="flex:1;padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;">保存</button>' +
        '</div>' +
        '</div>';
}

// 打开记录详情弹窗（居中玻璃，同 confirm-modal 体系）
function openRecordDetailModal(id, startMode) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入（含计划/其它弹窗）
        closeRecordDetailModal();
        var r = (records || []).find(function (x) { return x.id === id; });
        if (!r) return;
        detailModalRecordId = id;
        detailModalMode = (startMode === 'edit') ? 'edit' : 'view';
        var modal = document.createElement('div');
        // ★2026-09-04 详情弹窗用独立 class（不带 confirm-modal）：子选择弹窗（难度/日期/心情）open 时 closeOpenModals()
        //   只清 .confirm-modal，不会误删本弹窗 → 编辑态里再弹子选择器才能叠层工作
        modal.className = 'record-detail-modal modal-backdrop-animate';
        recordDetailModalEl = modal;
        var modalInner =
'<div class="confirm-modal-content modal-fade-scale mdl-lg" style="overflow-y:auto;border-radius:20px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
            '<span class="material-icons" style="color:#4f46e5;">' + (detailModalMode === 'edit' ? 'edit_note' : 'landscape') + '</span>' +
            '<span class="rd-tt" style="font-size:15px;font-weight:700;flex:1;color:#334155;">' + (detailModalMode === 'edit' ? '编辑记录' : '记录详情') + '</span>' +
            (detailModalMode === 'edit' ? '' : '<button id="rd-close" style="background:transparent;border:none;color:#334155;cursor:pointer;font-size:20px;line-height:1;padding:2px;">✕</button>') +
            '</div><div id="rd-body" style="margin-top:8px;"></div></div>';
        modal.innerHTML = modalInner;
        document.body.appendChild(modal);
        var bodyEl = modal.querySelector('#rd-body');
        if (detailModalMode === 'edit') {
            editingId = id;
            editingPhotoIds = (r.photos || []).slice();
            bodyEl.innerHTML = recordEditBodyHTML(r);
        } else {
            bodyEl.innerHTML = recordViewBodyHTML(r);
        }
        bindRecordDetailEvents(modal, id, r);
        // ★2026-09-04 修复：详情弹窗照片不显示——view 照片墙/编辑 thumbs 的 img 全靠 loadPhotoThumbs 异步填 src，打开后必须触发
        try { loadPhotoThumbs(id); } catch (e) { /* 忽略 */ }
        // ★2026-09-06 保存铁律：编辑态点空白关闭 = 等同取消（丢弃改动、删未存草稿，绝不保存）；阅读态点空白只是关详情
        modal.addEventListener('click', function (e) {
            if (e.target !== modal) return;
            if (detailModalMode === 'edit') { try { cancelEdit(); } catch (eC) { /* 兜底 */ } return; }
            closeRecordDetailModal(); renderTable();
        });
    } catch (e) { /* 打开失败不影响 */ }
}

// 弹窗内事件绑定（随弹窗 DOM 重建，不入 cleanup 体系）
function bindRecordDetailEvents(modal, id, r) {
    var closeBtn = modal.querySelector('#rd-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeRecordDetailModal(); renderTable(); });
    var bodyEl = modal.querySelector('#rd-body');
    // 阅读态：照片只读灯箱 + 编辑按钮
    if (detailModalMode === 'view') {
        var phBox = bodyEl.querySelector('#rd-photos-' + id);
        if (phBox) {
            phBox.addEventListener('click', function (e) {
                var img = e.target.closest('img[data-pid]');
                if (!img) return;
                var pid = img.getAttribute('data-pid');
                openPhotoLightbox(id, pid, false); // 只读灯箱
            });
        }
        var editBtn = bodyEl.querySelector('#rd-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                detailModalMode = 'edit';
                editingId = id;
                editingPhotoIds = (r.photos || []).slice();
                var tt = modal.querySelector('.rd-tt');
                if (tt) tt.textContent = '编辑记录';
                var ic = modal.querySelector('.material-icons');
                if (ic) ic.textContent = 'edit_note';
                bodyEl.innerHTML = recordEditBodyHTML(r);
                bindEditBody(modal, id);
                try { loadPhotoThumbs(id); } catch (e2) { /* 忽略 */ }   // ★2026-09-04 view→edit 切换重建 DOM 后重新填图
            });
        }
        return;
    }
    bindEditBody(modal, id);
}
// 编辑态表单事件（保存/取消/心情/天气/照片）
function bindEditBody(modal, id) {
    var saveBtn = modal.querySelector('#save-btn-' + id);
    var cancelBtn = modal.querySelector('#cancel-btn-' + id);
    if (saveBtn) saveBtn.addEventListener('click', function () { saveRecord(id); });
    if (cancelBtn) cancelBtn.addEventListener('click', function () { cancelEdit(); });
    var moodInput = modal.querySelector('#edit-mood-' + id);
    if (moodInput) moodInput.addEventListener('click', function () { openMoodWeatherPicker('mood', id); });
    var weatherInput = modal.querySelector('#edit-weather-' + id);
    if (weatherInput) weatherInput.addEventListener('click', function () { openMoodWeatherPicker('weather', id); });
    var phBox = modal.querySelector('#photo-thumbs-' + id);
    if (phBox) {
        phBox.addEventListener('click', function (e) {
            var stack = e.target.closest('.photo-stack');
            if (!stack) return;
            var firstImg = stack.querySelector('.photo-thumb-img');
            if (!firstImg) { addPhotosToEdit(id, false); return; }
            var firstPid = firstImg.getAttribute('data-pid');
            openPhotoLightbox(id, firstPid, true);
        });
    }
    try { loadPhotoThumbs(id); } catch (e) { /* 忽略 */ }
}

function attachEventListeners() {
    // 先清理所有已存在的事件监听器
    cleanupEventListeners();
    
    // ★2026-08-26 只绑定当前页记录（分页后非当前页的 DOM 不存在，遍历全部会白跑）
    const sortedRecords = (currentPageRecords && currentPageRecords.length !== undefined) ? currentPageRecords : getSortedRecords();
    const eventListeners = []; // 存储事件监听器引用以便清理
    
    // ★2026-08-26 翻页控件（事件委托到容器，随 DOM 重建重新绑定）
    const pagerEl = safeGetElementById('recordsPager');
    if (pagerEl) {
        const pagerHandler = (e) => {
            const prev = e.target.closest('#pagePrevBtn');
            const next = e.target.closest('#pageNextBtn');
            if (!prev && !next) return;
            if (editingId) cancelEdit(); // 编辑中翻页：先取消（与点击其他行切换行为一致）
            if (prev && recordPage > 1) { recordPage--; renderTable(); }
            else if (next) { recordPage++; renderTable(); }
        };
        pagerEl.addEventListener('click', pagerHandler);
        eventListeners.push({ element: pagerEl, event: 'click', handler: pagerHandler });
    }
    
    // ★2026-08-27 批量模式：勾选框 + 工具栏按钮事件（cleanup 统一管理）
    document.querySelectorAll('.batch-check').forEach(cb => {
        const handler = (e) => toggleBatchSelect(cb.getAttribute('data-id'), e);
        cb.addEventListener('change', handler);
        eventListeners.push({ element: cb, event: 'change', handler: handler });
    });
    const batchModeBtn = safeGetElementById('batchModeBtn');
    if (batchModeBtn) {
        const handler = () => toggleBatchMode();
        batchModeBtn.addEventListener('click', handler);
        eventListeners.push({ element: batchModeBtn, event: 'click', handler: handler });
    }
    const batchDeleteBtn = safeGetElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        const handler = () => deleteBatchSelected();
        batchDeleteBtn.addEventListener('click', handler);
        eventListeners.push({ element: batchDeleteBtn, event: 'click', handler: handler });
    }
    const batchCancelBtn = safeGetElementById('batchCancelBtn');
    if (batchCancelBtn) {
        const handler = () => exitBatchMode();
        batchCancelBtn.addEventListener('click', handler);
        eventListeners.push({ element: batchCancelBtn, event: 'click', handler: handler });
    }
    updateBatchBar(); // 渲染后同步批量工具栏状态（跨页勾选保留）
    
    sortedRecords.forEach(record => {
        const row = safeGetElementById(`row-${record.id}`);
        const deleteBtn = safeGetElementById(`delete-btn-${record.id}`);
        
        if (row) {
            const rowHandler = (e) => {
                // 如果点击的是按钮或批量勾选框，不触发编辑
                if (e.target.closest('button') || e.target.classList.contains('batch-check')) {
                    return;
                }
                // ★2026-08-27 批量模式：点击行切换勾选
                if (batchMode) {
                    toggleBatchSelect(record.id, null);
                    return;
                }
                // ★2026-09-04 阅读态 v2：点行打开居中详情弹窗（不再直接进编辑表格）
                openRecordDetailModal(record.id);
            };
            row.addEventListener('click', rowHandler);
            eventListeners.push({ element: row, event: 'click', handler: rowHandler });
        }
        
        // ★2026-08-21 v1.1.1.7 分享按钮已移到热力图详情弹窗（记录行内不再显示）
        if (deleteBtn) {
            const deleteHandler = () => showDeleteConfirmModal(record.id, record.name);
            deleteBtn.addEventListener('click', deleteHandler);
            eventListeners.push({ element: deleteBtn, event: 'click', handler: deleteHandler });
        }
    });
    
    window.currentEventListeners = eventListeners;
}

// ★2026-08-27 批量删除：进入/退出批量模式
function toggleBatchMode() {
    batchMode = !batchMode;
    if (!batchMode) batchSelected.clear();
    renderTable();
    updateBatchBar();
}
// ★2026-08-27 切换单条勾选（e 为 checkbox change 事件；行点击时 e=null 手动同步勾选态）
function toggleBatchSelect(id, e) {
    if (batchSelected.has(id)) batchSelected.delete(id);
    else batchSelected.add(id);
    const cb = e ? e.target : document.querySelector('.batch-check[data-id="' + id + '"]');
    if (cb) cb.checked = batchSelected.has(id);
    updateBatchBar();
}
// ★2026-08-27 批量工具栏状态同步（跨页勾选保留）
function updateBatchBar() {
    const bar = safeGetElementById('batchBar');
    const countEl = safeGetElementById('batchCount');
    const icon = safeGetElementById('batchModeIcon');
    const btn = safeGetElementById('batchModeBtn');
    if (bar) bar.style.display = batchMode ? 'flex' : 'none';
    if (countEl) countEl.textContent = '已选 ' + batchSelected.size + ' 条';
    if (icon) icon.textContent = batchMode ? 'close' : 'done_all';
    if (btn) btn.title = batchMode ? '退出批量' : '批量管理';
}
function exitBatchMode() {
    batchMode = false;
    batchSelected.clear();
    renderTable();
    updateBatchBar();
}
// ★2026-08-27 一键删除勾选的记录（confirm 确认 + 照片一并清理）
function deleteBatchSelected() {
    const ids = Array.from(batchSelected);
    if (!ids.length) { showErrorMessage('请先勾选要删除的记录'); return; }
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color:#dc2626;">warning</span>批量删除</div>' +
        '<div class="confirm-modal-message">确定删除选中的 ' + ids.length + ' 条记录？照片将一并删除，此操作无法撤销。</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="batch-confirm-cancel">取消</button>' +
        '<button class="confirm-btn-delete check-go-btn ripple-effect" id="batch-confirm-delete">删除</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('batch-confirm-cancel').addEventListener('click', function () { document.body.removeChild(modal); });
    document.getElementById('batch-confirm-delete').addEventListener('click', function () {
        document.body.removeChild(modal);
        const photoIds = [];
        ids.forEach(function (id) {
            const rec = records.find(function (r) { return r.id === id; });
            if (rec && rec.photos && rec.photos.length) photoIds.push.apply(photoIds, rec.photos);
        });
        records = records.filter(function (r) { return !batchSelected.has(r.id); });
        if (photoIds.length) photoDeleteMany(photoIds).catch(function () {});
        batchSelected.clear();
        batchMode = false;
        updateStatistics();
        saveToStorage();
        thumbCacheClear(); // ★2026-08-27 批量删记录照片：缩略图缓存全清
        renderTable();
        updateBatchBar();
        showSuccessMessage('已删除 ' + ids.length + ' 条记录');
        triggerHaptic(20); // ★2026-08-27 渐进增强：批量删除成功震动反馈
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}

// ★2026-08-27 计划批量删除（与记录页一致；计划无照片，直接过滤保存）
function togglePlannedBatchMode() {
    plannedBatchMode = !plannedBatchMode;
    if (!plannedBatchMode) plannedBatchSelected.clear();
    renderPlannedTripsTable();
    updatePlannedBatchBar();
}
function togglePlannedBatchSelect(id, e) {
    if (plannedBatchSelected.has(id)) plannedBatchSelected.delete(id);
    else plannedBatchSelected.add(id);
    const cb = e ? e.target : document.querySelector('.planned-batch-check[data-id="' + id + '"]');
    if (cb) cb.checked = plannedBatchSelected.has(id);
    updatePlannedBatchBar();
}
function updatePlannedBatchBar() {
    const bar = safeGetElementById('plannedBatchBar');
    const countEl = safeGetElementById('plannedBatchCount');
    const icon = safeGetElementById('plannedBatchModeIcon');
    const btn = safeGetElementById('plannedBatchModeBtn');
    if (bar) bar.style.display = plannedBatchMode ? 'flex' : 'none';
    if (countEl) countEl.textContent = '已选 ' + plannedBatchSelected.size + ' 条';
    if (icon) icon.textContent = plannedBatchMode ? 'close' : 'done_all';
    if (btn) btn.title = plannedBatchMode ? '退出批量' : '批量管理';
}
function exitPlannedBatchMode() {
    plannedBatchMode = false;
    plannedBatchSelected.clear();
    renderPlannedTripsTable();
    updatePlannedBatchBar();
}
function deletePlannedBatchSelected() {
    const ids = Array.from(plannedBatchSelected);
    if (!ids.length) { showErrorMessage('请先勾选要删除的计划'); return; }
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color:#dc2626;">warning</span>批量删除</div>' +
        '<div class="confirm-modal-message">确定删除选中的 ' + ids.length + ' 条计划？此操作无法撤销。</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="pbatch-confirm-cancel">取消</button>' +
        '<button class="confirm-btn-delete check-go-btn ripple-effect" id="pbatch-confirm-delete">删除</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('pbatch-confirm-cancel').addEventListener('click', function () { document.body.removeChild(modal); });
    document.getElementById('pbatch-confirm-delete').addEventListener('click', function () {
        document.body.removeChild(modal);
        plannedTrips = plannedTrips.filter(function (t) { return !plannedBatchSelected.has(t.id); });
        plannedBatchSelected.clear();
        plannedBatchMode = false;
        savePlannedTripsToStorage();
        updatePlannedBatchBar();
        renderPlannedTripsTable();
        showSuccessMessage('已删除 ' + ids.length + ' 条计划');
        triggerHaptic(20); // ★2026-08-27 渐进增强：批量删除成功震动反馈
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}

function startEdit(id) {
    // ★2026-09-04 阅读态 v2：编辑已搬进居中详情弹窗——startEdit 语义改为打开该记录的编辑弹窗
    editingId = id;
    const rec = records.find(r => r.id === id);
    editingPhotoIds = rec && rec.photos ? rec.photos.slice() : [];
    openRecordDetailModal(id, 'edit');
}

function cancelEdit() {
    if (editingId) {
        const editingRecord = records.find(r => r.id === editingId);
        if (editingRecord && 
            editingRecord.name === '' && 
            editingRecord.difficulty === 3 && 
            editingRecord.elevation === 0) {
            records = records.filter(r => r.id !== editingId);
        }
    }
    
    editingId = null;
    // ★2026-08-20 照片：取消编辑 → 新增未保存的照片回收为孤儿
    editingPhotoIds = [];
    photoCollectOrphans();
    
    updateStatistics();
    saveToStorage();
    renderTable();
    // ★2026-09-04 弹窗内取消 → 关闭详情弹窗（回到瘦身列表）
    if (recordDetailModalEl) {
        closeRecordDetailModal();
    }
}

// ★2026-08-20 编辑行照片区渲染辅助：生成照片缩略图占位（异步填充在 loadPhotoThumbs）
// ★2026-08-25 改为层叠卡片：第一张完整 + 后两张错位叠放露边 + 右下角 N 角标（不占多行）；点击卡片进灯箱，灯箱内可删除/添加
// ★2026-08-25 无照片时显示白框加号（点击直接添加第一张，替代原「添加照片」按钮）
function photoThumbsHTML(ids, recordId) {
    if (!ids || !ids.length) {
        return '<div class="photo-stack" data-record="' + recordId + '" style="position:relative;width:72px;height:72px;margin:2px;cursor:pointer;flex-shrink:0;background:rgba(255,255,255,0.35);border:1.5px dashed rgba(148,163,184,0.6);border-radius:12px;display:flex;align-items:center;justify-content:center;">' +
            '<span class="material-icons" style="font-size:28px;color:rgba(100,116,139,0.75);">add</span>' +
            '</div>';
    }
    var n = ids.length;
    var layers = Math.min(n, 3); // 最多叠 3 层（含第一张）
    var html = '<div class="photo-stack" data-record="' + recordId + '" style="position:relative;width:72px;height:72px;margin:2px;cursor:pointer;flex-shrink:0;">';
    for (var i = layers - 1; i >= 0; i--) {
        var pid = ids[i];
        var off = i * 4; // 每层错位 4px
        html += '<img data-pid="' + pid + '" data-record="' + recordId + '" ' +
            'class="photo-thumb-img" ' +
            'style="position:absolute;left:' + off + 'px;top:' + off + 'px;width:64px;height:64px;object-fit:cover;background:#e2e8f0;border-radius:10px;' +
            (i > 0 ? 'box-shadow:0 1px 4px rgba(0,0,0,0.28);' : '') +
            '" alt="照片">';
    }
    html += '<span class="photo-stack-count" style="position:absolute;right:0;bottom:0;background:rgba(15,23,42,0.78);color:#fff;font-size:11px;font-weight:600;line-height:19px;padding:0 7px;border-radius:9px 0 9px 9px;z-index:2;">' + n + '</span>';
    html += '</div>';
    return html;
}
// ★2026-09-04 单条记录照片上限 9→24（日记场景照片是灵魂，放宽一倍多）；
//   防卡靠压缩管线（canvas 1280px/JPEG0.7 已存在）+ 多选分批压缩（app-core pickPhotos 每批 3 张）
var MAX_RECORD_PHOTOS = 24;
// 异步填充缩略图（从 IndexedDB 取 blob → objectURL）
// ★2026-08-27 列表照片缩略图内存缓存（pid → blob URL）：编辑保存/翻页不再重复读 IndexedDB，秒显不闪烁
// LRU 上限 300 条防内存膨胀；照片变更（保存/删除/导入恢复）时全清
var thumbCache = {};
var thumbCacheOrder = [];
var THUMB_CACHE_MAX = 300;
function thumbCachePut(pid, url) {
    if (thumbCache[pid]) return;
    thumbCache[pid] = url;
    thumbCacheOrder.push(pid);
    if (thumbCacheOrder.length > THUMB_CACHE_MAX) {
        var oldPid = thumbCacheOrder.shift();
        if (oldPid && thumbCache[oldPid]) {
            try { URL.revokeObjectURL(thumbCache[oldPid]); } catch (e) { /* 忽略 */ }
            delete thumbCache[oldPid];
        }
    }
}
function thumbCacheClear() {
    Object.keys(thumbCache).forEach(function (pid) {
        try { URL.revokeObjectURL(thumbCache[pid]); } catch (e) { /* 忽略 */ }
    });
    thumbCache = {};
    thumbCacheOrder = [];
}
function loadPhotoThumbs(recordId) {
    var imgs = document.querySelectorAll('img[data-record="' + recordId + '"]');
    if (!imgs.length) return;
    Array.prototype.forEach.call(imgs, function (img) {
        var pid = img.getAttribute('data-pid');
        if (!pid || img._photoLoaded) return;
        img._photoLoaded = true;
        // 命中缓存：直接用（blob URL 由 LRU 统一回收，不复用不 revoke）
        if (thumbCache[pid]) { img.src = thumbCache[pid]; return; }
        photoGet(pid).then(function (p) {
            if (p && p.blob) {
                var url = URL.createObjectURL(p.blob);
                thumbCachePut(pid, url);
                img.src = url;
            }
        }).catch(function () {});
    });
}
// ★2026-08-20 添加照片到当前编辑（拍照 capture=true / 相册 false）
// ★2026-08-25 编辑行添加照片支持多选：相册多选（≤MAX_RECORD_PHOTOS 上限，超出取前几张并提示）；相机仍单选
function addPhotosToEdit(recordId, capture) {
    if (editingPhotoIds.length >= MAX_RECORD_PHOTOS) { showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片'); return; }
    if (!photosEnabled()) { showErrorMessage('照片存储不可用，请刷新重试'); return; }
    var remaining = MAX_RECORD_PHOTOS - editingPhotoIds.length;
    (capture ? pickPhoto(capture).then(function (r) { return [r]; }) : pickPhotos(false)).then(function (arr) {
        if (arr.length > remaining) {
            showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片，仅添加前 ' + remaining + ' 张');
            arr = arr.slice(0, remaining);
        }
        var tasks = arr.map(function (r) {
            var pid = generateId();
            return photoPut(pid, r.blob, r.w, r.h).then(function () { editingPhotoIds.push(pid); });
        });
        return Promise.all(tasks).then(function () { refreshPhotoStrip(recordId); });
    }).catch(function (e) {
        if (e && e.message !== 'cancel' && e.message !== 'no-file' && e.message !== 'image-load-fail') {
            showErrorMessage('添加照片失败，请重试');
        }
    });
}
// ★2026-08-25 删除编辑中的照片统一走灯箱 lbDeleteCurrent（旧 removePhotoFromEdit 已移除）
// 重渲染编辑行照片区（层叠卡片 + 角标计数）
function refreshPhotoStrip(recordId) {
    if (!recordId) return;
    var box = document.getElementById('photo-thumbs-' + recordId);
    if (!box) return;
    box.innerHTML = photoThumbsHTML(editingPhotoIds, recordId);
    loadPhotoThumbs(recordId);
    // ★2026-09-04 计数角标：优先查弹窗容器内的 photo-thumbs（详情/编辑弹窗），兼容旧行内 photo-row
    var c = box.querySelector('.photo-stack-count');
    if (c) c.textContent = editingPhotoIds.length;
}
