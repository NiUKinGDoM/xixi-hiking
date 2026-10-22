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

// ★2026-10-09 清空全局搜索词（切到「山册 / 计划日历」这类不提供搜索的视图时调用）
//   只清状态与输入框；重渲染交给调用方（避免出现"搜索框没了、过滤却还生效"的死结）
function clearGlobalSearchQuery() {
    if (typeof searchQuery !== 'string' || !searchQuery) return;
    searchQuery = '';
    var inp = safeGetElementById('globalSearchInput');
    if (inp) inp.value = '';
    var clr = safeGetElementById('globalSearchClear');
    if (clr) clr.style.display = 'none';
}

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
    // ★2026-10-09 山册视图（记录页）/ 计划日历视图不提供搜索（用户要求）→ 这两个视图下搜索框不出现
    function isSearchUnavailableView() {
        if (currentTabId === 'records') return typeof recordsViewMode !== 'undefined' && recordsViewMode === 'mountain';
        if (currentTabId === 'plans') return typeof plansViewMode !== 'undefined' && plansViewMode === 'calendar';
        return false;
    }
    function pokeSearchBar() {
        if (currentTabId !== 'records' && currentTabId !== 'plans') { setBarVisible(false); return; }
        // ★2026-10-09 山册 / 计划日历视图：隐藏搜索框并清掉搜索词（否则「框没了但过滤还在」成死结）
        if (isSearchUnavailableView()) { clearGlobalSearchQuery(); setBarVisible(false); return; }
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
            // ★2026-10-09 山册视图已不提供搜索（搜索框不出现）→ 这里只需按列表刷新
            recordPage = 1;
            renderTable();
        }
        else if (currentTabId === 'plans') {
            // ★2026-10-09 计划日历视图已不提供搜索（搜索框不出现）→ 这里只需按列表刷新
            plannedPage = 1;
            renderPlannedTripsTable();
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
        // ★2026-10-08 五项优化③：加 rAF 节流 —— 键盘弹起/收起动画期间 visualViewport 会高频触发
        //   （每帧多次），每次都调 applyKeyboardOffset 会反复写 bottom（触发布局）→ 跟随发涩/掉帧。
        //   节流成「每帧最多一次」，跟手更顺，行为与观感不变。
        let kvTicking = false;
        const onViewportChange = function () {
            if (kvTicking) return;
            kvTicking = true;
            requestAnimationFrame(function () { kvTicking = false; applyKeyboardOffset(); });
        };
        window.visualViewport.addEventListener('resize', onViewportChange);
        window.visualViewport.addEventListener('scroll', onViewportChange);
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
        // ★2026-10-09 山册 / 计划日历视图已不提供搜索（搜索框不出现）→ 清空只可能发生在列表视图
        if (currentTabId === 'records') { recordPage = 1; renderTable(); }
        else if (currentTabId === 'plans') { plannedPage = 1; renderPlannedTripsTable(); }
    });
    // 搜索框内回车/失焦不收起（保持简单）；供 switchTab 切页时清空
    window.__clearGlobalSearch = function () {
        searchQuery = '';
        if (input) input.value = '';
        if (clear) clear.style.display = 'none';
        setBarVisible(false);
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
    // ★2026-09-23 用户两次纠正后定稿：与「计划列表」的删除**同款** —— confirm-btn-cancel + 灰色垃圾桶图标（不是文字、不是红）
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
                    ${batchMode ? '<input type="checkbox" class="batch-check" data-id="' + record.id + '"' + (batchSelected.has(record.id) ? ' checked' : '') + ' title="勾选删除">' : '<button id="delete-btn-' + record.id + '" data-testid="delete-button-' + record.id + '" class="confirm-btn-cancel ripple-effect" style="' + recordDelStyle + '" title="删除"><span class="material-icons" style="font-size:18px;">delete</span></button>'}
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
