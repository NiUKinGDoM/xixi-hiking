// ============================================================================
// 计划徒步：列表 + 日历双视图 + 计划表单
// ★2026-10-22 从 app-data.js 按功能边界拆出（原 5464 行单文件 → 6 个文件）。
//   拆分为纯物理切分：所有函数/变量仍在全局作用域，加载顺序与拆分前一致，行为不变。
// ============================================================================

// ==================== 计划徒步行功能 ====================

function getSortedPlannedTrips() {
    // ★2026-08-27 搜索过滤：计划页有搜索词时按名称匹配（与记录页方案A一致）
    var src = plannedTrips;
    if (typeof searchQuery === 'string' && searchQuery.trim() && currentTabId === 'plans') {
        var q = searchQuery.trim().toLowerCase();
        src = plannedTrips.filter(function (t) {
            return lowerText(t.name).indexOf(q) >= 0;
        });
    }
    const sortedTrips = [...src];
    
    if (plannedCurrentSort.field) {
        sortedTrips.sort((a, b) => {
            let aVal = a[plannedCurrentSort.field === 'planned-name' ? 'name' : 
                         plannedCurrentSort.field === 'planned-elevation' ? 'elevation' : 
                         plannedCurrentSort.field === 'planned-difficulty' ? 'difficulty' : 'createdAt'];
            let bVal = b[plannedCurrentSort.field === 'planned-name' ? 'name' : 
                         plannedCurrentSort.field === 'planned-elevation' ? 'elevation' : 
                         plannedCurrentSort.field === 'planned-difficulty' ? 'difficulty' : 'createdAt'];
            
            if (plannedCurrentSort.field === 'planned-name') {
                aVal = (aVal || '').toString().toLowerCase();
                bVal = (bVal || '').toString().toLowerCase();
            } else if (plannedCurrentSort.field === 'planned-createdAt') {
                // 按时间排序
                aVal = aVal ? (new Date(aVal).getTime() || 0) : 0;
                bVal = bVal ? (new Date(bVal).getTime() || 0) : 0;
            } else {
                aVal = Number(aVal) || 0;
                bVal = Number(bVal) || 0;
            }
            
            if (plannedCurrentSort.direction === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });
    } else {
        // ★2026-08-25 默认按计划时间由近到远（升序 createdAt：今天→明天→后天…）
        sortedTrips.sort((a, b) => {
            let aT = a && a.createdAt ? (new Date(a.createdAt).getTime() || 0) : 0;
            let bT = b && b.createdAt ? (new Date(b.createdAt).getTime() || 0) : 0;
            return aT - bT;
        });
    }
    
    return sortedTrips;
}

// ===== ★2026-08-31 计划日历视图（列表/日历双视图切换）=====
// ★2026-08-31 默认日历视图（用户指定）；已存偏好尊重存储
var plansViewMode = 'calendar';
try { plansViewMode = localStorage.getItem('plans_view_mode') || 'calendar'; } catch (e) { /* 读取失败用默认 */ }
var calendarViewYear = new Date().getFullYear();
var calendarViewMonth = new Date().getMonth(); // 0-11
var calendarSelKey = null; // 选中的日期 YYYY-MM-DD

function applyPlansView() {
    var listView = safeGetElementById('plannedListView');
    var calView = safeGetElementById('plannedCalendarView');
    var icon = safeGetElementById('plansViewToggleIcon');
    if (!listView || !calView) return;
    var isCal = plansViewMode === 'calendar';
    listView.style.display = isCal ? 'none' : '';
    calView.style.display = isCal ? '' : 'none';
    if (icon) icon.textContent = isCal ? 'view_list' : 'calendar_month';
    // ★2026-09-04 按钮文字 + 视图说明小标题随模式切换（帮新用户看懂当前视图与切换目标）
    try { if (typeof window.showTabGuides === 'function') window.showTabGuides(); } catch (eg2) { /* 忽略 */ }
    var lab = safeGetElementById('plansViewToggleLabel');
    if (lab) lab.textContent = isCal ? '列表' : '日历';
    var capEl = safeGetElementById('plansViewCaption');
    var capTxt = safeGetElementById('plansViewCaptionText');
    if (capTxt) capTxt.textContent = isCal ? '日历视图 · 哪天有行程一眼看清，点日期看当天安排' : '列表视图 · 全部计划按时间排列，点一行可查看';
    if (capEl) capEl.style.display = '';   // ★2026-09-05 切视图时恢复被收起说明
    // ★2026-08-31 日历视图隐藏「批量管理」和「添加」按钮（切换按钮固定最右不动）；列表视图恢复
    //   ★08-31 去掉淡入淡出动画（用户反馈卡顿），直接显隐最干净
    var batchBtn = safeGetElementById('plannedBatchModeBtn');
    var addBtn = safeGetElementById('addPlannedTripBtn');
    if (batchBtn) batchBtn.style.display = isCal ? 'none' : 'inline-flex';
    if (addBtn) addBtn.style.display = isCal ? 'none' : 'inline-flex';
    // ★2026-10-09 日历视图不提供搜索：切视图后让搜索框重新判断显隐（列表显示 / 日历隐藏）
    if (window.__pokeSearchBar) { try { window.__pokeSearchBar(); } catch (e) { /* 忽略 */ } }
}

function togglePlansView() {
    plansViewMode = plansViewMode === 'calendar' ? 'list' : 'calendar';
    try { localStorage.setItem('plans_view_mode', plansViewMode); } catch (e) { /* 忽略 */ }
    // ★2026-08-31 切视图前退出批量模式（日历下批量按钮隐藏，避免状态残留）
    if (typeof plannedBatchMode !== 'undefined' && plannedBatchMode) {
        try { exitPlannedBatchMode(); } catch (e) { /* 忽略 */ }
    }
    if (plansViewMode === 'calendar') {
        // ★2026-10-09 日历视图不提供搜索（用户要求）→ 先清空搜索词再渲染，避免过滤/定位残留
        clearGlobalSearchQuery();
        var now = new Date();
        calendarViewYear = now.getFullYear();
        calendarViewMonth = now.getMonth();
        calendarSelKey = null;
        renderPlannedCalendar();
    } else {
        plannedPage = 1;
        renderPlannedTripsTable();
    }
    applyPlansView();
}

function calendarPrevMonth() {
    calendarViewMonth--;
    if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
    calendarSelKey = null;
    renderPlannedCalendar();
}
function calendarNextMonth() {
    calendarViewMonth++;
    if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
    calendarSelKey = null;
    renderPlannedCalendar();
}

function fmtPlanDateKey(iso) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var m = ('0' + (t.getMonth() + 1)).slice(-2);
    var d = ('0' + t.getDate()).slice(-2);
    return t.getFullYear() + '-' + m + '-' + d;
}

// 渲染月历：有计划日期显示蓝点，点击日期下方显示该日计划（完成/删除）
// ★2026-08-31 五项优化：圆角对齐按钮体系(12)、渲染后淡入动画、日历模式徽标统计
function renderPlannedCalendar() {
    var cal = safeGetElementById('plannedCalendarView');
    if (!cal) return;
    // 日历模式下徽标统计（列表渲染已提前 return，这里补上）
    var totalBadge = safeGetElementById('plannedTotalBadge');
    if (totalBadge) totalBadge.textContent = '总计: ' + (plannedTrips ? plannedTrips.length : 0) + '条计划';
    var dark = document.body.classList.contains('dark-mode');
    var accent = dark ? '#818cf8' : '#667eea';
    var byDate = {};
    (plannedTrips || []).forEach(function (t) {
        var key = fmtPlanDateKey(t.createdAt);
        if (!key) return;
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push(t);
    });
    var first = new Date(calendarViewYear, calendarViewMonth, 1);
    var startWeekday = first.getDay(); // 0=周日
    var daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
    var todayKey = fmtPlanDateKey(new Date());   // ★2026-09-20 直接传 Date：原写法绕 toISOString 一圈（结论相同，易被误读成 UTC 问题）

    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
    html += '<button class="ripple-effect glass-btn corner-glow" id="calPrevBtn" style="width:34px;height:34px;padding:0;border-radius:10px;"><span class="material-icons" style="font-size:18px;">chevron_left</span></button>';
    html += '<span style="font-size:16px;font-weight:600;">' + calendarViewYear + '年' + (calendarViewMonth + 1) + '月</span>';
    html += '<button class="ripple-effect glass-btn corner-glow" id="calNextBtn" style="width:34px;height:34px;padding:0;border-radius:10px;"><span class="material-icons" style="font-size:18px;">chevron_right</span></button>';
    html += '</div>';
    var weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">';
    weekLabels.forEach(function (w) { html += '<div style="text-align:center;font-size:12px;color:rgba(148,163,184,0.9);padding:4px 0;">' + w + '</div>'; });
    html += '</div>';
    var cells = '';
    for (var i = 0; i < startWeekday; i++) cells += '<div></div>';
    for (var day = 1; day <= daysInMonth; day++) {
        var m = ('0' + (calendarViewMonth + 1)).slice(-2);
        var d = ('0' + day).slice(-2);
        var key = calendarViewYear + '-' + m + '-' + d;
        var plans = byDate[key] || [];
        var has = plans.length > 0;
        var sel = calendarSelKey === key;
        var isToday = key === todayKey;
        // ★2026-08-31 选中日期用 2px 强调框（明细区显示哪天一目了然）；仅今天用 1px；选中优先
        var cellBorder = sel
            ? '2px solid ' + accent
            : (isToday ? '1px solid ' + accent : '1px solid transparent');
        cells += '<div data-key="' + key + '" style="position:relative;min-height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:' + (has ? 'pointer' : 'default') + ';' +
            'background:' + (sel ? (dark ? 'rgba(129,140,248,0.25)' : 'rgba(102,126,234,0.2)') : '') + ';' +
            'border:' + cellBorder + ';">' +
            '<span style="font-size:13px;font-weight:' + (isToday || sel ? '600' : '400') + ';">' + day + '</span>' +
            (has ? '<span style="width:6px;height:6px;border-radius:50%;background:' + accent + ';margin-top:2px;"></span>' : '') +
            '</div>';
    }
    var totalCells = startWeekday + daysInMonth;
    var remain = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var j = 0; j < remain; j++) cells += '<div></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">' + cells + '</div>';
    html += '<div id="calDayDetail" style="margin-top:12px;"></div>';
    cal.innerHTML = html;
    // ★2026-08-31 流畅度：渲染后轻量淡入（切月/切视图/重绘统一），与概览刷新手法一致
    if (typeof cal.animate === 'function') {
        try {
            cal.animate(
                [{ opacity: 0.4 }, { opacity: 1 }],
                { duration: 220, easing: 'ease-out' }
            );
        } catch (e) { /* 动画失败静默 */ }
    }

    var prevBtn = safeGetElementById('calPrevBtn');
    var nextBtn = safeGetElementById('calNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', calendarPrevMonth);
    if (nextBtn) nextBtn.addEventListener('click', calendarNextMonth);
    cal.querySelectorAll('[data-key]').forEach(function (el) {
        el.addEventListener('click', function () {
            calendarSelKey = el.getAttribute('data-key');
            renderPlannedCalendar();
        });
    });
    // ★2026-08-31 方式B：未点任何日期 → 明细区显示整月全部计划（每条带日期标记）；点了日期才聚焦该日
    if (calendarSelKey) {
        renderCalDayDetail(calendarSelKey);
    } else {
        renderCalMonthDetail();
    }
}

// ★2026-09-20 计划日差公共函数（消除重复）：按本机零点算「计划日期 − 今天」的天数差，`null` = 日期为空/无效。
//   为什么抽出来：到期判定（planIsDueOrOverdue）与状态徽章（planRelBadgeHtml）此前**各自复制了一遍**
//   同一套日差算法（各含 4 次 `new Date` 构造）—— 改口径得改两处、易漏；且列表每渲染一条计划就多构造 8 个 Date 对象。
//   ★守卫：test.js 5o2 断言「两者共用 planDayDiff」—— 防止以后又各自拷一份。
function planDayDiff(createdAt) {
    try {
        if (!createdAt) return null;
        var dd = new Date(createdAt);
        if (isNaN(dd.getTime())) return null;
        var now0 = new Date();
        var t0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate()).getTime();
        var d0 = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()).getTime();
        return Math.round((d0 - t0) / 86400000);
    } catch (e) { return null; }
}

// ★2026-09-20 计划「已到期」判定（日历与列表的「完成/延期」按钮用）：与徽章**同口径**（各自参与同一个日差）—— 过期(≤ -1) 或 当天(= 0) 视为已到期。
function planIsDueOrOverdue(createdAt) {
    var diff = planDayDiff(createdAt);
    return diff !== null && diff <= 0;
}
// ★2026-09-07 计划相对今天状态徽章（列表行/日历整月/日历单日三处通用）：过期=红「已过期 N 天」、今天=靛蓝「今天」、明天=天蓝「明天」，后天起无徽章
//   ★2026-09-20 日差改走 planDayDiff（与到期判定同一口径，消除重复算法）
function planRelBadgeHtml(createdAt) {
    var diff = planDayDiff(createdAt);
    if (diff === null) return '';
    try {
        if (diff < 0) return '<span class="pl-overdue">已过期 ' + Math.abs(diff) + ' 天</span>';
        if (diff === 0) return '<span class="pl-today">今天</span>';
        if (diff === 1) return '<span class="pl-tomorrow">明天</span>';
    } catch (e9) { /* 忽略 */ }
    return '';
}

// ★2026-08-31 整月明细：列出当月全部计划，按日期分组，每组前醒目标日期（用户选 B）
function renderCalMonthDetail() {
    var box = safeGetElementById('calDayDetail');
    if (!box) return;
    var dark = document.body.classList.contains('dark-mode');
    var accent = dark ? '#818cf8' : '#667eea';
    var prefix = calendarViewYear + '-' + ('0' + (calendarViewMonth + 1)).slice(-2) + '-';
    var monthPlans = (plannedTrips || []).filter(function (t) {
        return fmtPlanDateKey(t.createdAt).indexOf(prefix) === 0;
    });
    if (!monthPlans.length) { box.innerHTML = ''; return; }
    // 按日期分组并排序
    var byDate = {};
    monthPlans.forEach(function (t) {
        var k = fmtPlanDateKey(t.createdAt);
        if (!byDate[k]) byDate[k] = [];
        byDate[k].push(t);
    });
    var keys = Object.keys(byDate).sort();
    var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var html = '<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:' + (dark ? 'rgba(255,255,255,0.6)' : 'rgba(100,116,139,0.9)') + ';">本月计划 ' + monthPlans.length + ' 条</div>';
    keys.forEach(function (k) {
        var d = new Date(k);
        var dateTitle = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdays[d.getDay()];
        // 日期分组标记（醒目 + 分隔线）
        html += '<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;">' +
            '<span class="material-icons" style="font-size:14px;color:' + accent + ';">event</span>' +
            '<span style="font-size:13px;font-weight:700;color:' + accent + ';">' + dateTitle + '</span>' +
            '<span style="flex:1;height:1px;background:' + (dark ? 'rgba(255,255,255,0.12)' : 'rgba(100,116,139,0.2)') + ';"></span></div>';
        byDate[k].forEach(function (t) {
            // ★08-31 浅色模式删除按钮更可见（同 renderCalDayDetail）
            var delStyle = dark
                ? 'padding:6px 12px;border-radius:10px;font-size:12px;'
                : 'padding:6px 12px;border-radius:10px;font-size:12px;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;font-weight:600;';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;margin-bottom:6px;' +
                'background:' + (dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)') + ';border:0.5px solid ' + (dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') + ';">' +
                '<div style="min-width:0;"><div style="display:flex;align-items:center;gap:6px;min-width:0;"><span style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + escapeHtml(t.name) + '</span>' + planRelBadgeHtml(t.createdAt) + '</div>' +
                '<div style="font-size:11px;color:rgba(100,116,139,0.9);">Lv' + t.difficulty + (t.elevation ? ' · ' + t.elevation + 'm' : '') + '</div></div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0;">' +
                (planIsDueOrOverdue(t.createdAt)
                    ? '<button class="glass-btn ripple-effect" data-complete-delay="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成/延期</button>'
                    : '<button class="glass-btn ripple-effect" data-complete="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成</button>') +
                '<button class="confirm-btn-cancel ripple-effect" data-del="' + t.id + '" style="' + delStyle + '">删除</button>' +
                '</div></div>';
        });
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-complete]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-complete');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showConfirmCompleteModal(id, t2 ? t2.name : '');
        });
    });
    // ★2026-09-20 已到期（过期/当天）→「完成/延期」：先问一句再决定，避免日期到了但还没走就被转成记录
    box.querySelectorAll('[data-complete-delay]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-complete-delay');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showCompleteOrDelayModal(id, t2 ? t2.name : '');
        });
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-del');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showDeletePlannedTripConfirmModal(id, t2 ? t2.name : '');
        });
    });
}

function renderCalDayDetail(key) {
    var box = safeGetElementById('calDayDetail');
    if (!box) return;
    var plans = (plannedTrips || []).filter(function (t) { return fmtPlanDateKey(t.createdAt) === key; });
    if (!plans.length) { box.innerHTML = ''; return; }
    var dark = document.body.classList.contains('dark-mode');
    var accent = dark ? '#818cf8' : '#667eea';
    // ★2026-08-31 明细日期醒目标记：中文日期 + 星期几；★深色统一玻璃配方（白底 + 白边，与计划条/卡片一致），强调色只用于图标和日期文字
    var d = new Date(key);
    var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var dateTitle = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdays[d.getDay()];
    var html = '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;margin-bottom:8px;' +
        'background:' + (dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)') + ';' +
        'border:0.5px solid ' + (dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') + ';">' +
        '<span class="material-icons" style="font-size:16px;color:' + accent + ';">event</span>' +
        '<span style="font-size:14px;font-weight:700;color:' + accent + ';">' + dateTitle + '</span>' +
        '<span style="font-size:12px;color:' + (dark ? 'rgba(255,255,255,0.55)' : 'rgba(100,116,139,0.9)') + ';">计划 ' + plans.length + ' 条</span>' +
        '<button id="calShowMonthBtn" class="ripple-effect glass-btn corner-glow" style="margin-left:auto;padding:4px 10px;border-radius:8px;font-size:12px;">整月</button>' +
        '</div>';
    plans.forEach(function (t) {
        // ★2026-10-09 日历搜索已移除（该视图不提供搜索）→ 原「搜索匹配高亮」逻辑一并清理
        var itemBorder = '0.5px solid ' + (dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)');
        // ★2026-08-31 浅色模式删除按钮更可见：灰蓝底+描边+深字（class 浅色下白边不可见）
        var delStyle = dark
            ? 'padding:6px 12px;border-radius:10px;font-size:12px;'
            : 'padding:6px 12px;border-radius:10px;font-size:12px;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;font-weight:600;';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;margin-bottom:6px;' +
            'background:' + (dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)') + ';border:' + itemBorder + ';">' +
            '<div style="min-width:0;"><div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
            '<span style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + escapeHtml(t.name) + '</span>' +
            planRelBadgeHtml(t.createdAt) +
            '</div>' +
            '<div style="font-size:11px;color:rgba(100,116,139,0.9);">Lv' + t.difficulty + (t.elevation ? ' · ' + t.elevation + 'm' : '') + '</div></div>' +
            '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            (planIsDueOrOverdue(t.createdAt)
                ? '<button class="glass-btn ripple-effect" data-complete-delay="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成/延期</button>'
                : '<button class="glass-btn ripple-effect" data-complete="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成</button>') +
            '<button class="confirm-btn-cancel ripple-effect" data-del="' + t.id + '" style="' + delStyle + '">删除</button>' +
            '</div></div>';
    });
    box.innerHTML = html;
    // ★2026-08-31 聚焦某日后可点「整月」返回整月明细
    var showMonthBtn = box.querySelector('#calShowMonthBtn');
    if (showMonthBtn) {
        showMonthBtn.addEventListener('click', function () {
            calendarSelKey = null;
            renderPlannedCalendar();
        });
    }
    box.querySelectorAll('[data-complete]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-complete');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showConfirmCompleteModal(id, t2 ? t2.name : '');
        });
    });
    // ★2026-09-20 已到期（过期/当天）→「完成/延期」：先问一句再决定（与整月明细同款）
    box.querySelectorAll('[data-complete-delay]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-complete-delay');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showCompleteOrDelayModal(id, t2 ? t2.name : '');
        });
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-del');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showDeletePlannedTripConfirmModal(id, t2 ? t2.name : '');
        });
    });
}

let renderPlannedTripsTableRAF = null;

// ★2026-09-02 年度回顾（独立全屏页）：概览入口打开 + 每年 1/1 自动展示（回顾上一年）
var yearReviewYear = null;
// ★2026-09-03 P3：「和去年比」开关状态（点亮=对比版 / 熄灭=只看今年）
var yrCompareOn = false;
function yrSetCompare(on) {
    yrCompareOn = !!on;
    var cBtn = safeGetElementById('yrCompareToggle');
    if (cBtn) cBtn.classList.toggle('on', yrCompareOn);
    var txt = safeGetElementById('yrCompareText');
    if (txt) txt.textContent = yrCompareOn ? '只看今年' : '和去年比';
}
function initYearReview() {
    try {
        var openBtn = safeGetElementById('yearReviewOpenBtn');
        if (openBtn) openBtn.addEventListener('click', function () { openYearReview(null); });
        var closeBtn = safeGetElementById('yearReviewCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeYearReview);
        var mask = safeGetElementById('yearReviewMask');
        if (mask) mask.addEventListener('click', closeYearReview);
        var prev = safeGetElementById('yearPrevBtn');
        if (prev) prev.addEventListener('click', function () { if (yearReviewYear != null) renderYearReview(yearReviewYear - 1); });
        var next = safeGetElementById('yearNextBtn');
        if (next) next.addEventListener('click', function () { if (yearReviewYear != null) renderYearReview(yearReviewYear + 1); });
        // ★2026-09-03 P3「和去年比」开关：点亮校验去年有数据（无 → toast 不点亮）；再点回「只看今年」
        var cmpBtn = safeGetElementById('yrCompareToggle');
        if (cmpBtn) cmpBtn.addEventListener('click', function () {
            if (yearReviewYear == null) return;
            if (!yrCompareOn) {
                var lastStats = calcYearStats(yearReviewYear - 1);
                if (!lastStats.has) {
                    if (typeof showInfoMessage === 'function') showInfoMessage((yearReviewYear - 1) + ' 年还没有记录，没法对比', 2200);
                    return;
                }
            }
            yrSetCompare(!yrCompareOn);
            renderYearReview(yearReviewYear);
        });
        // ★每年 1/1 自动展示上一年的年度回顾；同一年只自动弹一次（不打扰）
        var now = new Date();
        if (now.getMonth() === 0 && now.getDate() === 1) {
            var lastY = now.getFullYear() - 1;
            try {
                if (localStorage.getItem('hiking_yr_auto_' + lastY) === '1') return;
                localStorage.setItem('hiking_yr_auto_' + lastY, '1');
            } catch (e) { /* 存储失败仍展示一次 */ }
            setTimeout(function () { openYearReview(lastY); }, 1200);
        }
    } catch (e) { /* 静默 */ }
}
function openYearReview(year) {
    try {
        var panel = safeGetElementById('yearReviewPanel');
        if (!panel) return;
        if (typeof closeOpenModals === 'function') closeOpenModals();
        var target = year;
        if (target == null) {
            var years = {};
            (records || []).forEach(function (r) { if (r && r.createdAt) { var y = new Date(r.createdAt).getFullYear(); if (!isNaN(y)) years[y] = 1; } });
            var ks = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
            var thisY = new Date().getFullYear();
            target = ks.length ? (ks.indexOf(thisY) >= 0 ? thisY : ks[0]) : (thisY - 1);
        }
        yrSetCompare(false); // ★每次打开回到「只看今年」
        panel.style.display = 'flex';
        renderYearReview(target);
    } catch (e) { /* 静默 */ }
}
function closeYearReview() {
    yrSetCompare(false);
    var panel = safeGetElementById('yearReviewPanel');
    if (panel) panel.style.display = 'none';
}
// ★2026-09-03 P3 年度回顾数据统计函数化：今年/去年共用同一口径，供单版与对比版渲染
function yearRecordsOf(year) {
    return (records || []).filter(function (r) { return r && r.createdAt && !isNaN(new Date(r.createdAt).getTime()) && new Date(r.createdAt).getFullYear() === year; });
}
function calcYearStats(year) {
    var list = yearRecordsOf(year);
    var st = { year: year, list: list, has: list.length > 0, n: list.length };
    if (!st.has) return st;
    st.km = list.reduce(function (s, r) { return s + (Number(r.distance) || 0); }, 0);
    st.min = list.reduce(function (s, r) { return s + (Number(r.duration) || 0); }, 0);
    var nameCnt = {};
    list.forEach(function (r) { if (r.name) nameCnt[r.name] = (nameCnt[r.name] || 0) + 1; });
    st.nameCnt = nameCnt;
    st.peaks = Object.keys(nameCnt).length;
    st.avgKm = st.km / st.n;
    var maxName = null, maxCnt = 0;
    Object.keys(nameCnt).forEach(function (k) { if (nameCnt[k] > maxCnt) { maxCnt = nameCnt[k]; maxName = k; } });
    st.maxName = maxName; st.maxCnt = maxCnt;
    st.mostOften = (maxName && maxCnt >= 2) ? maxName : '—';
    var maxEl = 0, maxElName = '';
    list.forEach(function (r) { var e = Number(r.elevation) || 0; if (e > maxEl) { maxEl = e; maxElName = r.name; } });
    st.maxEl = maxEl; st.maxElName = maxElName;
    st.monthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (r) { st.monthly[new Date(r.createdAt).getMonth()]++; });
    st.maxM = Math.max.apply(null, st.monthly);
    var farl = null, longl = null;
    list.forEach(function (r) {
        var d = Number(r.distance) || 0;
        var m = Number(r.duration) || 0;
        if (!farl || d > (Number(farl.distance) || 0)) farl = r;
        if (!longl || m > (Number(longl.duration) || 0)) longl = r;
    });
    st.farl = farl; st.longl = longl;
    var companionCounts = {};
    list.forEach(function (r) {
        String(r.companions || '').split(/[,，、\s]+/).forEach(function (s) {
            s = s.trim(); if (s) companionCounts[s] = (companionCounts[s] || 0) + 1;
        });
    });
    var topCompanion = null, topCompanionCnt = 0;
    Object.keys(companionCounts).forEach(function (k) {
        if (companionCounts[k] > topCompanionCnt) { topCompanionCnt = companionCounts[k]; topCompanion = k; }
    });
    st.topCompanion = topCompanion; st.topCompanionCnt = topCompanionCnt;
    var sorted = list.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    st.early = sorted[0]; st.late = sorted[sorted.length - 1];
    var lines = [];
    // ★2026-09-03 五项优化⑤：lines 内用户文本（山名/同行名）escapeHtml 后再入 innerHTML（与全 App XSS 约定一致）
    if (farl && Number(farl.distance) > 0) lines.push('最远单程 · ' + escapeHtml(farl.name) + ' · ' + Number(farl.distance).toFixed(1) + ' km');
    if (longl && Number(longl.duration) > 0) lines.push('最长时间 · ' + escapeHtml(longl.name) + ' · ' + formatDuration(Number(longl.duration)));
    if (maxEl > 0) lines.push('最高海拔 · ' + escapeHtml(maxElName || '') + ' · ' + maxEl + ' m');
    if (maxName && maxCnt >= 2) lines.push('最常去 · ' + escapeHtml(maxName) + '（' + maxCnt + ' 次）');
    if (topCompanion && topCompanionCnt >= 2) lines.push('最多同行 · ' + escapeHtml(topCompanion) + '（' + topCompanionCnt + ' 次）');
    if (st.early) lines.push('第一次出发 · ' + fmtYMD(st.early.createdAt) + ' · ' + escapeHtml(st.early.name));
    if (st.late && st.early !== st.late) lines.push('最后一次出发 · ' + fmtYMD(st.late.createdAt) + ' · ' + escapeHtml(st.late.name));
    if (!lines.length) lines.push('这一年没有更多之最，去徒步吧！');
    st.lines = lines;
    return st;
}
// ★2026-09-03 P3 定稿（用户示例版）：6 指标 3 列卡片；对比卡 = 去年划线值 + 今年值 + 增幅同排
// 数值+单位（示例版式：大数字 18 + 小单位 次）；★2026-09-03 五项优化⑤：num 统一转义（数值无副作用，「最常去」山名防注入）
function yrBig(num, unit) {
    return '<span class="uv">' + escapeHtml(num) + '</span>' + (unit ? '<span class="us"> ' + escapeHtml(unit) + '</span>' : '');
}
// 卡片：lab + 值区（单版=数字行；对比版=去年划线/今年/增幅一行）
function yrCard(lab, valHtml) {
    return '<div class="yr-metric"><div class="lab">' + lab + '</div>' + valHtml + '</div>';
}
// 增幅文本（示例版式：次数/里程/平均用 %，山峰/用时用差值）
function yrChgTxt(d, lastV, kind) {
    if (Math.abs(d) < 1e-9) return '<span class="ychg flat">持平</span>';
    var up = d > 0, absd = Math.abs(d);
    var cls = up ? 'ychg' : 'ychg down';
    if (kind === 'count' || kind === 'km') {
        if (lastV > 0) return '<span class="' + cls + '">' + (up ? '+' : '-') + Math.round(absd / lastV * 100) + '%</span>';
        return '<span class="ychg">新增</span>';
    }
    if (kind === 'peak') return '<span class="' + cls + '">' + (up ? '+' : '-') + Math.round(absd) + '</span>';
    if (kind === 'dur') { // 用时差值：>=60 分钟折小时，否则分钟
        var t = absd >= 60 ? (Math.round(absd / 60 * 10) / 10).toString().replace(/\.0$/, '') + 'h' : Math.round(absd) + 'm';
        return '<span class="' + cls + '">' + (up ? '+' : '-') + t + '</span>';
    }
    if (kind === 'avg') {
        if (lastV > 0) return '<span class="' + cls + '">' + (up ? '+' : '-') + Math.round(absd / lastV * 100) + '%</span>';
        return '<span class="ychg">新增</span>';
    }
    return '';
}
// 去年划线值 + 今年值 + 增幅（同一行）
function yrCmpVal(oldNum, curNum, curUnit, chgHtml) {
    return '<div class="yvo"><span class="yold">' + oldNum + '</span>' + yrBig(curNum, curUnit) + (chgHtml || '') + '</div>';
}
// 用时拆「数字+单位」（>=1h 折小时一位小数；否则分钟）
function yrDurParts(min) {
    min = Number(min) || 0;
    if (min >= 60) {
        var h = Math.round(min / 60 * 10) / 10;
        return { num: String(h).replace(/\.0$/, ''), unit: 'h' };
    }
    return { num: String(Math.round(min)), unit: 'min' };
}
// 单版 6 指标
function yrGridSingle(st) {
    var d = yrDurParts(st.min);
    return '<div class="yr-grid">' +
        yrCard('徒步次数', yrBig(st.n, '次')) +
        yrCard('总里程', yrBig(st.km.toFixed(1), 'km')) +
        yrCard('总用时', yrBig(d.num, d.unit)) +
        yrCard('打卡山峰', yrBig(st.peaks, '座')) +
        yrCard('平均里程', yrBig(st.avgKm.toFixed(1), 'km')) +
        yrCard('最常去', yrBig(st.mostOften, '')) +
        '</div>';
}
// 对比版 6 指标（去年划线值 + 今年 + 增幅）
function yrGridCompare(cur, last) {
    var dc = yrDurParts(cur.min), dl = yrDurParts(last.min);
    var oldDurNum = dl.num, durChg = yrChgTxt(cur.min - last.min, last.min, 'dur');
    // 平均里程 diff 小到 ±0.2km 内且 >5%? 直接用 pct
    return '<div class="yr-grid">' +
        yrCard('徒步次数', yrCmpVal(last.n, cur.n, '次', yrChgTxt(cur.n - last.n, last.n, 'count'))) +
        yrCard('总里程', yrCmpVal(+(last.km.toFixed(1)), cur.km.toFixed(1), 'km', yrChgTxt(cur.km - last.km, last.km, 'km'))) +
        yrCard('总用时', yrCmpVal(oldDurNum, dc.num, dc.unit, durChg)) +
        yrCard('打卡山峰', yrCmpVal(last.peaks, cur.peaks, '座', yrChgTxt(cur.peaks - last.peaks, last.peaks, 'peak'))) +
        yrCard('平均里程', yrCmpVal(+(last.avgKm.toFixed(1)), cur.avgKm.toFixed(1), 'km', yrChgTxt(cur.avgKm - last.avgKm, last.avgKm, 'avg'))) +
        yrCard('最常去', yrBig(cur.mostOften, '')) +
        '</div>';
}
// 文本面板（今年=年度之最；对比=一年小结·自然语言）
function yrTabHtml(tt, body) {
    return '<div class="yr-tab"><span class="tt">' + tt + '</span>' + body + '</div>';
}
// 一年小结自然语言生成（★2026-09-03 五项优化后：文案池化 + 活泼口吻 + 每次随机，数据保持准确）
// 结构 = y 年 + 随机开场（按趋势方向分池）+ 数据段（次数/里程/新山/活跃月/常去对比）+ 随机收尾
function yrSummaryText(cur, last) {
    var y = cur.year;
    var nd = cur.n - last.n, kmd = +(cur.km - last.km).toFixed(1), pd = cur.peaks - last.peaks;
    var pos = [nd > 0, kmd > 0, pd > 0].filter(Boolean).length;
    var neg = [nd < 0, kmd < 0, pd < 0].filter(Boolean).length;
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    // 活泼文案池（按趋势方向分：开场 + 收尾；句首都避「今年/这一年」字样——句首已有年份，防重复指代）
    var PO = {
        up: ['你像一阵风，山都替你开心', '山都快被你踩热了', '出发的瘾，好像又大了一点', '你和山野的约会，肉眼可见地变多了'],
        down: ['走得慢了些，但每一步都算数', '山不会跑，歇够了随时再出发', '脚步轻了些，心却更稳了'],
        flat: ['和去年打了个平手，稳得很', '节奏没变，热爱也没变'],
        mixed: ['有起有伏，才是登山的味道', '多走了几座山，也偷偷懒过几回', '玩得挺随性，也挺尽兴']
    };
    var PE = {
        up: ['继续保持，下一座山头在等你！', '就按这个节奏，把山头一座座点亮吧！', '山在，腿也在，明年继续冲！', '这份热爱，山顶都看得到！'],
        down: ['不着急，山又不会跑。', '缓一缓，是为了走更远的路。', '只要还想出发，就永远不算晚。'],
        flat: ['走自己的节奏，山顶总会到。', '每一步都算数，明年继续。', '稳稳的幸福，山也知道。'],
        mixed: ['下一座山，已经在等你了。', '明年接着折腾，也挺好。']
    };
    // 数据段
    var segs = [];
    var np = last.n > 0 ? Math.round(nd / last.n * 100) : null;
    var kp = last.km > 0 ? Math.round(kmd / last.km * 100) : null;
    if (nd !== 0 && kmd !== 0 && np !== null && kp !== null && (nd > 0) === (kmd > 0)) {
        segs.push('次数与里程分别 ' + (nd > 0 ? '+' : '') + np + '% / ' + (kmd > 0 ? '+' : '') + kp + '%');
    } else {
        if (nd !== 0 && np !== null) segs.push('次数' + (nd > 0 ? '+' : '') + np + '%');
        if (kmd !== 0 && kp !== null) segs.push('里程' + (kmd > 0 ? '+' : '') + kp + '%');
    }
    if (pd > 0) segs.push('又解锁 ' + pd + ' 座新山');
    else if (pd < 0) segs.push('打卡的山峰少了 ' + Math.abs(pd) + ' 座');
    // 今年最活跃月（并列最高且连续 → X-Y 月）
    if (cur.maxM >= 1) {
        var ms = [];
        cur.monthly.forEach(function (c, i) { if (c === cur.maxM) ms.push(i + 1); });
        var act = ms.length > 1 && ms[ms.length - 1] - ms[0] === ms.length - 1
            ? ms[0] + '-' + ms[ms.length - 1] + ' 月最勤快'
            : ms[0] + ' 月最勤快';
        segs.push(act);
    }
    // 常去对比（去年无固定常去 → 「今年常去」；去年常去别山 → 「换了山头」更有趣）
    if (cur.mostOften !== '—') {
        var curCnt = cur.nameCnt[cur.mostOften] || 0;
        var lastCnt = last.nameCnt[cur.mostOften] || 0;
        if (lastCnt > 0) {
            var dd = curCnt - lastCnt;
            segs.push('老地方还是 ' + escapeHtml(cur.mostOften) + (dd > 0 ? '，比去年多爬了 ' + dd + ' 趟' : (dd < 0 ? '，比去年少去了 ' + Math.abs(dd) + ' 趟' : '，一趟不多一趟不少')));
        } else if (last.mostOften !== '—') {
            segs.push('换了山头，常去 ' + escapeHtml(cur.mostOften));
        } else {
            segs.push('今年常去 ' + escapeHtml(cur.mostOften));
        }
    }
    // 组装：开场（按方向）+ 数据 + 收尾
    var dir = pos >= 2 && neg === 0 ? 'up' : (neg >= 2 && pos === 0 ? 'down' : (pos === 0 && neg === 0 ? 'flat' : 'mixed'));
    var head = y + ' 年，' + pick(PO[dir]);
    if (!segs.length) return head + '，和去年几乎打平。' + pick(PE[dir]);
    return head + '：' + segs.join('；') + '。' + pick(PE[dir]);
}
// ★2026-09-03 P3 定稿：对比版渲染（去年 = year-1；去年无数据由上层保证不进入）
function renderYearCompare(year) {
    var cur = calcYearStats(year);
    var last = calcYearStats(year - 1);
    if (!last.has) { // 兜底：切年份到某年而去年无数据 → 自动退回单版
        yrSetCompare(false);
        renderYearReview(year);
        return;
    }
    var content = safeGetElementById('yearReviewContent');
    if (!content) return;
    var tabBody = yrTabHtml('一年小结 · 和去年比', yrSummaryText(cur, last));
    content.innerHTML = yrGridCompare(cur, last) + tabBody;
}
function renderYearReview(year) {
    try {
        yearReviewYear = year;
        var title = safeGetElementById('yearReviewYear');
        if (title) title.textContent = String(year);
        var content = safeGetElementById('yearReviewContent');
        if (!content) return;
        // ★2026-09-03 P3：对比开关点亮 → 切到「和去年比」对比版（去年无数据自动退回单版）
        if (yrCompareOn) { renderYearCompare(year); return; }
        var st = calcYearStats(year);
        if (!st.has) {
            content.innerHTML = '<div class="yr-empty">' + year + ' 年还没留下徒步足迹<br>去「记录」页添加第一条吧</div>';
            return;
        }
        content.innerHTML = yrGridSingle(st) + yrTabHtml('年度之最', st.lines.join('<br>'));
    } catch (e) { /* 静默 */ }
}
function fmtYMD(t) {
    try {
        var d = new Date(t);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    } catch (e) { return ''; }
}

// ★2026-09-02 记录页「列表 / 山册」双视图（同计划页日历/列表切换模式；切换键在记录页添加按钮右侧）
var recordsViewMode = 'list';
try { recordsViewMode = localStorage.getItem('records_view_mode') || 'list'; } catch (e) { /* 默认列表 */ }
function initRecordsView() {
    var btn = safeGetElementById('recordsViewToggleBtn');
    if (btn) btn.addEventListener('click', function () {
        // ★2026-09-03 全链路 try：任何一步抛错都不能让视图停在中间态（用户报过「点两次才切换」= 首次点击中断）
        try {
            recordsViewMode = recordsViewMode === 'list' ? 'mountain' : 'list';
            try { localStorage.setItem('records_view_mode', recordsViewMode); } catch (e) { /* 忽略 */ }
            if (typeof batchMode !== 'undefined' && batchMode) { try { exitBatchMode(); } catch (e) { /* 忽略 */ } }
            applyRecordsView();
        } catch (e) {
            // 兜底：异常也要保证视图与状态一致（先显隐、后内容渲染，异常只丢内容不丢切换）
            try { applyRecordsView(); } catch (e2) { /* 忽略 */ }
        }
    });
    var wrap = safeGetElementById('mountainBookView');
    if (wrap) wrap.addEventListener('click', function (e) {
        // ★2026-09-03 P0 山册照片回忆：点照片 → 灯箱全屏看大图（该记录照片集，可滑动/保存）
        var ph = e.target.closest ? e.target.closest('.mbp-item') : null;
        if (ph) {
            var rid = ph.getAttribute('data-rid'), pid = ph.getAttribute('data-pid');
            if (rid && pid && typeof openPhotoLightbox === 'function') {
                try {
                    // ★2026-10-17 修复：把整条「照片回忆」的照片按顺序带进灯箱。
                    //   该条汇集了同一座山**多条记录**的照片，原实现只传起始记录 → 翻不到其余记录的照片。
                    var strip = ph.closest('.mb-photos-strip');
                    var ctx = null;
                    if (strip) {
                        ctx = Array.prototype.slice.call(strip.querySelectorAll('.mbp-item')).map(function (el) {
                            return { rid: el.getAttribute('data-rid'), pid: el.getAttribute('data-pid') };
                        }).filter(function (x) { return x.rid && x.pid; });
                    }
                    openPhotoLightbox(rid, pid, false, ctx);
                } catch (e2) { /* 忽略 */ }
            }
            return;
        }
        // ★2026-09-03 点卡头 → 抽屉整行展开（drawer 在同 .mb-row 内、data-mountain 与卡一致）
        var head = e.target.closest ? e.target.closest('.mb-head') : null;
        if (head) {
            var card = head.closest('.mb-card');
            if (card) {
                var mtn = card.getAttribute('data-mountain');
                var willOpen = !card.classList.contains('open');
                card.classList.toggle('open');
                var rowEl = card.closest('.mb-row');
                var drawer = rowEl ? rowEl.querySelector('.mb-drawer[data-mountain="' + mtn + '"]') : null;
                if (drawer) drawer.classList.toggle('open', willOpen);
                syncMtnDrawerTitles();
                // ★2026-09-03 展开时才懒加载抽屉内照片（img data-record 占位 → loadPhotoThumbs 异步填图，_photoLoaded 防重复）
                if (willOpen && drawer) {
                    var ridSet = {};
                    drawer.querySelectorAll('.mbp-item img').forEach(function (im) { var r2 = im.getAttribute('data-record'); if (r2) ridSet[r2] = 1; });
                    Object.keys(ridSet).forEach(function (r3) { try { loadPhotoThumbs(r3); } catch (e3) { /* 忽略 */ } });
                }
            }
            return;
        }
    });
}
function applyRecordsView() {
    var isMb = recordsViewMode === 'mountain';
    // ★2026-10-09 山册视图不提供搜索（用户要求）→ 先清空搜索词，随后 renderMountainBook 按全量渲染
    if (isMb) clearGlobalSearchQuery();
    var lv = safeGetElementById('recordsListViewWrap'); // 列表整体（表格+分页+批量条）
    var mb = safeGetElementById('mountainBookView');
    var icon = safeGetElementById('recordsViewToggleIcon');
    var bBtn = safeGetElementById('batchModeBtn');
    var aBtn = safeGetElementById('addBtn');
    // ★2026-09-03 先完成显隐与图标（视图切换主视觉），内容渲染放 try——渲染异常只丢卡片不丢切换
    if (isMb) {
        if (lv) lv.style.display = 'none';
        if (bBtn) bBtn.style.display = 'none';
        if (aBtn) aBtn.style.display = 'none';
        if (mb) mb.style.display = '';
        if (icon) icon.textContent = 'view_list';
        if (mb) { try { renderMountainBook(); } catch (e) { mb.innerHTML = '<div class="yr-empty">山册生成失败，请稍后重试</div>'; } }
    } else {
        if (lv) lv.style.display = '';
        if (mb) mb.style.display = 'none';
        if (bBtn) bBtn.style.display = 'inline-flex';
        if (aBtn) aBtn.style.display = 'inline-flex';
        if (icon) icon.textContent = 'landscape';
        try { if (typeof renderTable === 'function') renderTable(); } catch (e) { /* 渲染异常不影响切换 */ }
    }
    // ★2026-09-04 按钮文字 + 视图说明小标题随模式切换
    try { if (typeof window.showTabGuides === 'function') window.showTabGuides(); } catch (eg1) { /* 忽略 */ }
    var labR = safeGetElementById('recordsViewToggleLabel');
    if (labR) labR.textContent = isMb ? '列表' : '山册';
    var capElR = safeGetElementById('recordsViewCaption');
    var capTxtR = safeGetElementById('recordsViewCaptionText');
    if (capTxtR) capTxtR.textContent = isMb ? '山册视图 · 按山峰汇总成册，一座山一张卡片' : '列表视图 · 全部记录按时间排列，点一行可查看';
    if (capElR) capElR.style.display = '';   // ★2026-09-05 切视图时恢复被收起说明
    var btn = safeGetElementById('recordsViewToggleBtn');
    if (btn) btn.title = isMb ? '切回记录列表' : '查看我的山册';
    // ★2026-10-09 山册视图已不提供搜索 → 原「placeholder 随视图切换（山册搜山名）」逻辑移除；
    //   改为让搜索框重新判断显隐（列表显示 / 山册隐藏）
    if (window.__pokeSearchBar) { try { window.__pokeSearchBar(); } catch (e) { /* 忽略 */ } }
}
// ★2026-09-02 山册渲染：按记录名（山）聚合卡片；点卡片头展开这座山的记录；点记录右侧 ↗ 定位打开
// ★2026-09-03 双列名册：网格两列排卡片（山影天空带已按用户要求删除，卡只显示山名行）
// ★2026-10-10 山册「连接器」（用户：「朱雀-草甸」「朱雀-冰晶顶」应是同一座山；连接后名字自己定；
//   ★只在山册里生效，记录本身与其它页面一律不动）
//   ★不做自动前缀归并（自动切「-」前缀可能误并）—— 改成纯手动：抽屉底部「连接到另一座山」→ 选目标 + 自定义名字
//   映射存 AppStore「hiking_mtn_merge」：{ 来源名: { to: 目标名, name: 显示名 } }；支持链式（A→B、B→C）。
function mtnMerges() {
    try { return AppStore.getItem('hiking_mtn_merge') || {}; } catch (e) { return {}; }
}
function mtnKeyOf(name) {
    var base = String(name == null ? '' : name).trim();
    if (!base) return '';
    var m = mtnMerges(), hop = 0;
    while (m[base] && m[base].to && m[base].to !== base && hop++ < 10) base = m[base].to;
    return base;
}
// 组显示名：连接器自定义名优先，否则用原名
function mtnLabelOf(key) {
    var m = mtnMerges();
    if (m[key] && m[key].name) return m[key].name;
    for (var k0 in m) { if (m[k0] && m[k0].to === key && m[k0].name) return m[k0].name; }
    return key;
}
// 当前山册里所有「山」（归并后的键），供连接弹窗列选项
function mtnAllKeys() {
    var seen = {}, out = [];
    (records || []).forEach(function (r) {
        var k = mtnKeyOf(r && r.name);
        if (k && !seen[k]) { seen[k] = 1; out.push(k); }
    });
    out.sort();
    return out;
}
// 抽屉底部那一行「连接」（已连接则显示状态）
function mtnMergeRowHtml(key) {
    var m = mtnMerges();
    var conn = !!(m[key] && m[key].to);
    var sources = [];
    for (var k0 in m) { if (m[k0] && m[k0].to === key) sources.push(k0); }
    var txt;
    if (conn) txt = '已连接到「' + mtnLabelOf(m[key].to) + '」';
    else if (sources.length) txt = '已并入 ' + sources.length + ' 座';
    // ★2026-10-17 用户反馈：「山册下每一个打开后都有『连接到另一座山』那句话，有点臃肿」
    //   ⇒ 未连接时收敛成 2 字「连接」（状态文案保留，因为「已连接到 X / 已并入 N 座」是有信息量的）；
    //     同时把这行的视觉权重压低：下距 10→6px、内边距 4/8→2/6px、颜色 #64748b→#94a3b8。
    else txt = '连接';
    // ★2026-10-17 用户：「可不可以别单独一行了」→ 本函数只返回按钮本身，
    //   由调用处与「最近一次」并排成一行（不再自带一行 + 上下边距）。
    return '<button type="button" class="mtn-merge-btn" data-mtn-key="' + escapeHtml(key) + '" ' +
        'style="display:inline-flex;align-items:center;gap:3px;background:transparent;border:none;color:#64748b;font-size:11px;line-height:1;cursor:pointer;padding:6px 8px;margin:-4px -6px;border-radius:8px;white-space:nowrap;flex-shrink:0;">' +
        '<span class="material-icons" style="font-size:13px;line-height:1;">link</span>' + escapeHtml(txt) + '</button>';
}
// 连接弹窗（选目标 + 自定义名字）
function openMtnMergeDialog(key) {
    try {
        var m = mtnMerges();
        var conn = !!(m[key] && m[key].to);
        var cur = conn ? m[key] : null;
        var sources = [];
        for (var s0 in m) { if (m[s0] && m[s0].to === key) sources.push(s0); }
        var canOff = conn || sources.length > 0;
        var others = mtnAllKeys().filter(function (k0) { return k0 !== key; });
        var selectedKeys = [];   // ★2026-10-10 多选：一次可并入多座山
        var optRow = function (k0) {
            var on = selectedKeys.indexOf(k0) >= 0;
            return '<div class="mtn-merge-opt' + (on ? ' on' : '') + '" data-key="' + escapeHtml(k0) + '">' +
                '<span>' + escapeHtml(mtnLabelOf(k0)) + '</span>' +
                (on ? '<span class="material-icons mtn-merge-opt-check">check</span>' : '') +
                '</div>';
        };
        var opts = others.map(optRow).join('') || '<div class="mtn-merge-empty">还没有别的山可以连接</div>';
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-md">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="font-size:20px;vertical-align:-4px;color:#6366f1;">link</span> 连接山</div>' +
            '<div class="confirm-modal-message" style="line-height:1.7;text-align:left;">' +
            '<div style="margin-bottom:6px;">把选中的山并入「<b>' + escapeHtml(mtnLabelOf(key)) + '</b>」<span class="mtn-merge-note">（可多选）</span>：</div>' +
            '<div id="mtnMergeList" class="mtn-merge-list">' + opts + '</div>' +
            '<div style="margin-bottom:6px;">连接后叫什么名字？<span class="mtn-merge-note">（留空则用目标山的名字）</span></div>' +
            '<input type="text" id="mtnMergeName" maxlength="20" placeholder="例如：朱雀" value="' + escapeHtml(cur && cur.name ? cur.name : '') + '" class="mtn-merge-input">' +
            '<div class="mtn-merge-note-strong" style="margin-top:10px;line-height:1.5;">只在「山册」里生效 —— 归类和名字变了，记录本身一条都不动。</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="mtnMergeCancel">取消</button>' +
            (canOff ? '<button class="confirm-btn-cancel ripple-effect" id="mtnMergeOff">断开</button>' : '') +
            '<button class="check-go-btn ripple-effect" id="mtnMergeOk">' + (conn ? '保存' : '连接') + '</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        var close = function () { try { document.body.removeChild(modal); } catch (e) { } };
        document.getElementById('mtnMergeCancel').addEventListener('click', close);
        if (canOff) {
            document.getElementById('mtnMergeOff').addEventListener('click', function () {
                var mm = mtnMerges();
                delete mm[key];
                for (var d0 in mm) { if (mm[d0] && mm[d0].to === key) delete mm[d0]; }
                try { AppStore.setItem('hiking_mtn_merge', mm); } catch (e) { }
                close(); try { renderMountainBook(); } catch (e2) { }
            });
        }
        document.getElementById('mtnMergeOk').addEventListener('click', function () {
            var nm = document.getElementById('mtnMergeName');
            if (!selectedKeys.length) { try { showErrorMessage('请先选至少一座山'); } catch (eE) { } return; }
            var mm = mtnMerges();
            var label = ((nm && nm.value) ? String(nm.value).trim() : '') || mtnLabelOf(key);
            selectedKeys.forEach(function (sk) { mm[sk] = { to: key, name: label }; });
            try { AppStore.setItem('hiking_mtn_merge', mm); } catch (e) { }
            close(); try { renderMountainBook(); } catch (e2) { }
        });
        modal.addEventListener('click', function (e) {
            var el = e.target;
            var opt = (el && el.closest) ? el.closest('.mtn-merge-opt') : null;
            if (opt) {
                var kk = opt.getAttribute('data-key') || '';
                var i2 = selectedKeys.indexOf(kk);
                if (i2 >= 0) selectedKeys.splice(i2, 1); else selectedKeys.push(kk);
                modal.querySelectorAll('.mtn-merge-opt').forEach(function (o) {
                    var on = selectedKeys.indexOf(o.getAttribute('data-key')) >= 0;
                    if (on) o.classList.add('on'); else o.classList.remove('on');
                    var chk = o.querySelector('.mtn-merge-opt-check');
                    if (on && !chk) o.insertAdjacentHTML('beforeend', '<span class="material-icons mtn-merge-opt-check">check</span>');
                    else if (!on && chk) chk.remove();
                });
                return;
            }
            if (e.target === modal) close();
        });
    } catch (e) { /* 连接弹窗失败不影响山册 */ }
}


// ★2026-10-20 抽屉标题显隐：按 DOM 顺序，第 1 个打开的抽屉不加标题（它紧贴卡头能对上），
//   其余打开的抽屉都显示「序号 + 山名」，解决多个整行抽屉堆叠时看不出是哪个山的问题。
function syncMtnDrawerTitles() {
    var wrap = safeGetElementById('mountainBookView');
    if (!wrap) return;
    var open = wrap.querySelectorAll('.mb-drawer.open');
    for (var i = 0; i < open.length; i++) {
        var t = open[i].querySelector('.mb-drawer-title');
        if (t) t.style.display = (i === 0) ? 'none' : 'flex';
    }
}

function renderMountainBook() {
    var wrap = safeGetElementById('mountainBookView');
    if (!wrap) return;
    // ★2026-10-10 连接器：委托一次（捕获阶段，避免触发展开/收起）
    if (!window.__mtnMergeBound) {
        window.__mtnMergeBound = true;
        document.addEventListener('click', function (e) {
            var el = e.target;
            var b = (el && el.closest) ? el.closest('.mtn-merge-btn') : null;
            if (!b) return;
            e.stopPropagation();
            openMtnMergeDialog(b.getAttribute('data-mtn-key'));
        }, true);
    }
    var list = (records || []).filter(function (r) { return r && r.name && String(r.name).trim(); });
    if (!list.length) {
        wrap.innerHTML = '<div class="yr-empty">还没有任何记录<br>去「列表」添加第一条，山册会自动在这里汇总</div>';
        return;
    }
    var diffName = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
    var groups = {};
    list.forEach(function (r) {
        var k = mtnKeyOf(r.name);   // ★2026-10-10 同山归并（原为 String(r.name).trim()，同山不同名会分成两张卡）
        if (!groups[k]) groups[k] = [];
        groups[k].push(r);
    });
    // ★2026-09-03 集章序号：每座山按「第一次去的先后」编号 01/02/03…（首登 = 该组最早 createdAt）；
    //   全量排序后过滤，搜索命中时序号仍保持全册编号不重排
    function firstAt(arr) {
        var m = '';
        arr.forEach(function (r) { var c = r.createdAt || ''; if (!m || c < m) m = c; });
        return m;
    }
    var allKeys = Object.keys(groups).sort(function (a, b) {
        var fa = firstAt(groups[a]), fb = firstAt(groups[b]);
        if (fa !== fb) return fa < fb ? -1 : 1;
        if (groups[b].length !== groups[a].length) return groups[b].length - groups[a].length;
        return 0;
    });
    var sealNo = {};
    allKeys.forEach(function (k, i) { sealNo[k] = i + 1; });
    var padLen = Math.max(2, String(allKeys.length).length);
    // ★2026-10-09 山册视图已不提供搜索（用户要求）→ 不再按搜索词过滤，山册全册常显
    var keys = allKeys;
    // ★2026-09-03 双列山册 + 整行抽屉：每两座山一组 .mb-row；
    //   先排两个卡头（占两列），再排两个抽屉（grid-column 1/-1 整行）；
    //   点卡头 → 对应抽屉以整行宽在卡头行下方拉开，卡头留在原列（用户需求 v2）
    // ★2026-09-18 山册顶部常驻色带图例（最高海拔分档；完整说明在「颜色说明」弹窗）
    var legendHtml = '<div class="mb-legend" data-testid="mb-legend" title="卡片彩边 = 这座山的最高海拔档位（单位：米）">' +
        '<span class="mb-legend-label">海拔</span>' +
        '<span class="mb-legend-item"><span class="ridge-legend-bar rl-1"></span>&lt;1k</span>' +
        '<span class="mb-legend-item"><span class="ridge-legend-bar rl-2"></span>1-2k</span>' +
        '<span class="mb-legend-item"><span class="ridge-legend-bar rl-3"></span>2-3k</span>' +
        '<span class="mb-legend-item"><span class="ridge-legend-bar rl-4"></span>3-4k</span>' +
        '<span class="mb-legend-item"><span class="ridge-legend-bar rl-5"></span>4k+</span>' +
        '</div>';
    var rowHtml = '';
    for (var ri = 0; ri < keys.length; ri += 2) {
        var cellA = renderMountainCard(keys[ri], groups, sealNo, padLen, diffName);
        var cellB = (ri + 1 < keys.length) ? renderMountainCard(keys[ri + 1], groups, sealNo, padLen, diffName) : null;
        rowHtml += '<div class="mb-row">' + cellA.head + (cellB ? cellB.head : '') + cellA.drawer + (cellB ? cellB.drawer : '') + '</div>';
    }
    wrap.innerHTML = legendHtml + rowHtml;   // ★2026-09-18 图例常驻在山册最上方
}
// 渲染单座山的「卡头 + 整行抽屉」两部分（head 放两列，drawer 整行下拉）
function renderMountainCard(k, groups, sealNo, padLen, diffName) {
    function statCell(v, l) { return '<div><div class="sv">' + v + '</div><div class="sl">' + l + '</div></div>'; }
    function cmpSet(c) {
        var out = {}, n = 0;
        String(c || '').split(/[,，、\s]+/).forEach(function (s) { s = s.trim(); if (s && !out[s]) { out[s] = 1; n++; } });
        return Object.keys(out).slice(0, 3);
    }
    var arr = groups[k];
    // ★2026-10-10 显示名：连接器自定义名优先，否则用原名
    var dispName = mtnLabelOf(k);
    // ★2026-09-05 P0-1 大数量优化：组内单 pass 合并 4 个 reduce + comp；排序只在有照片时对照片记录做（无照片大组免整组 sort）
    var n = arr.length;
    var km = 0, min = 0, el = 0, diffSum = 0, lastTs = 0;   // ★2026-10-10 P1-2 该山最近一次
    var comp = [];
    var seen = {};
    var phRecs = [];
    for (var gi = 0; gi < n; gi++) {
        var gr = arr[gi];
        km += Number(gr.distance) || 0;
        min += Number(gr.duration) || 0;
        var gel = Number(gr.elevation) || 0;
        if (gel > el) el = gel;
        var gt = Date.parse(gr.createdAt) || 0;   // ★2026-10-10 P1-2
        if (gt > lastTs) lastTs = gt;
        diffSum += Number(gr.difficulty) || 0;
        cmpSet(gr.companions).forEach(function (c2) { if (!seen[c2]) { seen[c2] = 1; comp.push(c2); } });
        if (gr.photos && gr.photos.length) phRecs.push({ c: gr.createdAt || '', id: gr.id, ps: gr.photos });
    }
    var avgD = Math.round(diffSum / n);
    var pItems = [];
    var dMax = '';
    if (phRecs.length) {
        phRecs.sort(function (x, y) { return x.c < y.c ? -1 : (x.c > y.c ? 1 : 0); });
        for (var pj = 0; pj < phRecs.length && pItems.length < 24; pj++) {
            var pr = phRecs[pj];
            var dd = fmtYMD(pr.c) || '';
            if (dd && dd > dMax) dMax = dd;
            for (var pk = 0; pk < pr.ps.length && pItems.length < 24; pk++) {
                pItems.push({ rid: pr.id, pid: pr.ps[pk] });
            }
        }
    }
    var dLabel = dMax || '';
    var photosHtml = pItems.length
        ? '<div class="mb-photos"><div class="mb-photos-head"><span class="mb-photos-tt">照片回忆</span>' +
        '<span class="mb-photos-cnt">' + pItems.length + ' 张' + (dLabel ? ' · ' + dLabel : '') + '</span></div>' +
        '<div class="mb-photos-strip">' + pItems.map(function (it) {
            return '<div class="mbp-item" data-rid="' + it.rid + '" data-pid="' + it.pid + '" title="看大图">' +
                '<img data-record="' + it.rid + '" data-pid="' + it.pid + '" alt="照片"></div>';
        }).join('') + '</div></div>'
        : '';
    var ridgeCls = '';
    if (el > 0) {
        if (el < 1000) ridgeCls = 'mb-ridge-1';
        else if (el < 2000) ridgeCls = 'mb-ridge-2';
        else if (el < 3000) ridgeCls = 'mb-ridge-3';
        else if (el < 4000) ridgeCls = 'mb-ridge-4';
        else ridgeCls = 'mb-ridge-5';
    }
    var no = String(sealNo[k]).padStart(padLen, '0');
    var statHtml = '<div class="mb-stat">' +
        statCell(n + ' 次', '累计') + statCell(km ? km.toFixed(1) + 'km' : '—', '总里程') +
        statCell(min ? formatDuration(min) : '—', '总用时') + statCell(el ? el + 'm' : '—', '最高海拔') +
        statCell(diffName[avgD] || '—', '平均难度') + statCell(comp.length ? comp.map(escapeHtml).join('/') : '—', '一起走过') +
        '</div>';
    var head = '<div class="mb-card ' + ridgeCls + '" data-mountain="' + no + '"><div class="mb-head">' +
        '<span class="mb-seal">' + no + '</span>' +
        '<div class="mb-body"><div class="mb-name">' + escapeHtml(dispName) + '</div></div>' +
        '<span class="mb-open-arrow material-icons" style="font-size:18px;">expand_more</span></div></div>';
    // ★2026-10-10 P1-2「上次来」：一行灰字放统计之后（最低调，避免抽屉臃肿）
    var lastTxt = '';
    if (lastTs) {
        var ldays = Math.floor((Date.now() - lastTs) / 86400000);
        var ld0 = new Date(lastTs);
        var ldate = ld0.getFullYear() + '-' + String(ld0.getMonth() + 1).padStart(2, '0') + '-' + String(ld0.getDate()).padStart(2, '0');
        lastTxt = '<div class="mb-last" style="font-size:11px;opacity:0.66;">' +
            (n > 1 ? '最近一次' : '唯一一次') + ' · ' + (ldays <= 0 ? '今天' : ldays + ' 天前') + '（' + ldate + '）</div>';
    }
    // ★2026-10-17 「最近一次」与「连接」并排一行（用户：连接按钮别单独占一行）
    //   无「最近一次」时用一个空 span 占位，保证「连接」仍靠右对齐。
    var footRow = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;">' +
        (lastTxt || '<span></span>') + mtnMergeRowHtml(k) + '</div>';
    // ★2026-10-20 用户要求：同时展开 ≥2 个山册抽屉时，除最上面那个，其余都加山名标题
    //   —— 多个整行抽屉堆叠后离各自卡头太远，不标山名分不清是哪个山的统计。
    //   默认隐藏，显示与否由 syncMtnDrawerTitles() 在展开/收起后统一判定。
    var drawerTitle = '<div class="mb-drawer-title">' +
        '<span class="mb-drawer-seal">' + no + '</span>' +
        '<span class="mb-drawer-name">' + escapeHtml(dispName) + '</span></div>';
    var drawer = '<div class="mb-drawer" data-mountain="' + no + '">' + drawerTitle + photosHtml + statHtml + footRow + '</div>';
    return { head: head, drawer: drawer };
}

// ★2026-09-05 P0-③ 抹掉所有足迹：双重确认 → 清 records/plannedTrips/全部照片 + 引导与提醒标记 → reload 全新开始
function confirmWipeAllData() {
    try {
        var nRec = (records || []).length, nPl = (plannedTrips || []).length;
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#dc2626;">delete_forever</span>抹掉所有足迹？</div>' +
            '<div class="confirm-modal-message" style="line-height:1.7;">将删除 <b>' + nRec + ' 条记录、' + nPl + ' 个计划</b> 和 <b>全部照片</b>，<b>不可恢复</b>。<br>建议先点「导出数据」留一份备份。</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="wipe-cancel1">取消</button>' +
            '<button class="check-go-btn ripple-effect" id="wipe-next1">继续</button></div></div>';
        document.body.appendChild(modal);
        document.getElementById('wipe-cancel1').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('wipe-next1').addEventListener('click', function () {
            document.body.removeChild(modal);
            wipeConfirmSecond();
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}
function wipeConfirmSecond() {
    try {
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#dc2626;">warning</span>最后确认</div>' +
            '<div class="confirm-modal-message" style="line-height:1.7;">这一步会<b>永久删除全部徒步数据与照片</b>，并<b>解除网盘绑定</b>；<b>云端备份文件不受影响</b>（坚果云里的旧备份还在，需要时仍可恢复）。确定要抹掉吗？</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="wipe-cancel2">返回</button>' +
            '<button class="check-go-btn ripple-effect" id="wipe-go2" style="font-weight:700;">彻底抹掉</button></div></div>';
        document.body.appendChild(modal);
        document.getElementById('wipe-cancel2').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('wipe-go2').addEventListener('click', function () {
            document.body.removeChild(modal);
            try { wipeAllDataExecute(); } catch (e2) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}
function wipeAllDataExecute() {
    records = [];
    plannedTrips = [];
    try { saveToStorage(); } catch (e) { /* 忽略 */ }
    try { savePlannedTripsToStorage(); } catch (e2) { /* 忽略 */ }
    // records 已空 → 全部照片成孤儿，一次清库（photoCollectOrphans 删除全部）
    try { photoCollectOrphans().catch(function () { /* 照片清理失败不强求 */ }); } catch (e3) { /* 忽略 */ }
    // ★2026-09-20 抹除补全（此前只清 4 个键，与「全新开始」的承诺不符）：
    //   ① 固定键：引导/提醒/备份时间 + 崩溃队列 + 里程碑（含"已看过"标记）+ 年度回顾标记 + 网盘绑定与同步状态
    //   ② 前缀键：hiking_guide_seen_*（各页引导卡）、hiking_yr_auto_*（年度回顾自动展示）
    //   ③ 网盘绑定一并解除（凭据不再留在设备上）；坚果云里的备份文件不受影响，需要时仍可恢复
    ['welcome_seen_v1', 'hiking_overdue_remind_date', 'hiking_overdue_care_date', 'hiking_local_backup_at',
        'hiking_crash_queue', 'hiking_milestones', 'hiking_milestones_seen',
        'hiking_sync_config', 'hiking_sync_status', 'hiking_sync_files', 'hiking_pending_apk_tag'].forEach(function (k) {
        try { AppStore.removeItem(k); } catch (e4) { /* 忽略 */ }
    });
    try {
        var _wipePrefixes = ['hiking_guide_seen_', 'hiking_yr_auto_'];
        var _wipeKeys = [];
        for (var _wi = 0; _wi < localStorage.length; _wi++) { var _wk = localStorage.key(_wi); if (_wk) _wipeKeys.push(_wk); }
        _wipeKeys.forEach(function (wk) {
            if (_wipePrefixes.some(function (p) { return wk.indexOf(p) === 0; })) {
                try { AppStore.removeItem(wk); } catch (e4b) { /* 忽略 */ }
            }
        });
    } catch (e4c) { /* 忽略 */ }
    try { showSuccessMessage('已抹掉所有足迹，欢迎重新开始'); } catch (e5) { /* 忽略 */ }
    setTimeout(function () { try { location.reload(); } catch (e6) { /* 忽略 */ } }, 600);
}
// ★2026-10-19 用户要求「去掉新手指引的示例功能」：原 loadSampleData()（一键灌 3 条足迹 + 1 条计划）已移除。
//   原因有二：① 示例会让人误以为"已经有内容"，反而不知道从哪开始写；
//   ② 示例是直接写 records 的，绕过了保存流程 ⇒ 下次启动的 silent 补领会把已达成的里程碑
//      静默标记为「已庆祝」，导致那几个里程碑的弹窗永远不会出现（用户反馈的现象）。
//   现改为在概览欢迎卡上用一句话说明「记录 / 计划」两个 ＋ 入口的位置（见 index.html #wbWhereHint）。

// ★2026-09-03 P0 从历史记录复制（方案定稿：点「＋添加」先弹选择卡；行内不再有复制条）：
// 可复制的历史记录 = 有名字的记录
function historyCopySources() {
    return (records || []).filter(function (r) {
        return r && r.name && String(r.name).trim();
    });
}
// ★2026-09-03 P0 入口（v3 定稿）：点「＋添加」→ 弹窗 =
//  ①「直接新建空白记录」独立整行（不藏进下拉，点即空白新建）
//  ②「或者」分隔
//  ③ 下拉框只做「从历史记录复制」：点开展开最近记录圆点单选，选中收起、栏文本变「山名 · 日期」
//  ④ 底部「用这条填充」确认键（check-go-btn 玻璃主钮，未选置灰，点确认才带出字段）
function handleAddRecordFlow() {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        var srcs = historyCopySources();
        if (!srcs.length) { addNewRecord(); return; }
        srcs = srcs.slice().sort(function (a, b) { return ((b.createdAt || '') < (a.createdAt || '')) ? -1 : 1; });
        var diffMap = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
        var items = srcs.map(function (r) {
            var meta = [];
            meta.push(diffMap[r.difficulty] || '');
            var km = Number(r.distance) || 0, dur = Number(r.duration) || 0, el = Number(r.elevation) || 0;
            if (km) meta.push(km.toFixed(1) + 'km');
            if (dur) meta.push(formatDuration(dur));
            if (el) meta.push(el + 'm');
            return '<div class="hcm-item" data-id="' + r.id + '" role="button" tabindex="0">' +
                '<span class="hcm-dot"></span>' +
                '<div class="hcm-main"><div class="hcm-row1"><span class="hcm-name">' + escapeHtml(r.name) + '</span>' +
                '<span class="hcm-date">' + fmtYMD(r.createdAt) + '</span></div>' +
                '<div class="hcm-meta">' + escapeHtml(meta.join(' · ')) + '</div></div></div>';
        }).join('');
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-md">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">add_circle_outline</span>添加徒步记录</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="ap-new" id="apNew" role="button" tabindex="0">' +
            '<span class="material-icons ic">edit_note</span>' +
            '<span class="ap-t"><span class="m1">新建空白记录</span><span class="s1">从零开始填，日期自动是今天</span></span></div>' +
            '<div class="ap-seg">或者</div>' +
            '<button type="button" class="ap-field" id="apField">' +
            '<span class="material-icons ap-ic">content_copy</span>' +
            '<span class="ap-t"><span class="ap-main" id="apMain">从历史记录复制</span>' +
            '<span class="ap-sub" id="apSub">挑一条最近去过的山，选完点确认</span></span>' +
            '<span class="material-icons ap-arr">expand_more</span></button>' +
            '<div class="ap-fold" id="apFold"><div class="ap-fold-inner">' +
            '<div class="ap-recent-tip">最近记录 · 点选一条（日期与照片不复制）</div>' +
            '<div class="hcm-list" data-count="' + srcs.length + '" style="max-height:42vh;">' + items + '</div>' +
            '</div></div></div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="glass-btn ripple-effect" id="apOk" disabled type="button">填充</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        var field = modal.querySelector('#apField');
        var fold = modal.querySelector('#apFold');
        var listEl = modal.querySelector('.hcm-list');
        var okBtn = modal.querySelector('#apOk');
        var mainTxt = modal.querySelector('#apMain');
        var subTxt = modal.querySelector('#apSub');
        var selId = null;
        function closeMdl() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
        function setSel(id) {
            selId = id;
            Array.prototype.forEach.call(listEl.querySelectorAll('.hcm-item'), function (it) {
                it.classList.toggle('sel', it.getAttribute('data-id') === id);
            });
            var src = (records || []).find(function (r) { return r.id === id; });
            if (src) {
                field.classList.add('chosen');
                mainTxt.textContent = escapeHtml(src.name) + ' · ' + fmtYMD(src.createdAt);
                subTxt.textContent = '已选，点下方「填充」带出';
            }
            fold.classList.remove('open');
            field.classList.remove('open');
            okBtn.disabled = !selId;
        }
        field.addEventListener('click', function () {
            if (okBtn.disabled === false) return; // 已选定时先点下方确认；想换条可点列表内其它项前先重置：仍允许重开
            fold.classList.toggle('open');
            field.classList.toggle('open', fold.classList.contains('open'));
        });
        listEl.addEventListener('click', function (e) {
            var it = e.target.closest ? e.target.closest('.hcm-item') : null;
            if (it) setSel(it.getAttribute('data-id'));
        });
        modal.querySelector('#apNew').addEventListener('click', function () {
            closeMdl();
            addNewRecord();
        });
        okBtn.addEventListener('click', function () {
            if (!selId) return;
            closeMdl();
            addRecordFromHistory(selId);
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) closeMdl(); });
        try { modal.querySelector('#apField').focus(); } catch (e) { /* 忽略 */ }
    } catch (e) { /* 静默 */ }
}
// ★2026-09-03 P0：从历史记录复制创建新记录（草稿日期=今天；日期/照片不复制，其余字段填入编辑行）
function addRecordFromHistory(srcId) {
    try {
        var src = (records || []).find(function (r) { return r.id === srcId; });
        if (!src) { addNewRecord(); return; }
        addNewRecord(); // 顶部插入空白草稿并进入编辑（createdAt=今天）
        var dstId = (typeof editingId !== 'undefined') ? editingId : null;
        if (!dstId) return;
        // 等弹窗编辑表单渲染后再写值 + 高亮
        setTimeout(function () {
            applyCopyFillToForm(src, dstId);
            markCopyFilled(dstId);
            // ★2026-09-04 编辑在居中弹窗：无需滚动表格，聚焦名称输入框即可
            var nameEl = safeGetElementById('edit-name-' + dstId);
            if (nameEl && nameEl.focus) { try { nameEl.focus(); } catch (e2) { /* 忽略 */ } }
        }, 120);
    } catch (e) { /* 静默 */ }
}
// 把源记录字段写入编辑行输入框（记录对象保持未保存，点「保存」才入库）
function applyCopyFillToForm(src, dstId) {
    if (!src || !dstId) return;
    function setVal(prefix, v) {
        var el = document.getElementById(prefix + dstId);
        if (!el) return;
        el.value = (v === undefined || v === null) ? '' : String(v);
    }
    setVal('edit-name-', src.name);
    setVal('edit-elevation-', Number(src.elevation) || '');
    var diffEl = document.getElementById('edit-difficulty-' + dstId);
    if (diffEl) {
        var dff = (typeof src.difficulty === 'number') ? src.difficulty : (parseInt(src.difficulty, 10) || 3);
        diffEl.value = diffLabel(dff);   // ★2026-09-04 与编辑框文案格式统一「N级 档名」
        // ★2026-09-04 复制填充后同步难度色变量
        diffEl.style.setProperty('--dfc-light', getDifficultyColor(dff));
        diffEl.style.setProperty('--dfc-dark', getDifficultyColorDark(dff));
    }
    setVal('edit-mood-', src.mood);
    setVal('edit-weather-', src.weather);
    setVal('edit-companions-', src.companions);
    var dur = Number(src.duration) || 0;
    setVal('edit-duration-h-', dur ? Math.floor(dur / 60) : '');
    setVal('edit-duration-m-', dur ? dur % 60 : '');
    setVal('edit-distance-', Number(src.distance) || '');
}
// 填充后：被带出字段常驻靛蓝描边（保存/取消/翻页重渲染后自然消失）
function markCopyFilled(id) {
    try {
        if (!id) return;
        ['edit-name-', 'edit-elevation-', 'edit-difficulty-', 'edit-mood-', 'edit-weather-', 'edit-companions-', 'edit-duration-h-', 'edit-duration-m-', 'edit-distance-'].forEach(function (p) {
            var el = document.getElementById(p + id);
            if (el) el.classList.add('copy-filled');
        });
    } catch (e) { /* 静默 */ }
}

// ★2026-08-25 计划日期提醒：启动时检查未完成计划
// ★2026-09-05 P1-⑦ 计划过期关怀（应用内一次弹窗）：过期未完成计划 → 顺延一周 / 去处理 / 忽略；一天一次
function maybeShowOverdueCare() {
    try {
        if (typeof plannedTrips === 'undefined' || !plannedTrips || !plannedTrips.length) return;
        var now = new Date();
        var todayStr = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
        if (AppStore.getItem('hiking_overdue_care_date') === todayStr) return;
        // ★2026-09-20 复用 planDayDiff：口径与徽章/到期判定/提醒统一，不再本地重复一套日差算法
        var overdue = plannedTrips.filter(function (t) {
            var diff = planDayDiff(t.createdAt);
            return diff !== null && diff < 0;
        });
        if (!overdue.length) return;
        try { AppStore.setItem('hiking_overdue_care_date', todayStr); } catch (e0) { /* 忽略 */ }
        var label = overdue.slice(0, 3).map(function (t) { return t.name; }).join('、') + (overdue.length > 3 ? ' 等 ' + overdue.length + ' 个' : '');
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        // ★2026-09-06 定稿：只留「去处理 / 忽略」两按钮横排各半宽（顺延入口删除，过期计划改日期/删除都在计划页）；字 13px 不折行
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#f59e0b;">event_busy</span>有 ' + overdue.length + ' 个计划过期了</div>' +
            '<div class="confirm-modal-message" style="line-height:1.7;font-size:13px;">到日子没去的：<b>' + escapeHtml(label) + '</b>。<br>去计划页改个日期或删掉吧。</div>' +
            '<div style="display:flex;gap:8px;margin-top:16px;">' +
            '<button class="glass-btn ripple-effect" id="oc-go" style="flex:1;padding:10px 0;border-radius:10px;font-size:13px;font-weight:600;">去处理</button>' +
            '<button class="confirm-btn-cancel ripple-effect" id="oc-ignore" style="flex:1;padding:10px 0;border-radius:10px;font-size:13px;">忽略</button></div></div>';
        document.body.appendChild(modal);
        var closeCare = function () { try { if (modal.parentNode) document.body.removeChild(modal); } catch (e3) { /* 忽略 */ } };
        document.getElementById('oc-ignore').addEventListener('click', closeCare);
        // ★2026-09-06 顺延一键已删（用户定稿只留两按钮）：去处理 = 跳计划页自行改期/删除
        document.getElementById('oc-go').addEventListener('click', function () {
            closeCare();
            try { switchTab('plans'); } catch (e5) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) closeCare(); });
    } catch (e6) { /* 关怀弹窗失败绝不影响 */ }
}

// ★2026-09-02 改：今天+未来 3 天照旧提醒；计划过期（最近 3 天内）独立提醒，同一天不重复（不再被今天计划盖住，也不轰炸）
function checkPlannedTripReminders() {
    try {
        var now = new Date();
        var overdue = [], todayList = [], tomorrowList = [], dayAfterList = [], thirdDayList = [];
        (plannedTrips || []).forEach(function (t) {
            if (!t.name) return;
            // ★2026-09-20 复用 planDayDiff（口径与徽章/到期判定/过期关怀统一）
            var diff = planDayDiff(t.createdAt);
            if (diff === null) return;
            if (diff < 0) overdue.push({ name: t.name, diff: diff });
            else if (diff === 0) todayList.push(t.name);
            else if (diff === 1) tomorrowList.push(t.name);
            else if (diff === 2) dayAfterList.push(t.name);
            else if (diff === 3) thirdDayList.push(t.name);
        });
        // 今天 + 未来 3 天合并成一条（不重叠）
        var parts = [];
        if (todayList.length) parts.push('今天有徒步计划：' + todayList.join('、'));
        if (tomorrowList.length) parts.push('明天有徒步计划：' + tomorrowList.join('、'));
        if (dayAfterList.length) parts.push('后天有徒步计划：' + dayAfterList.join('、'));
        if (thirdDayList.length) parts.push('大后天有徒步计划：' + thirdDayList.join('、'));
        if (parts.length) { showSystemNotification('徒步计划提醒', parts.join(' · ')); return; }
        // ★2026-09-02 计划过期提醒：只提最近 3 天内过期的（太久远的不轰炸）；同一天不重复
        var recent = overdue.filter(function (o) { return o.diff >= -3; });
        if (recent.length) {
            var todayStr = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
            try {
                if (localStorage.getItem('hiking_overdue_remind_date') === todayStr) return;
                localStorage.setItem('hiking_overdue_remind_date', todayStr);
            } catch (e) { /* 存储失败仍提醒 */ }
            var tag = { '-1': '昨天', '-2': '前天', '-3': '3 天前' };
            var label = recent.map(function (o) { return o.name + '（' + (tag[o.diff] || Math.abs(o.diff) + ' 天前') + '）'; }).join('、');
            showSystemNotification('徒步计划已过期', '还没去：' + label + '。可以去完成或删除');
        }
    } catch (e) { /* 静默 */ }
}

// ★2026-08-30 不打开 App 也能提醒：把「今天及以后」的计划同步成系统闹钟（每天 08:00 原生触发通知）
// 计划每次保存（增删改/完成）都全量重设；网页版无桥自动跳过
function syncPlanAlarmsBridge() {
    try {
        if (!window.XixiFileBridge || typeof window.XixiFileBridge.syncPlanAlarms !== 'function') return;
        var todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        var list = [];
        (plannedTrips || []).forEach(function (t) {
            if (!t.createdAt || !t.name || !t.id) return;
            var d = new Date(t.createdAt);
            if (isNaN(d.getTime())) return;
            if (d.getTime() < todayStart.getTime()) return; // 过期不设（今天及以后才提醒）
            var m = ('0' + (d.getMonth() + 1)).slice(-2);
            var dd = ('0' + d.getDate()).slice(-2);
            list.push({ id: t.id, name: t.name, date: d.getFullYear() + '-' + m + '-' + dd });
        });
        window.XixiFileBridge.syncPlanAlarms(JSON.stringify(list));
    } catch (e) { /* 闹钟同步失败不影响使用 */ }
}

function renderPlannedTripsTable() {
    // ★2026-08-31 日历视图模式：直接显示日历（不渲染列表）
    if (plansViewMode === 'calendar') {
        applyPlansView();
        try { renderPlannedCalendar(); } catch (e) { /* 日历渲染失败不阻塞 */ }
        return;
    }
    if (renderPlannedTripsTableRAF) {
        cancelAnimationFrame(renderPlannedTripsTableRAF);
    }
    
    renderPlannedTripsTableRAF = requestAnimationFrame(() => {
        const tbody = safeGetElementById('plannedTripsTable');
        const emptyState = safeGetElementById('plannedEmptyState');
        const sortedTrips = getSortedPlannedTrips();
        
        // ★2026-08-12 计划页"总计"徽标（样式同柱状图右上角，颜色深浅色自适应）
        // ★2026-08-27 计划页搜索修复：有搜索词时显示匹配数（搜 1 条不再显示"总计 8 条"）
        const totalBadge = safeGetElementById('plannedTotalBadge');
        if (totalBadge) {
            const searchOn = (searchQuery || '').trim();
            totalBadge.textContent = searchOn
                ? ('匹配 ' + sortedTrips.length + ' / 共 ' + plannedTrips.length + ' 条')
                : ('总计: ' + plannedTrips.length + '条计划');
        }
        
        if (sortedTrips.length === 0) {
            if (tbody) safeSetElementContent('plannedTripsTable', '');
            if (emptyState) {
                safeSetElementStyle('plannedEmptyState', 'display', 'block');
                // ★2026-08-27 搜索无结果时区分提示
                const t = emptyState.querySelector('p');
                if (t) t.textContent = (searchQuery && searchQuery.trim())
                    ? (window.__isComposing ? '正在输入…' : '没有找到匹配的计划，换个词试试')
                    : '暂无计划徒步行，点击上方按钮添加';
            }
            const emptyPager = safeGetElementById('plannedPager');
            if (emptyPager) safeSetElementStyle('plannedPager', 'display', 'none');
            currentPagePlannedTrips = [];
            return;
        }
        
        if (emptyState) safeSetElementStyle('plannedEmptyState', 'display', 'none');
        
        // ★2026-08-26 计划分页：每页 10 条（与记录页一致）；删除越界自动回退
        const totalPages = Math.max(1, Math.ceil(sortedTrips.length / RECORD_PAGE_SIZE));
        if (plannedPage > totalPages) plannedPage = totalPages;
        if (plannedPage < 1) plannedPage = 1;
        const pageStart = (plannedPage - 1) * RECORD_PAGE_SIZE;
        const pageTrips = sortedTrips.slice(pageStart, pageStart + RECORD_PAGE_SIZE);
        currentPagePlannedTrips = pageTrips;
        
        const pager = safeGetElementById('plannedPager');
        if (pager) {
            if (sortedTrips.length > RECORD_PAGE_SIZE) {
                pager.style.display = 'flex';
                const pageInfoEl = safeGetElementById('plannedPageInfo');
                if (pageInfoEl) pageInfoEl.textContent = (pageStart + 1) + '-' + Math.min(pageStart + RECORD_PAGE_SIZE, sortedTrips.length) + ' / 共' + sortedTrips.length + '条';
                const prevBtn = safeGetElementById('plannedPagePrevBtn');
                const nextBtn = safeGetElementById('plannedPageNextBtn');
                if (prevBtn) prevBtn.style.display = plannedPage <= 1 ? 'none' : 'inline-flex';
                if (nextBtn) nextBtn.style.display = plannedPage >= totalPages ? 'none' : 'inline-flex';
            } else {
                pager.style.display = 'none';
            }
        }
        
        // ★2026-09-01 计划列表按年份分组（与记录页同款：预处理插入年份标记项，组内保持排序；条数全年统计跨页准确）
        const plannedYearTotals = {};
        (plannedTrips || []).forEach(function (pp) {
            const py = pp.createdAt ? String(new Date(pp.createdAt).getFullYear()) : '';
            if (py) plannedYearTotals[py] = (plannedYearTotals[py] || 0) + 1;
        });
        const groupedTrips = [];
        let lastPlannedYearKey = null;
        pageTrips.forEach(function (t) {
            const y = t.createdAt ? String(new Date(t.createdAt).getFullYear()) : '';
            if (y && y !== lastPlannedYearKey) {
                lastPlannedYearKey = y;
                groupedTrips.push({ __year: y, __count: plannedYearTotals[y] || 0 });
            }
            groupedTrips.push(t);
        });

        // ★2026-09-01 行内操作按钮统一：完成/编辑/保存=glass-btn 中性玻璃、删除=check-go-btn 描边红（★2026-09-23 二次收口）（与日历明细/弹窗同款；浅色下删除按钮用可见灰蓝底防白边不可见）
        const plannedDark = document.body.classList.contains('dark-mode');
        const plannedDelStyle = plannedDark
            ? 'padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;'
            : 'padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;font-weight:600;';
        // ★2026-09-01 编辑行取消按钮：尺寸硬锁定 + 浅色下可见灰蓝底（与记录页同款）
        const plannedCancelStyle = plannedDark
            ? 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
            : 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';

        const tableContent = groupedTrips.map((trip, idx) => {
            // ★2026-09-01 年份标题行（与记录页同款样式）
            if (trip && trip.__year) {
                return '<tr class="year-group-row"><td colspan="99"><div class="year-group-head">' +
                    '<span class="material-icons year-group-icon">landscape</span>' +
                    '<span class="year-group-text">' + trip.__year + '年</span>' +
                    (trip.__count ? '<span class="year-group-count">' + trip.__count + ' 次</span>' : '') +
                    '</div></td></tr>';
            }
            // ★2026-09-04 阅读态 v2：计划列表瘦身——只显示 名称 + 操作（完成/删除），海拔/难度/时间等收进详情弹窗
            const rowAnimCls2 = plannedRowsAnimated ? '' : 'table-row-animate ';
            const rowDelayStyle2 = plannedRowsAnimated ? '' : ('animation-delay: ' + (Math.min(idx, 6) * 0.05) + 's;');   // ★2026-09-07 限幅同记录表
            // ★2026-09-07 状态徽章统一走 planRelBadgeHtml：过期红/今天靛蓝/明天天蓝（v1.1.9.5 起仅过期红标，今天/明天为本次扩展，与日历明细同款）
            const _ovBadge = planRelBadgeHtml(trip.createdAt);
            // ★2026-09-20 A+B：列表视图里**已到期**的计划——图标换成「日历循环」、title 提示「完成 / 延期」，点击后弹同一个「完成 / 延期」弹窗（与日历明细同口径）
            const _planDue = planIsDueOrOverdue(trip.createdAt);
            return `
                <tr class="table-row-advanced ${rowAnimCls2}border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="planned-row-${trip.id}" style="${rowDelayStyle2}">
                    <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="planned-name-cell-${trip.id}">
                        <span class="rd-name-main">${escapeHtml(trip.name)}</span>${_ovBadge}
                </td>
                <td class="rd-time-cell" data-label="计划时间">${formatDateTime(trip.createdAt)}</td>
                <td class="p-2 text-center" data-label="操作">
                        ${plannedBatchMode ? '<input type="checkbox" class="planned-batch-check" data-id="' + trip.id + '"' + (plannedBatchSelected.has(trip.id) ? ' checked' : '') + ' title="勾选删除">' : '<button id="complete-planned-btn-' + trip.id + '" data-testid="complete-planned-button-' + trip.id + '" class="glass-btn ripple-effect" style="padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-right:4px;" title="' + (_planDue ? '完成 / 延期' : '标记为已完成') + '"><span class="material-icons" style="font-size:18px;">' + (_planDue ? 'event_repeat' : 'check') + '</span></button><button id="delete-planned-btn-' + trip.id + '" data-testid="delete-planned-button-' + trip.id + '" class="confirm-btn-cancel ripple-effect" style="' + plannedDelStyle + '" title="删除"><span class="material-icons" style="font-size:18px;">delete</span></button>'}
                    </td>
                </tr>
            `;
        }).join('');
        
        if (tbody) safeSetElementContent('plannedTripsTable', tableContent);
        plannedRowsAnimated = true; // ★2026-08-27 首次有行渲染后置位（后续不播入场动画）
        
        // 表格横向滚动归位（刷新/重渲染后回到最左）
        if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
            tbody.parentElement.parentElement.scrollLeft = 0;
        }
        
        attachPlannedTripsEventListeners();
    });
}

function attachPlannedTripsEventListeners() {
    // ★2026-08-26 只绑定当前页计划（分页后非当前页 DOM 不存在）
    const sortedTrips = (currentPagePlannedTrips && currentPagePlannedTrips.length !== undefined) ? currentPagePlannedTrips : getSortedPlannedTrips();
    
    // ★2026-08-26 计划翻页控件（onclick 覆盖式绑定：容器是静态节点，addEventListener 会累积重复触发）
    const pagerEl = safeGetElementById('plannedPager');
    if (pagerEl) {
        pagerEl.onclick = function (e) {
            const prev = e.target.closest('#plannedPagePrevBtn');
            const next = e.target.closest('#plannedPageNextBtn');
            if (!prev && !next) return;
            if (plannedEditingId) cancelPlannedEdit(); // 编辑中翻页：先取消（与点击其他行切换行为一致）
            if (prev && plannedPage > 1) { plannedPage--; renderPlannedTripsTable(); }
            else if (next) { plannedPage++; renderPlannedTripsTable(); }
        };
    }
    
    // ★2026-08-27 计划批量：勾选框 + 工具栏按钮（onclick 覆盖式绑定，防静态节点监听器累积）
    document.querySelectorAll('.planned-batch-check').forEach(function (cb) {
        cb.onchange = function (e) { togglePlannedBatchSelect(cb.getAttribute('data-id'), e); };
    });
    const pBatchBtn = safeGetElementById('plannedBatchModeBtn');
    if (pBatchBtn) pBatchBtn.onclick = togglePlannedBatchMode;
    const pBatchDelBtn = safeGetElementById('plannedBatchDeleteBtn');
    if (pBatchDelBtn) pBatchDelBtn.onclick = deletePlannedBatchSelected;
    const pBatchCancelBtn = safeGetElementById('plannedBatchCancelBtn');
    if (pBatchCancelBtn) pBatchCancelBtn.onclick = exitPlannedBatchMode;
    updatePlannedBatchBar(); // 渲染后同步工具栏状态（跨页勾选保留）
    
    sortedTrips.forEach(trip => {
        const row = safeGetElementById(`planned-row-${trip.id}`);
        const deleteBtn = safeGetElementById(`delete-planned-btn-${trip.id}`);
        
        if (row) {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.classList.contains('planned-batch-check')) {
                    return;
                }
                // ★2026-08-27 批量模式：点击行切换勾选
                if (plannedBatchMode) {
                    togglePlannedBatchSelect(trip.id, null);
                    return;
                }
                // ★2026-09-04 阅读态 v2：点行打开计划详情弹窗
                openPlannedDetailModal(trip.id);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => showDeletePlannedTripConfirmModal(trip.id, trip.name));
        }
        
        const completeBtn = safeGetElementById(`complete-planned-btn-${trip.id}`);
        if (completeBtn) {
            // ★2026-09-20 A+B：到期的计划点 ✓ 先问「完成 / 延期」（与日历明细同一个弹窗）；未到期仍走原「确认完成」。
            //   为什么不在按钮上写字：那格只有 28px 宽，写「完成/延期」会把计划名挤掉一大截。
            completeBtn.addEventListener('click', () => {
                if (planIsDueOrOverdue(trip.createdAt)) showCompleteOrDelayModal(trip.id, trip.name);
                else showConfirmCompleteModal(trip.id, trip.name);
            });
        }
    });
}
