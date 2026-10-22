// ============================================================================
// 计划详情弹窗（阅读态 v2 同构）
// ★2026-10-22 从 app-data.js 按功能边界拆出（原 5464 行单文件 → 6 个文件）。
//   拆分为纯物理切分：所有函数/变量仍在全局作用域，加载顺序与拆分前一致，行为不变。
// ============================================================================

// ===== ★2026-09-04 计划详情弹窗（阅读态 v2 同构：点行看详情，弹窗内编辑）=====
var plannedDetailModalEl = null;
function closePlannedDetailModal() {
    if (plannedDetailModalEl && plannedDetailModalEl.parentNode) {
        try { plannedDetailModalEl.parentNode.removeChild(plannedDetailModalEl); } catch (e) { /* 忽略 */ }
    }
    plannedDetailModalEl = null;
    if (typeof plannedEditingId !== 'undefined') plannedEditingId = null;
}
// 计划阅读态 body（计划字段少：名称/难度/海拔/计划日期）
function plannedViewBodyHTML(t) {
    var dColor = rdDifficultyColor(Number(t.difficulty));
    var diffName = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' }[Number(t.difficulty)] || '中等';
    var elTxt = (Number(t.elevation) || 0) ? t.elevation + 'm' : '—';
    return '' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin:2px 0 6px;">' +
        '<span class="rd-name" style="font-size:20px;font-weight:700;color:#1e293b;line-height:1.35;">' + escapeHtml(t.name) + '</span>' +
        '<span class="rd-no" style="font-size:13px;color:#475569;flex-shrink:0;font-weight:500;">计划 ' + fmtYMD(t.createdAt) + '</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' +
        '<span class="rd-chip" style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:99px;color:' + rdDifficultyColorDeep(Number(t.difficulty)) + ';border:1px solid ' + dColor + '66;background:' + dColor + '14;">难度 ' + t.difficulty + ' 级 · ' + diffName + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">目标海拔</div><div style="font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">' + elTxt + '</div></div>' +
        '<div class="rd-met" style="background:rgba(148,163,184,0.1);border-radius:10px;padding:8px 12px;"><div style="font-size:11px;color:#334155;">难度</div><div style="font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">' + t.difficulty + ' 级</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;">' +
        '<button id="pd-edit-btn" class="glass-btn ripple-effect" type="button" style="flex:1;padding:10px 0;border-radius:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">编辑计划</button>' +
        '<button id="pd-complete-btn" class="glass-btn ripple-effect" type="button" style="flex:1;padding:10px 0;border-radius:12px;font-weight:600;display:flex;align-items:center;justify-content:center;background:rgba(22,163,74,0.16);border:1px solid rgba(22,163,74,0.5);color:#15803d;" onclick="showConfirmCompleteModal(\'' + t.id + '\',\'' + escapeHtml(t.name).replace(/'/g, "\\'") + '\')">完成了 ✓</button>' +
        '</div>';
}
// 计划编辑态 body（id 沿用 edit-planned-*，保存/取消复用 savePlannedTrip/cancelPlannedEdit）
function plannedEditBodyHTML(t) {
    var pCancel = (document.body.classList.contains('dark-mode'))
        ? 'padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
        : 'padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';
    return '' +
        '<div style="display:flex;flex-direction:column;gap:7px;">' +
        '<input type="text" id="edit-planned-name-' + t.id + '" value="' + escapeHtml(t.name) + '" data-testid="edit-planned-name-' + t.id + '" class="edit-input input-glow" placeholder="输入名称" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="next">' +
        // ★2026-09-04 海拔+难度 1:1 提前（与记录页同构），日期时间移到其后
        '<div style="display:flex;gap:8px;">' +
        '<input type="number" id="edit-planned-elevation-' + t.id + '" value="' + (t.elevation || 0) + '" data-testid="edit-planned-elevation-' + t.id + '" class="edit-input input-glow" style="flex:1;min-width:0;" min="0" placeholder="海拔" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next">' +
        '<input type="text" id="edit-planned-difficulty-' + t.id + '" data-testid="edit-planned-difficulty-' + t.id + '" value="' + diffLabel(t.difficulty || 3) + '" class="edit-input input-glow difficulty-color"' + ' readonly style="flex:1;min-width:0;cursor:pointer;font-weight:600;text-align:center;--dfc-light:' + getDifficultyColor(t.difficulty || 3) + ';--dfc-dark:' + getDifficultyColorDark(t.difficulty || 3) + ';" onclick="openDifficultyPicker(\'edit-planned-difficulty-' + t.id + '\')" title="点击选择难度" enterkeyhint="done">' +
        '</div>' +
        '<input type="text" id="edit-planned-created-at-' + t.id + '" value="' + formatDateTimeLocal(t.createdAt).replace('T', ' ') + '" data-iso="' + formatDateTimeLocal(t.createdAt) + '" data-testid="edit-planned-created-at-' + t.id + '" class="edit-input input-glow" readonly style="cursor:pointer;font-weight:400;text-align:center;color:' + (document.body.classList.contains('dark-mode') ? '#e5e7eb' : '#334155') + ';" onclick="openDateTimePicker(this.id, this.value)" enterkeyhint="done" title="点击选择日期时间">' +
        '<div style="display:flex;gap:10px;margin-top:2px;">' +
        '<button id="cancel-planned-btn-' + t.id + '" data-testid="cancel-planned-button-' + t.id + '" class="ripple-effect btn-click-effect confirm-btn-cancel" style="' + pCancel + '">取消</button>' +
        '<button id="save-planned-btn-' + t.id + '" data-testid="save-planned-button-' + t.id + '" class="ripple-effect btn-click-effect glass-btn" style="flex:1;padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;">保存</button>' +
        '</div>' +
        '</div>';
}
function openPlannedDetailModal(id, startMode) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals();
        closePlannedDetailModal();
        var t = (plannedTrips || []).find(function (x) { return x.id === id; });
        if (!t) return;
        var isEdit = (startMode === 'edit');
        plannedEditingId = isEdit ? id : null;
        var modal = document.createElement('div');
        modal.className = 'record-detail-modal modal-backdrop-animate'; // 独立层，子弹窗可叠加
        plannedDetailModalEl = modal;
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-lg" style="overflow-y:auto;border-radius:20px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
            '<span class="material-icons" style="color:#4f46e5;">' + (isEdit ? 'edit_note' : 'hiking') + '</span>' +
            '<span class="rd-tt" style="font-size:15px;font-weight:700;flex:1;color:#334155;">' + (isEdit ? '编辑计划' : '计划详情') + '</span>' +
            (isEdit ? '' : '<button id="pd-close" style="background:transparent;border:none;color:#334155;cursor:pointer;font-size:20px;line-height:1;padding:2px;">✕</button>') +
            '</div><div id="pd-body" style="margin-top:8px;"></div></div>';
        document.body.appendChild(modal);
        var bodyEl = modal.querySelector('#pd-body');
        bodyEl.innerHTML = isEdit ? plannedEditBodyHTML(t) : plannedViewBodyHTML(t);
        bindPlannedDetailEvents(modal, id, t, isEdit);
        // ★2026-09-06 保存铁律：计划编辑态点空白关闭 = 等同取消（丢弃改动、删未存草稿）；阅读态只是关详情
        modal.addEventListener('click', function (e) {
            if (e.target !== modal) return;
            if (isEdit) { try { cancelPlannedEdit(); } catch (eC) { /* 兜底 */ } return; }
            closePlannedDetailModal(); renderPlannedTripsTable();
        });
    } catch (e) { /* 忽略 */ }
}
function bindPlannedDetailEvents(modal, id, t, isEdit) {
    var closeBtn = modal.querySelector('#pd-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closePlannedDetailModal(); renderPlannedTripsTable(); });
    if (!isEdit) {
        var edBtn = modal.querySelector('#pd-edit-btn');
        if (edBtn) edBtn.addEventListener('click', function () {
            plannedEditingId = id;
            var tt = modal.querySelector('.rd-tt'); if (tt) tt.textContent = '编辑计划';
            var ic = modal.querySelector('.material-icons'); if (ic) ic.textContent = 'edit_note';
            modal.querySelector('#pd-body').innerHTML = plannedEditBodyHTML(t);
            bindPlannedEditForm(modal, id);
        });
        return;
    }
    bindPlannedEditForm(modal, id);
}
function bindPlannedEditForm(modal, id) {
    var saveBtn = modal.querySelector('#save-planned-btn-' + id);
    if (saveBtn) saveBtn.addEventListener('click', function () { savePlannedTrip(id); });
    var cancelBtn = modal.querySelector('#cancel-planned-btn-' + id);
    if (cancelBtn) cancelBtn.addEventListener('click', function () { cancelPlannedEdit(); });
}


function cancelPlannedEdit() {
    const trip = plannedTrips.find(t => t.id === plannedEditingId);
    if (trip && !trip.name) {
        plannedTrips = plannedTrips.filter(t => t.id !== plannedEditingId);
        savePlannedTripsToStorage();
    }
    plannedEditingId = null;
    renderPlannedTripsTable();
    if (plannedDetailModalEl) closePlannedDetailModal();
}

function savePlannedTrip(id) {
    const nameInput = safeGetElementById(`edit-planned-name-${id}`);
    const elevationInput = safeGetElementById(`edit-planned-elevation-${id}`);
    const difficultyInput = safeGetElementById(`edit-planned-difficulty-${id}`);
    const createdAtInput = safeGetElementById(`edit-planned-created-at-${id}`);
    
    if (!nameInput || !elevationInput || !difficultyInput) {
        return;
    }
    
    const name = nameInput.value.trim();
    const elevation = parseInt(elevationInput.value) || 0;
    const difficulty = parseInt(difficultyInput.value) || 3;
    
    if (!name) {
        showErrorMessage('请输入名称');
        nameInput.focus();
        return;
    }
    
    const tripIndex = plannedTrips.findIndex(t => t.id === id);
    if (tripIndex !== -1) {
        plannedTrips[tripIndex] = {
            ...plannedTrips[tripIndex],
            name,
            elevation: Math.max(0, elevation),
            difficulty: Math.min(5, Math.max(1, difficulty))
        };
        
        // 保存记录时间
        if (createdAtInput && createdAtInput.value) {
            plannedTrips[tripIndex].createdAt = new Date(createdAtInput.dataset.iso || createdAtInput.value).toISOString();   // ★2026-09-22 优先用 data-iso
        }
        // ★2026-08-26 最后修改时间
        plannedTrips[tripIndex].updatedAt = new Date().toISOString();
    }
    
    plannedEditingId = null;
    savePlannedTripsToStorage();
    renderPlannedTripsTable();
    if (plannedDetailModalEl) closePlannedDetailModal();
}

function addNewPlannedTrip() {
    const newTrip = {
        id: generateId(),
        name: '',
        difficulty: 3,
        elevation: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()   // ★2026-08-26 最后修改时间
    };
    
    plannedTrips.unshift(newTrip);
    plannedPage = 1; // ★2026-08-26 新增计划回到第一页
    plannedEditingId = newTrip.id;
    renderPlannedTripsTable();
    // ★2026-09-04 阅读态 v2：新建后直接打开编辑弹窗
    openPlannedDetailModal(newTrip.id, 'edit');
}

// ★2026-09-20 「完成 / 延期」二选一弹窗（用户需求）：日历视图里**已到期**（过期或当天）的计划，
//   按钮从「完成」改为「完成/延期」—— 先问一句再决定，避免「日子到了但实际还没走」被一键转成记录。
//   完成 → 走既有 markPlannedComplete（切记录页 + 庆祝卡 + 可继续补全）；延期 → 打开既有编辑计划弹窗改日期。
function showCompleteOrDelayModal(tripId, tripName) {
    closeOpenModals();
    var modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">event_repeat</span>完成 / 延期</div>' +
        '<div class="confirm-modal-message">「' + escapeHtml(tripName || '未命名计划') + '」的日子到了。已经走完就点「完成」，会转入徒步记录；还没走就点「延期」，改个新日期。</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="glass-btn ripple-effect" id="cod-complete" style="flex:1;padding:10px 0;border-radius:12px;font-weight:600;">完成</button>' +
        '<button class="glass-btn ripple-effect" id="cod-delay" style="flex:1;padding:10px 0;border-radius:12px;font-weight:600;">延期</button>' +
        '</div>' +
        '<div class="confirm-modal-buttons">' +
        '<button class="confirm-btn-cancel ripple-effect" id="cod-cancel" style="flex:1;">取消</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    var close = function () { try { document.body.removeChild(modal); } catch (e) { /* 已移除 */ } };
    var cBtn = document.getElementById('cod-complete');
    var dBtn = document.getElementById('cod-delay');
    var xBtn = document.getElementById('cod-cancel');
    if (cBtn) cBtn.addEventListener('click', function () { close(); markPlannedComplete(tripId, tripName); });
    if (dBtn) dBtn.addEventListener('click', function () { close(); openPlannedDetailModal(tripId, 'edit'); });
    if (xBtn) xBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
}
function showConfirmCompleteModal(tripId, tripName) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-sm">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #22c55e;">check_circle</span>
                确认完成
            </div>
            <div class="confirm-modal-message">
                确定将"${tripName || '未命名计划'}"标记为已完成，并转入徒步记录吗？
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="confirm-complete-cancel">
                    取消
                </button>
                <button class="glass-btn ripple-effect" id="confirm-complete-ok">
                    确认完成
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = document.getElementById('confirm-complete-cancel');
    const okBtn = document.getElementById('confirm-complete-ok');
    
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    okBtn.addEventListener('click', () => {
        closeModal();
        markPlannedComplete(tripId, tripName);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function markPlannedComplete(tripId, tripName) {
    // 从 plannedTrips 中移除
    const idx = plannedTrips.findIndex(t => t.id === tripId);
    if (idx === -1) return;
    
    const trip = plannedTrips[idx];
    plannedTrips.splice(idx, 1);
    
    // ★2026-08-31 计划完成 → 直接补记录：先插入预填记录（名字/难度/海拔），随后进入行内编辑补心情/天气/照片
    const newRecord = {
        id: generateId(),
        name: trip.name,
        elevation: trip.elevation,
        difficulty: trip.difficulty,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    records.push(newRecord);
    
    // 保存两边的数据
    savePlannedTripsToStorage();
    saveToStorage();
    
    // 刷新两个表格
    updateStatistics();
    renderTable();
    renderPlannedTripsTable();
    
    // ★2026-09-04 顺序改版（用户要求：别两弹窗叠一起）：先切到记录页只弹「完成！庆祝卡」，
    //   点「继续补全」才打开该条记录的编辑弹窗（名字/难度/海拔已预填，补心情/天气/照片即保存）
    if (typeof window.switchTab === 'function') window.switchTab('records');
    showPlanCompleteCelebration(trip.name, function () {
        try { startEdit(newRecord.id); } catch (e) { /* 庆祝卡已关仍打不开编辑则忽略 */ }
    });
}

// ★2026-09-14 提取：彩屑粒子（400 粒满屏爆撒）—— 计划完成庆祝与里程碑庆祝共用
var CONF_COLORS = ['#667eea', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa'];
function spawnConfetti(overlay) {
    for (var i = 0; i < 400; i++) {
        var p = document.createElement('div');
        var size = 5 + Math.random() * 7;
        var left = Math.random() * 100;
        var delay = Math.random() * 0.6;
        var dur = 1.4 + Math.random() * 0.8;
        p.style.cssText = 'position:fixed;top:-16px;left:' + left + '%;width:' + size + 'px;height:' + (size * 0.62) + 'px;' +
            'background:' + CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)] + ';border-radius:2px;' +
            'z-index:1101;pointer-events:none;opacity:0.95;' +
            'animation:confetti-fall ' + dur + 's ease-in ' + delay + 's forwards;';
        overlay.appendChild(p);
        (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, (dur + delay + 0.3) * 1000); })(p);
    }
}

// ★2026-09-14 新增「里程碑纪念」：保存记录后判定，达成弹一次庆祝；已达成档位持久化，绝不重复弹
// ★2026-09-15 山名归一化：去括号内容 / 空白 / 「东·西·南·北·中岳」前缀 / 分隔符
// 用途：五岳等「收集类」精确匹配 —— 「西岳华山」→「华山」命中；「少华山」→ 不等于「华山」，不命中
function normalizePeakName(s) {
    var n = String(s || '').trim();
    n = n.replace(/[（(][^）)]*[）)]/g, '');
    n = n.replace(/\s+/g, '');
    n = n.replace(/^(东岳|西岳|南岳|北岳|中岳)/, '');
    n = n.replace(/[·•.\-—_、,，]/g, '');
    return n;
}
// ★2026-09-15 统一的「当前值 / 目标值」：单点达成与收集类共用（一览与达成判定都走它）
function milestoneProgress(ms, st) {
    if (ms.type === 'collect') {
        var set = st[ms.collectKey] || {};
        return { cur: Object.keys(set).length, need: ms.items.length };
    }
    var map = { peaks: st.peaks, km: st.km, alt: st.maxAlt };
    return { cur: map[ms.type] || 0, need: ms.value };
}
var MILESTONES = [
    { id: 'peaks_1', type: 'peaks', value: 1, title: '第 1 座山', desc: '恭喜入坑，从此周末有地方去了' },
    { id: 'peaks_5', type: 'peaks', value: 5, title: '第 5 座山', desc: '五座山，够凑一桌了' },
    { id: 'peaks_10', type: 'peaks', value: 10, title: '第 10 座山', desc: '两位数了，可以对外自称驴友' },
    { id: 'peaks_25', type: 'peaks', value: 25, title: '第 25 座山', desc: '山册翻起来，边角都磨圆了' },
    { id: 'peaks_50', type: 'peaks', value: 50, title: '第 50 座山', desc: '半百。这已经不只是爱好，是生活了' },
    { id: 'km_100', type: 'km', value: 100, title: '累计 100 公里', desc: '一百公里，够沿着城墙走七圈' },
    { id: 'km_500', type: 'km', value: 500, title: '累计 500 公里', desc: '差不多西安到郑州，一步没少走' },
    { id: 'km_1000', type: 'km', value: 1000, title: '累计 1000 公里', desc: '一千里。古人进京赶考，也就这个数' },
    { id: 'alt_1000', type: 'alt', value: 1000, title: '登顶 1000 米', desc: '一千米，视野一下子开阔了' },
    { id: 'alt_2000', type: 'alt', value: 2000, title: '登顶 2000 米', desc: '两千米，云差不多在脚下了' },
    { id: 'alt_3000', type: 'alt', value: 3000, title: '登顶 3000 米', desc: '三千米，正经的高山了' },
    { id: 'alt_4000', type: 'alt', value: 4000, title: '登顶 4000 米', desc: '四千米，喘气都得慢慢来' },
    { id: 'wuyue', type: 'collect', collectKey: 'wuyue', matchBy: 'peak', items: ['泰山', '华山', '衡山', '恒山', '嵩山'], title: '五岳集齐', desc: '三山五岳，先把五岳走一遍' },
    { id: 'shaanxi', type: 'collect', collectKey: 'shaanxi', matchBy: 'peak', items: [['南五台山', '南五台'], ['翠华山', '翠华'], '华山', ['太白山', '太白']], title: '陕西名山', desc: '家门口的这几座，总得走一遍' },
    { id: 'season', type: 'collect', collectKey: 'season', matchBy: 'season', items: ['春', '夏', '秋', '冬'], title: '四季足迹', desc: '春夏秋冬，一季都没落下' },
    { id: 'weather', type: 'collect', collectKey: 'weather', matchBy: 'weather', items: ['晴', '多云', '阴', '雨', '雪'], title: '天气收藏家', desc: '晴天雨天，各有各的好' },
    { id: 'difficulty', type: 'collect', collectKey: 'difficulty', matchBy: 'difficulty', items: [1, 2, 3, 4, 5], title: '难度全通关', desc: '从散步到自虐，全试过一遍' }
];



var MILESTONE_KEY = 'hiking_milestones';   // ★2026-09-15 语义变更：已「庆祝过」的档位 id（旧数据=已达成，天然兼容：老用户不会被补弹一堆庆祝）
var MILESTONE_SEEN_KEY = 'hiking_milestones_seen';   // 已「查看过」的档位 id（入口红点用）
function msReadIds(key) {
    try { var a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a.map(String) : []; }
    catch (e) { return []; }
}
function msWriteIds(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* 存储失败不影响 */ }
}
function msGetCelebrated() { return msReadIds(MILESTONE_KEY); }
function msSetCelebrated(arr) { msWriteIds(MILESTONE_KEY, arr); }
function msGetSeen() { return msReadIds(MILESTONE_SEEN_KEY); }
function msSetSeen(arr) { msWriteIds(MILESTONE_SEEN_KEY, arr); }
// ★2026-09-15 成就「实时计算」：不再是写入即永久的清单——删记录/改数据后自动失效（如删掉华山 → 陕西名山不再是已达成）
function getMilestoneDone() {
    try {
        var st = milestoneStats();
        return MILESTONES.filter(function (ms) {
            var p = milestoneProgress(ms, st);
            return p.cur >= p.need;
        }).map(function (ms) { return ms.id; });
    } catch (e) { return []; }
}// 当前统计：山峰数（按名称去重，与年度回顾/山册口径一致）+ 累计里程

// ★2026-09-15 天气归一化：现行存 emoji、旧数据可能存文本（'晴' / '晴天' …），两者都归一为 '晴'|'多云'|'阴'|'雨'|'雪'
var WEATHER_EMOJI_MAP = { '☀': '晴', '🌤': '多云', '☁': '阴', '🌧': '雨', '❄': '雪' };
function normWeather(v) {
    var s = String(v == null ? '' : v).replace(/[\uFE0F\u200D\s]/g, '');   // 去变体选择符/连接符/空白
    if (!s) return null;
    if (WEATHER_EMOJI_MAP[s]) return WEATHER_EMOJI_MAP[s];
    var T = ['晴', '多云', '阴', '雨', '雪'];
    for (var i = 0; i < T.length; i++) { if (s.indexOf(T[i]) >= 0) return T[i]; }
    return null;
}
function milestoneStats() {
    // ★2026-09-15 一次遍历算全部维度，收集类按「别名组」判断命中
    // pool 为各维度的原始值集合；MILESTONES 里的 collect 组据此算进度（items 支持 ['别名1','别名2']）
    var WEATHERS = ['晴', '多云', '阴', '雨', '雪'];
    var nameCnt = {}, km = 0, maxAlt = 0;
    var pool = { peak: {}, season: {}, weather: {}, difficulty: {} };
    (records || []).forEach(function (r) {
        if (!r) return;
        var n = (r.name ? String(r.name).trim() : '');
        if (n) nameCnt[n] = 1;
        km += (parseFloat(r.distance) || 0);
        var alt = parseFloat(r.elevation) || 0;
        if (alt > maxAlt) maxAlt = alt;
        if (n) {
            var nn = normalizePeakName(n);
            if (nn) pool.peak[nn] = 1;
        }
        if (r.createdAt) {
            var t = new Date(r.createdAt);
            if (!isNaN(t.getTime())) {
                var mo = t.getMonth() + 1;
                pool.season[mo === 12 || mo <= 2 ? '冬' : (mo <= 5 ? '春' : (mo <= 8 ? '夏' : '秋'))] = 1;
            }
        }
        // ★2026-09-15 修复天气识别：记录里存的是 emoji（WEATHER_OPTIONS 的 ☀️🌤️☁️🌧️❄️），原先只做 indexOf('晴') 文本匹配 → 永远匹配不上，天气收藏家永远收不齐
        var wt = normWeather(r.weather);
        if (wt) pool.weather[wt] = 1;
        var dv = parseInt(r.difficulty, 10);
        if (dv >= 1 && dv <= 5) pool.difficulty[String(dv)] = 1;
    });
    var st = {
        peaks: Object.keys(nameCnt).length,
        km: Math.round(km * 10) / 10,
        maxAlt: Math.round(maxAlt)
    };
    MILESTONES.forEach(function (ms) {
        if (ms.type !== 'collect') return;
        var p = pool[ms.matchBy] || {};
        var hit = {};
        ms.items.forEach(function (it) {
            var keys = Array.isArray(it) ? it : [it];
            var label = Array.isArray(it) ? it[0] : it;
            for (var i = 0; i < keys.length; i++) {
                if (p[String(keys[i])]) { hit[String(label)] = 1; break; }
            }
        });
        st[ms.collectKey] = hit;
    });
    return st;
}
function checkMilestones(silent) {
    // silent=true：启动/切页补领用 —— 只记录「已庆祝」+ 刷新入口（红点提示），不弹窗打扰
    // silent 省略/false：保存记录时用 —— 弹庆祝卡给即时正反馈
    // ★2026-09-15 达成改为实时计算：持久化的只有「已庆祝 / 已查看」两个簿记；
    //   档位失效会自动从两者剔除 → 删记录后成就立即失效，重新达成会再庆祝
    try {
        var st = milestoneStats();
        var achieved = getMilestoneDone();
        var cel = msGetCelebrated().filter(function (id) { return achieved.indexOf(id) >= 0; });
        var newly = MILESTONES.filter(function (ms) {
            return achieved.indexOf(ms.id) >= 0 && cel.indexOf(ms.id) < 0;
        });
        if (newly.length) {
            msSetCelebrated(cel.concat(newly.map(function (x) { return x.id; })));
            if (!silent) {
                // ★★2026-10-19 用户要求「每一个里程碑完成之后加解锁弹窗、加彩带，解锁几个就弹几个」
                //   —— 原实现是「1 个 → 庆祝卡；多个 → 合并成一张汇总卡（showMilestoneSummary）」。
                //   现改为**逐个排队弹出**：全部入队，先弹第一个；用户点「收下」/关闭后再弹下一个。
                //   彩带由 spawnConfetti 在每次弹窗里各撒一次（400 粒），所以每个弹窗都有。
                msCelebrateQueue = newly.slice();
                showNextMilestoneCelebration(st);
            }
        } else {
            msSetCelebrated(cel);   // 回收已失效档位
        }
        msSetSeen(msGetSeen().filter(function (id) { return achieved.indexOf(id) >= 0; }));
        renderMilestoneEntry();
    } catch (e) { /* 里程碑失败绝不影响保存流程 */ }
}
// ★2026-10-19 逐个解锁弹窗的队列（配合 checkMilestones 的改动）
//   设计：一次解锁 N 个 → 全部入队，先弹第一个；每张点「收下」后 280ms 再弹下一张。
//   280ms 是为了让上一张的遮罩淡出与彩带撤离不与新一张叠在一起（视觉不突跳）。
var msCelebrateQueue = [];
function showNextMilestoneCelebration(st) {
    if (!msCelebrateQueue || !msCelebrateQueue.length) return;
    var ms = msCelebrateQueue.shift();
    showMilestoneCelebration(ms, st, msCelebrateQueue.length);
}

function showMilestoneCelebration(ms, st, remaining) {
    remaining = remaining || 0;
    try {
        var old = document.getElementById('celebrateOverlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var dark = document.body.classList.contains('dark-mode');
        var overlay = document.createElement('div');
        overlay.id = 'celebrateOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;' +
            'background:' + (dark ? 'rgba(15,23,42,0.42)' : 'rgba(15,23,42,0.2)') + ';';
        spawnConfetti(overlay);
        var card = document.createElement('div');
        card.className = 'confirm-modal-content modal-fade-scale celebration-card';
        card.innerHTML =
            '<span class="material-icons" style="font-size:44px;color:#f59e0b;line-height:1;">emoji_events</span>' +
            '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#f59e0b;margin-top:8px;">里程碑达成</div>' +
            '<div style="font-size:22px;font-weight:800;margin:6px 0;color:' + (dark ? '#ffffff' : '#0f172a') + ';">' + escapeHtml(ms.title) + '</div>' +
            '<div style="font-size:14px;font-weight:600;color:' + (dark ? 'rgba(255,255,255,0.9)' : '#334155') + ';">' + escapeHtml(ms.desc) + '</div>' +
            '<div style="font-size:12px;color:' + (dark ? 'rgba(255,255,255,0.55)' : 'rgba(100,116,139,0.9)') + ';margin-top:10px;line-height:1.7;">目前 ' + st.peaks + ' 座山 · ' + st.km.toFixed(1) + ' km</div>' +
            (remaining > 0 ? '<div style="font-size:11px;margin-top:7px;color:#f59e0b;font-weight:700;">还有 ' + remaining + ' 个里程碑待解锁</div>' : '') +
            '<button id="celebrateOkBtn" class="glass-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-weight:700;">收下</button>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        var escHandler = function (e) { if (e.key === 'Escape') close(); };
                var close = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', escHandler);
            // ★2026-10-19 队列推进：关掉当前这张后，若还有待解锁的就接着弹下一张（解锁几个弹几个）
            if (msCelebrateQueue && msCelebrateQueue.length) {
                setTimeout(function () { showNextMilestoneCelebration(st); }, 280);
            }
        };
        document.addEventListener('keydown', escHandler);
        var btn = document.getElementById('celebrateOkBtn');
        if (btn) btn.addEventListener('click', close);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        triggerHaptic(20);
    } catch (e) { /* 弹窗失败不影响保存 */ }
}

// ★2026-09-15 新增「我的里程碑」一览：8 档全列 + 达成状态 + 未达成显示当前进度
function renderMilestoneEntry() {
    try {
        var el = document.getElementById('milestoneEntryCount');
        if (!el) return;
        // ★2026-09-15 实时计算：计数跟随记录变化（删/改记录后立即变动）
        var done = getMilestoneDone();
        el.textContent = done.length + ' / ' + MILESTONES.length;
        var dot = document.getElementById('milestoneNewDot');
        if (dot) {
            var seen = msGetSeen();
            var unseen = done.some(function (id) { return seen.indexOf(id) < 0; });
            dot.style.display = unseen ? 'block' : 'none';
        }
    } catch (e) { /* 入口计数失败不影响 */ }
}
function initMilestoneEntry() {
    try {
        var entry = document.getElementById('milestoneEntry');
        if (!entry) return;
        renderMilestoneEntry();
        var handler = function () { triggerHaptic(12); showMilestoneList(); };
        entry.addEventListener('click', handler);
        cleanupFunctions.push(function () { entry.removeEventListener('click', handler); });
    } catch (e) { /* 绑定失败不影响启动 */ }
}
function showMilestoneList() {
    try {
        var dark = document.body.classList.contains('dark-mode');
        var sub = dark ? 'rgba(255,255,255,0.6)' : '#1e293b'; // ★2026-09-15 浅色对比度修复：玻璃卡在遮罩上呈中灰（实测 #9A9EA9），#64748b 仅 1.78:1 → 看不清；#1e293b 为 5.4:1
        var strong = dark ? '#ffffff' : '#0f172a';
        var line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
        var st = milestoneStats();
        var done = getMilestoneDone();
        var got = done.length;
        // ★2026-09-15 打开一览即视为已查看：记录 seen 并清掉入口红点
        try { msSetSeen(done); } catch (eS) { /* 存储失败不影响 */ }
        renderMilestoneEntry();
        var rows = MILESTONES.map(function (ms) {
            var has = done.indexOf(ms.id) >= 0;
            var p = milestoneProgress(ms, st);
            var prog;
            if (ms.type === 'collect') prog = p.cur + ' / ' + p.need;
            else if (ms.type === 'km') prog = p.cur.toFixed(1) + ' / ' + p.need + ' km';
            else if (ms.type === 'alt') prog = p.cur + ' / ' + p.need + ' m';
            else if (ms.type === 'peaks') prog = p.cur + ' / ' + p.need + ' 座';
            else prog = p.cur + ' / ' + p.need;
            // 收集类：把具体清单列出来，已达成的打勾（看得出还缺哪几项）
            var subLine = '';
            if (ms.type === 'collect') {
                var set = st[ms.collectKey] || {};
                subLine = '<div style="font-size:11px;color:' + sub + ';margin-top:3px;line-height:1.6;">' +
                    ms.items.map(function (it) {
                        var label = Array.isArray(it) ? it[0] : it;
                        return escapeHtml(String(label)) + (set[String(label)] ? ' \u2713' : '');
                    }).join(' · ') + '</div>';

            }
            // ★2026-09-15 修复描述被挤成两行：右侧进度原与「标题+描述」同列竞争宽度，km 档进度串最长（如「300.0 / 1000 km」宽 90px）→ 描述可用宽仅 178px，明明一行能写完却折两行；
            //   现改为：进度只在「标题行」占位（标题短），描述/清单拿到整行宽度
            return '<div style="display:flex;align-items:flex-start;gap:9px;padding:6px 0;border-bottom:1px solid ' + line + ';">' +
                '<span class="material-icons" style="font-size:20px;flex-shrink:0;color:' + (has ? '#f59e0b' : sub) + ';">' + (has ? 'emoji_events' : 'radio_button_unchecked') + '</span>' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:baseline;gap:8px;">' +
                '<div style="flex:1;min-width:0;font-size:14px;font-weight:700;color:' + (has ? strong : sub) + ';">' + escapeHtml(ms.title) + '</div>' +
                '<span style="font-size:11px;font-weight:700;flex-shrink:0;color:' + (has ? '#f59e0b' : sub) + ';">' + (has ? '已达成' : prog) + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:' + sub + ';margin-top:2px;line-height:1.5;">' + escapeHtml(ms.desc) + '</div>' +
                subLine +
                '</div>' +
                '</div>';
        }).join('');

        var modal = document.createElement('div');
        modal.className = 'modal-backdrop-animate';
        modal.style.cssText = 'position:fixed;inset:0;z-index:1050;display:flex;align-items:center;justify-content:center;background:' + (dark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.35)') + ';padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-lg ms-list-modal" style="border-radius:20px;overflow:hidden;display:flex;flex-direction:column">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
            '<span class="material-icons" style="color:#f59e0b;">emoji_events</span>' +
            '<span style="font-size:15px;font-weight:700;flex:1;color:' + (dark ? '#fff' : '#334155') + ';">我的里程碑</span>' +
            '<button id="msListClose" style="background:transparent;border:none;color:#334155;cursor:pointer;font-size:20px;line-height:1;padding:2px;">✕</button>' +
            '</div>' +
            '<div style="font-size:12px;color:' + sub + ';margin-bottom:6px;">已达成 ' + got + ' / ' + MILESTONES.length + ' 项</div>' +
            '<div class="ms-scroll" style="overflow-y:auto;flex:1;min-height:0;">' + rows + '</div></div>';
        document.body.appendChild(modal);
        var esc = function (e) { if (e.key === 'Escape') close(); };
        var close = function () {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            document.removeEventListener('keydown', esc);
        };
        document.addEventListener('keydown', esc);
        var btn = document.getElementById('msListClose');
        if (btn) btn.addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    } catch (e) { /* 一览失败不影响页面 */ }
}
// ★2026-09-15 汇总卡：一次补领多个时用（升级老用户首次打开会走到这里）
// ★2026-10-19 起**不再被调用**：用户要求「解锁几个就弹几个」后，多档解锁改走
//   `msCelebrateQueue` + `showNextMilestoneCelebration` 逐个弹庆祝卡，不再合并成汇总卡。
//   保留此函数（含「去看看」按钮跳一览的旧路径）以便日后需要时恢复汇总视图。
function showMilestoneSummary(list, st) {
    try {
        var oldOv = document.getElementById('celebrateOverlay');
        if (oldOv && oldOv.parentNode) oldOv.parentNode.removeChild(oldOv);
        var dark = document.body.classList.contains('dark-mode');
        var overlay = document.createElement('div');
        overlay.id = 'celebrateOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;' +
            'background:' + (dark ? 'rgba(15,23,42,0.42)' : 'rgba(15,23,42,0.2)') + ';';
        spawnConfetti(overlay);
        var names = list.map(function (m) { return escapeHtml(m.title); }).join(' · ');
        var card = document.createElement('div');
        card.className = 'confirm-modal-content modal-fade-scale celebration-card';
        card.innerHTML =
            '<span class="material-icons" style="font-size:44px;color:#f59e0b;line-height:1;">emoji_events</span>' +
            '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#f59e0b;margin-top:8px;">里程碑达成</div>' +
            '<div style="font-size:22px;font-weight:800;margin:6px 0;color:' + (dark ? '#ffffff' : '#0f172a') + ';">解锁了 ' + list.length + ' 个</div>' +
            '<div style="font-size:13px;font-weight:600;color:' + (dark ? 'rgba(255,255,255,0.9)' : '#334155') + ';line-height:1.7;">' + names + '</div>' +
            '<div style="font-size:12px;color:' + (dark ? 'rgba(255,255,255,0.55)' : 'rgba(100,116,139,0.9)') + ';margin-top:10px;line-height:1.7;">目前 ' + st.peaks + ' 座山 · ' + st.km.toFixed(1) + ' km</div>' +
            '<button id="celebrateOkBtn" class="glass-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-weight:700;">去看看</button>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        var escHandler = function (e) { if (e.key === 'Escape') close(); };
        var close = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', escHandler);
        };
        document.addEventListener('keydown', escHandler);
        var btn = document.getElementById('celebrateOkBtn');
        if (btn) btn.addEventListener('click', function () { close(); showMilestoneList(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        triggerHaptic(20);
    } catch (e) { /* 汇总卡失败不影响保存 */ }
}

// ★2026-08-31 计划完成庆祝卡片：彩屑 + 弹入卡片 + 「继续补全」；轻量粒子（≤24），播完自动清理
function showPlanCompleteCelebration(tripName, onContinue) {   // ★2026-09-04 加 onContinue：点「继续补全」触发（计划完成补记录用）
    try {
        // ★五项优化⑤防重入：连续完成计划时移除上一个庆祝弹层
        var old = document.getElementById('celebrateOverlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var dark = document.body.classList.contains('dark-mode');
        var overlay = document.createElement('div');
        overlay.id = 'celebrateOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;' +
            'background:' + (dark ? 'rgba(15,23,42,0.42)' : 'rgba(15,23,42,0.2)') + ';';
        spawnConfetti(overlay);
        var card = document.createElement('div');
        card.className = 'confirm-modal-content modal-fade-scale celebration-card';
        card.innerHTML =
            '<span class="material-icons" style="font-size:44px;color:#f59e0b;line-height:1;">celebration</span>' +
            '<div style="font-size:20px;font-weight:800;margin:10px 0 6px;color:' + (dark ? '#fff' : '#0f172a') + ';">完成！</div>' +
            '<div style="font-size:15px;font-weight:600;color:' + (dark ? 'rgba(255,255,255,0.92)' : '#334155') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">「' + escapeHtml(tripName || '未命名计划') + '」已加入徒步记录</div>' +
            '<div style="font-size:12px;color:' + (dark ? 'rgba(255,255,255,0.55)' : 'rgba(100,116,139,0.9)') + ';margin-top:8px;line-height:1.7;">新的足迹已点亮，期待下一座山 🏔️</div>' +
            '<button id="celebrateOkBtn" class="glass-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-weight:700;">继续补全</button>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        var close = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', escHandler);
        };
        var escHandler = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escHandler);
        var okBtn = document.getElementById('celebrateOkBtn');
        if (okBtn) okBtn.addEventListener('click', function () {
            close();
            // ★2026-09-04 点「继续补全」→ 才进入编辑补全流程（Esc/点遮罩关闭则不进入，记录已保存不影响）
            if (typeof onContinue === 'function') { try { onContinue(); } catch (e2) { /* 忽略 */ } }
        });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    } catch (e) { /* 庆祝失败不影响主流程 */ }
}

function showDeletePlannedTripConfirmModal(tripId, tripName) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-sm">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #dc2626;">warning</span>
                确认删除
            </div>
            <div class="confirm-modal-message">
                确定要删除"${tripName || '未命名计划'}"这条计划吗？此操作无法撤销。
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="confirm-planned-cancel">
                    取消
                </button>
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-planned-delete">
                    删除
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = document.getElementById('confirm-planned-cancel');
    const deleteBtn = document.getElementById('confirm-planned-delete');
    
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    deleteBtn.addEventListener('click', () => {
        closeModal();
        deletePlannedTrip(tripId);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function deletePlannedTrip(id) {
    plannedTrips = plannedTrips.filter(t => t.id !== id);
    savePlannedTripsToStorage();
    renderPlannedTripsTable();
}

function handlePlannedTripSort(field) {
    if (plannedCurrentSort.field === field) {
        plannedCurrentSort.direction = plannedCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        plannedCurrentSort.field = field;
        plannedCurrentSort.direction = 'asc';
    }
    plannedPage = 1; // ★2026-08-26 排序变化回到第一页
    
    updatePlannedSortIcons();
    renderPlannedTripsTable();
}

function updatePlannedSortIcons() {
    const fields = ['planned-name', 'planned-elevation', 'planned-difficulty', 'planned-createdAt'];
    
    fields.forEach(field => {
        const icon = safeGetElementById(`sort-icon-${field}`);
        if (icon) {
            if (plannedCurrentSort.field === field) {
                icon.textContent = plannedCurrentSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
            } else {
                icon.textContent = 'unfold_more';
            }
        }
    });
}

let plannedSaveTimeout = null;

async function savePlannedTripsToStorage() {
    if (plannedSaveTimeout) {
        clearTimeout(plannedSaveTimeout);
    }
    
    plannedSaveTimeout = setTimeout(async () => {
        try {
            const validTrips = [];
            let droppedTrips = 0;
            plannedTrips.forEach(trip => {
                const fixed = normalizeRecordFields(trip);
                if (fixed) validTrips.push(fixed);
                else droppedTrips++;
            });
            
            if (droppedTrips) console.warn(`Dropped ${droppedTrips} non-object planned trips`);
            if (validTrips.length !== plannedTrips.length) {
                plannedTrips = validTrips;
            }
            
            const _okPlan = await AppStore.setItem(PLANNED_TRIPS_KEY, { version: DATA_SCHEMA_VERSION, trips: validTrips });   // ★P0-2 写 schema 版本
            if (_okPlan === false) { showErrorMessage('计划保存失败（本机存储异常），请检查可用空间后重试'); return; }
            // ★2026-08-30 计划变更（增删改/完成）后同步系统闹钟：不打开 App 也能提醒
            syncPlanAlarmsBridge();
            // ★2026-08-31 计划数据变更后日历视图同步重绘
            if (plansViewMode === 'calendar') {
                try { renderPlannedCalendar(); } catch (e) { /* 日历重绘失败不阻塞 */ }
            }
            // ★自动同步（v1.4.10.1）：计划数据变更后同样触发自动上传
            maybeAutoUploadAfterChange();
        } catch (error) {
            console.error('Save planned trips storage error:', error);
            showErrorMessage('计划保存失败，请稍后重试');
        }
    }, 300);
}

async function loadPlannedTripsFromStorage() {
    try {
        const data = await AppStore.getItem(PLANNED_TRIPS_KEY);
        if (data && Array.isArray(data.trips)) {
            // ★2026-09-05 P0-2 计划数据先过 schema 迁移链
            // ★2026-09-17 加载也走归一化（同记录：避免启动时静默丢计划）
            plannedTrips = applySchemaMigrations(data.trips, TRIP_SCHEMA_MIGRATIONS)
                .map(trip => normalizeRecordFields(trip))
                .filter(trip => trip !== null)
                .map(trip => ({
                ...trip,
                name: trip.name.trim(),
                difficulty: Math.min(5, Math.max(1, Math.round(trip.difficulty))),
                elevation: Math.max(0, Math.round(trip.elevation)),
                // 为旧数据添加 createdAt 字段
                createdAt: trip.createdAt || new Date().toISOString()
            }));
        } else {
            plannedTrips = [];
        }
    } catch (error) {
        console.error('Load planned trips storage error:', error);
        plannedTrips = [];
    }
}

// ★2026-09-17 数据自愈：字段类型不符的记录「就地归一化」而不是整条删除
//   （原先用 filter 直接丢弃 → 导入外部/手工改过的备份时，用户记录会静默消失）
//   只有「非对象」才丢弃；id/name/difficulty/elevation 能修的都修
function normalizeRecordFields(rec) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
    if (typeof rec.id !== 'string' || !rec.id) {
        rec.id = (rec.id == null) ? generateId() : String(rec.id);
    }
    if (typeof rec.name !== 'string') rec.name = (rec.name == null) ? '' : String(rec.name);
    var d = rec.difficulty;
    if (typeof d !== 'number' || !isFinite(d)) d = parseInt(d, 10);
    rec.difficulty = (isFinite(d) && d >= 1 && d <= 5) ? Math.round(d) : 3;
    var el = rec.elevation;
    if (typeof el !== 'number' || !isFinite(el)) el = parseFloat(el);
    rec.elevation = (isFinite(el) && el >= 0) ? el : 0;
    // ★2026-09-20 补距离/用时净化（此前只净化难度/海拔 → 负数距离能一路进存储，污染总里程/统计/分享卡）
    if (rec.distance !== undefined && rec.distance !== null) {
        var ds = rec.distance;
        if (typeof ds !== 'number' || !isFinite(ds)) ds = parseFloat(ds);
        rec.distance = (isFinite(ds) && ds >= 0) ? Math.min(10000, Math.round(ds * 100) / 100) : 0;
    }
    if (rec.duration !== undefined && rec.duration !== null) {
        var du = rec.duration;
        if (typeof du !== 'number' || !isFinite(du)) du = parseInt(du, 10);
        rec.duration = (isFinite(du) && du >= 0) ? Math.min(1440, Math.round(du)) : 0;
    }
    return rec;
}

let saveTimeout = null;

async function saveToStorage() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(async () => {
        try {
            const validRecords = [];
            let droppedRecords = 0;
            records.forEach(record => {
                const fixed = normalizeRecordFields(record);
                if (fixed) validRecords.push(fixed);
                else droppedRecords++;
            });
            
            if (droppedRecords) console.warn(`Dropped ${droppedRecords} non-object records`);
            if (validRecords.length !== records.length) {
                records = validRecords;
            }
            
            const _okRec = await AppStore.setItem(STORAGE_KEY, { version: DATA_SCHEMA_VERSION, records: validRecords });   // ★P0-2 写 schema 版本
            // ★2026-09-20 写入失败必须让用户知道：此前下层吞异常 → 这里的提示是死代码，用户以为已保存 → 静默丢数据
            if (_okRec === false) { showErrorMessage('数据保存失败（本机存储异常），请检查可用空间后重试'); return; }
            // ★自动同步（v1.4.10.1）：数据变更后若开启自动同步，延迟自动上传备份
            maybeAutoUploadAfterChange();
        } catch (error) {
            console.error('Save storage error:', error);
            showErrorMessage('数据保存失败，请稍后重试');
        }
    }, 300);
}

// ★自动上传备份（v1.4.10.1）：自动同步开启 + 已配置 + 非同步进行中 → 防抖后上传
let autoUploadTimer = null;
function maybeAutoUploadAfterChange() {
    if (!syncAuto) return;
    if (!syncConfig.server || !syncConfig.username || !syncConfig.password) return;
    if (syncInProgress) return;
    if (autoUploadTimer) clearTimeout(autoUploadTimer);
    autoUploadTimer = setTimeout(function () {
        uploadSyncBackup(true);
    }, 2000); // 等保存完成 + 避免连续编辑频繁上传
}
