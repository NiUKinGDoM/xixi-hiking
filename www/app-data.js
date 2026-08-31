function getSortedRecords() {
    // ★2026-08-27 搜索过滤：记录页有搜索词时按名称匹配（方案A，找"去年去过的那座山"）
    var src = records;
    if (typeof searchQuery === 'string' && searchQuery.trim() && currentTabId === 'records') {
        var q = searchQuery.trim().toLowerCase();
        src = records.filter(function (r) {
            return (r.name || '').toLowerCase().indexOf(q) >= 0;
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
            aValue = aValue ? new Date(aValue).getTime() : 0;
            bValue = bValue ? new Date(bValue).getTime() : 0;
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
        if (searchQuery && searchQuery.trim()) { setBarVisible(true); return; }
        setBarVisible(true);
        clearTimeout(searchHideTimer);
        searchHideTimer = setTimeout(function () { setBarVisible(false); }, 1000);
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
        if (currentTabId === 'records') { recordPage = 1; renderTable(); }
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
        if (currentTabId === 'records') { recordPage = 1; renderTable(); }
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
    
    const tableContent = pageRecords.map((record, idx) => {
        if (editingId === record.id) {
            return `
                <tr class="border-b border-gray-200">
                    <td class="p-2" data-label="名称">
                        <div class="input-with-search">
                            <input type="text" 
                                   id="edit-name-${record.id}" 
                                   value="${escapeHtml(record.name)}" 
                                   data-testid="edit-name-${record.id}"
                                   class="edit-input input-glow"
                                   placeholder="输入名称"
                                   autocomplete="off"
                                   autocorrect="off"
                                   autocapitalize="off"
                                   spellcheck="false"
                                   inputmode="text"
                                   enterkeyhint="next">
                        </div>
                    </td>
                    <td class="p-2" data-label="海拔">
                        <input type="number" 
                               id="edit-elevation-${record.id}" 
                               value="${record.elevation}" 
                               data-testid="edit-elevation-${record.id}"
                               class="edit-input input-glow"
                               min="0"
                               placeholder="海拔"
                               inputmode="numeric"
                               pattern="[0-9]*"
                               enterkeyhint="next">
                    </td>
                    <td class="p-2" data-label="难度">
                        <select id="edit-difficulty-${record.id}" 
                                data-testid="edit-difficulty-${record.id}"
                                class="edit-input input-glow">
                            <option value="1" ${record.difficulty === 1 ? 'selected' : ''}>1级</option>
                            <option value="2" ${record.difficulty === 2 ? 'selected' : ''}>2级</option>
                            <option value="3" ${record.difficulty === 3 ? 'selected' : ''}>3级</option>
                            <option value="4" ${record.difficulty === 4 ? 'selected' : ''}>4级</option>
                            <option value="5" ${record.difficulty === 5 ? 'selected' : ''}>5级</option>
                        </select>
                    </td>
                    <td class="p-2" data-label="记录时间">
                        <input type="datetime-local" 
                               id="edit-created-at-${record.id}" 
                               value="${formatDateTimeLocal(record.createdAt)}" 
                               data-testid="edit-created-at-${record.id}"
                               class="edit-input input-glow text-xs">
                    </td>
                    <td class="p-2 text-center" data-label="操作">
                        <div class="edit-action-btns">
                            <button id="save-btn-${record.id}" 
                                    data-testid="save-button-${record.id}"
                                    class="ripple-effect btn-click-effect bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors text-xs">
                                保存
                            </button>
                            <button id="cancel-btn-${record.id}" 
                                    data-testid="cancel-button-${record.id}"
                                    class="ripple-effect btn-click-effect bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors text-xs">
                                取消
                            </button>
                        </div>
                    </td>
                </tr>
                <!-- ★2026-08-20 照片区（编辑行下方，最多 9 张） -->
                <tr id="photo-row-${record.id}" class="border-b border-gray-200 bg-white/5">
                    <td colspan="5" class="p-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <div id="photo-thumbs-${record.id}" class="flex items-center">
                                ${photoThumbsHTML(editingPhotoIds, record.id)}
                            </div>
                            <!-- ★2026-08-25 恢复原大小（edit-input）：心情/天气 100、同行 130→104(80%)、里程/用时 90→72(80%)；手机两行：照片+心情+天气 / 同行+里程+用时 -->
                            <select id="edit-mood-${record.id}" class="edit-input input-glow" style="max-width:100px;" title="心情（可选）">
                                <option value="">心情</option>
                                <option value="😄" ${record.mood === '😄' ? 'selected' : ''}>开心</option>
                                <option value="😌" ${record.mood === '😌' ? 'selected' : ''}>平静</option>
                                <option value="🤩" ${record.mood === '🤩' ? 'selected' : ''}>兴奋</option>
                                <option value="😮‍💨" ${record.mood === '😮‍💨' ? 'selected' : ''}>疲惫</option>
                                ${record.mood && ['😄','😌','🤩','😮‍💨'].indexOf(record.mood) < 0 ? '<option value="' + record.mood + '" selected>' + record.mood + '</option>' : ''}
                            </select>
                            <select id="edit-weather-${record.id}" class="edit-input input-glow" style="max-width:100px;" title="天气（可选）">
                                <option value="">天气</option>
                                <option value="☀️" ${record.weather === '☀️' ? 'selected' : ''}>晴</option>
                                <option value="🌤️" ${record.weather === '🌤️' ? 'selected' : ''}>多云</option>
                                <option value="☁️" ${record.weather === '☁️' ? 'selected' : ''}>阴</option>
                                <option value="🌧️" ${record.weather === '🌧️' ? 'selected' : ''}>雨</option>
                                <option value="❄️" ${record.weather === '❄️' ? 'selected' : ''}>雪</option>
                                ${record.weather && ['☀️','🌤️','☁️','🌧️','❄️'].indexOf(record.weather) < 0 ? '<option value="' + record.weather + '" selected>' + record.weather + '</option>' : ''}
                            </select>
                            <input type="text" id="edit-companions-${record.id}" placeholder="同行人" class="edit-input input-glow" style="max-width:104px;" value="${record.companions || ''}">
                            <!-- ★2026-08-25 里程/用时（可选，不进表格列宽，宽度=原 90 的 80%） -->
                            <input type="number" id="edit-distance-${record.id}" placeholder="里程" class="edit-input input-glow" style="max-width:72px;" value="${record.distance || ''}" min="0" step="0.1" inputmode="decimal" title="里程（公里）">
                            <input type="number" id="edit-duration-${record.id}" placeholder="用时" class="edit-input input-glow" style="max-width:72px;" value="${record.duration ? Math.round(record.duration / 60 * 10) / 10 : ''}" min="0" step="0.1" inputmode="decimal" title="用时（小时，如 2.5 = 2小时30分）">
                        </div>
                    </td>
                </tr>
            `;
        } else {
            // ★2026-08-27 入场动画只首次播（后续刷新/编辑/翻页不重播，省布局抖动）
            const rowAnimCls = recordsRowsAnimated ? '' : 'table-row-animate ';
            const rowDelayStyle = recordsRowsAnimated ? '' : ('animation-delay: ' + (idx * 0.05) + 's;');
            return `
                <tr class="table-row-advanced ${rowAnimCls}border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="row-${record.id}" style="${rowDelayStyle}">
                    <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="name-cell-${record.id}">
                        <span class="inline-flex items-center gap-1.5">
                            ${batchMode ? '<input type="checkbox" class="batch-check" data-id="' + record.id + '"' + (batchSelected.has(record.id) ? ' checked' : '') + ' style="width:16px;height:16px;flex-shrink:0;vertical-align:middle;accent-color:#b91c1c;">' : ''}
                            ${escapeHtml(record.name)}
                            ${record.weather ? '<span class="text-base" title="天气">' + record.weather + '</span>' : ''}
                            <!-- ★2026-08-25 名称后照片按钮：新版玻璃配方图标按钮（.icon-glass-btn）；查看模式只读（保存+左右翻页） -->
                            ${record.photos && record.photos.length ? '<button id="photos-btn-' + record.id + '" data-testid="photos-button-' + record.id + '" class="ripple-effect btn-click-effect icon-glass-btn" style="width:30px;height:30px;padding:0;border-radius:8px;flex-shrink:0;" title="查看照片"><span class="material-icons" style="font-size:16px;line-height:1;">photo_library</span></button>' : ''}
                        </span>
                    </td>
                    <td class="p-2 text-white/80 text-base font-medium" data-label="海拔">
                        ${record.elevation}
                    </td>
                    <td class="p-2" data-label="难度">
                        <span class="difficulty-badge difficulty-badge-advanced px-2 py-1 rounded text-white text-sm font-medium"
                              style="background: ${getDifficultyGlass(record.difficulty)}; border-color: ${getDifficultyBorder(record.difficulty)};">
                            ${getDifficultyText(record.difficulty)}
                        </span>
                    </td>
                    <td class="p-2 text-white/60 text-sm" data-label="记录时间">
                        ${formatDateTime(record.createdAt)}
                    </td>
                    <td class="p-2 text-center" data-label="操作">
                        ${batchMode ? '' : '<button id="delete-btn-' + record.id + '" data-testid="delete-button-' + record.id + '" class="ripple-effect btn-click-effect bg-red-600 text-white p-1 rounded hover:bg-red-700 transition-colors inline-flex items-center justify-center"><span class="material-icons">delete</span></button>'}
                    </td>
                </tr>
            `;
        }
    }).join('');
    
    if (tbody) safeSetElementContent('recordsTable', tableContent);
    recordsRowsAnimated = true; // ★2026-08-27 首次有行渲染后置位（后续不播入场动画）
    
    // 表格横向滚动归位（刷新/重渲染后回到最左）
    if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
        tbody.parentElement.parentElement.scrollLeft = 0;
    }
        
        attachEventListeners();
    });

    fitEditSelects(); // v1.0.7.11 编辑行难度框宽度自适应
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
        if (editingId === record.id) {
            const saveBtn = safeGetElementById(`save-btn-${record.id}`);
            const cancelBtn = safeGetElementById(`cancel-btn-${record.id}`);
            const nameInput = safeGetElementById(`edit-name-${record.id}`);
            
            if (saveBtn) {
                const saveHandler = () => saveRecord(record.id);
                saveBtn.addEventListener('click', saveHandler);
                eventListeners.push({ element: saveBtn, event: 'click', handler: saveHandler });
            }
            
            if (cancelBtn) {
                const cancelHandler = () => cancelEdit();
                cancelBtn.addEventListener('click', cancelHandler);
                eventListeners.push({ element: cancelBtn, event: 'click', handler: cancelHandler });
            }
            
            // ★2026-08-25 照片区：层叠卡片点击（有照片→灯箱编辑；无照片→白框加号直接添加）；删除/添加在灯箱内操作
            const photoThumbsBox = safeGetElementById(`photo-thumbs-${record.id}`);
            if (photoThumbsBox) {
                const thumbsHandler = (e) => {
                    const stack = e.target.closest('.photo-stack');
                    if (!stack) return;
                    const firstImg = stack.querySelector('.photo-thumb-img');
                    if (!firstImg) {
                        // 空状态白框加号 → 直接打开相册添加第一张
                        addPhotosToEdit(record.id, false);
                        return;
                    }
                    const firstPid = firstImg.getAttribute('data-pid');
                    openPhotoLightbox(record.id, firstPid, true);
                };
                photoThumbsBox.addEventListener('click', thumbsHandler);
                eventListeners.push({ element: photoThumbsBox, event: 'click', handler: thumbsHandler });
            }
            loadPhotoThumbs(record.id);
        } else {
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
                    startEdit(record.id);
                };
                row.addEventListener('click', rowHandler);
                eventListeners.push({ element: row, event: 'click', handler: rowHandler });
            }
            // ★2026-08-25 照片按钮 → 灯箱查看（查看模式只读：保存 + 左右翻页，无删除/添加）
            const photosBtn = safeGetElementById(`photos-btn-${record.id}`);
            if (photosBtn) {
                const photosHandler = (e) => {
                    e.stopPropagation();
                    const pids = record.photos || [];
                    if (pids.length) openPhotoLightbox(record.id, pids[0]);
                };
                photosBtn.addEventListener('click', photosHandler);
                eventListeners.push({ element: photosBtn, event: 'click', handler: photosHandler });
            }
            
            // ★2026-08-21 v1.1.1.7 分享按钮已移到热力图详情弹窗（记录行内不再显示）
            if (deleteBtn) {
                const deleteHandler = () => showDeleteConfirmModal(record.id, record.name);
                deleteBtn.addEventListener('click', deleteHandler);
                eventListeners.push({ element: deleteBtn, event: 'click', handler: deleteHandler });
            }
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
    editingId = id;
    // ★2026-08-20 照片：进入编辑时从记录拷贝当前照片列表
    const rec = records.find(r => r.id === id);
    editingPhotoIds = rec && rec.photos ? rec.photos.slice() : [];
    renderTable();
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
// ★2026-08-25 编辑行添加照片支持多选：相册多选（≤9 上限，超出取前几张并提示）；相机仍单选
function addPhotosToEdit(recordId, capture) {
    if (editingPhotoIds.length >= 9) { showErrorMessage('最多添加 9 张照片'); return; }
    if (!photosEnabled()) { showErrorMessage('照片存储不可用，请刷新重试'); return; }
    var remaining = 9 - editingPhotoIds.length;
    (capture ? pickPhoto(capture).then(function (r) { return [r]; }) : pickPhotos(false)).then(function (arr) {
        if (arr.length > remaining) {
            showErrorMessage('最多添加 9 张照片，仅添加前 ' + remaining + ' 张');
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
    var c = document.querySelector('#photo-row-' + recordId + ' .photo-stack-count');
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
        '<div style="width:100%;max-width:560px;display:flex;justify-content:space-between;align-items:center;color:#fff;flex-shrink:0;">' +
        '<span id="lb-title" style="font-size:15px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
        '<span id="lb-index" style="color:rgba(255,255,255,0.55);font-size:12px;flex-shrink:0;"></span>' +
        '<button id="lb-close" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0;">✕</button>' +
        '</div>' +
        // 图片（垂直空间留给上下控件）
        '<img id="lb-img" style="max-width:94%;max-height:56%;object-fit:contain;flex-shrink:1;min-height:0;">' +
        // 底部操作栏（图片下方）
        '<div style="display:flex;gap:16px;align-items:center;flex-shrink:0;">' +
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
    var sx = null;
    div.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    div.addEventListener('touchend', function (e) {
        if (sx === null) return;
        var dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 50) { if (dx < 0) lbStep(1); else lbStep(-1); }
        sx = null;
    }, { passive: true });
    photoLightboxEl = div;
    return div;
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
    showSuccessMessage('再按一次退出徒步小记', 2000);
};
// ★2026-08-25 灯箱主按钮统一入口：编辑模式=添加照片，查看模式=保存图片
function lbPrimaryAction() {
    var lb = photoLightboxEl;
    if (!lb) return;
    if (lb._editing) lbAddPhoto();
    else saveCurrentPhoto();
}
// ★2026-08-25 灯箱内添加照片（编辑模式，替代原编辑行「添加照片」按钮）：相册选图 → IndexedDB → 刷新照片区 + 灯箱跳到新照片
// ★2026-08-25 灯箱添加照片支持多选（相册多选，≤9 上限；添加后跳到最后一张）
function lbAddPhoto() {
    var lb = photoLightboxEl;
    if (!lb || !lb._editing) return;
    if (editingPhotoIds.length >= 9) { showErrorMessage('最多添加 9 张照片'); return; }
    if (!photosEnabled()) { showErrorMessage('照片存储不可用，请刷新重试'); return; }
    var remaining = 9 - editingPhotoIds.length;
    pickPhotos(false).then(function (arr) {
        if (arr.length > remaining) {
            showErrorMessage('最多添加 9 张照片，仅添加前 ' + remaining + ' 张');
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
    modal.style.zIndex = '300'; // ★2026-08-29 灯箱 z-index=200，确认弹窗必须盖在灯箱之上（否则被挡住看不到）
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
    
    record.name = nameInput.value.trim();
    record.difficulty = parseInt(difficultyInput.value);
    record.elevation = Math.max(0, parseInt(elevationInput.value) || 0); // ★2026-08-29 与新增记录一致：负数防护
    
    // 保存记录时间
    if (createdAtInput && createdAtInput.value) {
        record.createdAt = new Date(createdAtInput.value).toISOString();
    }
    
    // ★2026-08-20 照片：编辑结果写回记录
    record.photos = editingPhotoIds.slice();
    editingPhotoIds = [];
    
    // ★2026-08-21 v1.1.1.6 扩展信息：心情/天气/同行人（可选）
    const moodInput = document.getElementById(`edit-mood-${id}`);
    const weatherInput = document.getElementById(`edit-weather-${id}`);
    const companionsInput = document.getElementById(`edit-companions-${id}`);
    if (moodInput) record.mood = moodInput.value || '';
    if (weatherInput) record.weather = weatherInput.value.trim();
    if (companionsInput) record.companions = companionsInput.value.trim();

    // ★2026-08-25 里程/用时（可选）：distance=km 数字，duration=分钟
    const distanceInput = document.getElementById(`edit-distance-${id}`);
    const durationInput = document.getElementById(`edit-duration-${id}`);
    if (distanceInput) record.distance = parseFloat(distanceInput.value) || 0;
    if (durationInput) record.duration = Math.round((parseFloat(durationInput.value) || 0) * 60);

    // ★2026-08-26 最后修改时间：每次保存记录都更新（合并取新用，区分于徒步日期 createdAt）
    record.updatedAt = new Date().toISOString();
    
    editingId = null;
    updateStatistics();
    saveToStorage();
    thumbCacheClear(); // ★2026-08-27 照片可能增删：缩略图缓存全清，下次渲染重新读
    renderTable();
    triggerHaptic(15); // ★2026-08-27 渐进增强：保存成功轻震动反馈
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
function showSectionTitleModal(titleElementId, saveFn) {
    closeOpenModals(); // ★2026-08-29 防重入
    const titleEl = document.getElementById(titleElementId);
    if (!titleEl) return;
    const titleTextEl = titleEl.querySelector('.title-text');
    const currentTitle = titleTextEl ? titleTextEl.textContent : '';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">edit</span>
                编辑标题
            </div>
            <input type="text" id="sectionTitleEditInput" class="edit-input" style="width: 100%; margin: 14px 0 4px;" maxlength="20" placeholder="输入新标题">
            <div class="confirm-modal-message" style="margin-top: 6px;">最多 20 个字符</div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="section-title-cancel">取消</button>
                <button class="confirm-btn-delete ripple-effect" id="section-title-save" style="background: #4f46e5; border-color: #4f46e5;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const input = document.getElementById('sectionTitleEditInput');
    input.value = currentTitle;
    // 2026-08-11 用户要求：点击可编辑栏不直接弹输入法——不自动聚焦

    const closeModal = () => { document.body.removeChild(modal); };

    document.getElementById('section-title-cancel').addEventListener('click', closeModal);
    document.getElementById('section-title-save').addEventListener('click', () => {
        const newTitle = input.value.trim();
        if (!newTitle) { showErrorMessage('标题不能为空'); return; }
        if (titleTextEl) titleTextEl.textContent = newTitle;
        try { saveFn(newTitle); } catch (e) { console.error('save section title failed:', e); }
        closeModal();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('section-title-save').click();
        if (e.key === 'Escape') closeModal();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

/* 2026-08-11 数据管理说明弹窗（i 标识点击显示） */
function showDataInfoModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">info</span>
                数据管理说明
            </div>
            <div class="confirm-modal-message" style="line-height: 1.4;">
                导出/导入完整备份（压缩包 .zip，含徒步记录、计划与照片；另有不含照片的纯数据备份）。数据仅保存在本机，建议定期导出备份；开启自动同步后，数据变更自动上传云端防丢失。导入或恢复时，相同记录按最后修改时间取新（改了的字段更新，未改的保持），空字段自动用另一份补全；本地独有的记录合并保留。
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
    updateStatistics();
    renderTable();
}

// 更新山脉数据的函数

// ★2026-08-27 统计防抖：记录数据指纹（长度+最后修改时间），没变就不重算/不重建图表（14 处调用防抖）
let statsFingerprint = '';
function updateStatistics() {
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
    // ★2026-08-26 平均难度卡片 → 总爬升卡片（平均难度移入直方图左上角 chartAvgDiff）
    const totalClimbCard = safeGetElementById('totalClimbCard');
    const difficultyChart = safeGetElementById('difficultyChart');
    const chartLabels = safeGetElementById('chartLabels');
    const chartAvgDiff = safeGetElementById('chartAvgDiff');
    
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
    
    if (records.length === 0) {
        if (totalCount) totalCount.textContent = '0';
        if (avgElevation) avgElevation.textContent = '0m';
        if (maxElevation) maxElevation.textContent = '0m';
        if (totalClimbCard) totalClimbCard.textContent = '0m';
        if (totalDistance) totalDistance.textContent = '0 km';
        if (totalDuration) totalDuration.textContent = '0h';
        if (chartAvgDiff) safeSetElementContent('chartAvgDiff', '');
        if (difficultyChart) safeSetElementContent('difficultyChart', '<div class="text-white/50 text-center w-full">暂无数据</div>');
        if (chartLabels) safeSetElementContent('chartLabels', '');
        return;
    }
    

    const total = records.length;
    const totalElevation = records.reduce((sum, record) => sum + record.elevation, 0);
    const averageElevation = Math.round(totalElevation / total);
    const highestElevation = records.reduce((m, record) => Math.max(m, Number(record.elevation) || 0), 0); // ★2026-08-30 改 reduce 防大数组展开爆栈
    const totalDifficulty = records.reduce((sum, record) => sum + record.difficulty, 0);
    const averageDifficulty = (totalDifficulty / total).toFixed(1);
    // ★2026-08-25 总里程/总用时
    const totalKm = records.reduce((sum, record) => sum + (Number(record.distance) || 0), 0);
    const totalMin = records.reduce((sum, record) => sum + (Number(record.duration) || 0), 0);
    
    updateWithAnimation(totalCount, total.toString());
    updateWithAnimation(avgElevation, `${averageElevation}m`);
    updateWithAnimation(maxElevation, `${highestElevation}m`);
    // ★2026-08-26 总爬升卡片（原平均难度卡位；平均难度挪到直方图左上角）
    updateWithAnimation(totalClimbCard, Math.round(totalElevation) + 'm');
    // ★2026-08-25 总里程/总用时（卡片渐入由 .stat-card 行级 stagger 控制）
    updateWithAnimation(totalDistance, totalKm ? totalKm.toFixed(1) + ' km' : '0 km');
    updateWithAnimation(totalDuration, totalMin ? (formatDuration(totalMin) || '0h') : '0h');
    // ★2026-08-26 直方图左上角平均难度（字体与右上角总计一致 text-xs）
    if (chartAvgDiff) chartAvgDiff.innerHTML = '<span class="' + (isDarkMode ? 'text-white/70' : 'text-white/60') + '">平均难度 ' + averageDifficulty + ' 级</span>';
    
    const difficultyCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    records.forEach(record => {
        difficultyCounts[record.difficulty]++;
    });
    
    const maxCount = Math.max(...Object.values(difficultyCounts));
    
    if (difficultyChart && chartLabels) {
        const difficultyNames = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
        const difficultyColors = { 1: '#10b981', 2: '#84cc16', 3: '#f59e0b', 4: '#f97316', 5: '#dc2626' };
        const difficultyGradients = {
            1: 'from-green-400 to-green-600',
            2: 'from-lime-400 to-lime-600', 
            3: 'from-amber-400 to-amber-600',
            4: 'from-orange-400 to-orange-600',
            5: 'from-red-400 to-red-600'
        };
        
        // 深色模式下的渐变样式
        const darkModeGradients = {
            1: 'from-green-400 to-green-600',
            2: 'from-lime-400 to-lime-600', 
            3: 'from-amber-400 to-amber-600',
            4: 'from-orange-400 to-orange-600',
            5: 'from-red-400 to-red-600'
        };
        
        const currentGradients = isDarkMode ? darkModeGradients : difficultyGradients;
        
        let chartHtml = '';
        let labelsHtml = '';
        
        Object.entries(difficultyCounts).forEach(([difficulty, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const color = difficultyColors[difficulty];
            const gradient = currentGradients[difficulty];
            const name = difficultyNames[difficulty];
            
            chartHtml += `
                <div class="flex flex-col items-center flex-1">
                    <div class="relative w-full max-w-12 h-32 flex items-end justify-center">
                        <div class="chart-bar glass-bar absolute bottom-0 w-full rounded-t-lg hover:scale-105 cursor-pointer"
                             style="height: ${percentage}%; min-height: ${count > 0 ? '8px' : '0'}; animation-delay: ${parseInt(difficulty) * 0.15}s; background: linear-gradient(to top, ${getDifficultyColor(difficulty)}cc, ${getDifficultyColor(difficulty)}85); box-shadow: 0 0 8px ${getDifficultyColor(difficulty)}40;"
                             title="${name}级: ${count}个 (${((count/total)*100).toFixed(1)}%)">
                            <div class="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold whitespace-nowrap" style="color: ${getDifficultyColor(difficulty)}">
                                ${count > 0 ? count : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            labelsHtml += `
                <div class="flex-1 text-center">
                    <div class="text-xs font-medium ${isDarkMode ? 'text-gray-300' : ''}">${difficulty}级</div>
                </div>
            `;
        });
        
        difficultyChart.innerHTML = chartHtml;
        chartLabels.innerHTML = labelsHtml;
        // ★2026-08-26 右上角「总计」已删除（避免与统计卡片重复）；平均难度在左上角 chartAvgDiff 显示
        
        difficultyChart.querySelectorAll('.bg-gradient-to-t').forEach((bar, index) => {
            bar.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.1)';
                this.style.zIndex = '10';
            });
            bar.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1.05)';
                this.style.zIndex = '1';
            });
        });
    }
    renderHeatmap(); // v1.0.7.7 切到概览刷新热力图
}

// ===== 徒步足迹热力图（v1.0.7.7：红色渐变 + 年月可选 + 日历式月视图） =====
let hmYear = 0, hmMonth = 0;
// ★2026-08-11 热力图事件只绑定一次（initHeatmap 会被多次调用：初始化 + 底栏刷新重置）
let hmBound = false;
function bindHeatmapEvents() {
    const ySel = document.getElementById('hmYear');
    const mSel = document.getElementById('hmMonth');
    if (!ySel || !mSel || hmBound) return;
    hmBound = true;
    ySel.addEventListener('change', function () {
        hmYear = parseInt(ySel.value, 10);
        fillHmMonths(hmYear, 1);
        renderHeatmap();
    });
    mSel.addEventListener('change', function () {
        hmMonth = parseInt(mSel.value, 10);
        renderHeatmap();
    });
}

function initHeatmap() {
    const ySel = document.getElementById('hmYear');
    const mSel = document.getElementById('hmMonth');
    if (!ySel || !mSel) return;
    const now = new Date();
    // 只显示有记录的年（无记录兜底当前年）
    const years = getRecordYears();
    const yearList = years.length ? years : [now.getFullYear()];
    ySel.innerHTML = '';
    yearList.forEach(function (y) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y + '年';
        ySel.appendChild(opt);
    });
    const curYear = now.getFullYear();
    const targetYear = yearList.indexOf(curYear) >= 0 ? curYear : yearList[0];
    ySel.value = targetYear;
    hmYear = targetYear;
    fitSelectWidth(ySel);
    fillHmMonths(targetYear, now.getMonth() + 1);
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

function fillHmMonths(year, preferred) {
    const mSel = document.getElementById('hmMonth');
    if (!mSel) return;
    const now = new Date();
    const months = getRecordMonths(year);
    const list = months.length ? months : [now.getMonth() + 1];
    mSel.innerHTML = '';
    list.forEach(function (m) {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m + '月';
        mSel.appendChild(opt);
    });
    const target = list.indexOf(preferred) >= 0 ? preferred : list[list.length - 1];
    mSel.value = target;
    hmMonth = parseInt(mSel.value, 10);
    fitSelectWidth(mSel);
}
// ★2026-08-27 热力图渲染缓存：key = 年月+数据指纹（记录变才重建，重复进入秒开）
let heatmapCache = {};
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
    const cacheKey = year + '_' + month + '_' + dataFp;
    let html = heatmapCache[cacheKey];
    if (html === undefined) {
        const dayCount = {};
        records.forEach(function (r) {
            if (!r.createdAt) return;
            const d = new Date(r.createdAt);
            if (isNaN(d.getTime())) return;
            if (d.getFullYear() === year && d.getMonth() + 1 === month) {
                const day = d.getDate();
                dayCount[day] = (dayCount[day] || 0) + 1;
            }
        });
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
    const total = Array.prototype.reduce.call(cal.querySelectorAll('.hm-day:not(.empty)'), function (s, el) {
        return s + (parseInt(el.getAttribute('data-count'), 10) || 0);
    }, 0);
    if (sumEl) sumEl.textContent = year + '年' + month + '月 · 徒步 ' + total + ' 次';
    // ★2026-08-26 累计爬升已移到概览统计卡片（总爬升），热力图底部不再重复显示
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
        const moodTxt = r.mood ? '<span class="hm-meta-item"><span class="hm-meta-label">心情：</span><span class="hm-meta-value">' + (MOOD_TEXT[r.mood] || r.mood) + '</span></span>' : '';
        const weatherTxt = r.weather ? '<span class="hm-meta-item"><span class="hm-meta-label">天气：</span><span class="hm-meta-value">' + (WEATHER_TEXT[r.weather] || r.weather) + '</span></span>' : '';
        const companionTxt = r.companions ? '<span class="hm-meta-item"><span class="hm-meta-label">同行：</span><span class="hm-meta-value">' + r.companions + '</span></span>' : '';
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
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px;">' +
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
            return (t.name || '').toLowerCase().indexOf(q) >= 0;
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
                aVal = aVal ? new Date(aVal).getTime() : 0;
                bVal = bVal ? new Date(bVal).getTime() : 0;
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
            let aT = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
            let bT = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
    var todayKey = fmtPlanDateKey(new Date().toISOString());

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
        cells += '<div data-key="' + key + '" style="position:relative;min-height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:' + (has ? 'pointer' : 'default') + ';' +
            'background:' + (sel ? (dark ? 'rgba(129,140,248,0.25)' : 'rgba(102,126,234,0.2)') : '') + ';' +
            'border:' + (isToday ? '1px solid ' + accent : '1px solid transparent') + ';">' +
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
    // 默认选中：今天有计划则选中今天，否则选当月第一个有计划的日期
    if (!calendarSelKey) {
        if (byDate[todayKey]) { calendarSelKey = todayKey; }
        else {
            var keys = Object.keys(byDate).sort();
            var monthPrefix = calendarViewYear + '-' + ('0' + (calendarViewMonth + 1)).slice(-2) + '-';
            for (var k = 0; k < keys.length; k++) {
                if (keys[k].indexOf(monthPrefix) === 0) { calendarSelKey = keys[k]; break; }
            }
        }
    }
    if (calendarSelKey) renderCalDayDetail(calendarSelKey);
}

function renderCalDayDetail(key) {
    var box = safeGetElementById('calDayDetail');
    if (!box) return;
    var plans = (plannedTrips || []).filter(function (t) { return fmtPlanDateKey(t.createdAt) === key; });
    if (!plans.length) { box.innerHTML = ''; return; }
    var dark = document.body.classList.contains('dark-mode');
    var accent = dark ? '#818cf8' : '#667eea';
    var html = '<div style="font-size:13px;font-weight:600;margin-bottom:6px;">' + key + ' 计划</div>';
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
            '<div style="min-width:0;"><div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            (isMatch ? '<span style="color:' + accent + ';font-size:12px;">● </span>' : '') +
            escapeHtml(t.name) +
            (isMatch ? ' <span style="font-size:11px;color:' + accent + ';font-weight:400;">匹配</span>' : '') +
            '</div>' +
            '<div style="font-size:11px;color:rgba(100,116,139,0.9);">Lv' + t.difficulty + (t.elevation ? ' · ' + t.elevation + 'm' : '') + '</div></div>' +
            '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            '<button class="check-go-btn ripple-effect" data-complete="' + t.id + '" style="padding:6px 12px;border-radius:10px;font-size:12px;">完成</button>' +
            '<button class="confirm-btn-cancel ripple-effect" data-del="' + t.id + '" style="' + delStyle + '">删除</button>' +
            '</div></div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-complete]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-complete');
            var t2 = (plannedTrips || []).find(function (x) { return x.id === id; });
            showConfirmCompleteModal(id, t2 ? t2.name : '');
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

// ★2026-08-25 计划日期提醒：启动时检查未完成计划；★规则：今天有→弹今天（过期忽略）；无今天有过期→弹「计划未完成」；未来 3 天内按 明天/后天/大后天 分组提示
function checkPlannedTripReminders() {
    try {
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var overdue = [], todayList = [], tomorrowList = [], dayAfterList = [], thirdDayList = [];
        (plannedTrips || []).forEach(function (t) {
            if (!t.createdAt || !t.name) return;
            var d = new Date(t.createdAt);
            if (isNaN(d.getTime())) return;
            var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            var diff = Math.round((day - today) / 86400000);
            if (diff < 0) overdue.push(t.name);
            else if (diff === 0) todayList.push(t.name);
            else if (diff === 1) tomorrowList.push(t.name);
            else if (diff === 2) dayAfterList.push(t.name);
            else if (diff === 3) thirdDayList.push(t.name);
        });
        // ★2026-08-25 今天 + 未来 3 天合并成一条（不重叠）；仅无任何计划时弹过期
        var parts = [];
        if (todayList.length) parts.push('今天有徒步计划：' + todayList.join('、'));
        if (tomorrowList.length) parts.push('明天有徒步计划：' + tomorrowList.join('、'));
        if (dayAfterList.length) parts.push('后天有徒步计划：' + dayAfterList.join('、'));
        if (thirdDayList.length) parts.push('大后天有徒步计划：' + thirdDayList.join('、'));
        if (parts.length) showSystemNotification('徒步计划提醒', parts.join(' · ')); // ★2026-08-30 系统通知（网页版降级 toast）
        else if (overdue.length) showSystemNotification('徒步计划未完成', '计划未完成：' + overdue.join('、'));
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
        
        const tableContent = pageTrips.map((trip, idx) => {
            if (plannedEditingId === trip.id) {
                return `
                    <tr class="border-b border-gray-200">
                        <td class="p-2" data-label="名称">
                            <div class="input-with-search">
                                <input type="text" 
                                       id="edit-planned-name-${trip.id}" 
                                       value="${escapeHtml(trip.name)}" 
                                       data-testid="edit-planned-name-${trip.id}"
                                       class="edit-input input-glow"
                                       placeholder="输入名称"
                                       autocomplete="off"
                                       autocorrect="off"
                                       autocapitalize="off"
                                       spellcheck="false"
                                       inputmode="text"
                                       enterkeyhint="next">
                            </div>
                        </td>
                        <td class="p-2" data-label="海拔">
                            <input type="number" 
                                   id="edit-planned-elevation-${trip.id}" 
                                   value="${trip.elevation}" 
                                   data-testid="edit-planned-elevation-${trip.id}"
                                   class="edit-input input-glow"
                                   min="0"
                                   placeholder="海拔"
                                   inputmode="numeric"
                                   pattern="[0-9]*"
                                   enterkeyhint="next">
                        </td>
                        <td class="p-2" data-label="难度">
                            <select id="edit-planned-difficulty-${trip.id}" 
                                    data-testid="edit-planned-difficulty-${trip.id}"
                                    class="edit-input input-glow">
                                <option value="1" ${trip.difficulty === 1 ? 'selected' : ''}>1级</option>
                                <option value="2" ${trip.difficulty === 2 ? 'selected' : ''}>2级</option>
                                <option value="3" ${trip.difficulty === 3 ? 'selected' : ''}>3级</option>
                                <option value="4" ${trip.difficulty === 4 ? 'selected' : ''}>4级</option>
                                <option value="5" ${trip.difficulty === 5 ? 'selected' : ''}>5级</option>
                            </select>
                        </td>
                        <td class="p-2" data-label="记录时间">
                            <input type="datetime-local" 
                                   id="edit-planned-created-at-${trip.id}" 
                                   value="${formatDateTimeLocal(trip.createdAt)}" 
                                   data-testid="edit-planned-created-at-${trip.id}"
                                   class="edit-input input-glow text-xs">
                        </td>
                        <td class="p-2 text-center" data-label="操作">
                            <div class="edit-action-btns">
                                <button id="save-planned-btn-${trip.id}" 
                                        data-testid="save-planned-button-${trip.id}"
                                        class="ripple-effect btn-click-effect bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors text-xs">
                                    保存
                                </button>
                                <button id="cancel-planned-btn-${trip.id}" 
                                        data-testid="cancel-planned-button-${trip.id}"
                                        class="ripple-effect btn-click-effect bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors text-xs">
                                    取消
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // ★2026-08-27 入场动画只首次播（后续刷新/编辑/翻页不重播）
                const rowAnimCls = plannedRowsAnimated ? '' : 'table-row-animate ';
                const rowDelayStyle = plannedRowsAnimated ? '' : ('animation-delay: ' + (idx * 0.05) + 's;');
                return `
                    <tr class="table-row-advanced ${rowAnimCls}border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="planned-row-${trip.id}" style="${rowDelayStyle}">
                        <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="planned-name-cell-${trip.id}">
                            ${plannedBatchMode ? '<input type="checkbox" class="planned-batch-check" data-id="' + trip.id + '"' + (plannedBatchSelected.has(trip.id) ? ' checked' : '') + ' style="width:16px;height:16px;flex-shrink:0;vertical-align:middle;accent-color:#b91c1c;">' : ''}
                            ${escapeHtml(trip.name)}
                        </td>
                        <td class="p-2 text-white/80 text-base font-medium" data-label="海拔">
                            ${trip.elevation}
                        </td>
                        <td class="p-2" data-label="难度">
                            <span class="difficulty-badge difficulty-badge-advanced px-2 py-1 rounded text-white text-sm font-medium"
                                  style="background: ${getDifficultyGlass(trip.difficulty)}; border-color: ${getDifficultyBorder(trip.difficulty)};">
                                ${getDifficultyText(trip.difficulty)}
                            </span>
                        </td>
                        <td class="p-2 text-white/60 text-sm" data-label="记录时间">
                            ${formatDateTime(trip.createdAt)}
                        </td>
                        <td class="p-2 text-center" data-label="操作">
                            ${plannedBatchMode ? '' : '<button id="complete-planned-btn-' + trip.id + '" data-testid="complete-planned-button-' + trip.id + '" class="ripple-effect btn-click-effect bg-green-600 text-white p-1 rounded hover:bg-green-700 transition-colors inline-flex items-center justify-center mr-1" title="标记为已完成"><span class="material-icons">check</span></button><button id="delete-planned-btn-' + trip.id + '" data-testid="delete-planned-button-' + trip.id + '" class="ripple-effect btn-click-effect bg-red-600 text-white p-1 rounded hover:bg-red-700 transition-colors inline-flex items-center justify-center" title="删除"><span class="material-icons">delete</span></button>'}
                        </td>
                    </tr>
                `;
            }
        }).join('');
        
        if (tbody) safeSetElementContent('plannedTripsTable', tableContent);
        plannedRowsAnimated = true; // ★2026-08-27 首次有行渲染后置位（后续不播入场动画）
        
        // 表格横向滚动归位（刷新/重渲染后回到最左）
        if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
            tbody.parentElement.parentElement.scrollLeft = 0;
        }
        
        attachPlannedTripsEventListeners();
    });

    fitEditSelects(); // v1.0.7.11 编辑行难度框宽度自适应
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
        if (plannedEditingId === trip.id) {
            const saveBtn = safeGetElementById(`save-planned-btn-${trip.id}`);
            const cancelBtn = safeGetElementById(`cancel-planned-btn-${trip.id}`);
            
            if (saveBtn) {
                saveBtn.addEventListener('click', () => savePlannedTrip(trip.id));
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => cancelPlannedEdit());
            }
        } else {
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
                    startPlannedEdit(trip.id);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => showDeletePlannedTripConfirmModal(trip.id, trip.name));
            }
            
            const completeBtn = safeGetElementById(`complete-planned-btn-${trip.id}`);
            if (completeBtn) {
                completeBtn.addEventListener('click', () => showConfirmCompleteModal(trip.id, trip.name));
            }
        }
    });
}

function startPlannedEdit(id) {
    plannedEditingId = id;
    renderPlannedTripsTable();
    // 2026-08-11 用户要求：点击可编辑栏不直接弹输入法——不再自动聚焦输入框
}

function cancelPlannedEdit() {
    const trip = plannedTrips.find(t => t.id === plannedEditingId);
    if (trip && !trip.name) {
        plannedTrips = plannedTrips.filter(t => t.id !== plannedEditingId);
        savePlannedTripsToStorage();
    }
    plannedEditingId = null;
    renderPlannedTripsTable();
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
            plannedTrips[tripIndex].createdAt = new Date(createdAtInput.value).toISOString();
        }
        // ★2026-08-26 最后修改时间
        plannedTrips[tripIndex].updatedAt = new Date().toISOString();
    }
    
    plannedEditingId = null;
    savePlannedTripsToStorage();
    renderPlannedTripsTable();
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
    
    // ★2026-08-31 跳到记录页并进入行内编辑（名字/难度/海拔已预填，补完即保存）
    if (typeof window.switchTab === 'function') window.switchTab('records');
    startEdit(newRecord.id);
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
            const validTrips = plannedTrips.filter(trip => {
                return trip && 
                       typeof trip.id === 'string' &&
                       typeof trip.name === 'string' &&
                       typeof trip.difficulty === 'number' &&
                       typeof trip.elevation === 'number';
            });
            
            if (validTrips.length !== plannedTrips.length) {
                console.warn(`Filtered ${plannedTrips.length - validTrips.length} invalid planned trips`);
                plannedTrips = validTrips;
            }
            
            await AppStore.setItem(PLANNED_TRIPS_KEY, { trips: validTrips });
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
            plannedTrips = data.trips.filter(trip => {
                return trip && 
                       typeof trip.id === 'string' &&
                       typeof trip.name === 'string' &&
                       typeof trip.difficulty === 'number' &&
                       typeof trip.elevation === 'number' &&
                       trip.difficulty >= 1 && 
                       trip.difficulty <= 5 &&
                       trip.elevation >= 0;
            }).map(trip => ({
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

let saveTimeout = null;

async function saveToStorage() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(async () => {
        try {
            const validRecords = records.filter(record => {
                return record && 
                       typeof record.id === 'string' &&
                       typeof record.name === 'string' &&
                       typeof record.difficulty === 'number' &&
                       typeof record.elevation === 'number';
            });
            
            if (validRecords.length !== records.length) {
                console.warn(`Filtered ${records.length - validRecords.length} invalid records`);
                records = validRecords;
            }
            
            await AppStore.setItem(STORAGE_KEY, { records: validRecords });
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
