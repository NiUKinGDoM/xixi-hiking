// ★2026-09-10 支持作者：收款码改为外置 assets 图片（随包发布、纳入 ResGuard 资源校验；base64 内联退役）
var SUPPORT_QR_WECHAT = 'assets/support-qr-wechat.jpg';
var SUPPORT_QR_ALIPAY = 'assets/support-qr-alipay.jpg';

// ★2026-09-17 搜索文本归一化：字段可能是数字/对象/null（导入的备份），直接 .toLowerCase() 会抛
//   TypeError: (r.name || "").toLowerCase is not a function → 搜索整体失效（列表不刷新）
function lowerText(v) { return String(v == null ? '' : v).toLowerCase(); }

// ★2026-09-17 年份分组 key：无效日期返回空串
//   （原先 String(new Date('x').getFullYear()) = "NaN" → 列表里会出现「NaN年」分组标题）
function yearKeyOf(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : String(d.getFullYear());
}

function getSortedRecords() {
    // ★2026-08-27 搜索过滤：记录页有搜索词时按名称匹配（方案A，找"去年去过的那座山"）
    var src = records;
    if (typeof searchQuery === 'string' && searchQuery.trim() && currentTabId === 'records') {
        var q = searchQuery.trim().toLowerCase();
        // ★2026-09-05 P0-② 全文搜索：山名 + 小日记(notes) + 心情/天气/同行人（记得内容搜不到山名也能找到）
        src = records.filter(function (r) {
            return lowerText(r.name).indexOf(q) >= 0 ||
                lowerText(r.notes).indexOf(q) >= 0 ||
                lowerText(r.mood).indexOf(q) >= 0 ||
                lowerText(r.weather).indexOf(q) >= 0 ||
                lowerText(r.companions).indexOf(q) >= 0;
        });
    }
    if (!currentSort.field) {
        return src;
    }
    
    const sortedRecords = [...src].sort((a, b) => {
        let aValue = a[currentSort.field];
        let bValue = b[currentSort.field];
        
        // 处理 createdAt 字段的时间排序
        if (currentSort.field === 'createdAt') {
            aValue = aValue ? (new Date(aValue).getTime() || 0) : 0;   // ★2026-09-17 无效日期兜底为 0（NaN 会让排序顺序错乱）
            bValue = bValue ? (new Date(bValue).getTime() || 0) : 0;
        } else if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) {
            return currentSort.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return currentSort.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });
    
    return sortedRecords;
}

let renderTableRAF = null;

// ★2026-08-27 记录/计划搜索（方案A：默认隐藏，往下滚动滑出/滚回顶部收起；有搜索词时常显；输入实时按名称过滤）
function initGlobalSearch() {
    const bar = safeGetElementById('globalSearchBar');
    const input = safeGetElementById('globalSearchInput');
    const clear = safeGetElementById('globalSearchClear');
    if (!bar || !input) return;

    function setBarVisible(show) {
        if (show) bar.classList.add('show');
        else bar.classList.remove('show');
    }
    // ★2026-08-27 显示规则（用户最终方案）：任意方向轻滑（滚动发生）即显示；1 秒不碰自动消失；
    //   有搜索词或输入框聚焦时常显；仅记录/计划页生效（★2026-08-27 底部避让分页已按用户要求移除）
    let searchHideTimer = null;
    function pokeSearchBar() {
        if (currentTabId !== 'records' && currentTabId !== 'plans') { setBarVisible(false); return; }
        if (document.activeElement === input) { setBarVisible(true); return; } // 输入中常显
        // ★2026-09-02 自动避让分页键（用户要求）：滚动接近页面底部（分页/批量条区域露出）时收起搜索框，
        //   避免悬浮条盖住"上一页/下一页/页码"；向上离开底部区域即恢复显示
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const scrolled = window.pageYOffset || document.documentElement.scrollTop || 0;
        const totalH = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        // ★2026-09-11 修复：页面不可滚动（内容不足一屏）时不做「底部避让」——
        //   否则 vh+0 >= totalH-150 恒成立，搜索框在任何操作下都不显示（记录/计划条数少时“搜索栏失效”）
        const scrollable = totalH > vh + 10;
        if (scrollable && vh + scrolled >= totalH - 150) { setBarVisible(false); clearTimeout(searchHideTimer); return; }
        if (searchQuery && searchQuery.trim()) { setBarVisible(true); return; }
        setBarVisible(true);
        clearTimeout(searchHideTimer);
        // ★2026-09-11 修复「计划页搜索栏不灵敏」：去掉可滚动页面的「1 秒后自动收起」
        //   原 8/27 方案 A 是「滚动显示 + 1 秒消失」，但切页后用户还没看清、没来得及点就被收走
        //   （日历视图有数据、页面可滚动时尤其明显 → 用户反馈「没有记录页好用」）
        //   搜索是高频主动操作 → 搜索框在记录/计划页下**常显**；页面已有 padding-bottom 110px 让位，不挡内容
    }
    // 滚动监听（rAF 节流，passive 不阻塞滚动）：任意方向滚动都触发显示
    let scrollTicking = false;
    window.addEventListener('scroll', function () {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(function () { scrollTicking = false; pokeSearchBar(); });
    }, { passive: true });

    // ★v1.1.6.3 输入法协作重构：彻底不依赖 compositionend（部分输入法/WebView 组合会丢失该事件，
    //   导致 inputComposing 卡 true、第一次输入永远不刷新——用户"删字才有搜索"）。
    //   方案：input 事件永远实时处理（拼音阶段 value=拼音→过滤为空+显示"正在输入…"，上屏后 value=中文→自动出结果）；
    //   compositionend 仅作兜底强制刷新；compositionstart 带 3 秒超时复位防标志卡死。
    let inputComposing = false;
    let inputComposingTimer = null;
    window.__isComposing = false; // 供空态文案区分"正在输入"vs"没有找到"
    function syncSearchAndRefresh() {
        searchQuery = input.value || '';
        if (clear) clear.style.display = searchQuery ? 'inline-flex' : 'none';
        clearTimeout(searchHideTimer); // 打字时取消自动消失计时器
        setBarVisible(true); // 输入时常显
        if (currentTabId === 'records') {
            if (typeof recordsViewMode !== 'undefined' && recordsViewMode === 'mountain') renderMountainBook(); // ★2026-09-03 山册模式按山名实时过滤
            else { recordPage = 1; renderTable(); }
        }
        else if (currentTabId === 'plans') {
            if (plansViewMode === 'calendar') {
                // ★2026-08-31 日历模式搜索：定位到匹配计划的日历日期并标记
                locatePlanInCalendar(searchQuery);
            } else {
                plannedPage = 1;
                renderPlannedTripsTable();
            }
        }
    }
    input.addEventListener('compositionstart', function () {
        inputComposing = true;
        window.__isComposing = true;
        clearTimeout(inputComposingTimer);
        inputComposingTimer = setTimeout(function () { // 超时兜底：输入法丢失 compositionend 时自动复位
            inputComposing = false;
            window.__isComposing = false;
            // ★v1.1.6.4 超时必须同时刷新：若上屏后 input/compositionend 全丢失，
            //   列表会卡在拼音态（删字才恢复）——超时后用当前 value 强制刷新即可恢复
            syncSearchAndRefresh();
        }, 3000);
    });
    input.addEventListener('compositionend', function () {
        inputComposing = false;
        window.__isComposing = false;
        clearTimeout(inputComposingTimer);
        syncSearchAndRefresh(); // 上屏强制同步（兜底：若上屏后 input 未触发也能出结果）
    });
    input.addEventListener('input', function () {
        // 拼音阶段也实时过滤（value=拼音→列表空+"正在输入…"），上屏后 value=中文→结果——不依赖 compositionend
        syncSearchAndRefresh();
    });
    // ★v1.1.6.4 根治：value 轮询检测——某些输入法在拼音合成期间不派发 input 事件、还会丢 compositionend，
    //   事件全断时列表纹丝不动（删字才恢复）。轮询不依赖任何事件：聚焦时每 250ms 比对 input.value，
    //   变了就刷新（最多 250ms 延迟出结果）；事件正常时事件立即刷新、轮询不重复（值没变不刷）。
    let lastSearchValue = '';
    let searchPollTimer = null;
    function stopSearchPoll() {
        if (searchPollTimer) { clearInterval(searchPollTimer); searchPollTimer = null; }
    }
    function startSearchPoll() {
        stopSearchPoll();
        lastSearchValue = input.value || '';
        searchPollTimer = setInterval(function () {
            var v = input.value || '';
            if (v !== lastSearchValue) {
                lastSearchValue = v;
                syncSearchAndRefresh();
            }
        }, 250);
    }
    input.addEventListener('focus', startSearchPoll);
    input.addEventListener('blur', stopSearchPoll);
    // ★2026-08-27 输入法弹出：搜索框精确跟随键盘。
    //   App 内（Capacitor 原生）：原生桥 window.__onImeHeight 提供真实键盘高度
    //     （adjustNothing 下 WebView 视觉视口不更新，JS 自测不到；原生监听 IME insets 可靠，含按返回键关键盘）
    //   网页版：visualViewport 动态计算。两者互斥，原生优先。
    var hasNativeIme = !!(window.Capacitor && window.Capacitor.isNativePlatform
        && window.Capacitor.isNativePlatform());
    // ★v1.1.5.10 输入法协作：拼音中间态标记 + 键盘弹出时搜索框上移 + 结果列表底部避让
    //   （列表容器加 padding-bottom 让内容可滚动到键盘上方，搜索结果不被键盘挡住）
    const containerEl = document.querySelector('.container');
    function applySearchOffset(hCss) { // hCss: 如 '45vh' 或 '500px'
        bar.style.bottom = 'calc(' + hCss + ' + env(safe-area-inset-bottom, 0px))';
        if (containerEl) containerEl.style.paddingBottom = 'calc(' + hCss + ' + 110px)';
    }
    function clearSearchOffset() {
        bar.style.bottom = '';
        if (containerEl) containerEl.style.paddingBottom = '';
    }
    window.__onImeHeight = function (px) {
        hasNativeIme = true;
        if (px > 50) { // 键盘弹出：紧贴键盘上方 + 12px
            // ★2026-08-27 v1.1.5.9 修复：原生 insets 是物理像素，CSS bottom 是逻辑像素，
            //   DPR>1 必须 ÷devicePixelRatio，否则搜索框被顶出屏幕（DPR3 时 3 倍偏差直接飞不见）
            var h = Math.round(px / (window.devicePixelRatio || 1));
            var maxH = Math.round((window.innerHeight || 800) * 0.6); // 保险：不超屏幕 60%（防个别 ROM 报值异常）
            if (h > maxH) h = maxH;
            applySearchOffset(h + 'px');
            // ★2026-08-27 五项优化：adjustNothing 下系统不自动滚动输入框 → 键盘弹出后把焦点输入框滚到键盘上方
            //   （防记录编辑行/WebDAV 输入框在屏幕下半部时被键盘盖住看不到输入内容）
            setTimeout(function () { ensureFocusedInputVisible(h); }, 350);
        } else { // 键盘收起（含按返回键关键盘）：平滑滑回默认位置（CSS 120px）
            clearSearchOffset();
        }
    };
    // ★2026-08-27 五项优化：焦点输入框若会被键盘盖住则滚动到键盘上方（adjustNothing 回归修复）
    // ★2026-08-27 v1.1.6.1：排除全局搜索框（fixed 定位且已在键盘上方，无需滚动；误滚动会把页面"抬高"）
    function ensureFocusedInputVisible(kbH) {
        try {
            var el = document.activeElement;
            if (!el) return;
            var tag = el.tagName;
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
            if (el.closest && el.closest('.global-search-box')) return; // 搜索框免滚动
            var rect = el.getBoundingClientRect();
            var vh = window.innerHeight || document.documentElement.clientHeight;
            if (rect.bottom > vh - kbH - 20) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        } catch (e) { /* 忽略滚动异常 */ }
    }
    function applyKeyboardOffset() {
        if (hasNativeIme) return; // App 内由原生桥接管
        if (window.visualViewport) {
            const kbH = (window.innerHeight || 0) - (window.visualViewport.height || 0);
            if (kbH > 50) { // 键盘弹出（网页版）：紧贴键盘上方 + 12px
                applySearchOffset(kbH + 'px');
                return;
            }
        }
        // 键盘收起/未检测到：清内联 bottom → 平滑滑回默认位置（CSS 120px）
        clearSearchOffset();
    }
    if (window.visualViewport) {
        // ★2026-08-27 resize/scroll 都直接处理（不要求聚焦）：键盘弹起跟随、收起回位——按返回键关键盘也能恢复
        window.visualViewport.addEventListener('resize', function () { applyKeyboardOffset(); });
        window.visualViewport.addEventListener('scroll', function () { applyKeyboardOffset(); });
    }
    input.addEventListener('focus', function () {
        clearTimeout(searchHideTimer); // ★2026-08-27 聚焦时取消自动消失计时器（防输入中框消失）
        setBarVisible(true);
        // ★2026-08-27 v1.1.6.1：去掉 45vh 兜底（点击瞬间"跳一下"太突兀）——等原生桥给键盘高度，
        //   bottom 0.25s 过渡自然滑到键盘上方；网页版 300ms 后 visualViewport 精确跟随
        setTimeout(applyKeyboardOffset, 300); // 等键盘稳定后再精确跟随（网页版；App 内由原生桥接管）
    });
    input.addEventListener('blur', function () {
        setTimeout(function () {
            clearSearchOffset();
        }, 200);
    });
    if (clear) clear.addEventListener('click', function () {
        searchQuery = '';
        input.value = '';
        clear.style.display = 'none';
        pokeSearchBar(); // 清空后回到「滚动显示 + 1 秒自动消失」规则
        // ★2026-08-31 日历模式清空搜索：复位日历到今天所在月
        if (plansViewMode === 'calendar') {
            calendarSearchMatches = null;
            calendarSelKey = null;
            var now = new Date();
            calendarViewYear = now.getFullYear();
            calendarViewMonth = now.getMonth();
        }
        // ★2026-09-03 山册模式清空搜索：同样要重渲染山册（原只 renderTable 渲染隐藏列表，山册残留过滤结果不还原）
        if (currentTabId === 'records') {
            if (typeof recordsViewMode !== 'undefined' && recordsViewMode === 'mountain') renderMountainBook();
            else { recordPage = 1; renderTable(); }
        }
        else if (currentTabId === 'plans') { plannedPage = 1; renderPlannedTripsTable(); }
    });
    // 搜索框内回车/失焦不收起（保持简单）；供 switchTab 切页时清空
    window.__clearGlobalSearch = function () {
        searchQuery = '';
        if (input) input.value = '';
        if (clear) clear.style.display = 'none';
        setBarVisible(false);
        // ★2026-08-31 日历模式清空搜索：复位定位状态
        if (typeof calendarSearchMatches !== 'undefined') calendarSearchMatches = null;
    };
    // ★2026-08-27 计划页搜索修复：暴露呼出函数，供 switchTab 切到记录/计划页时自动显示搜索框
    //   （计划少、页面不足一屏时无法滚动呼出，切页自动出现一次让用户知道搜索框位置）
    window.__pokeSearchBar = function () { pokeSearchBar(); };
    setBarVisible(false);
}

function renderTable() {
    if (renderTableRAF) {
        cancelAnimationFrame(renderTableRAF);
    }
    
    renderTableRAF = requestAnimationFrame(() => {
        const tbody = safeGetElementById('recordsTable');
        const emptyState = safeGetElementById('emptyState');
        const sortedRecords = getSortedRecords();
        
        updateStatistics();
        try { fillAboutSince(); } catch (e) { /* 年资失败不影响 */ }
        
        // ★2026-08-12 记录页"总计"徽标（样式同柱状图右上角，颜色深浅色自适应）
        // ★2026-08-27 计划页搜索修复：有搜索词时显示匹配数（搜 1 条不再显示"总计 8 条"）
        const totalBadge = safeGetElementById('recordsTotalBadge');
        if (totalBadge) {
            const searchOn = (searchQuery || '').trim();
            totalBadge.textContent = searchOn
                ? ('匹配 ' + sortedRecords.length + ' / 共 ' + records.length + ' 条')
                : ('总计: ' + records.length + '条记录');
        }
        
        if (sortedRecords.length === 0) {
            if (tbody) safeSetElementContent('recordsTable', '');
            if (emptyState) {
                safeSetElementStyle('emptyState', 'display', 'block');
                // ★2026-08-27 搜索无结果时区分提示（vs 本来就没记录）
                const t = emptyState.querySelector('p');
                if (t) t.textContent = (searchQuery && searchQuery.trim())
                    ? (window.__isComposing ? '正在输入…' : '没有找到匹配的记录，换个词试试')
                    : '暂无徒步记录，点击上方按钮添加';
            }
            const emptyPager = safeGetElementById('recordsPager');
            if (emptyPager) safeSetElementStyle('recordsPager', 'display', 'none');
            currentPageRecords = [];
            return;
        }
        
        if (emptyState) safeSetElementStyle('emptyState', 'display', 'none');
        
        // ★2026-08-26 分页：每页 10 条，记录超出 1 页才显示翻页控件；删除后当前页越界自动回退
        const totalPages = Math.max(1, Math.ceil(sortedRecords.length / RECORD_PAGE_SIZE));
        if (recordPage > totalPages) recordPage = totalPages;
        if (recordPage < 1) recordPage = 1;
        const pageStart = (recordPage - 1) * RECORD_PAGE_SIZE;
        const pageRecords = sortedRecords.slice(pageStart, pageStart + RECORD_PAGE_SIZE);
        currentPageRecords = pageRecords;
        
        const pager = safeGetElementById('recordsPager');
        if (pager) {
            if (sortedRecords.length > RECORD_PAGE_SIZE) {
                pager.style.display = 'flex';
                const pageInfoEl = safeGetElementById('pageInfo');
                if (pageInfoEl) pageInfoEl.textContent = (pageStart + 1) + '-' + Math.min(pageStart + RECORD_PAGE_SIZE, sortedRecords.length) + ' / 共' + sortedRecords.length + '条';
                const prevBtn = safeGetElementById('pagePrevBtn');
                const nextBtn = safeGetElementById('pageNextBtn');
                if (prevBtn) prevBtn.style.display = recordPage <= 1 ? 'none' : 'inline-flex';
                if (nextBtn) nextBtn.style.display = recordPage >= totalPages ? 'none' : 'inline-flex';
            } else {
                pager.style.display = 'none';
            }
        }
    
    // ★2026-09-01 记录列表按年份分组：预处理插入年份标记项（组内保持原排序）；条数用全年统计（跨页准确）
    const groupedRecords = [];
    let lastYearKey = null;
    const yearTotals = {};
    records.forEach(function (rr) {
        const yy = yearKeyOf(rr.createdAt);
        if (yy) yearTotals[yy] = (yearTotals[yy] || 0) + 1;
    });
    pageRecords.forEach(function (r) {
        const y = yearKeyOf(r.createdAt);
        if (y && y !== lastYearKey) { lastYearKey = y; groupedRecords.push({ __year: y, __count: yearTotals[y] || 0 }); }
        groupedRecords.push(r);
    });
    // ★2026-09-01 行内删除按钮统一：confirm-btn-cancel 灰蓝玻璃（与计划页/日历明细/弹窗同款；浅色下用可见灰蓝底防白边不可见）
    const recordDark = document.body.classList.contains('dark-mode');
    const recordDelStyle = recordDark
        ? 'padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;'
        : 'padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;font-weight:600;';
    // ★2026-09-01 编辑行取消按钮：尺寸硬锁定 + 浅色下可见灰蓝底（根治 confirm-btn-cancel 白玻璃底在浅色不可见）
    const recordCancelStyle = recordDark
        ? 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
        : 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';

    const tableContent = groupedRecords.map((record, idx) => {
        // ★2026-09-01 年份标题行（图标 + 年份 + 全年次数；★09-01 用户去掉延伸分隔线）
        if (record && record.__year) {
            return '<tr class="year-group-row"><td colspan="99"><div class="year-group-head">' +
                '<span class="material-icons year-group-icon">landscape</span>' +
                '<span class="year-group-text">' + record.__year + '年</span>' +
                (record.__count ? '<span class="year-group-count">' + record.__count + ' 次</span>' : '') +
                '</div></td></tr>';
        }
        // ★2026-09-04 阅读态 v2：列表瘦身——只显示 名称 + 操作(删除)，海拔/难度/时间等全收进详情弹窗
        //   （行内编辑表格已废弃：编辑搬进居中详情弹窗，点行=看详情，弹窗内「编辑」才进编辑态）
        const rowAnimCls = recordsRowsAnimated ? '' : 'table-row-animate ';
        const rowDelayStyle = recordsRowsAnimated ? '' : ('animation-delay: ' + (Math.min(idx, 6) * 0.05) + 's;');   // ★2026-09-07 限幅 0.3s：超 7 行后不再累加首屏延迟
        return `
            <tr class="table-row-advanced ${rowAnimCls}border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="row-${record.id}" style="${rowDelayStyle}">
                <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="name-cell-${record.id}">
                    <span class="rd-name-main">${escapeHtml(record.name)}</span>
                </td>
                <td class="rd-time-cell" data-label="记录时间">${formatDateTime(record.createdAt)}</td>
                <td class="p-2 text-center" data-label="操作">
                    ${batchMode ? '<input type="checkbox" class="batch-check" data-id="' + record.id + '"' + (batchSelected.has(record.id) ? ' checked' : '') + ' title="勾选删除">' : '<button id="delete-btn-' + record.id + '" data-testid="delete-button-' + record.id + '" class="check-go-btn ripple-effect" style="' + recordDelStyle + '" title="删除"><span class="material-icons" style="font-size:18px;">delete</span></button>'}
                </td>
            </tr>
        `;
    }).join('');
    
    if (tbody) safeSetElementContent('recordsTable', tableContent);
    recordsRowsAnimated = true; // ★2026-08-27 首次有行渲染后置位（后续不播入场动画）
    
    // 表格横向滚动归位（刷新/重渲染后回到最左）
    if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
        tbody.parentElement.parentElement.scrollLeft = 0;
    }
        
        attachEventListeners();
    });
}

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
        '<button id="rd-edit-btn" class="glass-btn ripple-effect" type="button" style="width:100%;padding:10px 0;border-radius:12px;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;">编辑这条记录</button>';
}

// 编辑态弹窗 body（与行内编辑同 id 体系：保存/照片/日期/难度/心情/天气全复用）
function recordEditBodyHTML(r) {
    var recordCancelStyle2 = (document.body.classList.contains('dark-mode'))
        ? 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
        : 'padding:6px 14px;border-radius:10px;font-size:12px;min-width:56px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';
    return '' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
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
        '<textarea id="edit-notes-' + r.id + '" class="edit-input input-glow" rows="3" maxlength="2000" placeholder="写点这天的见闻、心情、路上故事…（保存后显示在记录里）" style="width:100%;box-sizing:border-box;resize:none;border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.7;min-height:66px;font-family:inherit;">' + escapeHtml(r.notes || '') + '</textarea></div>' +
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
            '<div class="confirm-modal-content modal-fade-scale" style="max-width:440px;width:calc(100vw - 44px);box-sizing:border-box;max-height:86vh;overflow-y:auto;border-radius:20px;">' +
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
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
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
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
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

// ===== ★2026-08-20 灯箱（全屏查看 + 滑动 + 单独保存）=====
var photoLightboxEl = null;
function ensureLightbox() {
    if (photoLightboxEl) return photoLightboxEl;
    var div = document.createElement('div');
    div.id = 'photoLightbox';
    div.innerHTML =
        '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 16px;box-sizing:border-box;">' +
        // 标题栏（图片上方，跟随图片不贴屏幕顶；含页码）
        '<div style="position:relative;z-index:6;width:100%;max-width:560px;display:flex;justify-content:space-between;align-items:center;color:#fff;flex-shrink:0;">' +
        '<span id="lb-title" style="font-size:15px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
        '<span id="lb-index" style="color:rgba(255,255,255,0.55);font-size:12px;flex-shrink:0;"></span>' +
        '<button id="lb-close" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0;">✕</button>' +
        '</div>' +
        // 图片（垂直空间留给上下控件）
        '<img id="lb-img" style="position:relative;z-index:1;max-width:94%;max-height:56%;object-fit:contain;flex-shrink:1;min-height:0;transform-origin:center;will-change:transform;touch-action:pan-y;">' +
        // ★2026-09-01 缩放指示（放大时显示 ×N，还原隐藏）
        '<div id="lb-zoom-ind" style="position:absolute;top:64px;right:16px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px;display:none;z-index:5;"></div>' +
        // 底部操作栏（图片下方）
        '<div style="position:relative;z-index:6;display:flex;gap:16px;align-items:center;flex-shrink:0;">' +
        // ★2026-08-25 左右箭头改 material-icons + flex 居中（‹ › 字符不在圆正中）；保存/删除统一 padding 10px 28px
        '<button id="lb-prev" style="display:flex;align-items:center;justify-content:center;padding:0;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.22);color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;line-height:1;"><span class="material-icons" style="font-size:26px;">chevron_left</span></button>' +
        '<button id="lb-save" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:#fff;padding:10px 28px;border-radius:22px;font-size:14px;cursor:pointer;font-weight:600;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);">保存</button>' +
        '<button id="lb-del" style="background:rgba(70,15,20,0.08);border:1px solid rgba(248,113,113,0.9);color:#fecaca;padding:10px 28px;border-radius:22px;font-size:14px;cursor:pointer;font-weight:600;backdrop-filter:blur(2px) saturate(150%);-webkit-backdrop-filter:blur(2px) saturate(150%);display:none;">删除</button>' +
        '<button id="lb-next" style="display:flex;align-items:center;justify-content:center;padding:0;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.22);color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;line-height:1;"><span class="material-icons" style="font-size:26px;">chevron_right</span></button>' +
        '</div>' +
        '</div>';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;background:rgba(0,0,0,0.93);display:none;';
    document.body.appendChild(div);
    div.querySelector('#lb-close').addEventListener('click', closePhotoLightbox);
    div.querySelector('#lb-prev').addEventListener('click', function () { lbStep(-1); });
    div.querySelector('#lb-next').addEventListener('click', function () { lbStep(1); });
    div.querySelector('#lb-save').addEventListener('click', lbPrimaryAction);
    div.querySelector('#lb-del').addEventListener('click', lbDeleteCurrent);
    div.addEventListener('click', function (e) {
        // 点最外层或内部空白区域（wrapper）关闭；按钮/图片不触发
        if (e.target === div || e.target === div.firstElementChild) closePhotoLightbox();
    });
    // ★2026-09-01 灯箱手势 v2：双指捏合缩放（1~3×）、放大后单指拖动、双击放大/还原、1× 时滑动翻页
    var lbPanStart = null;
    var lbPinchDist = 0, lbPinchScale0 = 1;
    var lbTapTimer = null;
    div.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            lbPanStart = null;
            lbPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            lbPinchScale0 = lbScale;
        } else if (e.touches.length === 1) {
            lbPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: lbPanX, py: lbPanY };
        }
    }, { passive: true });
    div.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            lbScale = Math.max(1, Math.min(3, lbPinchScale0 * (d / Math.max(1, lbPinchDist))));
            lbApplyTransform();
        } else if (e.touches.length === 1 && lbScale > 1 && lbPanStart) {
            e.preventDefault();
            var t = e.touches[0];
            lbPanX = lbPanStart.px + (t.clientX - lbPanStart.x);
            lbPanY = lbPanStart.py + (t.clientY - lbPanStart.y);
            lbApplyTransform();
        }
    }, { passive: false });
    div.addEventListener('touchend', function (e) {
        var t0 = e.changedTouches[0];
        var isTap = lbPanStart && Math.abs(t0.clientX - lbPanStart.x) < 20 && Math.abs(t0.clientY - lbPanStart.y) < 20;
        if (lbScale === 1) {
            // 1×：滑动翻页
            if (lbPanStart && Math.abs(t0.clientX - lbPanStart.x) > 50) {
                if (t0.clientX - lbPanStart.x < 0) lbStep(1); else lbStep(-1);
                lbPanStart = null;
                return;
            }
            // 双击放大
            if (isTap) {
                if (lbTapTimer) { clearTimeout(lbTapTimer); lbTapTimer = null; lbToggleZoom(); }
                else { lbTapTimer = setTimeout(function () { lbTapTimer = null; }, 300); }
            }
        } else {
            // 放大中：双击还原
            if (isTap && e.touches.length === 0) {
                if (lbTapTimer) { clearTimeout(lbTapTimer); lbTapTimer = null; lbToggleZoom(); }
                else { lbTapTimer = setTimeout(function () { lbTapTimer = null; }, 300); }
            }
        }
        if (e.touches.length === 0) lbPanStart = null;
    }, { passive: true });
    photoLightboxEl = div;
    return div;
}
// ★2026-09-01 灯箱缩放状态与变换应用
var lbScale = 1, lbPanX = 0, lbPanY = 0;
function lbApplyTransform() {
    var lb = photoLightboxEl;
    if (!lb) return;
    var img = lb.querySelector('#lb-img');
    if (!img) return;
    img.style.transform = 'translate(' + lbPanX + 'px,' + lbPanY + 'px) scale(' + lbScale + ')';
    if (lbScale === 1 && lbPanX === 0 && lbPanY === 0) {
        img.style.transition = 'transform 0.15s ease-out';
    } else {
        img.style.transition = 'none';
    }
    var zi = lb.querySelector('#lb-zoom-ind');
    if (zi) {
        zi.textContent = lbScale > 1 ? (Math.round(lbScale * 10) / 10) + '×' : '';
        zi.style.display = lbScale > 1 ? 'block' : 'none';
    }
}
function lbResetZoom() {
    lbScale = 1; lbPanX = 0; lbPanY = 0;
    lbApplyTransform();
}
function lbToggleZoom() {
    if (lbScale > 1) { lbScale = 1; lbPanX = 0; lbPanY = 0; }
    else { lbScale = 2.5; }
    lbApplyTransform();
}
function openPhotoLightbox(recordId, startPid, editing) {
    var rec = records.find(r => r.id === recordId);
    if (!rec) return;
    editing = !!editing;
    // ★2026-08-25 编辑模式数据源用 editingPhotoIds（含编辑中新增未保存的照片）
    var ids = editing ? editingPhotoIds.slice() : (rec.photos || []).slice();
    if (!ids.length) return;
    var lb = ensureLightbox();
    lb._recordId = recordId;
    lb._ids = ids;
    lb._idx = ids.indexOf(startPid);
    if (lb._idx < 0) lb._idx = 0;
    lb._editing = editing;
    var delBtn = lb.querySelector('#lb-del');
    if (delBtn) delBtn.style.display = editing ? 'inline-block' : 'none';
    // ★2026-08-25 编辑模式主按钮 = 「添加」（添加照片）；查看模式 = 「保存」（保存当前图片）
    var saveBtn = lb.querySelector('#lb-save');
    if (saveBtn) saveBtn.textContent = editing ? '添加' : '保存';
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lbLoadImg();
}
function lbStep(delta) {
    var lb = photoLightboxEl;
    if (!lb || !lb._ids || !lb._ids.length) return;
    lb._idx = (lb._idx + delta + lb._ids.length) % lb._ids.length;
    lbLoadImg();
}
// ★2026-08-27 灯箱照片内存缓存（pid → blob URL，打开期间复用，关闭时释放）
let lightboxImgCache = {};
// ★2026-08-27 预加载当前±1 张（翻页秒开）
function preloadLbNeighbors(lb) {
    if (!lb || !lb._ids || !lb._ids.length) return;
    [lb._idx - 1, lb._idx + 1].forEach(function (ni) {
        if (ni < 0 || ni >= lb._ids.length) return;
        var nid = lb._ids[ni];
        if (!nid || lightboxImgCache[nid]) return;
        photoGet(nid).then(function (p) {
            if (p && p.blob) lightboxImgCache[nid] = URL.createObjectURL(p.blob);
        }).catch(function () {});
    });
}
function lbLoadImg() {
    var lb = photoLightboxEl;
    if (!lb) return;
    var img = lb.querySelector('#lb-img');
    var title = lb.querySelector('#lb-title');
    var idxEl = lb.querySelector('#lb-index');
    var rec = records.find(r => r.id === lb._recordId);
    title.textContent = rec ? rec.name : '';
    idxEl.textContent = (lb._idx + 1) + ' / ' + lb._ids.length;
    var pid = lb._ids[lb._idx];
    lb._currentPid = pid;
    lbResetZoom(); // ★2026-09-01 切图重置缩放
    // ★2026-08-27 缓存命中直接显示（翻页/后退零等待）
    if (lightboxImgCache[pid]) {
        img.src = lightboxImgCache[pid];
        img.style.opacity = '1';
    } else {
        img.style.opacity = '0.3';
        photoGet(pid).then(function (p) {
            if (lb._currentPid !== pid) return;
            if (p && p.blob) {
                var url = URL.createObjectURL(p.blob);
                lightboxImgCache[pid] = url; // 进缓存，翻回不再重读
                img.src = url;
                img.style.opacity = '1';
            }
        }).catch(function () {});
    }
    preloadLbNeighbors(lb);
}
function closePhotoLightbox() {
    var lb = photoLightboxEl;
    if (!lb) return;
    lb.style.display = 'none';
    document.body.style.overflow = '';
    lb.querySelector('#lb-img').src = '';
    // ★2026-08-27 关闭时释放缓存（blob URL 全 revoke，避免内存堆积）
    Object.keys(lightboxImgCache).forEach(function (pid) {
        try { URL.revokeObjectURL(lightboxImgCache[pid]); } catch (e) { /* 忽略 */ }
    });
    lightboxImgCache = {};
}

// ★2026-08-27 渐进增强：返回键先关弹窗（原生回调 __handleSystemBack，返回 1=已处理 / 0=无弹窗）
// ★2026-08-27 修复：去掉 MutationObserver 异步缓存（弹窗刚开瞬间可能没更新）→ 每次实时查 DOM
// ★2026-08-27 修复2：查询范围扩到 .modal-backdrop-animate（所有弹窗外层都带，含导出 exportModal/导入 importMethodModal 这类裸 id 弹窗）
// ★2026-08-27 修复3：弹窗关闭统一直接 remove（用户要求取消淡出清理，与确认弹窗一致）
// 返回 1/0 数字（原生 evaluateJavascript 回调可靠判断）
window.__handleSystemBack = function () {
    try {
        var modals = document.querySelectorAll('.confirm-modal, .modal-backdrop-animate');
        if (modals.length) { modals[modals.length - 1].remove(); return 1; }
        var lb = document.getElementById('photoLightbox');
        if (lb && lb.style && lb.style.display !== 'none') { closePhotoLightbox(); return 1; }
    } catch (e) { /* 忽略 */ }
    return 0;
};
// ★2026-08-27 防误退提示：用 App 玻璃 toast（与下载更新同款 toast-glass 体系），时长 2000ms
window.__showBackHint = function () {
    showInfoMessage('再按一次退出徒步小记', 2000);
};
// ★2026-08-25 灯箱主按钮统一入口：编辑模式=添加照片，查看模式=保存图片
function lbPrimaryAction() {
    var lb = photoLightboxEl;
    if (!lb) return;
    if (lb._editing) lbAddPhoto();
    else saveCurrentPhoto();
}
// ★2026-08-25 灯箱内添加照片（编辑模式，替代原编辑行「添加照片」按钮）：相册选图 → IndexedDB → 刷新照片区 + 灯箱跳到新照片
// ★2026-08-25 灯箱添加照片支持多选（相册多选，≤MAX_RECORD_PHOTOS 上限；添加后跳到最后一张）
function lbAddPhoto() {
    var lb = photoLightboxEl;
    if (!lb || !lb._editing) return;
    if (editingPhotoIds.length >= MAX_RECORD_PHOTOS) { showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片'); return; }
    if (!photosEnabled()) { showErrorMessage('照片存储不可用，请刷新重试'); return; }
    var remaining = MAX_RECORD_PHOTOS - editingPhotoIds.length;
    pickPhotos(false).then(function (arr) {
        if (arr.length > remaining) {
            showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片，仅添加前 ' + remaining + ' 张');
            arr = arr.slice(0, remaining);
        }
        var tasks = arr.map(function (r) {
            var pid = generateId();
            return photoPut(pid, r.blob, r.w, r.h).then(function () { editingPhotoIds.push(pid); });
        });
        return Promise.all(tasks).then(function () {
            refreshPhotoStrip(lb._recordId);
            lb._ids = editingPhotoIds.slice();
            lb._idx = lb._ids.length - 1;
            lbLoadImg();
        });
    }).catch(function (e) {
        if (e && e.message !== 'cancel' && e.message !== 'no-file' && e.message !== 'image-load-fail') {
            showErrorMessage('添加照片失败，请重试');
        }
    });
}
// ★2026-08-25 灯箱删除当前照片（仅编辑模式）：从 editingPhotoIds 移除 + IndexedDB 删 + 刷新编辑行照片区
// ★2026-08-29 加删除确认（与删除记录同款 confirm-modal 设计语言，防误删不可恢复）
function lbDeleteCurrent() {
    var lb = photoLightboxEl;
    if (!lb || !lb._currentPid || !lb._editing) return;
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #dc2626;">warning</span>
                删除照片
            </div>
            <div class="confirm-modal-message">
                确定要删除这张照片吗？删除后无法恢复。
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="lb-confirm-cancel">
                    取消
                </button>
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="lb-confirm-delete">
                    删除
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.zIndex = '300'; // ★2026-08-29 本弹窗=照片删除确认（confirm-modal 体系），内联 300 盖住灯箱 200（普通 confirm-modal 100 只在无灯箱时出现，互不干扰）
    const closeModal = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
    };
    document.getElementById('lb-confirm-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('lb-confirm-delete').addEventListener('click', () => {
        closeModal();
        var pid = lb._currentPid;
        var ei = editingPhotoIds.indexOf(pid);
        if (ei >= 0) editingPhotoIds.splice(ei, 1);
        photoDelete(pid).catch(function () {});
        lb._ids = lb._ids.filter(function (x) { return x !== pid; });
        refreshPhotoStrip(lb._recordId);
        if (!lb._ids.length) { closePhotoLightbox(); return; }
        if (lb._idx >= lb._ids.length) lb._idx = lb._ids.length - 1;
        lbLoadImg();
    });
}
// 保存当前照片：App 版走原生桥存相册（M6），网页版浏览器下载
function saveCurrentPhoto() {
    var lb = photoLightboxEl;
    if (!lb || !lb._currentPid) return;
    var pid = lb._currentPid;
    photoGet(pid).then(function (p) {
        if (!p || !p.blob) { showErrorMessage('照片读取失败'); return; }
        if (window.XixiFileBridge && typeof window.XixiFileBridge.saveImageToGallery === 'function') {
            blobToDataURL(p.blob).then(function (durl) {
                var base64 = durl.split(',')[1] || '';
                try {
                    var ok = window.XixiFileBridge.saveImageToGallery(base64, 'xixi-' + pid + '.jpg');
                    if (ok === true || ok === 'true' || ok === null) showSuccessMessage('已保存<b>缩略图</b>到相册');
                    else showErrorMessage('保存失败');
                } catch (e) { showErrorMessage('保存失败'); }
            });
            return;
        }
        var url = URL.createObjectURL(p.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'xixi-' + pid + '.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
        showSuccessMessage('已开始下载<b>缩略图</b>（非原图）');
    }).catch(function () { showErrorMessage('保存失败'); });
}

// ★2026-09-01 自定义日期时间选择弹窗（替换系统原生 picker，统一玻璃设计语言）
// 值格式保持 YYYY-MM-DDTHH:mm（与 formatDateTimeLocal 一致，保存逻辑 new Date(value) 兼容）
let dtpState = null; // { inputId, year, month(0-11), day, hour, minute }
function openDateTimePicker(inputId, currentValue) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        // 解析当前值（缺省今天此刻）
        const now = new Date();
        let y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), h = now.getHours(), mi = now.getMinutes();
        if (currentValue) {
            const m2 = String(currentValue).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);   // ★2026-09-22 兼容人话显示「2026-09-21 18:23」与 ISO
            if (m2) {
                y = parseInt(m2[1], 10); m = parseInt(m2[2], 10) - 1; d = parseInt(m2[3], 10);
                h = parseInt(m2[4], 10); mi = parseInt(m2[5], 10);
            }
        }
        dtpState = { inputId: inputId, year: y, month: m, day: d, hour: h, minute: mi };

        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        // ★2026-09-01 v3：时/分改步进器（- 数字 +），彻底告别 select 全屏原生列表；★09-01 弹窗缩小 360→320px
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">event</span>选择日期时间</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="dtp-nav" id="dtpNav"></div>' +
            '<div class="dtp-grid" id="dtpGrid"></div>' +
            '<div class="dtp-time-row">' +
            '<div class="dtp-stepper">' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpHourMinus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">remove</span></button>' +
            '<span class="dtp-num" id="dtpHourNum">00</span>' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpHourPlus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">add</span></button>' +
            '</div>' +
            '<span class="dtp-colon">:</span>' +
            '<div class="dtp-stepper">' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpMinuteMinus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">remove</span></button>' +
            '<span class="dtp-num" id="dtpMinuteNum">00</span>' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpMinutePlus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">add</span></button>' +
            '</div>' +
            '</div></div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="dtpCancel" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">取消</button>' +
            '<button class="glass-btn ripple-effect" id="dtpOk" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        document.getElementById('dtpCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('dtpOk').addEventListener('click', function () {
            try {
                const hh = String(dtpState.hour).padStart(2, '0');
                const mm = String(dtpState.minute).padStart(2, '0');
                const dd = String(dtpState.day).padStart(2, '0');
                const mo = String(dtpState.month + 1).padStart(2, '0');
                const input = document.getElementById(dtpState.inputId);
                                if (input) {
                    // ★2026-09-22 显示人话、真值存 data-iso（保存与再次解析都以 data-iso 为准）
                    var _iso = dtpState.year + '-' + mo + '-' + dd + 'T' + hh + ':' + mm;
                    input.value = _iso.replace('T', ' ');
                    input.setAttribute('data-iso', _iso);
                }
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        // ★v4 步进器：点按一次 + 长按 350ms 后连续加速（touchstart preventDefault 防与 mousedown 双触发）
        function bindStepperHold(btnId, stepFn) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            let holdTimer = null, fastTimer = null;
            function start(e) {
                try { e.preventDefault(); } catch (err) { /* 忽略 */ }
                stepFn();
                holdTimer = setTimeout(function () {
                    fastTimer = setInterval(stepFn, 90);
                }, 350);
            }
            function stop() {
                if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
                if (fastTimer) { clearInterval(fastTimer); fastTimer = null; }
            }
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('touchend', stop);
            btn.addEventListener('touchcancel', stop);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
        }
        bindStepperHold('dtpHourMinus', function () { dtpState.hour = (dtpState.hour + 23) % 24; renderDtpTime(); });
        bindStepperHold('dtpHourPlus', function () { dtpState.hour = (dtpState.hour + 1) % 24; renderDtpTime(); });
        bindStepperHold('dtpMinuteMinus', function () { dtpState.minute = (dtpState.minute + 59) % 60; renderDtpTime(); });
        bindStepperHold('dtpMinutePlus', function () { dtpState.minute = (dtpState.minute + 1) % 60; renderDtpTime(); });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
        renderDtpNav();
        renderDtpGrid();
        renderDtpTime();
    } catch (e) { /* 弹窗失败不影响编辑 */ }
}

// 月份导航（‹ 2026年9月 ›）
function renderDtpNav() {
    const nav = document.getElementById('dtpNav');
    if (!nav || !dtpState) return;
    nav.innerHTML =
        '<button type="button" class="ripple-effect icon-glass-btn" id="dtpPrev" style="width:36px;height:36px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:20px;">chevron_left</span></button>' +
        '<span style="font-size:17px;font-weight:900;flex:1;text-align:center;">' + dtpState.year + '年' + (dtpState.month + 1) + '月</span>' +
        '<button type="button" class="ripple-effect icon-glass-btn" id="dtpNext" style="width:36px;height:36px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:20px;">chevron_right</span></button>';
    document.getElementById('dtpPrev').addEventListener('click', function () {
        dtpState.month--;
        if (dtpState.month < 0) { dtpState.month = 11; dtpState.year--; }
        const maxD = new Date(dtpState.year, dtpState.month + 1, 0).getDate();
        if (dtpState.day > maxD) dtpState.day = maxD;
        renderDtpNav(); renderDtpGrid();
    });
    document.getElementById('dtpNext').addEventListener('click', function () {
        dtpState.month++;
        if (dtpState.month > 11) { dtpState.month = 0; dtpState.year++; }
        const maxD = new Date(dtpState.year, dtpState.month + 1, 0).getDate();
        if (dtpState.day > maxD) dtpState.day = maxD;
        renderDtpNav(); renderDtpGrid();
    });
}

// ★2026-09-04 难度选择弹窗（替换原生 select，统一玻璃设计语言，与心情/天气/日期同款选中态）
// prefix 传 'edit-difficulty-' 或 'edit-planned-difficulty-'，由调用方拼接 id
function openDifficultyPicker(inputId) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        const input = document.getElementById(inputId);
        const current = input ? parseInt(input.value, 10) : 3;
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">signal_cellular_alt</span>选择难度</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="df-grid" id="dfGrid"></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="dfCancel" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">取消</button>' +
            '<button class="check-go-btn ripple-effect" id="dfOk" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        let selected = current;
        const grid = document.getElementById('dfGrid');
        const DIFF_NAMES = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
        for (let d = 1; d <= 5; d++) {
            const cell = document.createElement('div');
            cell.className = 'df-opt' + (d === current ? ' selected' : '');
            cell.setAttribute('data-v', d);
            cell.style.setProperty('--df-color', getDifficultyColor(d));
            cell.innerHTML = '<span class="df-dot"></span>' + d + '级 <span class="df-name">' + DIFF_NAMES[d] + '</span>';
            cell.addEventListener('click', function () {
                selected = parseInt(this.getAttribute('data-v'), 10);
                grid.querySelectorAll('.df-opt').forEach(function (c) { c.classList.remove('selected'); });
                this.classList.add('selected');
            });
            grid.appendChild(cell);
        }
        document.getElementById('dfCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('dfOk').addEventListener('click', function () {
            try {
                const inp = document.getElementById(inputId);
                if (inp) {
                    inp.value = diffLabel(selected);   // ★2026-09-04 「N级 档名」文案（parseInt 兼容）
                    // ★2026-09-04 同步难度色变量（浅/深两套），框色即时跟随档位
                    inp.style.setProperty('--dfc-light', getDifficultyColor(selected));
                    inp.style.setProperty('--dfc-dark', getDifficultyColorDark(selected));
                }
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}

// ★2026-09-01 心情/天气选择弹窗（替换原生 select，统一玻璃设计语言，与日期选择器同款选中态）
const MOOD_OPTIONS = [['😄', '开心'], ['😌', '平静'], ['🤩', '兴奋'], ['😮‍💨', '疲惫']];
const WEATHER_OPTIONS = [['☀️', '晴'], ['🌤️', '多云'], ['☁️', '阴'], ['🌧️', '雨'], ['❄️', '雪']];
function openMoodWeatherPicker(type, recordId) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        const input = document.getElementById('edit-' + type + '-' + recordId);
        const current = input ? input.value : '';
        const opts = type === 'mood' ? MOOD_OPTIONS : WEATHER_OPTIONS;
        const title = type === 'mood' ? '选择心情' : '选择天气';
        const icon = type === 'mood' ? 'sentiment_satisfied' : 'wb_sunny';
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width: 300px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">' + icon + '</span>' + title + '</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="mwp-grid" id="mwpGrid"></div>' +
            '<div class="mwp-clear-wrap"><button type="button" class="mwp-clear-btn ripple-effect" id="mwpClear">清空</button></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="mwpCancel" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">取消</button>' +
            '<button class="check-go-btn ripple-effect" id="mwpOk" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        let selected = current;
        const grid = document.getElementById('mwpGrid');
        opts.forEach(function (pair) {
            const cell = document.createElement('div');
            cell.className = 'mwp-opt' + (pair[0] === current ? ' selected' : '');
            cell.innerHTML = '<span class="mwp-emoji">' + pair[0] + '</span>' + pair[1];
            cell.addEventListener('click', function () {
                selected = pair[0];
                grid.querySelectorAll('.mwp-opt').forEach(function (c) { c.classList.remove('selected'); });
                cell.classList.add('selected');
            });
            grid.appendChild(cell);
        });
        document.getElementById('mwpClear').addEventListener('click', function () {
            selected = '';
            grid.querySelectorAll('.mwp-opt').forEach(function (c) { c.classList.remove('selected'); });
        });
        document.getElementById('mwpCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('mwpOk').addEventListener('click', function () {
            try {
                const inp = document.getElementById('edit-' + type + '-' + recordId);
                if (inp) inp.value = selected;
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}

// 日期网格（周一开头，今天描边，选中靛蓝）
function renderDtpGrid() {
    const grid = document.getElementById('dtpGrid');
    if (!grid || !dtpState) return;
    const y = dtpState.year, m = dtpState.month;
    const firstDay = new Date(y, m, 1).getDay();
    const lead = (firstDay === 0 ? 6 : firstDay - 1); // 周一开始
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();
    let html = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="dtp-week">' + w + '</div>'; }).join('');
    for (let i = 0; i < lead; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDateStr = y + '-' + m + '-' + day;
        const cls = ['dtp-cell'];
        if (cellDateStr === todayStr) cls.push('today');
        if (day === dtpState.day) cls.push('selected');
        html += '<div class="' + cls.join(' ') + '" data-day="' + day + '">' + day + '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.dtp-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
            dtpState.day = parseInt(cell.getAttribute('data-day'), 10);
            grid.querySelectorAll('.dtp-cell.selected').forEach(function (c) { c.classList.remove('selected'); });
            cell.classList.add('selected');
        });
    });
}

// 时/分步进器数字显示（v3：不再用 select，避免原生全屏列表）
function renderDtpTime() {
    if (!dtpState) return;
    const hourNum = document.getElementById('dtpHourNum');
    const minNum = document.getElementById('dtpMinuteNum');
    if (hourNum) hourNum.textContent = String(dtpState.hour).padStart(2, '0');
    if (minNum) minNum.textContent = String(dtpState.minute).padStart(2, '0');
}

function saveRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    const nameInput = document.getElementById(`edit-name-${id}`);
    const difficultyInput = document.getElementById(`edit-difficulty-${id}`);
    const elevationInput = document.getElementById(`edit-elevation-${id}`);
    const createdAtInput = document.getElementById(`edit-created-at-${id}`);
    
    if (!nameInput.value.trim()) {
        nameInput.classList.add('border-red-500');
        return;
    }
    
    nameInput.classList.remove('border-red-500');   // ★2026-09-10 校验通过清红边（原来只加不删）
    record.name = nameInput.value.trim();
    record.difficulty = Math.min(5, Math.max(1, parseInt(difficultyInput.value, 10) || 3));   // ★2026-09-17 NaN 兜底（空值会存成 NaN → JSON 变 null → 下轮被误删）★2026-09-20 与计划路径统一补 1~5 钳制
    record.elevation = Math.max(0, parseInt(elevationInput.value) || 0); // ★2026-08-29 与新增记录一致：负数防护
    
    // 保存记录时间
    if (createdAtInput && createdAtInput.value) {
        record.createdAt = new Date(createdAtInput.dataset.iso || createdAtInput.value).toISOString();   // ★2026-09-22 优先用 data-iso（显示是人话）
    }
    
    // ★2026-08-20 照片：编辑结果写回记录
    record.photos = editingPhotoIds.slice();
    editingPhotoIds = [];
    
    // ★2026-08-21 v1.1.1.6 扩展信息：心情/天气/同行人（可选）
    const moodInput = document.getElementById(`edit-mood-${id}`);
    const weatherInput = document.getElementById(`edit-weather-${id}`);
    const companionsInput = document.getElementById(`edit-companions-${id}`);
    if (moodInput) record.mood = moodInput.value.trim() || '';   // ★五项优化⑤：与 weather 一致 trim（防意外空格）
    if (weatherInput) record.weather = weatherInput.value.trim();
    if (companionsInput) record.companions = companionsInput.value.trim();
    // ★2026-09-05 小日记（notes）：空则删键保持干净（老记录无 notes 不占存储）
    const notesInput = document.getElementById(`edit-notes-${id}`);
    if (notesInput) {
        const nn = notesInput.value.replace(/^\s+|\s+$/g, '');
        if (nn) record.notes = nn; else delete record.notes;
    }

    // ★2026-09-01 里程/用时（可选）：distance=km 数字（保留两位小数），duration=分钟（时/分双框换算）
    const distanceInput = document.getElementById(`edit-distance-${id}`);
    // ★2026-09-20 距离补下限/上限（此前只有 `|| 0` → 负数能进库；海拔/用时早已有防护）
    if (distanceInput) record.distance = Math.min(10000, Math.max(0, Math.round((parseFloat(distanceInput.value) || 0) * 100) / 100));
    const durationHInput = document.getElementById(`edit-duration-h-${id}`);
    const durationMInput = document.getElementById(`edit-duration-m-${id}`);
    if (durationHInput || durationMInput) {
        // ★2026-09-20 时长加上限：小时框 0~23（与 input max 一致）、总时长 ≤1440 分钟（24 小时）
        const hh = Math.min(23, Math.max(0, parseInt((durationHInput ? durationHInput.value : '0'), 10) || 0));
        const mm = Math.max(0, parseInt((durationMInput ? durationMInput.value : '0'), 10) || 0);
        record.duration = Math.min(1440, hh * 60 + mm);
    }

    // ★2026-08-26 最后修改时间：每次保存记录都更新（合并取新用，区分于徒步日期 createdAt）
    record.updatedAt = new Date().toISOString();
    
    editingId = null;
    updateStatistics();
    saveToStorage();
    thumbCacheClear(); // ★2026-08-27 照片可能增删：缩略图缓存全清，下次渲染重新读
    renderTable();
    // ★2026-09-04 弹窗内保存成功 → 关闭详情弹窗（表格已刷新）
    if (recordDetailModalEl) {
        closeRecordDetailModal();
    }
    triggerHaptic(15); // ★2026-08-27 渐进增强：保存成功轻震动反馈
    checkMilestones(); // ★2026-09-14 新增：保存后判定里程碑（达成弹一次，已达成不再弹）
}

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    recordPage = 1; // ★2026-08-26 排序变化回到第一页
    updateSortIcons();
    renderTable();
}

function updateSortIcons() {
    const sortIcons = {
        name: document.getElementById('sort-icon-name'),
        difficulty: document.getElementById('sort-icon-difficulty'),
        elevation: document.getElementById('sort-icon-elevation'),
        createdAt: document.getElementById('sort-icon-created-at')
    };
    
    Object.keys(sortIcons).forEach(key => {
        if (sortIcons[key]) {
            sortIcons[key].classList.remove('active');
            if (currentSort.field === key) {
                sortIcons[key].classList.add('active');
                sortIcons[key].textContent = currentSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
            } else {
                sortIcons[key].textContent = 'unfold_more';
            }
        }
    });
}

// v1.4.12.9：顶栏标题恢复可编辑——点击标题/铅笔图标弹窗修改，保存到本地
function showEditTitleModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    const titleEl = document.getElementById('appTitle');
    const currentTitle = titleEl ? titleEl.textContent : 'XXの徒步小记';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">edit</span>
                编辑标题
            </div>
            <input type="text" id="titleEditInput" class="edit-input" style="width: 100%; margin: 14px 0 4px;" maxlength="20" placeholder="输入新标题">
            <div class="confirm-modal-message" style="margin-top: 6px;">最多 20 个字符</div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="title-edit-cancel">取消</button>
                <button class="confirm-btn-delete ripple-effect" id="title-edit-save" style="background: #4f46e5; border-color: #4f46e5;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const input = document.getElementById('titleEditInput');
    input.value = currentTitle;
    // 2026-08-11 用户要求：点击可编辑栏不直接弹输入法——不自动聚焦，用户点输入框才弹键盘

    const closeModal = () => { document.body.removeChild(modal); };

    document.getElementById('title-edit-cancel').addEventListener('click', closeModal);
    document.getElementById('title-edit-save').addEventListener('click', () => {
        const newTitle = input.value.trim();
        if (!newTitle) { showErrorMessage('标题不能为空'); return; }
        saveAppTitle(newTitle);
        closeModal();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('title-edit-save').click();
        if (e.key === 'Escape') closeModal();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

async function saveAppTitle(title) {
    try {
        await AppStore.setItem(APP_TITLE_KEY, { title });
        const titleEl = document.getElementById('appTitle');
        if (titleEl) titleEl.textContent = title;
        showSuccessMessage('标题已更新');
    } catch (e) {
        console.error('保存标题失败:', e);
        showErrorMessage('保存失败，请重试');
    }
}

// v1.4.12.10：区块标题统一弹窗编辑（统计/记录/计划/设置），与顶栏标题同一套交互

/* 2026-08-11 数据管理说明弹窗（i 标识点击显示） */
function showDataInfoModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;width:calc(100vw - 44px);box-sizing:border-box;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">info</span>
                数据管理说明
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;margin-bottom:16px;">   <!-- ★2026-09-06 内容与按钮间距拉开（原 2px 贴太近） -->
                <!-- ★2026-09-03 排版统一：大段文字改分组条目（小图标+标题+12px 说明，深浅色自适应 dmi-* 类） -->
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">inventory_2</span>
                    <div style="min-width:0;"><div class="dmi-title">完整备份 / 纯数据</div>
                    <div class="dmi-body">导出「完整备份」是压缩包（记录 + 计划 + 照片）；「纯数据」不含照片。数据只保存在本机，建议定期导出。</div></div>
                </div>
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">merge</span>
                    <div style="min-width:0;"><div class="dmi-title">恢复 / 合并规则</div>
                    <div class="dmi-body">同一条记录按最后修改时间取新：改过的字段更新、没改的保持；空字段自动用另一份补全；本地独有的记录合并保留。</div></div>
                </div>
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">cloud_done</span>
                    <div style="min-width:0;"><div class="dmi-title">自动同步</div>
                    <div class="dmi-body">开启后数据变更自动上传云端备份，本机数据多一层保险；云端备份会带上你的网盘配置（含加密密码），换机下载恢复一键配好。</div></div>
                </div>
                <!-- ★2026-09-06 由导出弹窗迁入（用户要求：说明统一收进数据管理 i）：本地自动备份说明 -->
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">schedule</span>
                    <div style="min-width:0;"><div class="dmi-title">本地自动备份</div>
                    <div class="dmi-body">每满 7 天，App 会自动存一份纯数据备份到系统「下载」目录，无需手动操作（手机空间不足或网页版不自动备份）。</div></div>
                </div>
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="data-info-close">知道了</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('data-info-close');
    const closeModal = () => document.body.removeChild(modal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

// ★2026-09-08 隐私政策弹窗（关于卡「隐私政策」入口；README 隐私段整理成一屏，dmi-* 条目排版复用深浅自适应；含崩溃上报联网说明）
// ★2026-09-09 免责声明：记录工具定位 + 户外安全提示（不引导野山/风险自担）
function showDisclaimerModal() {
    closeOpenModals();
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px;width:calc(100vw - 44px);box-sizing:border-box;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">hiking</span>
                免责声明
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;max-height:55vh;overflow-y:auto;margin-bottom:16px;">
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">hiking</span>
                        <div style="min-width:0;"><div class="dmi-title">一、服务性质：记录工具，不是领队</div>
                            <div class="dmi-body">本应用是一款个人徒步记录工具，用于记录行程、心情与照片。它<b>不提供</b>路线规划、导航、定位救援、天气预警、医疗建议或任何形式的户外安全指导，<b>不能替代</b>专业向导、领队、地图与救援服务——它不是领队，也不是救生员。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">fact_check</span>
                        <div style="min-width:0;"><div class="dmi-title">二、记录数据仅供参考</div>
                            <div class="dmi-body">记录中的海拔、距离、用时、难度、天气等均由你自行填写，本应用不做测量与校验，可能存在误差；里程碑、统计与山册展示均基于上述自填数据推算。<b>全部数据仅供个人回顾</b>，不构成专业测量结果，不可用于测绘、赛事认证、保险理赔或任何法律用途。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">signpost</span>
                        <div style="min-width:0;"><div class="dmi-title">三、请走正规路线</div>
                            <div class="dmi-body">本应用<b>不引导、也不建议</b>前往未开发的野山、自然保护区或禁止进入的区域。出行请选择正规开放路线，遵守当地法律法规及景区、保护区管理规定，服从现场管理与警示。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">wb_sunny</span>
                        <div style="min-width:0;"><div class="dmi-title">四、出发前做好准备</div>
                            <div class="dmi-body">请先查看天气预报与封山公告，结伴而行，带足饮水、照明与充电设备；不逞强、不夜行、不涉险，量力而行。户外安全永远由你本人第一位负责。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">warning</span>
                        <div style="min-width:0;"><div class="dmi-title">五、风险自担</div>
                            <div class="dmi-body">户外活动存在固有且无法完全避免的风险。你应在出行前自行评估身体状况、路线难度、天气与装备情况，未成年人须由监护人陪同。<b>因你的出行行为或判断所产生的一切后果，由你自行承担。</b></div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">backup</span>
                        <div style="min-width:0;"><div class="dmi-title">六、数据安全与备份责任</div>
                            <div class="dmi-body">你的数据默认仅存于本机。卸载应用、清除数据、设备损坏或丢失均可能导致数据丢失；云备份依赖你自行配置的第三方网盘，其可用性、容量与数据完整性由该服务商负责。请定期导出备份并妥善保存——<b>开发者无法找回你未备份的数据</b>。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">cloud_off</span>
                        <div style="min-width:0;"><div class="dmi-title">七、第三方服务</div>
                            <div class="dmi-body">应用内的更新检查依赖 GitHub，云备份依赖你选择的 WebDAV 网盘。上述服务的可用性、内容变更、服务中断或数据处理行为不由开发者控制，开发者不就此承担赔偿责任。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">balance</span>
                        <div style="min-width:0;"><div class="dmi-title">八、责任限制</div>
                            <div class="dmi-body">在适用法律允许的最大范围内，开发者不对因使用或无法使用本应用所致的间接、附带或衍生损失（包括但不限于数据丢失、行程延误、人身或财产损害）承担赔偿责任。<b>本条不排除或限制依法不得排除、限制的责任</b>；如相关法律另有强制性规定，以该法律规定为准。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">copyright</span>
                        <div style="min-width:0;"><div class="dmi-title">九、知识产权</div>
                            <div class="dmi-body">本应用的界面设计、图标与程序代码归开发者所有；你在应用内创建的记录、备注与照片<b>归你本人所有</b>。请勿对本应用进行反向工程、二次打包或用于商业用途。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">gavel</span>
                        <div style="min-width:0;"><div class="dmi-title">十、条款变更与适用法律</div>
                            <div class="dmi-body">本声明可能随版本更新调整，更新后在本页展示；你继续使用本应用即视为接受更新后的条款，如不同意请停止使用并卸载。本声明适用<b>中华人民共和国法律</b>，因本声明或使用本应用发生争议的，双方应友好协商解决；协商不成的，可依法向有管辖权的人民法院提起诉讼。生效日期：2026-09-18。</div></div>
                    </div>
            </div>
            <div class="confirm-modal-buttons">
                <button id="disclaimer-close" class="ripple-effect confirm-btn-cancel">我知道了</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#disclaimer-close').addEventListener('click', function () { if (modal.parentNode) document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal && modal.parentNode) document.body.removeChild(modal); });
}

// ★2026-09-18 同意留存（隐私政策 / 免责声明）
//   立法本意：用户「明确同意」必须有痕迹 —— 显式勾选 + 本机记录（条款版本 + 时间戳）。
//   ★改动政策正文时必须同步 bump LEGAL_VERSION（与正文「生效日期」保持一致）→ 会自动重新征求同意。
const LEGAL_VERSION = '2026-09-18';
const LEGAL_AGREE_KEY = 'hiking_legal_agree';
let _legalPromptedThisSession = false;   // 启动时已主动弹过（同一会话不再打扰）
let _legalTabPrompted = false;           // 首次进设置页已弹过

function getLegalAgreement() {
    const rec = AppStore.getItem(LEGAL_AGREE_KEY);
    return (rec && typeof rec === 'object') ? rec : null;
}
// 已同意、且同意的是「当前版本」的条款
function hasAgreedLegal() {
    const rec = getLegalAgreement();
    return !!(rec && rec.at && rec.version === LEGAL_VERSION);
}
// 记录同意：写入条款版本 + 本地时间戳（ISO 8601，便于日后查证）
function saveLegalAgreement() {
    const rec = { version: LEGAL_VERSION, at: new Date().toISOString() };
    AppStore.setItem(LEGAL_AGREE_KEY, rec);
    return rec;
}
// 时间戳 → 本地可读时间（YYYY-MM-DD HH:mm）
function formatLegalStamp(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
}
// 征求同意（Promise<boolean>）。★防 Promise 永挂：弹窗被外部 closeOpenModals() 移除时也 resolve(false)
function showLegalConsentModal() {
    return new Promise(function (resolve) {
        if (document.getElementById('legalConsentModal')) { resolve(false); return; }
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.id = 'legalConsentModal';
        // ★2026-09-18 声明为常驻弹窗：查看条款时不会被条款弹窗内部的 closeOpenModals() 清掉
        modal.setAttribute('data-persist', '1');
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width:340px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">verified_user</span> 使用前请确认</div>' +
            '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;max-height:55vh;overflow-y:auto;margin-bottom:16px;">' +
                '<div class="dmi-group">' +
                    '<span class="material-icons dmi-ic">shield</span>' +
                    '<div style="min-width:0;"><div class="dmi-title">关于你的数据</div>' +
                    '<div class="dmi-body">记录与照片只保存在本机；只有你主动配置网盘后，数据才会同步到<b>你自己的</b>账号。本应用没有开发者服务器，不收集、不上传任何使用数据。</div></div>' +
                '</div>' +
                '<div class="dmi-group">' +
                    '<span class="material-icons dmi-ic">description</span>' +
                    '<div style="min-width:0;"><div class="dmi-title">请先阅读以下条款</div>' +
                    '<div class="dmi-body">' +
                        '<span class="legal-link" id="legalOpenPrivacy">《隐私政策》</span>：数据存在哪、联网做什么、你有哪些权利。<br>' +
                        '<span class="legal-link" id="legalOpenDisclaimer">《免责声明》</span>：它是记录工具不是领队，户外风险与备份责任由你自负。' +
                    '</div></div>' +
                '</div>' +
                '<label class="chk-row" style="margin-top:6px;">' +
                    '<input type="checkbox" id="legalAgreeChk">' +
                    '<span>我已阅读并同意<b>《隐私政策》</b>与<b>《免责声明》</b></span>' +
                '</label>' +
                '<div class="legal-stamp">勾选并同意后，会在本机记录同意时间与条款版本，便于日后查证。</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
                '<button class="confirm-btn-cancel ripple-effect" id="legalLater">暂不同意</button>' +
                '<button class="check-go-btn ripple-effect" id="legalAgree">同意并继续</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);

        const chk = modal.querySelector('#legalAgreeChk');
        let done = false;
        const finish = function (v) {
            if (done) return;
            done = true;
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            resolve(v);
        };
        // 兜底：被外部 closeOpenModals() 移除时也 resolve（否则调用方 await 永挂）
        const obs = new MutationObserver(function () {
            if (done) return;
            if (!modal.parentNode) { obs.disconnect(); done = true; resolve(false); }
        });
        obs.observe(document.body, { childList: true });

        // 读条款：本弹窗带 data-persist，条款弹窗内部的 closeOpenModals() 会跳过它
        //   → 条款弹窗直接叠在上层，关闭后自然回到本弹窗（勾选状态原样保留，无需任何挂回逻辑）
        modal.querySelector('#legalOpenPrivacy').addEventListener('click', function () { showPrivacyPolicyModal(); });
        modal.querySelector('#legalOpenDisclaimer').addEventListener('click', function () { showDisclaimerModal(); });

        modal.querySelector('#legalAgree').addEventListener('click', function () {
            if (!chk.checked) {
                // 未勾选：高亮提示（不用 disabled 态，避免依赖缺失的禁用样式）
                chk.style.outline = '2px solid rgba(220, 38, 38, 0.5)';
                chk.style.outlineOffset = '2px';
                setTimeout(function () { chk.style.outline = ''; chk.style.outlineOffset = ''; }, 1200);
                if (typeof showToast === 'function') showToast('请先勾选「我已阅读并同意」', 'warn');
                return;
            }
            saveLegalAgreement();
            if (typeof showToast === 'function') showToast('已记录你的同意', 'success');
            finish(true);
        });
        modal.querySelector('#legalLater').addEventListener('click', function () { finish(false); });
        modal.addEventListener('click', function (e) { if (e.target === modal) finish(false); });
    });
}
// 按需征求：已同意直接返回；否则弹窗（每个入口每会话最多主动弹一次）
function maybePromptLegalConsent(fromTab) {
    if (hasAgreedLegal()) return Promise.resolve(true);
    if (fromTab) {
        if (_legalTabPrompted) return Promise.resolve(false);
        _legalTabPrompted = true;
    } else {
        if (_legalPromptedThisSession) return Promise.resolve(false);
        _legalPromptedThisSession = true;
    }
    return showLegalConsentModal();
}

function showPrivacyPolicyModal() {
    closeOpenModals();
    // ★2026-09-18 同意留存：已同意则展示「同意时间 + 条款版本」，让记录可见可查
    const _ag = getLegalAgreement();
    const AGREEMENT_STAMP = (_ag && _ag.at)
        ? '<div class="legal-stamp">你已于 ' + escapeHtml(formatLegalStamp(_ag.at)) + ' 同意本政策（条款版本 ' + escapeHtml(String(_ag.version || '-')) + '）</div>'
        : '';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px;width:calc(100vw - 44px);box-sizing:border-box;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">security</span>
                隐私政策
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;max-height:55vh;overflow-y:auto;margin-bottom:16px;">
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">info</span>
                        <div style="min-width:0;"><div class="dmi-title">适用范围与生效</div>
                            <div class="dmi-body">本政策适用于「XiXiの徒步小记」Android 客户端与网页版（以下统称<b>本应用</b>）。生效日期：2026-09-18；最近更新：2026-09-18。本政策随版本迭代更新，重大变更会在应用内提示。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">storage</span>
                        <div style="min-width:0;"><div class="dmi-title">一、数据存储位置与期限</div>
                            <div class="dmi-body">本应用是<b>纯本地工具</b>：记录、计划、备注、照片全部保存在你的设备上（网页版为浏览器本地存储），本应用<b>不设账号体系</b>，不收集、不上传你的个人身份信息、行为数据、设备标识与位置信息，也未接入任何统计、广告或推送 SDK。存储期限由你决定——卸载应用或使用「抹掉所有足迹」即可清除本机全部数据。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">cloud_done</span>
                        <div style="min-width:0;"><div class="dmi-title">二、云备份（可选）</div>
                            <div class="dmi-body">仅当你主动在设置中配置 WebDAV 后，数据才会同步到<b>你本人的</b>网盘账号。服务器地址、账号与应用密码仅保存于本机，采用加密存储，任何界面均不明文展示；与网盘的通信全程 HTTPS，且在你的设备与网盘服务商之间直接进行——<b>本应用没有开发者服务器，数据不经过任何中转</b>。备份文件中可包含一份加密后的网盘配置（便于换机一键恢复），请妥善保管备份文件，避免提供或发送给他人。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">share</span>
                        <div style="min-width:0;"><div class="dmi-title">三、信息共享、转让与公开披露</div>
                            <div class="dmi-body">本应用<b>不会</b>向任何第三方出售、出租、共享、转让或公开披露你的数据，也不存在与「合作方共享数据」的情形。开发者不持有你的数据，因此任何第三方（含广告商、数据服务商）均无法通过本应用获取你的记录与照片。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">wifi</span>
                        <div style="min-width:0;"><div class="dmi-title">四、联网行为与第三方服务</div>
                            <div class="dmi-body">① <b>检查更新</b>：请求 GitHub Releases 接口查询最新版本号，仅产生常规网络请求信息（IP、User-Agent），由 GitHub 依其自身隐私政策处理；② <b>云备份</b>：依赖你自行选择的 WebDAV 服务商（如坚果云），其数据处理行为适用该服务商的条款与政策；③ <b>崩溃报告</b>：仅在已配置网盘的前提下，应用异常时上传一份不含记录与照片的诊断信息（版本号、错误内容、时间），用于定位问题。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">security</span>
                        <div style="min-width:0;"><div class="dmi-title">五、数据安全措施</div>
                            <div class="dmi-body">本应用采用以下措施保护你的数据：本地数据随应用沙箱隔离；网盘凭据加密存储；Android 包经过签名校验，防止被篡改或替换安装；不申请通讯录、短信、通话记录、精确位置等与功能无关的权限。同时请理解：<b>任何存储方式都无法保证绝对安全</b>，请定期导出备份并自行妥善保存。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">rule</span>
                        <div style="min-width:0;"><div class="dmi-title">六、你的权利</div>
                            <div class="dmi-body"><b>查阅与更正</b>：全部数据在应用内可见、可改；<b>导出与迁移</b>：随时「导出完整备份」带走记录与照片；<b>删除</b>：单条删除、批量删除、抹掉所有足迹（云端旧备份需你自行在网盘删除）；<b>撤回同意</b>：关闭自动同步、解绑网盘账号或卸载应用。上述权利<b>均无需向开发者申请</b>，你在应用内即可直接行使。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">child_care</span>
                        <div style="min-width:0;"><div class="dmi-title">七、未成年人保护</div>
                            <div class="dmi-body">本应用不面向 14 周岁以下儿童单独提供服务。未成年人应在监护人指导下使用；户外活动请务必由成年人陪同，并由监护人承担相应监护责任。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">key</span>
                        <div style="min-width:0;"><div class="dmi-title">八、权限清单与用途</div>
                            <div class="dmi-body"><b>通知</b>：计划与备份提醒；<b>精确闹钟</b>：计划当天早上提醒；<b>开机启动</b>：重启手机后恢复你的计划闹钟；<b>震动</b>：点按反馈；<b>安装应用</b>：协助安装已下载的新版本；<b>存储写入</b>（仅旧版安卓）：把备份写入「下载」目录；<b>照片选择</b>：为记录添加照片。以上权限均可拒绝，拒绝仅导致对应功能不可用，不影响其余功能。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">update</span>
                        <div style="min-width:0;"><div class="dmi-title">九、政策更新</div>
                            <div class="dmi-body">本政策随功能迭代更新，最新内容始终在本页展示。若更新涉及你的权利或数据处理方式的重大变化，本应用会在应用内以提示方式告知。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">gavel</span>
                        <div style="min-width:0;"><div class="dmi-title">十、适用法律与联系方式</div>
                            <div class="dmi-body">如对本政策有疑问、意见或投诉，可通过「关于应用 → GitHub」提交 Issue，或经应用内反馈渠道联系开发者，我们将在合理期限内答复。本政策的订立、效力、解释与争议解决均适用<b>中华人民共和国法律</b>。</div></div>
                    </div>
                ${AGREEMENT_STAMP}
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="privacy-close">我知道了</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('privacy-close');
    const closeModal = function () { if (modal.parentNode) document.body.removeChild(modal); };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
}

// ★2026-09-08 保存二维码（App 原生 MediaStore 桥优先存相册；网页版 a[download] 降级）
function saveSupportQr(src, label) {
    var isData = String(src || '').indexOf('data:') === 0;
    var fileName = 'xixi-support-' + (label === '微信收款' ? 'wechat' : 'alipay') + '.jpg';
    function hasBridge() {
        return !!(window.XixiFileBridge && typeof window.XixiFileBridge.saveQrToGallery === 'function');
    }
    function saveBase64(dataUrl) {
        var raw = String(dataUrl || '').replace(/^data:image\/[a-z+]+;base64,/, '');
        try {
            var ok = window.XixiFileBridge.saveQrToGallery(raw);
            if (ok === true || ok === 'true' || ok === null) showSuccessMessage('已保存到系统相册');
            else showErrorMessage('保存失败，可长按图片识别或截图保存');
        } catch (e) { showErrorMessage('保存失败，可长按图片识别或截图保存'); }
    }
    function isIOSWeb() {
        try {
            var ua = navigator.userAgent || '';
            var iOS = /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Macintosh') >= 0 && 'ontouchend' in document);
            var noDl = typeof document.createElement('a').download === 'undefined';
            return iOS || noDl;
        } catch (e) { return false; }
    }
    function webDownload(href) {
        // ★2026-09-10 iOS 网页适配：Safari 不支持 a[download] → 改为提示长按图片保存（存储到照片）
        if (isIOSWeb()) { if (typeof showInfoMessage === 'function') showInfoMessage('长按二维码图片即可保存到相册'); return; }
        try {
            var a = document.createElement('a');
            a.href = href; a.download = fileName;
            document.body.appendChild(a); a.click();
            setTimeout(function () { a.remove(); }, 300);
            showSuccessMessage('图片已开始下载，存好后去扫一扫识别');
        } catch (e2) { showErrorMessage('保存失败，请长按图片保存'); }
    }
    if (isData) { if (hasBridge()) saveBase64(src); else webDownload(src); return; }
    // 外置图片：App 内 fetch 读成 base64 走相册桥；失败降级提示长按保存
    if (hasBridge()) {
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
            return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
        }).then(function (dataUrl) { saveBase64(dataUrl); })
          .catch(function () { showErrorMessage('保存失败，可长按图片识别或截图保存'); });
    } else {
        webDownload(src);
    }
}

// ★2026-09-08 支持作者弹窗（设置-关于卡「支持作者」入口）：step1 渠道选择+推荐金额 → step2 收款码大图+保存相册
function showSupportModal() {
    closeOpenModals();
    var modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    var dark = document.body.classList.contains('dark-mode');
    var bodyTxt = dark ? '#cbd5e1' : '#334155';
    var subTxt = dark ? '#94a3b8' : '#64748b';
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width: 330px;width:calc(100vw - 44px);box-sizing:border-box;">' +
        '<div class="confirm-modal-title">支持作者</div>' +
        '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;margin-bottom:14px;">' +
        '<div style="font-size:13px;color:' + bodyTxt + ';line-height:1.7;">徒步小记是 XiXi 亲手做的小软件，完全免费、没有广告。如果你用得开心，欢迎请作者喝杯奶茶支持一下——纯自愿，不付费也拥有全部功能。</div>' +
        '</div>' +
        '<div class="confirm-modal-buttons" style="gap:8px;">' +
        '<button id="support-wx" class="ripple-effect" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 0;border-radius:12px;font-size:13px;font-weight:700;color:#047857;background:rgba(7,193,96,0.14);border:1px solid rgba(7,193,96,0.5);"><span class="material-icons" style="font-size:16px;">chat</span>微信</button>' +
        '<button id="support-ali" class="ripple-effect" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 0;border-radius:12px;font-size:13px;font-weight:700;color:#0057b8;background:rgba(22,119,255,0.14);border:1px solid rgba(22,119,255,0.5);"><span class="material-icons" style="font-size:16px;">account_balance_wallet</span>支付宝</button>' +
        '<button class="confirm-btn-cancel ripple-effect" id="support-close" style="flex:0 0 auto;padding:9px 16px;">关闭</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    function toStep2(kind) {
        var isWx = kind === 'wx';
        var b64 = isWx ? SUPPORT_QR_WECHAT : SUPPORT_QR_ALIPAY;
        var label = isWx ? '微信收款' : '支付宝收款';
        var box = modal.querySelector('.confirm-modal-content');
        if (!box) return;
        box.innerHTML = '<div class="confirm-modal-title">' + label + '</div>' +
            '<div class="confirm-modal-message" style="text-align:center;padding:0 2px;margin-bottom:14px;">' +
            '<div style="margin:8px auto 12px;width:min(70vw,254px);border-radius:12px;background:#fff;padding:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);">' +
            '<img src="' + b64 + '" alt="' + label + '" data-testid="support-qr-img" style="width:100%;display:block;border-radius:8px;background:#fff;"></div>' +
            '<div style="font-size:12px;color:' + subTxt + ';line-height:1.65;">保存二维码到相册后，打开' + (isWx ? '微信' : '支付宝') + '「扫一扫」点右上角相册图标选图即可识别付款</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="support-back">返回</button>' +
            '<button class="check-go-btn ripple-effect" id="support-save">保存二维码</button>' +
            '</div>';
        box.querySelector('#support-back').addEventListener('click', function () {
            if (modal.parentNode) document.body.removeChild(modal);
            showSupportModal();
        });
        box.querySelector('#support-save').addEventListener('click', function () { saveSupportQr(b64, label); });
    }
    modal.querySelector('#support-wx').addEventListener('click', function () { toStep2('wx'); });
    modal.querySelector('#support-ali').addEventListener('click', function () { toStep2('ali'); });
    modal.querySelector('#support-close').addEventListener('click', function () { if (modal.parentNode) document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal && modal.parentNode) document.body.removeChild(modal); });
}

function showDeleteConfirmModal(recordId, recordName) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #dc2626;">warning</span>
                确认删除
            </div>
            <div class="confirm-modal-message">
                确定要删除"${recordName}"这条记录吗？此操作无法撤销。
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="confirm-cancel">
                    取消
                </button>
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-delete">
                    删除
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = document.getElementById('confirm-cancel');
    const deleteBtn = document.getElementById('confirm-delete');
    
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    deleteBtn.addEventListener('click', () => {
        closeModal();
        deleteRecord(recordId);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function deleteRecord(id) {
    // ★2026-08-20 级联删除照片
    const recToDelete = records.find(r => r.id === id);
    if (recToDelete && recToDelete.photos && recToDelete.photos.length) {
        photoDeleteMany(recToDelete.photos).catch(function () {});
    }
    thumbCacheClear(); // ★2026-08-27 照片删除：缩略图缓存全清
    const row = document.getElementById('row-' + id);
    if (row) {
        row.classList.add('row-exit');
        row.addEventListener('animationend', () => {
            records = records.filter(r => r.id !== id);
            updateStatistics();
            saveToStorage();
            renderTable();
        }, { once: true });
    } else {
        records = records.filter(r => r.id !== id);
        updateStatistics();
        saveToStorage();
        renderTable();
    }
}

function addNewRecord() {
    const newRecord = {
        id: generateId(),
        name: '',
        difficulty: 3,
        elevation: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()   // ★2026-08-26 最后修改时间（合并取新用）
    };
    
    records.unshift(newRecord);
    recordPage = 1; // ★2026-08-26 新增记录回到第一页（新记录在最前）
    editingId = newRecord.id;
    editingPhotoIds = [];
    // ★2026-09-04 阅读态 v2：新建后直接打开编辑弹窗（列表本身是瘦身只读态）
    updateStatistics();
    renderTable();
    openRecordDetailModal(newRecord.id, 'edit');
}

// 更新山脉数据的函数

// ★2026-08-27 统计防抖：记录数据指纹（长度+最后修改时间），没变就不重算/不重建图表（14 处调用防抖）
let statsFingerprint = '';
// ★2026-09-01 徒步年资：按最早记录日期显示"徒步第 N 天 · 从 X年X月X日 出发"（无记录隐藏）
function fillAboutSince() {
    var el = document.getElementById('aboutSinceLine');
    if (!el) return;
    var dates = [];
    (records || []).forEach(function (r) {
        if (r.createdAt) {
            var d = new Date(r.createdAt);
            if (!isNaN(d.getTime())) dates.push(d);
        }
    });
    if (!dates.length) { el.style.display = 'none'; return; }
    dates.sort(function (a, b) { return a - b; });
    var first = dates[0];
    var days = Math.max(1, Math.floor((Date.now() - first.getTime()) / 86400000) + 1);
    el.innerHTML = '<span class="material-icons" style="font-size:12px;vertical-align:-2px;color:#667eea;">hiking</span> <span>徒步第 ' + days + ' 天 · 从 ' + first.getFullYear() + '年' + (first.getMonth() + 1) + '月' + first.getDate() + '日 出发</span>';
    el.style.display = '';
}
// ★2026-09-14 新增「那年今日」：概览页展示往年同月同日的徒步记录（纯本地计算、零新依赖、两端通用）
// 匹配策略：月+日完全相同且年份早于今年；无则整卡不渲染（宁缺毋滥，避免误导）
var onThisDayFp = '';
function renderOnThisDay() {
    try {
        var card = document.getElementById('onThisDayCard');
        var body = document.getElementById('onThisDayBody');
        if (!card || !body) return;
        var now = new Date();
        var mm = now.getMonth() + 1, dd = now.getDate(), yy = now.getFullYear();
        var list = records || [];
        // 指纹：今天日期 + 记录数 + 最新修改时间（避免频繁重算与重渲染）
        var fp = yy + '-' + mm + '-' + dd + '_' + list.length + '_' + list.reduce(function (m, r) { var t = (r && (r.updatedAt || r.createdAt)) || ''; return t > m ? t : m; }, '');
        if (fp === onThisDayFp) return;
        onThisDayFp = fp;
        var hits = list.filter(function (r) {
            if (!r || !r.createdAt) return false;
            var t = new Date(r.createdAt);
            if (isNaN(t.getTime())) return false;
            return (t.getMonth() + 1) === mm && t.getDate() === dd && t.getFullYear() < yy;
        });
        if (!hits.length) { card.style.display = 'none'; body.innerHTML = ''; return; }
        hits.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
        var r = hits[0];
        var years = yy - new Date(r.createdAt).getFullYear();
        var dark = document.body.classList.contains('dark-mode');
        var sub = dark ? 'rgba(255,255,255,0.72)' : '#52606f';
        var strong = dark ? '#ffffff' : '#0f172a';
        var pid = (r.photos && r.photos.length) ? r.photos[0] : '';
        var thumb = '<div style="width:56px;height:56px;border-radius:12px;flex-shrink:0;overflow:hidden;background:' + (dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)') + ';display:flex;align-items:center;justify-content:center;">' + (pid ? '<img data-record="' + escapeHtml(r.id) + '" data-pid="' + escapeHtml(pid) + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<span class="material-icons" style="font-size:24px;color:' + sub + ';">landscape</span>') + '</div>';
        var meta = [];
        if (r.distance) meta.push(r.distance + ' km');
        if (r.difficulty) meta.push(r.difficulty + ' 级');
        if (r.mood) meta.push(escapeHtml(r.mood));
        if (r.weather) meta.push(escapeHtml(r.weather));
        body.innerHTML = '<div id="onThisDayRow" style="display:flex;align-items:center;gap:12px;cursor:pointer;">' + thumb + '<div style="flex:1;min-width:0;">' + '<div style="font-size:12px;color:' + sub + ';margin-bottom:2px;">' + years + ' 年前的今天</div>' + '<div style="font-size:16px;font-weight:700;color:' + strong + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(r.name || '未命名') + '</div>' + (meta.length ? '<div style="font-size:12px;color:' + sub + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + meta.join(' · ') + '</div>' : '') + '</div>' + '<span class="material-icons" style="font-size:20px;color:' + sub + ';flex-shrink:0;">chevron_right</span>' + '</div>';
        card.style.display = 'block';
        var row = document.getElementById('onThisDayRow');
        if (row) row.addEventListener('click', function () { triggerHaptic(12); if (typeof openRecordDetailModal === 'function') openRecordDetailModal(r.id); });
        try { loadPhotoThumbs(r.id); } catch (eP) { /* 缩略图失败不影响文字 */ }
    } catch (e) { /* 那年今日失败绝不影响概览渲染 */ }
}

function updateStatistics() {
    renderOnThisDay(); // ★2026-09-14「那年今日」：置于指纹快照判断之前，跨天/切页回来也能刷新
    // ★2026-09-15 里程碑补领已移出此处：saveRecord() 内 updateStatistics() 先于 checkMilestones() 执行，
    //   静默补领会抢先标记新达成档位 → 庆祝卡永不弹（真 bug）。改由「启动 + 切到概览页」触发（见 app-init.js）
    renderMilestoneEntry(); // ★2026-09-15 入口计数跟随数据实时刷新（删/改记录后立即变化；纯展示无副作用）
    const fp = (records || []).length + '_' + (records || []).reduce(function (m, r) {
        const t = r.updatedAt || r.createdAt || '';
        return t > m ? t : m;
    }, '');
    if (fp === statsFingerprint && safeGetElementById('totalCount')) {
        return; // 数据没变：跳过重算与图表重建（消灭编辑保存时的统计卡顿）
    }
    statsFingerprint = fp;
    
    const totalCount = safeGetElementById('totalCount');
    const avgElevation = safeGetElementById('avgElevation');
    const maxElevation = safeGetElementById('maxElevation');
    // ★2026-09-03 A 布局：矮副卡新增 平均难度/平均用时（总爬升卡已随布局精简移除，累计爬升仍在热力图底部汇总）
    const avgDifficultyMini = safeGetElementById('avgDifficultyMini');
    const avgDurationMini = safeGetElementById('avgDurationMini');
    // ★2026-09-03 难度分布图卡已删除（用户：首页不需要）；相关元素/渲染逻辑全部移除
    
    // 辅助函数：更新数字并添加动画（用 WAAPI 取消旧动画，避免强制同步布局重排）
    // ★2026-08-25 卡片渐入由 .stat-card CSS 行级 stagger 负责，数字动画不再单独 delay
    const updateWithAnimation = (element, newValue) => {
        if (!element) return;
        const oldValue = element.textContent;
        if (oldValue !== newValue) {
            element.classList.remove('number-scroll');
            if (typeof element.getAnimations === 'function') {
                const anims = element.getAnimations();
                if (anims.length) {
                    anims.forEach(a => a.cancel());
                } else {
                    void element.offsetWidth; // 无动画时的重放兜底（仅数字变化时，极低频）
                }
            } else {
                void element.offsetWidth;
            }
            element.classList.add('number-scroll');
            element.textContent = newValue;
        }
    };
    
    // ★2026-09-06 单位全部独立小字（.stat-unit 与「次」同规格）：JS 只写数字本体；空态难度隐藏「级」单位
    if (records.length === 0) {
        if (totalCount) totalCount.textContent = '0';
        if (avgElevation) avgElevation.textContent = '0';
        if (maxElevation) maxElevation.textContent = '0';
        if (avgDifficultyMini) { avgDifficultyMini.textContent = '—'; }
        var dU0 = safeGetElementById('avgDifficultyMiniU'); if (dU0) dU0.style.display = 'none';
        if (avgDurationMini) avgDurationMini.innerHTML = '—';
        if (totalDistance) totalDistance.textContent = '0';
        if (totalDuration) totalDuration.innerHTML = '0<span class="stat-unit">h</span>';
        return;
    }
    

    const total = records.length;
    // ★2026-09-05 P0-1 大数量优化：原 6 次独立 reduce 全量遍历（万条 70ms）→ 单次 forEach 累加（~15ms）
    let accEl = 0, accMaxEl = 0, accDiff = 0, accKm = 0, accMin = 0;
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        accEl += Number(rec.elevation) || 0;
        const el = Number(rec.elevation) || 0;
        if (el > accMaxEl) accMaxEl = el;
        accDiff += Number(rec.difficulty) || 0;
        accKm += Number(rec.distance) || 0;
        accMin += Number(rec.duration) || 0;
    }
    const totalElevation = accEl;
    const averageElevation = Math.round(totalElevation / total);
    const highestElevation = accMaxEl;
    const totalDifficulty = accDiff;
    const averageDifficulty = (totalDifficulty / total).toFixed(1);
    const totalKm = accKm;
    const totalMin = accMin;
    
    // ★2026-09-06 单位小字化：数字本体更新（单位静态在 HTML .stat-unit）；时长渲染 h/m 单位也小字
    var durationHTML = function (min) {
        var mm = Math.round(Number(min) || 0);
        if (!mm || mm <= 0) return '0<span class="stat-unit">h</span>';
        var hh = Math.floor(mm / 60), rr = mm % 60;
        if (hh && rr) return hh + '<span class="stat-unit">h</span>&nbsp;' + rr + '<span class="stat-unit">m</span>';
        if (hh) return hh + '<span class="stat-unit">h</span>';
        return rr + '<span class="stat-unit">m</span>';
    };
    updateWithAnimation(totalCount, total.toString());
    updateWithAnimation(avgElevation, averageElevation);
    updateWithAnimation(maxElevation, highestElevation);
    var dU1 = safeGetElementById('avgDifficultyMiniU'); if (dU1) dU1.style.display = '';
    // ★2026-09-03 A 布局：矮副卡 平均难度/平均用时（原总爬升卡精简移除，累计爬升回到热力图底部汇总行）
    updateWithAnimation(avgDifficultyMini, averageDifficulty);
    const avgMin = total ? Math.round(totalMin / total) : 0;
    if (avgDurationMini) avgDurationMini.innerHTML = avgMin ? durationHTML(avgMin) : '—';
    // ★2026-08-25 总里程/总用时（卡片渐入由 .stat-card 行级 stagger 控制）
    updateWithAnimation(totalDistance, totalKm ? totalKm.toFixed(2) : '0'); // ★2026-09-01 里程两位小数
    if (totalDuration) totalDuration.innerHTML = durationHTML(totalMin);
    renderHeatmap(); // v1.0.7.7 切到概览刷新热力图
}

// ===== 徒步足迹热力图（v1.0.7.7：红色渐变 + 年月可选 + 日历式月视图） =====
// ★2026-09-03 难度分布卡已删除 → ensureOverviewLayout 整段移除（原负责把热力图卡插到难度分布卡前）
let hmYear = 0, hmMonth = 0;
// ★2026-08-11 热力图事件只绑定一次（initHeatmap 会被多次调用：初始化 + 底栏刷新重置）
let hmBound = false;
function updateHmYmBtn() {
    const t = document.getElementById('hmYmText');
    if (t) t.textContent = (hmYear ? hmYear : '—') + '年' + (hmMonth ? hmMonth : '—') + '月';
}
function bindHeatmapEvents() {
    const ymBtn = document.getElementById('hmYmBtn');
    if (!ymBtn || hmBound) return;
    hmBound = true;
    ymBtn.addEventListener('click', function () { openHmYmPicker(); });
}
// ★2026-09-03 年月单框弹窗：年份 chips（有记录年份）+ 月份 12 格（有足迹月可点），选中整格靛蓝实心白字（同 App 单选态）
function openHmYmPicker() {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals();
        const now = new Date();
        const years = getRecordYears();
        const yearList = years.length ? years : [now.getFullYear()];
        const nowY = now.getFullYear();
        let y = (hmYear && yearList.indexOf(hmYear) >= 0) ? hmYear : (yearList.indexOf(nowY) >= 0 ? nowY : yearList[0]);
        const nowM = now.getMonth() + 1;
        const ms0 = getRecordMonths(y);
        let m = (hmMonth && ms0.indexOf(hmMonth) >= 0) ? hmMonth : (ms0.length ? (ms0.indexOf(nowM) >= 0 ? nowM : ms0[ms0.length - 1]) : nowM);
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width: 380px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">calendar_view_month</span>选择年月</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="hmyp-yrs" id="hmypYrs"></div>' +
            '<div class="hmyp-months" id="hmypMonths"></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="hmyp-cancel" type="button" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;">取消</button>' +
            '<button class="check-go-btn ripple-effect" id="hmyp-ok" type="button" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        const yrsEl = modal.querySelector('#hmypYrs');
        const mosEl = modal.querySelector('#hmypMonths');
        function renderYrs() {
            yrsEl.innerHTML = yearList.map(function (yy) {
                return '<span class="hmyp-yr' + (yy === y ? ' sel' : '') + '" data-y="' + yy + '" role="button">' + yy + '年</span>';
            }).join('');
        }
        function renderMos() {
            const avail = getRecordMonths(y);
            const usable = avail.length ? avail : [now.getMonth() + 1];
            let cells = '';
            for (let i = 1; i <= 12; i++) {
                const on = usable.indexOf(i) >= 0;
                cells += '<span class="hmyp-m' + (i === m && on ? ' sel' : '') + (on ? '' : ' no') + '" data-m="' + i + '" role="button">' + i + '月</span>';
            }
            mosEl.innerHTML = cells;
        }
        renderYrs();
        renderMos();
        yrsEl.addEventListener('click', function (e) {
            const chip = e.target.closest ? e.target.closest('.hmyp-yr') : null;
            if (!chip) return;
            y = parseInt(chip.getAttribute('data-y'), 10);
            const avail = getRecordMonths(y);
            const usable = avail.length ? avail : [now.getMonth() + 1];
            if (usable.indexOf(m) < 0) m = usable[usable.length - 1];
            renderYrs();
            renderMos();
        });
        mosEl.addEventListener('click', function (e) {
            const cell = e.target.closest ? e.target.closest('.hmyp-m') : null;
            if (!cell || cell.classList.contains('no')) return;
            m = parseInt(cell.getAttribute('data-m'), 10);
            renderMos();
        });
        function closeMdl() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
        modal.querySelector('#hmyp-cancel').addEventListener('click', closeMdl);
        modal.querySelector('#hmyp-ok').addEventListener('click', function () {
            hmYear = y;
            hmMonth = m;
            updateHmYmBtn();
            closeMdl();
            renderHeatmap();
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) closeMdl(); });
    } catch (e) { /* 静默 */ }
}

function initHeatmap() {
    // ★2026-09-03 难度分布卡删除后无需布局重排（原 ensureOverviewLayout 已移除）
    const ymBtn = document.getElementById('hmYmBtn');
    if (!ymBtn) return;
    const now = new Date();
    const years = getRecordYears();
    const yearList = years.length ? years : [now.getFullYear()];
    const nowY = now.getFullYear();
    hmYear = yearList.indexOf(nowY) >= 0 ? nowY : yearList[0];
    const ms = getRecordMonths(hmYear);
    const nowM = now.getMonth() + 1;
    hmMonth = ms.length ? (ms.indexOf(nowM) >= 0 ? nowM : ms[ms.length - 1]) : nowM;
    updateHmYmBtn();
    bindHeatmapEvents();
    renderHeatmap();
}

function getRecordYears() {
    const years = [];
    const seen = {};
    records.forEach(function (r) {
        if (!r.createdAt) return;
        const d = new Date(r.createdAt);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        if (!seen[y]) { seen[y] = 1; years.push(y); }
    });
    return years.sort(function (a, b) { return b - a; });
}

function getRecordMonths(year) {
    const months = [];
    const seen = {};
    records.forEach(function (r) {
        if (!r.createdAt) return;
        const d = new Date(r.createdAt);
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() !== year) return;
        const m = d.getMonth() + 1;
        if (!seen[m]) { seen[m] = 1; months.push(m); }
    });
    return months.sort(function (a, b) { return a - b; });
}

// ★2026-08-27 热力图渲染缓存：key = 年月+数据指纹（记录变才重建，重复进入秒开）
let heatmapCache = {};
// ★2026-09-05 P0-4 月度聚合桶：单次全量遍历把「每天次数 + 当月爬升」按年月分桶，任意月 O(1) 读取（切月/汇总不再全量扫 records）
let hmMonthAgg = null;   // { fp, buckets: { 'y_m': { days:{}, n, climb } } }
function renderHeatmap() {
    const cal = document.getElementById('hmCalendar');
    const sumEl = document.getElementById('hmSummary');
    if (!cal) return;
    if (!hmYear || !hmMonth) { initHeatmap(); return; }
    const year = hmYear, month = hmMonth;
    const dataFp = (records || []).length + '_' + (records || []).reduce(function (m, r) {
        const t = r.updatedAt || r.createdAt || '';
        return t > m ? t : m;
    }, '');
    // ★2026-09-05 P0-4：月桶懒构建（指纹与 html 缓存 key 一致；无记录增删改则复用）
    let agg = null;
    if (hmMonthAgg && hmMonthAgg.fp === dataFp) { agg = hmMonthAgg; }
    else {
        agg = { fp: dataFp, buckets: {} };
        records.forEach(function (r) {
            if (!r.createdAt) return;
            const d = new Date(r.createdAt);
            if (isNaN(d.getTime())) return;
            const bk = d.getFullYear() + '_' + (d.getMonth() + 1);
            const b = agg.buckets[bk] || (agg.buckets[bk] = { days: {}, n: 0, climb: 0 });
            b.days[d.getDate()] = (b.days[d.getDate()] || 0) + 1;
            b.n++;
            b.climb += Number(r.elevation) || 0;
        });
        hmMonthAgg = agg;
    }
    const bucket = agg.buckets[year + '_' + month] || { days: {}, n: 0, climb: 0 };
    const cacheKey = year + '_' + month + '_' + dataFp;
    let html = heatmapCache[cacheKey];
    if (html === undefined) {
        const dayCount = bucket.days;
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
        html = '';
        for (let i = 0; i < firstWeekday; i++) html += '<div class="hm-day empty"></div>';
        let maxDay = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const c = dayCount[day] || 0;
            if (c > maxDay) maxDay = c;
            const lv = c > 0 ? 'hm-red' : '';
            html += '<div class="hm-day ' + lv + '" data-day="' + day + '" data-count="' + c + '">' + day + '</div>';
        }
        heatmapCache[cacheKey] = html;
        // 缓存防膨胀：超过 30 条清掉（数据指纹变化后旧 key 自然失效）
        if (Object.keys(heatmapCache).length > 30) heatmapCache = {};
    }
    cal.innerHTML = html;
    const total = bucket.n;
    if (sumEl) {
        // ★2026-09-05 P0-4：爬升直接读桶（原来每次渲染全量扫 records）
        const climbThis = bucket.climb;
        // ★2026-09-04 底部前缀：所选即本月 → 写「本月徒步 …」；历史月写「X年X月徒步 …」防歧义（用户要求加「本月」）
        const _nowD = new Date();
        const _mLabel = (year === _nowD.getFullYear() && month === _nowD.getMonth() + 1) ? '本月' : (year + '年' + month + '月');
        sumEl.textContent = _mLabel + '徒步 ' + total + ' 次' + (climbThis ? ' · 累计爬升 ' + Math.round(climbThis) + 'm' : '');
    }
    cal.querySelectorAll('.hm-day:not(.empty)').forEach(function (el) {
        el.addEventListener('click', function () {
            showHeatmapDayDetail(year, month, parseInt(el.getAttribute('data-day'), 10));
        });
    });
}

function showHeatmapDayDetail(year, month, day) {
    const dayRecords = records.filter(function (r) {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
    });
    if (dayRecords.length === 0) return;
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    // ★2026-08-23 热力图弹窗 v2：关闭/分享按钮玻璃配方 + meta 间距加宽 + 图片分享同行 + 去分割线
    let items = dayRecords.map(function (r) {
        // ★2026-08-26 热力图弹窗分组：①名称·海拔 ②难度·里程 ③用时 ④心情·天气·同行 ⑤图片
        // （难度里程拆开与用时分行，防一行过长换行错位/间距不均）
        const MOOD_TEXT = { '😄': '开心', '😌': '平静', '🤩': '兴奋', '😮‍💨': '疲惫' };
        const WEATHER_TEXT = { '☀️': '晴', '🌤️': '多云', '☁️': '阴', '🌧️': '雨', '❄️': '雪' };
        // ★2026-09-03 五项优化⑤：同行必为用户输入 → escapeHtml；心情/天气旧数据可能存过文本 → 兜底分支也转义（emoji 原样安全）
        const moodTxt = r.mood ? '<span class="hm-meta-item"><span class="hm-meta-label">心情：</span><span class="hm-meta-value">' + escapeHtml(MOOD_TEXT[r.mood] || r.mood) + '</span></span>' : '';
        const weatherTxt = r.weather ? '<span class="hm-meta-item"><span class="hm-meta-label">天气：</span><span class="hm-meta-value">' + escapeHtml(WEATHER_TEXT[r.weather] || r.weather) + '</span></span>' : '';
        const companionTxt = r.companions ? '<span class="hm-meta-item"><span class="hm-meta-label">同行：</span><span class="hm-meta-value">' + escapeHtml(r.companions) + '</span></span>' : '';
        const metaRow = (moodTxt || weatherTxt || companionTxt)
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + moodTxt + weatherTxt + companionTxt + '</div>'
            : '';
        // 难度/里程 一行（行2）
        const diffTxt = r.difficulty ? '<span class="hm-meta-item"><span class="hm-meta-label">难度：</span><span class="hm-meta-value">' + r.difficulty + '级</span></span>' : '';
        const distTxt = r.distance ? '<span class="hm-meta-item"><span class="hm-meta-label">里程：</span><span class="hm-meta-value">' + r.distance + 'km</span></span>' : '';
        const statRow = (diffTxt || distTxt)
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + diffTxt + distTxt + '</div>'
            : '';
        // 用时单独一行（行3）
        const durTxt = r.duration ? '<span class="hm-meta-item"><span class="hm-meta-label">用时：</span><span class="hm-meta-value">' + formatDuration(r.duration) + '</span></span>' : '';
        const durRow = durTxt
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + durTxt + '</div>'
            : '';
        // ★v5 图片缩略图：显示全部照片（有几张显示几张，按序横排换行）
        const photoIds = (r.photos && r.photos.length) ? r.photos : [];
        const picBox = photoIds.length
            ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' + photoIds.map(function (pid) {
                return '<span class="hm-day-photo" data-pid="' + pid + '" style="display:inline-block;width:56px;height:56px;border-radius:8px;background:#e2e8f0;cursor:pointer;overflow:hidden;" data-lightbox="' + r.id + '"><span style="font-size:20px;line-height:56px;">📷</span></span>';
              }).join('') + '</div>'
            : '';
        return '<div style="padding:10px 0;font-size:14px;">' +
            '<div class="hm-meta-item" style="font-size:17px;font-weight:700;">🏔️ ' + escapeHtml(r.name) + (r.elevation ? ' · ' + r.elevation + 'm' : '') + '</div>' +
            statRow +
            durRow +
            metaRow +
            picBox +
            '</div>';
    }).join('');
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px;width:calc(100vw - 44px);box-sizing:border-box;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">local_fire_department</span>' + year + '年' + month + '月' + day + '日</div>' +
        '<div class="confirm-modal-message" style="text-align:left;">' + items + '</div>' +
        '<div class="confirm-modal-buttons"><button class="ripple-effect hm-share-btn check-go-btn" id="hm-share" data-share="' + dayRecords[0].id + '">分享</button><button class="confirm-btn-cancel ripple-effect" id="hm-close">关闭</button></div></div>';
    document.body.appendChild(modal);
    // 异步加载照片缩略图
    modal.querySelectorAll('.hm-day-photo').forEach(function (box) {
        (function (b) {
            const pid = b.getAttribute('data-pid');
            const recordId = b.getAttribute('data-lightbox');
            photoGet(pid).then(function (p) {
                if (!p || !p.blob) return;
                return blobToDataURL(p.blob).then(function (durl) {
                    b.innerHTML = '<img src="' + durl + '" style="width:100%;height:100%;object-fit:cover;" alt="照片">';
                    b.addEventListener('click', function (ev) {
                        ev.stopPropagation();
                        if (typeof openPhotoLightbox === 'function') openPhotoLightbox(recordId, pid);
                    });
                });
            }).catch(function () { /* 加载失败保留占位 */ });
        })(box);
    });
    // 分享按钮
    modal.querySelectorAll('.hm-share-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const r = records.find(function (x) { return x.id === btn.getAttribute('data-share'); });
            if (r) { document.body.removeChild(modal); generateShareCard(r); }
        });
    });
    document.getElementById('hm-close').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}

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
}

function togglePlansView() {
    plansViewMode = plansViewMode === 'calendar' ? 'list' : 'calendar';
    try { localStorage.setItem('plans_view_mode', plansViewMode); } catch (e) { /* 忽略 */ }
    // ★2026-08-31 切视图前退出批量模式（日历下批量按钮隐藏，避免状态残留）
    if (typeof plannedBatchMode !== 'undefined' && plannedBatchMode) {
        try { exitPlannedBatchMode(); } catch (e) { /* 忽略 */ }
    }
    if (plansViewMode === 'calendar') {
        var now = new Date();
        calendarViewYear = now.getFullYear();
        calendarViewMonth = now.getMonth();
        calendarSelKey = null;
        // ★2026-08-31 切到日历视图：有搜索词则直接定位到匹配计划（搜索在日历模式下用于定位）
        if (searchQuery && searchQuery.trim()) {
            locatePlanInCalendar(searchQuery);
        } else {
            calendarSearchMatches = null;
            renderPlannedCalendar();
        }
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

// ★2026-08-31 日历模式搜索定位：跳转匹配计划所在月份/日期并标记（calendarSearchMatches 供明细高亮）
var calendarSearchMatches = null;
function locatePlanInCalendar(query) {
    var q = (query || '').trim();
    if (!q) {
        calendarSearchMatches = null;
        calendarSelKey = null;
        var now = new Date();
        calendarViewYear = now.getFullYear();
        calendarViewMonth = now.getMonth();
        renderPlannedCalendar();
        return;
    }
    var match = (plannedTrips || []).find(function (t) { return t.name && t.name.indexOf(q) >= 0; });
    if (!match) {
        calendarSearchMatches = q;
        renderPlannedCalendar();
        return;
    }
    var d = new Date(match.createdAt);
    calendarViewYear = d.getFullYear();
    calendarViewMonth = d.getMonth();
    calendarSelKey = fmtPlanDateKey(match.createdAt);
    calendarSearchMatches = q;
    renderPlannedCalendar();
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
                    ? '<button class="check-go-btn ripple-effect" data-complete-delay="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成/延期</button>'
                    : '<button class="check-go-btn ripple-effect" data-complete="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成</button>') +
                '<button class="check-go-btn ripple-effect" data-del="' + t.id + '" style="' + delStyle + '">删除</button>' +
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
        // ★2026-08-31 搜索匹配标记：计划名含搜索词 → 左侧强调点 + 描边高亮
        var isMatch = calendarSearchMatches && t.name && t.name.indexOf(calendarSearchMatches) >= 0;
        var itemBorder = isMatch
            ? '2px solid ' + accent
            : '0.5px solid ' + (dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)');
        // ★2026-08-31 浅色模式删除按钮更可见：灰蓝底+描边+深字（class 浅色下白边不可见）
        var delStyle = dark
            ? 'padding:6px 12px;border-radius:10px;font-size:12px;'
            : 'padding:6px 12px;border-radius:10px;font-size:12px;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;font-weight:600;';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;margin-bottom:6px;' +
            'background:' + (dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)') + ';border:' + itemBorder + ';">' +
            '<div style="min-width:0;"><div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
            (isMatch ? '<span style="color:' + accent + ';font-size:12px;flex-shrink:0;">● </span>' : '') +
            '<span style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + escapeHtml(t.name) + '</span>' +
            (isMatch ? '<span style="font-size:11px;color:' + accent + ';font-weight:400;flex-shrink:0;">匹配</span>' : '') +
            planRelBadgeHtml(t.createdAt) +
            '</div>' +
            '<div style="font-size:11px;color:rgba(100,116,139,0.9);">Lv' + t.difficulty + (t.elevation ? ' · ' + t.elevation + 'm' : '') + '</div></div>' +
            '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            (planIsDueOrOverdue(t.createdAt)
                ? '<button class="check-go-btn ripple-effect" data-complete-delay="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成/延期</button>'
                : '<button class="check-go-btn ripple-effect" data-complete="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成</button>') +
            '<button class="check-go-btn ripple-effect" data-del="' + t.id + '" style="' + delStyle + '">删除</button>' +
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
            if (rid && pid && typeof openPhotoLightbox === 'function') { try { openPhotoLightbox(rid, pid, false); } catch (e2) { /* 忽略 */ } }
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
    // ★2026-09-03 搜索框提示随视图切换（山册 = 搜山名）
    var gs = safeGetElementById('globalSearchInput');
    if (gs) gs.placeholder = isMb ? '搜索山峰…' : '搜索记录…';
}
// ★2026-09-02 山册渲染：按记录名（山）聚合卡片；点卡片头展开这座山的记录；点记录右侧 ↗ 定位打开
// ★2026-09-03 双列名册：网格两列排卡片（山影天空带已按用户要求删除，卡只显示山名行）
function renderMountainBook() {
    var wrap = safeGetElementById('mountainBookView');
    if (!wrap) return;
    var list = (records || []).filter(function (r) { return r && r.name && String(r.name).trim(); });
    var q = (typeof searchQuery === 'string' && searchQuery.trim()) ? searchQuery.trim().toLowerCase() : '';
    if (!list.length) {
        wrap.innerHTML = '<div class="yr-empty">还没有任何记录<br>去「列表」添加第一条，山册会自动在这里汇总</div>';
        return;
    }
    var diffName = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
    var groups = {};
    list.forEach(function (r) {
        var k = String(r.name).trim();
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
    var keys = allKeys.filter(function (k) {
        if (!q) return true;
        if (lowerText(k).indexOf(q) >= 0) return true;
        // 山名本身没匹配时，再翻这座山的所有记录（同伴/备注等字段也可能命中）
        return groups[k].some(function (r) {
            return String(r.companions || '').toLowerCase().indexOf(q) >= 0 ||
                String(r.notes || '').toLowerCase().indexOf(q) >= 0;
        });
    });
    if (q && !keys.length) {
        wrap.innerHTML = '<div class="yr-empty">' + (window.__isComposing ? '正在输入…' : '没有找到匹配的山，换个词试试') + '</div>';
        return;
    }
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
    // ★2026-09-05 P0-1 大数量优化：组内单 pass 合并 4 个 reduce + comp；排序只在有照片时对照片记录做（无照片大组免整组 sort）
    var n = arr.length;
    var km = 0, min = 0, el = 0, diffSum = 0;
    var comp = [];
    var seen = {};
    var phRecs = [];
    for (var gi = 0; gi < n; gi++) {
        var gr = arr[gi];
        km += Number(gr.distance) || 0;
        min += Number(gr.duration) || 0;
        var gel = Number(gr.elevation) || 0;
        if (gel > el) el = gel;
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
        '<div class="mb-body"><div class="mb-name">' + escapeHtml(k) + '</div></div>' +
        '<span class="mb-open-arrow material-icons" style="font-size:18px;">expand_more</span></div></div>';
    var drawer = '<div class="mb-drawer" data-mountain="' + no + '">' + photosHtml + statHtml + '</div>';
    return { head: head, drawer: drawer };
}

// ★2026-09-05 P0-③ 抹掉所有足迹：双重确认 → 清 records/plannedTrips/全部照片 + 引导与提醒标记 → reload 全新开始
function confirmWipeAllData() {
    try {
        var nRec = (records || []).length, nPl = (plannedTrips || []).length;
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
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
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
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
// ★2026-09-05 P1-5 一键示例足迹：零记录时灌 3 条真实感记录 + 1 条计划（无照片），帮新用户/演示一眼看懂 App
function loadSampleData() {
    try {
        var now = new Date();
        function daysAgo(n, h) { var d = new Date(now.getTime() - n * 86400000); if (h) d.setHours(h, 0, 0, 0); else d.setHours(15, 0, 0, 0); return d.toISOString(); }
        var demoRecords = [
            { id: generateId(), name: '沣峪口 · 秦岭', difficulty: 2, elevation: 1250, duration: 240, distance: 18.6, mood: '轻松', weather: '晴', companions: '周末小队', notes: '第一次进秦岭，溪水边歇了会儿脚。', photos: [], createdAt: daysAgo(3, 9), updatedAt: daysAgo(3, 9) },
            { id: generateId(), name: '华山', difficulty: 4, elevation: 2154, duration: 330, distance: 22.3, mood: '超棒', weather: '晴', companions: '', notes: '北峰看日出，值了。', photos: [], createdAt: daysAgo(21, 8), updatedAt: daysAgo(21, 8) },
            { id: generateId(), name: '太白山', difficulty: 5, elevation: 3767, duration: 480, distance: 45.5, mood: '感叹', weather: '多云', companions: '俱乐部', notes: '拔仙台的风大到站不稳，下次轻装。', photos: [], createdAt: daysAgo(70, 7), updatedAt: daysAgo(70, 7) }
        ];
        var demoPlan = { id: generateId(), name: '终南山 · 秦楚古道', difficulty: 3, elevation: 2604, duration: '', distance: '', createdAt: new Date(now.getTime() + 7 * 86400000).toISOString(), updatedAt: new Date(now.getTime() + 7 * 86400000).toISOString() };
        records = (records || []).concat(demoRecords);
        plannedTrips = (plannedTrips || []).concat([demoPlan]);
        saveToStorage();
        savePlannedTripsToStorage();
        try { updateStatistics(); } catch (e) {}
        try {
            switchTab('records');
            if (typeof recordsViewMode !== 'undefined') recordsViewMode = 'list';
            renderTable();
        } catch (e2) {}
        try { showSuccessMessage('示例已载入：3 条足迹 + 1 条计划，去逛逛吧'); triggerHaptic(20); } catch (e3) {}
    } catch (e4) { try { showErrorMessage('示例载入失败，请重试'); } catch (e5) {} }
}

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
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width:400px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">add_circle_outline</span>添加徒步记录</div>' +
            '<div class="confirm-modal-message" style="text-align:left;margin-bottom:14px;">' +
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
            '<button class="check-go-btn ripple-effect" id="apOk" disabled type="button" style="padding:10px 24px;border-radius:12px;font-size:14px;min-width:96px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex:1;margin-top:2px;">填充</button>' +
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
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
            '<div class="confirm-modal-title" style="font-size:15px;"><span class="material-icons" style="color:#f59e0b;">event_busy</span>有 ' + overdue.length + ' 个计划过期了</div>' +
            '<div class="confirm-modal-message" style="line-height:1.7;font-size:13px;">到日子没去的：<b>' + escapeHtml(label) + '</b>。<br>去计划页改个日期或删掉吧。</div>' +
            '<div style="display:flex;gap:8px;margin-top:16px;">' +
            '<button class="check-go-btn ripple-effect" id="oc-go" style="flex:1;padding:10px 0;border-radius:10px;font-size:13px;font-weight:600;">去处理</button>' +
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

        // ★2026-09-01 行内操作按钮统一：完成=check-go-btn 浅红玻璃、删除=confirm-btn-cancel 灰蓝（与日历明细/弹窗同款；浅色下删除按钮用可见灰蓝底防白边不可见）
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
                        ${plannedBatchMode ? '<input type="checkbox" class="planned-batch-check" data-id="' + trip.id + '"' + (plannedBatchSelected.has(trip.id) ? ' checked' : '') + ' title="勾选删除">' : '<button id="complete-planned-btn-' + trip.id + '" data-testid="complete-planned-button-' + trip.id + '" class="check-go-btn ripple-effect" style="padding:6px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-right:4px;" title="' + (_planDue ? '完成 / 延期' : '标记为已完成') + '"><span class="material-icons" style="font-size:18px;">' + (_planDue ? 'event_repeat' : 'check') + '</span></button><button id="delete-planned-btn-' + trip.id + '" data-testid="delete-planned-button-' + trip.id + '" class="confirm-btn-cancel ripple-effect" style="' + plannedDelStyle + '" title="删除"><span class="material-icons" style="font-size:18px;">delete</span></button>'}
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
        '<button id="pd-edit-btn" class="check-go-btn ripple-effect" type="button" style="flex:1;padding:10px 0;border-radius:12px;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;">编辑计划</button>' +
        '<button id="pd-complete-btn" class="check-go-btn ripple-effect" type="button" style="flex:1;padding:10px 0;border-radius:12px;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;background:rgba(22,163,74,0.16);border:1px solid rgba(22,163,74,0.5);color:#15803d;" onclick="showConfirmCompleteModal(\'' + t.id + '\',\'' + escapeHtml(t.name).replace(/'/g, "\\'") + '\')">完成了 ✓</button>' +
        '</div>';
}
// 计划编辑态 body（id 沿用 edit-planned-*，保存/取消复用 savePlannedTrip/cancelPlannedEdit）
function plannedEditBodyHTML(t) {
    var pCancel = (document.body.classList.contains('dark-mode'))
        ? 'padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;'
        : 'padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;background:rgba(100,116,139,0.14);border:1px solid rgba(100,116,139,0.6);color:#334155;';
    return '' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<input type="text" id="edit-planned-name-' + t.id + '" value="' + escapeHtml(t.name) + '" data-testid="edit-planned-name-' + t.id + '" class="edit-input input-glow" placeholder="输入名称" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="next">' +
        // ★2026-09-04 海拔+难度 1:1 提前（与记录页同构），日期时间移到其后
        '<div style="display:flex;gap:8px;">' +
        '<input type="number" id="edit-planned-elevation-' + t.id + '" value="' + (t.elevation || 0) + '" data-testid="edit-planned-elevation-' + t.id + '" class="edit-input input-glow" style="flex:1;min-width:0;" min="0" placeholder="海拔" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next">' +
        '<input type="text" id="edit-planned-difficulty-' + t.id + '" data-testid="edit-planned-difficulty-' + t.id + '" value="' + diffLabel(t.difficulty || 3) + '" class="edit-input input-glow difficulty-color"' + ' readonly style="flex:1;min-width:0;cursor:pointer;font-weight:600;text-align:center;--dfc-light:' + getDifficultyColor(t.difficulty || 3) + ';--dfc-dark:' + getDifficultyColorDark(t.difficulty || 3) + ';" onclick="openDifficultyPicker(\'edit-planned-difficulty-' + t.id + '\')" title="点击选择难度" enterkeyhint="done">' +
        '</div>' +
        '<input type="text" id="edit-planned-created-at-' + t.id + '" value="' + formatDateTimeLocal(t.createdAt).replace('T', ' ') + '" data-iso="' + formatDateTimeLocal(t.createdAt) + '" data-testid="edit-planned-created-at-' + t.id + '" class="edit-input input-glow" readonly style="cursor:pointer;font-weight:400;text-align:center;color:' + (document.body.classList.contains('dark-mode') ? '#e5e7eb' : '#334155') + ';" onclick="openDateTimePicker(this.id, this.value)" enterkeyhint="done" title="点击选择日期时间">' +
        '<div style="display:flex;gap:10px;margin-top:2px;">' +
        '<button id="cancel-planned-btn-' + t.id + '" data-testid="cancel-planned-button-' + t.id + '" class="ripple-effect btn-click-effect confirm-btn-cancel" style="' + pCancel + '">取消</button>' +
        '<button id="save-planned-btn-' + t.id + '" data-testid="save-planned-button-' + t.id + '" class="ripple-effect btn-click-effect check-go-btn" style="flex:1;padding:10px 0;border-radius:10px;font-size:14px;min-width:96px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;">保存</button>' +
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
            '<div class="confirm-modal-content modal-fade-scale" style="max-width:420px;width:calc(100vw - 44px);box-sizing:border-box;max-height:86vh;overflow-y:auto;border-radius:20px;">' +
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
        '<div class="confirm-modal-content modal-fade-scale" style="width:calc(100vw - 44px);max-width:400px;box-sizing:border-box;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">event_repeat</span>完成 / 延期</div>' +
        '<div class="confirm-modal-message">「' + escapeHtml(tripName || '未命名计划') + '」的日子到了。已经走完就点「完成」，会转入徒步记录；还没走就点「延期」，改个新日期。</div>' +
        '<div style="display:flex;gap:10px;margin-top:12px;">' +
        '<button class="glass-btn ripple-effect" id="cod-complete" style="flex:1;padding:10px 0;border-radius:12px;font-size:14px;font-weight:600;">完成</button>' +
        '<button class="glass-btn ripple-effect" id="cod-delay" style="flex:1;padding:10px 0;border-radius:12px;font-size:14px;font-weight:600;">延期</button>' +
        '</div>' +
        '<div class="confirm-modal-buttons" style="margin-top:12px;">' +
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
        <div class="confirm-modal-content modal-fade-scale">
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
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-complete-ok">
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
                if (newly.length === 1) showMilestoneCelebration(newly[0], st);
                else showMilestoneSummary(newly, st);
            }
        } else {
            msSetCelebrated(cel);   // 回收已失效档位
        }
        msSetSeen(msGetSeen().filter(function (id) { return achieved.indexOf(id) >= 0; }));
        renderMilestoneEntry();
    } catch (e) { /* 里程碑失败绝不影响保存流程 */ }
}
function showMilestoneCelebration(ms, st) {
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
            '<button id="celebrateOkBtn" class="check-go-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-size:14px;font-weight:700;">收下</button>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        var escHandler = function (e) { if (e.key === 'Escape') close(); };
        var close = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', escHandler);
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
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width:440px;width:calc(100vw - 44px);box-sizing:border-box;max-height:70vh;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;">' +
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
            '<button id="celebrateOkBtn" class="check-go-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-size:14px;font-weight:700;">去看看</button>';
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
            '<button id="celebrateOkBtn" class="check-go-btn ripple-effect" style="margin-top:18px;padding:10px 30px;border-radius:12px;font-size:14px;font-weight:700;">继续补全</button>';
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
        <div class="confirm-modal-content modal-fade-scale">
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

// 工具：字符串转 Base64（支持中文，UTF-8）
