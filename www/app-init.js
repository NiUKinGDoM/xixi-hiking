async function init() {
    if (isInitialized) {
        return;
    }

    isInitialized = true;
    const startTime = performance.now();

    try {
        // ★2026-08-28 底层优化：启动不再预渲染记录表——此时数据未加载（records=空），
        //   渲染空表 + 空数据统计纯属浪费（且与数据加载后的 updateStatistics 重复执行两次）；
        //   启动默认在概览页，记录/计划表由 switchTab 懒渲染兜底（v1.1.1.5 机制）
        
        const [storageData, darkModeData, themeModeData, titleData, statsTitleData, recordsTitleData, plannedTitleData, settingsTitleData, heatmapTitleData, fpsData, hapticData] = await Promise.allSettled([
            AppStore.getItem(STORAGE_KEY),
            AppStore.getItem(DARK_MODE_KEY),
            AppStore.getItem(THEME_MODE_KEY),
            AppStore.getItem(APP_TITLE_KEY),
            AppStore.getItem(STATS_TITLE_KEY),
            AppStore.getItem(RECORDS_TITLE_KEY),
            AppStore.getItem(PLANNED_TITLE_KEY),
            AppStore.getItem(SETTINGS_TITLE_KEY),
            AppStore.getItem(HEATMAP_TITLE_KEY),
            AppStore.getItem(SHOW_FPS_KEY),
            AppStore.getItem(HAPTIC_KEY)
        ]);
        
        if (storageData.status === 'fulfilled' && storageData.value && Array.isArray(storageData.value.records)) {
            records = storageData.value.records.filter(record => {
                return record && 
                       typeof record.id === 'string' &&
                       typeof record.name === 'string' &&
                       typeof record.difficulty === 'number' &&
                       typeof record.elevation === 'number' &&
                       record.difficulty >= 1 && 
                       record.difficulty <= 5 &&
                       record.elevation >= 0;
            }).map(record => ({
                ...record,
                name: record.name.trim(),
                difficulty: Math.min(5, Math.max(1, Math.round(record.difficulty))),
                elevation: Math.max(0, Math.round(record.elevation))
            }));
        }
        
        // 主题模式加载（v1.4.10.2 三态：优先读新 themeMode，兼容旧 isDarkMode 布尔）
        let loadedTheme = null;
        if (themeModeData.status === 'fulfilled' && themeModeData.value && typeof themeModeData.value.mode === 'string') {
            loadedTheme = themeModeData.value.mode;
        }
        if (!loadedTheme && darkModeData.status === 'fulfilled' && darkModeData.value && typeof darkModeData.value.isDarkMode === 'boolean') {
            // 旧数据：isDarkMode=true → dark，false → light（不是 auto，避免与用户手动选择冲突）
            loadedTheme = darkModeData.value.isDarkMode ? 'dark' : 'light';
        }
        themeMode = (loadedTheme === 'light' || loadedTheme === 'dark' || loadedTheme === 'auto') ? loadedTheme : 'auto';
        applyThemeMode();
        
        if (titleData.status === 'fulfilled' && titleData.value && typeof titleData.value.title === 'string') {
            const titleElement = document.getElementById('appTitle');
            if (titleElement) {
                titleElement.textContent = titleData.value.title;
            }
        }
        
        // 加载区块标题
        if (statsTitleData.status === 'fulfilled' && statsTitleData.value && typeof statsTitleData.value.title === 'string') {
            const titleElement = document.getElementById('statsTitle');
            if (titleElement) {
                const titleTextElement = titleElement.querySelector('.title-text');
                if (titleTextElement) {
                    titleTextElement.textContent = statsTitleData.value.title;
                }
            }
        }
        
        if (recordsTitleData.status === 'fulfilled' && recordsTitleData.value && typeof recordsTitleData.value.title === 'string') {
            const titleElement = document.getElementById('recordsTitle');
            if (titleElement) {
                const titleTextElement = titleElement.querySelector('.title-text');
                if (titleTextElement) {
                    titleTextElement.textContent = recordsTitleData.value.title;
                }
            }
        }
        
        if (plannedTitleData.status === 'fulfilled' && plannedTitleData.value && typeof plannedTitleData.value.title === 'string') {
            const titleElement = document.getElementById('plannedTitle');
            if (titleElement) {
                const titleTextElement = titleElement.querySelector('.title-text');
                if (titleTextElement) {
                    titleTextElement.textContent = plannedTitleData.value.title;
                }
            }
        }
        
        if (settingsTitleData.status === 'fulfilled' && settingsTitleData.value && typeof settingsTitleData.value.title === 'string') {
            const titleElement = document.getElementById('settingsTitle');
            if (titleElement) {
                const titleTextElement = titleElement.querySelector('.title-text');
                if (titleTextElement) {
                    titleTextElement.textContent = settingsTitleData.value.title;
                }
            }

        if (heatmapTitleData.status === 'fulfilled' && heatmapTitleData.value && typeof heatmapTitleData.value.title === 'string') {
            const titleElement = document.getElementById('heatmapTitle');
            if (titleElement) {
                const titleTextElement = titleElement.querySelector('.title-text');
                if (titleTextElement) {
                    titleTextElement.textContent = heatmapTitleData.value.title;
                }
            }
        }
        }
        
        // 帧率显示开关
        if (fpsData.status === 'fulfilled' && fpsData.value && typeof fpsData.value.showFps === 'boolean') {
            showFps = fpsData.value.showFps;
        }
        applyFpsPreference();
        
        // 震动反馈开关（v1.1.1.1，默认开）
        if (hapticData.status === 'fulfilled' && hapticData.value && typeof hapticData.value.enabled === 'boolean') {
            hapticEnabled = hapticData.value.enabled;
        }
        const hapticToggleEl = document.getElementById('hapticToggle');
        if (hapticToggleEl) hapticToggleEl.checked = hapticEnabled;
        
        // ★2026-08-21 v1.1.1.5 启动优化：启动只渲染当前概览页，记录/计划表格延迟到切 tab 时渲染
        updateStatistics();
        
        // ★2026-08-27 启动并行：计划 + 同步配置/状态并行加载（原串行 await，省一次 IndexedDB 往返，启动更快）
        await Promise.all([
            loadPlannedTripsFromStorage(),
            loadSyncState().catch(function () { /* 同步初始化失败不阻塞启动 */ })
        ]);
        // ★2026-08-28 底层优化：数据全部就绪后，仅当用户已在记录/计划页（数据未加载完就切页的边界）才补渲染；
        //   正常启动停在概览页，表格继续由 switchTab 懒渲染兜底，零额外开销
        try {
            if (currentTabId === 'records' && typeof renderTable === 'function') renderTable();
            else if (currentTabId === 'plans' && typeof renderPlannedTripsTable === 'function') renderPlannedTripsTable();
        } catch (e) { /* 补渲染失败不影响启动 */ }
        // ★2026-08-30 通知点击动作消费（冷启动路径）：点通知本体 → 跳计划页
        //（consumeNotifyAction 取走即清空，重复调用幂等）
        function consumeNotifyActionOnce() {
            try {
                if (!window.XixiFileBridge || typeof window.XixiFileBridge.consumeNotifyAction !== 'function') return;
                var notifyAction = window.XixiFileBridge.consumeNotifyAction();
                if (!notifyAction) return;
                var notifyObj = JSON.parse(notifyAction);
                if (notifyObj && notifyObj.navigate === 'plans') {
                    try { switchTab('plans'); } catch (e) { /* 跳转失败不影响 */ }
                }
            } catch (e) { /* 消费失败不影响启动 */ }
        }
        consumeNotifyActionOnce();
        // ★2026-08-30 热启动路径：App 存活时点通知回前台 → visibilitychange visible 触发消费（幂等，不会重复执行）
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                try { consumeNotifyActionOnce(); } catch (e) { /* 忽略 */ }
            }
        });
        // ★2026-08-30 启动同步计划闹钟：不打开 App 也能收到计划提醒（原生 AlarmManager，每天 08:00）
        syncPlanAlarmsBridge();
        // ★2026-08-25 计划日期提醒（今天有/已过期未完成）：延迟 1s 显示、toast 停留 2s
        setTimeout(checkPlannedTripReminders, 1000);
        
        setupEventListeners();
        updateSortIcons();
        initGlobalSearch(); // ★2026-08-27 记录/计划搜索（方案A 滚动显示）
        
        // WebDAV 同步：配置已由 loadSyncState 并行加载，这里绑定事件 + 若开启自动同步则静默合并
        try {
            setupSyncEventListeners();
            bindAutoCheckOnSettingsTab();
            initSystemThemeListener(); // ★跟随系统深色模式监听（v1.4.10.2）
            if (syncAuto && syncConfig.server && syncConfig.username) {
                // ★2026-08-19 v1.1.0.1 根治启动卡死：0.8s→3s（等首屏稳定后再同步；原生同步桥超时已缩，双保险）
                // ★2026-08-27 离线优化：断网启动直接跳过自动同步（避免必失败的请求 + 白弹错误提示），联网后下次数据变更再同步
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    /* 离线：跳过自动同步，静默等待恢复网络 */
                } else {
                    setTimeout(function () { mergeSyncBackup(true); }, 3000);
                }
            }
        } catch (e) {
            console.error('Sync init error:', e);
        }
        
    } catch (error) {
        console.error('Initialization error:', error);
        records = [];
        renderTable();
    }
}

// ★2026-08-21 v1.1.1.1 震动反馈：App 走原生桥（跟随系统触摸反馈强度），网页版 navigator.vibrate
// v1.1.1.2 修复：桥名是 XixiFileBridge（vibrate 挂在该桥下），原 XixiVibration 不存在导致 App 不震
function triggerHaptic(ms) {
    if (!hapticEnabled) return;
    var dur = ms || 15;
    try {
        if (window.XixiFileBridge && typeof window.XixiFileBridge.vibrate === 'function') {
            window.XixiFileBridge.vibrate(dur);
            return;
        }
        // 网页版：安卓浏览器支持，不支持则静默跳过（iOS 不报错）
        if (navigator.vibrate) navigator.vibrate(dur);
    } catch (e) { /* 震动失败静默 */ }
}

function setupEventListeners() {
    // ★2026-08-21 照片占用统计（设置页）
    refreshPhotoUsage();
    // ★2026-08-21 v1.1.1.1 震动反馈：全局点击委托——只对按钮/可点击控件短震，空白处不震
    const hapticClickHandler = function (e) {
        if (!hapticEnabled) return;
        // 命中按钮类才震：原生 <button> + 全 App 模拟按钮/可点击行
        var btn = e.target.closest('button, .tab-btn, .glass-btn, .modal-option-btn, .modal-cancel-btn, .confirm-btn-cancel, .confirm-btn-delete, .btn-click-effect, .restore-file-item, .sort-header, .sync-config-toggle-btn, .settings-item, .settings-switch, .glass-modal .modal-option-btn, [data-testid$="-button"]');
        if (btn) triggerHaptic();
    };
    document.addEventListener('click', hapticClickHandler);
    cleanupFunctions.push(() => document.removeEventListener('click', hapticClickHandler));
    
    // 顶栏标题编辑（v1.4.12.9：点击标题或铅笔图标弹窗修改；只绑 wrap，子元素冒泡触发一次）
    const appTitleWrap = document.getElementById('appTitleWrap');
    if (appTitleWrap) {
        const titleHandler = showEditTitleModal;
        appTitleWrap.addEventListener('click', titleHandler);
        cleanupFunctions.push(() => appTitleWrap.removeEventListener('click', titleHandler));
    // 徒步足迹热力图初始化（v1.0.7.7）
    initHeatmap();
    }
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        const handler = addNewRecord;
        addBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => addBtn.removeEventListener('click', handler));
    }

    // 检查更新（★2026-08-27 直接检查：确认弹窗已删，更新内容看关于页「查看更新日志」）
    const checkUpdateItem = document.getElementById('checkUpdateItem');
    if (checkUpdateItem) {
        const handler = checkForUpdate;
        checkUpdateItem.addEventListener('click', handler);
        cleanupFunctions.push(() => checkUpdateItem.removeEventListener('click', handler));
    }

    // 数据管理 i 标识 → 说明弹窗（2026-08-11）
    const dataInfoIcon = document.getElementById('dataInfoIcon');
    if (dataInfoIcon) {
        const handler = showDataInfoModal;
        dataInfoIcon.addEventListener('click', handler);
        cleanupFunctions.push(() => dataInfoIcon.removeEventListener('click', handler));
    }
    
    // ★2026-08-27 关于页：查看更新日志按钮
    const changelogBtn = document.getElementById('changelogBtn');
    if (changelogBtn) {
        changelogBtn.addEventListener('click', showChangelogModal);
    }
    // ★2026-08-27 关于页：GitHub 图标 → 外部浏览器打开仓库（原生拦截 http/https 跳转）
    const githubBtn = document.getElementById('githubBtn');
    if (githubBtn) {
        githubBtn.addEventListener('click', function () {
            window.location.href = 'https://github.com/NiUKinGDoM/xixi-hiking';
        });
    }
    
    // 导入按钮
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        // ★2026-08-11 命令后 2 秒自动回正 WebDAV 状态（scheduleSyncStatusRefresh 内部防抖+判配置）
        const handler = function () {
            showImportModal();
            scheduleSyncStatusRefresh(2000);
        };        importBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => importBtn.removeEventListener('click', handler));
    }
    
    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        const handler = function () {
            exportRecords();
            scheduleSyncStatusRefresh(2000);
        };
        exportBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => exportBtn.removeEventListener('click', handler));
    }
    
    // 计划徒步行添加按钮
    const addPlannedBtn = document.getElementById('addPlannedTripBtn');
    if (addPlannedBtn) {
        const handler = addNewPlannedTrip;
        addPlannedBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => addPlannedBtn.removeEventListener('click', handler));
    }
    
    // ★2026-08-31 计划视图切换（列表/日历）
    const plansViewToggleBtn = document.getElementById('plansViewToggleBtn');
    if (plansViewToggleBtn) {
        const handler = togglePlansView;
        plansViewToggleBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => plansViewToggleBtn.removeEventListener('click', handler));
    }
    // 恢复上次视图模式
    try { if (typeof applyPlansView === 'function') applyPlansView(); } catch (e) { /* 视图恢复失败不影响 */ }
    
    // ★主题开关绑定（v1.4.10.2）：设置页「跟随系统」+「深色模式」两开关
    const themeFollowToggle = document.getElementById('themeFollowToggle');
    if (themeFollowToggle) {
        const handler = function () {
            // 打开跟随系统 → auto；关闭 → 保持当前实际模式（若当前是暗则 dark，否则 light）
            if (themeFollowToggle.checked) {
                setThemeMode('auto');
            } else {
                setThemeMode(isDarkModeActive() ? 'dark' : 'light');
            }
        };
        themeFollowToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => themeFollowToggle.removeEventListener('change', handler));
    }
    const themeDarkToggle = document.getElementById('themeDarkToggle');
    if (themeDarkToggle) {
        const handler = function () {
            // 手动切暗色：同时关闭跟随系统
            const followToggle = document.getElementById('themeFollowToggle');
            if (followToggle) followToggle.checked = false;
            setThemeMode(themeDarkToggle.checked ? 'dark' : 'light');
        };
        themeDarkToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => themeDarkToggle.removeEventListener('change', handler));
    }
    
    // 顶栏标题不可修改（已锁定，移除点击编辑）
    
    // ★2026-08-25 区块标题改为不可编辑（用户要求）：统计概览/难度分布/徒步足迹/计划/记录/设置 全部移除点击编辑绑定
    
    // 帧率显示开关
    const fpsToggle = document.getElementById('fpsToggle');
    if (fpsToggle) {
        const handler = async () => {
            showFps = fpsToggle.checked;
            try {
                await AppStore.setItem(SHOW_FPS_KEY, { showFps });
            } catch (e) {
                console.error('保存帧率开关失败:', e);
            }
            applyFpsPreference();
        };
        fpsToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => fpsToggle.removeEventListener('change', handler));
    }
    
    // 震动反馈开关（v1.1.1.1）
    const hapticToggle = document.getElementById('hapticToggle');
    if (hapticToggle) {
        const handler = async () => {
            hapticEnabled = hapticToggle.checked;
            try {
                await AppStore.setItem(HAPTIC_KEY, { enabled: hapticEnabled });
            } catch (e) {
                console.error('保存震动开关失败:', e);
            }
            // 开/关瞬间给一个反馈，让用户知道开关生效
            if (hapticEnabled) triggerHaptic();
        };
        hapticToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => hapticToggle.removeEventListener('change', handler));
    }
    
    document.querySelectorAll('.sort-header').forEach(header => {
        const handler = () => {
            const sortField = header.dataset.sort;
            handleSort(sortField);
        };
        header.addEventListener('click', handler);
        cleanupFunctions.push(() => header.removeEventListener('click', handler));
    });
    
    // 计划徒步行排序事件
    document.querySelectorAll('.sort-header-planned').forEach(header => {
        const handler = () => {
            const sortField = header.dataset.sort;
            handlePlannedTripSort(sortField);
        };
        header.addEventListener('click', handler);
        cleanupFunctions.push(() => header.removeEventListener('click', handler));
    });
    
    // 启动FPS监控
    applyFpsPreference();
    cleanupFunctions.push(stopFPSMonitor);

    // ===== 底部悬浮导航栏：概览/计划/记录 切换 =====
    var tabButtons = document.querySelectorAll('#bottomTabBar .tab-btn');
    // 当前激活的 tab（2026-08-11：点击当前 tab = 手动刷新该页数据）
    // ★2026-08-27 currentTabId 已提升为全局变量（搜索功能在全局函数中引用），这里不再重复声明
    function switchTab(tabId) {
        var pages = { overview: 'tab-overview', plans: 'tab-plans', records: 'tab-records', settings: 'tab-settings' };
        var pageId = pages[tabId];
        if (!pageId) return;
        // ★2026-08-11 点击当前已激活的 tab：强制刷新该页数据（记录/计划重新渲染表格），不重播切换动画
        if (tabId === currentTabId) {
            // ★2026-08-14 四页统一：点击当前 tab 平滑滚动回屏幕顶部（内容不足一屏时无效果，无副作用）
            try {
                var scroller = document.scrollingElement || document.documentElement;
                scroller.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (e) { window.scrollTo(0, 0); }
            if (tabId === 'records' && typeof renderTable === 'function') {
                // ★2026-08-26 二次点击刷新回到第一页（否则停留在第二页等会让人以为刷新没生效）
                recordPage = 1;
                // ★2026-08-11 二次点击刷新：若正在行内编辑，先取消编辑恢复显示态再渲染
                if (typeof editingId !== 'undefined' && editingId !== null) {
                    try { cancelEdit(); } catch (e) { console.error('cancel edit failed:', e); }
                } else {
                    try { renderTable(); } catch (e) { console.error('refresh records failed:', e); }
                }
            } else if (tabId === 'plans' && typeof renderPlannedTripsTable === 'function') {
                // ★2026-08-26 二次点击刷新回到第一页
                plannedPage = 1;
                // ★2026-08-31 日历视图二次点击：自动回到当天（月/选中/搜索定位全部复位）
                if (typeof plansViewMode !== 'undefined' && plansViewMode === 'calendar') {
                    var nowCal = new Date();
                    calendarViewYear = nowCal.getFullYear();
                    calendarViewMonth = nowCal.getMonth();
                    calendarSelKey = null;
                    calendarSearchMatches = null;
                }
                // ★2026-08-11 二次点击刷新：先退出计划编辑态再渲染
                if (typeof plannedEditingId !== 'undefined' && plannedEditingId !== null) {
                    plannedEditingId = null;
                }
                try { renderPlannedTripsTable(); } catch (e) { console.error('refresh plans failed:', e); }
            } else if (tabId === 'overview') {
                if (typeof updateStatistics === 'function') {
                    try { updateStatistics(); } catch (e) { console.error('refresh overview failed:', e); }
                }
                // ★2026-08-11 热力图一并重置到最新日期并刷新数据（initHeatmap 已幂等）
                try { initHeatmap(); } catch (e) { console.error('refresh heatmap failed:', e); }
                // ★2026-08-11 用户要求：概览二次点击刷新要有视觉反馈（统计卡+热力图面板轻量渐入）
                // 2026-08-11 v1.0.9.2 修复：改用 WAAPI animate 一次性渐入（无类切换/无回退/绝不二次播放），
                // 且先取消统计卡内数字滚动动画（number-scroll/countUp）避免叠加成"两次刷新"
                const statCards = document.querySelectorAll('#tab-overview .glass-stat-card');
                statCards.forEach(card => {
                    card.querySelectorAll('.number-scroll').forEach(el => {
                        el.classList.remove('number-scroll');
                        if (typeof el.getAnimations === 'function') {
                            el.getAnimations().forEach(a => a.cancel());
                        }
                    });
                });
                const fadeTargets = document.querySelectorAll('#tab-overview .glass-stat-card, #heatmapPanel');
                fadeTargets.forEach(el => {
                    if (typeof el.animate === 'function') {
                        try {
                            el.animate(
                                [{ opacity: 0.45, transform: 'scale(0.99)' }, { opacity: 1, transform: 'scale(1)' }],
                                { duration: 380, easing: 'ease-out', fill: 'both' }
                            );
                        } catch (e) { /* 动画失败静默，不影响刷新 */ }
                    }
                });
            } else if (tabId === 'settings') {
                // ★2026-08-11 设置页刷新：状态行 + 逐块浮现动画（不覆盖输入框、不发网络请求）
                try { refreshSettingsUI(); } catch (e) { console.error('refresh settings failed:', e); }
            }
            return;
        }
        // 切换界面时自动取消正在进行的编辑，恢复编辑前数据
        if (typeof editingId !== 'undefined' && editingId !== null) {
            cancelEdit();
        }
        if (typeof plannedEditingId !== 'undefined' && plannedEditingId !== null) {
            plannedEditingId = null;
            renderPlannedTripsTable();
        }
        // ★2026-08-27 批量模式切页自动退出（防忘了退出带着批量状态误点）
        if (batchMode) exitBatchMode();
        if (plannedBatchMode) exitPlannedBatchMode();
        // ★2026-08-27 切页时清空搜索（搜索框收起，下次进页重新滚动呼出）
        if (window.__clearGlobalSearch) window.__clearGlobalSearch();
        document.querySelectorAll('.tab-page').forEach(function (p) {
            p.style.display = 'none';
        });
        var page = safeGetElementById(pageId);
        if (page) {
            page.style.display = 'block';
            // 2026-08-10 修复切tab卡顿：去掉强制重排（animation重置+offsetHeight），设置页DOM大重排慢
            // 页面自带 tabPageFadeIn 淡入，无需手动重启动画
        }
        // ★设置页逐块动画（2026-08-10 机制修复）：切到设置页时临时加 .block-anim 触发逐块浮现，
        //   播完(0.9s)自动移除——平时元素无动画，主题切换不会被重触发，数据管理框不再空白
        if (tabId === 'settings') {
            // ★2026-09-01 切到设置页刷新徒步年资（避免未进记录页时年资不显示）
            if (typeof fillAboutSince === 'function') { try { fillAboutSince(); } catch (e) { /* 忽略 */ } }
            try {
                var settingsChildren = document.querySelectorAll('#tab-settings .glass-panel > *');
                settingsChildren.forEach(function (child) {
                    child.classList.add('block-anim');
                });
                setTimeout(function () {
                    settingsChildren.forEach(function (child) {
                        child.classList.remove('block-anim');
                    });
                }, 950);
            } catch (e) { console.error('settings block anim failed:', e); }
        }
        tabButtons.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
        });
        // 切到概览时刷新统计数据
        if (tabId === 'overview' && typeof updateStatistics === 'function') {
            try { updateStatistics(); } catch (e) { console.error('updateStatistics failed:', e); }
        }
        // ★2026-08-21 v1.1.1.5 懒渲染：切到记录/计划页时渲染对应表格（启动不再全量渲染）
        if (tabId === 'records' && typeof renderTable === 'function') {
            try { renderTable(); } catch (e) { console.error('lazy render records failed:', e); }
        }
        if (tabId === 'plans' && typeof renderPlannedTripsTable === 'function') {
            try { renderPlannedTripsTable(); } catch (e) { console.error('lazy render plans failed:', e); }
        }
        // ★2026-08-27 计划页搜索修复：placeholder 按页切换（计划页不再显示"搜索记录…"）+ 切页自动呼出搜索框一次
        //   （计划少、页面不足一屏时轻滑无法滚动呼出，切页自动出现让用户知道搜索框位置，1 秒不碰自动消失）
        // ★2026-08-31 日历视图模式跳过（搜索是列表功能，日历下不呼出）
        if (tabId === 'records' || (tabId === 'plans' && (!window.plansViewMode || window.plansViewMode !== 'calendar'))) {
            var gsi = safeGetElementById('globalSearchInput');
            if (gsi) gsi.placeholder = tabId === 'records' ? '搜索记录…' : '搜索计划…';
            if (window.__pokeSearchBar) { try { window.__pokeSearchBar(); } catch (e) { /* 忽略 */ } }
        }
        // 切到记录/计划时表格横向滚动归位
        if (tabId === 'records' || tabId === 'plans') {
            var tbl = safeGetElementById(tabId === 'records' ? 'recordsTable' : 'plannedTripsTable');
            if (tbl && tbl.parentElement && tbl.parentElement.parentElement) {
                tbl.parentElement.parentElement.scrollLeft = 0;
            }
        }
        currentTabId = tabId;
    }
    // ★2026-08-31 暴露全局：计划完成补记录（app-data.js markPlannedComplete）需跨文件调用切页
    window.switchTab = switchTab;
    tabButtons.forEach(function (btn) {
        btn._switchTabHandler = function () {
            // 图标点击弹跳动画
            var icon = btn.querySelector('.material-icons');
            if (icon) {
                icon.classList.remove('tab-icon-bounce');
                void icon.offsetWidth;
                icon.classList.add('tab-icon-bounce');
            }
            switchTab(btn.getAttribute('data-tab'));
        };
        btn.addEventListener('click', btn._switchTabHandler);
    });
    cleanupFunctions.push(function () {
        tabButtons.forEach(function (btn) {
            btn.removeEventListener('click', btn._switchTabHandler);
        });
    });
    // ★2026-08-19 v1.1.0.3 底栏按住滑动切换：拖动时只做果冻视觉（不切页面），松手时确认切换到手指所在 tab（点击行为保留）
    var tabDragActive = false;
    var tabDragMoved = false;
    var tabDragSuppressClick = false;
    var tabDragTouchId = null;
    var tabDragTarget = null; // 拖动过程中手指当前所在的 tab
    var tabDragBar = document.getElementById('bottomTabBar');
    // 果冻视觉：手指下按钮拉伸 + 相邻按钮粘连；无目标时清除全部
    function setTabDragVisual(targetBtn) {
        var all = document.querySelectorAll('.bottom-tabbar .tab-btn.drag-target, .bottom-tabbar .tab-btn.drag-adj-left, .bottom-tabbar .tab-btn.drag-adj-right, .bottom-tabbar .tab-btn.drag-preview');
        all.forEach(function (el) { el.classList.remove('drag-target', 'drag-adj-left', 'drag-adj-right', 'drag-preview'); });
        if (!targetBtn) return;
        targetBtn.classList.add('drag-target');
        // ★tabButtons 是 NodeList，无 indexOf —— 用 Array.prototype 调（2026-08-19 修崩溃）
        var idx = Array.prototype.indexOf.call(tabButtons, targetBtn);
        if (idx > 0) tabButtons[idx - 1].classList.add('drag-adj-left');
        if (idx < tabButtons.length - 1) tabButtons[idx + 1].classList.add('drag-adj-right');
    }
    if (tabDragBar) {
        tabDragBar.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            var el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el || !el.closest('.tab-btn')) return;
            tabDragActive = true;
            tabDragMoved = false;
            tabDragTouchId = t.identifier;
            var btn = el.closest('.tab-btn');
            tabDragTarget = btn.getAttribute('data-tab');
            setTabDragVisual(btn); // 按下即有果冻反馈
        }, { passive: true });
        tabDragBar.addEventListener('touchmove', function (e) {
            if (!tabDragActive) return;
            var t = null;
            for (var i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === tabDragTouchId) { t = e.touches[i]; break; }
            }
            if (!t) return;
            e.preventDefault(); // 拖动时不滚动页面
            var el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el) return;
            var btn = el.closest('.tab-btn');
            if (btn) {
                var tb = btn.getAttribute('data-tab');
                tabDragMoved = true;
                if (tb !== tabDragTarget) {
                    tabDragTarget = tb;
                    setTabDragVisual(btn); // 果冻视觉跟随（页面不变）
                }
            }
        }, { passive: false });
        tabDragBar.addEventListener('touchend', function () {
            if (tabDragActive && tabDragMoved) {
                tabDragSuppressClick = true; // 抑制拖动后自动触发的 click（防"刷新+回顶"误触发）
                setTimeout(function () { tabDragSuppressClick = false; }, 120);
                // ★松手确认切换：手指最终所在 tab ≠ 当前才切换（NodeList 用 Array.prototype.find）
                if (tabDragTarget && tabDragTarget !== currentTabId) {
                    var targetBtn = Array.prototype.find.call(tabButtons, function (b) { return b.getAttribute('data-tab') === tabDragTarget; }) || null;
                    if (targetBtn) {
                        targetBtn.classList.remove('drag-target', 'drag-adj-left', 'drag-adj-right', 'drag-preview');
                        targetBtn.classList.add('drag-confirm'); // 松手果冻弹跳
                        setTimeout(function () { targetBtn.classList.remove('drag-confirm'); }, 400);
                    }
                    switchTab(tabDragTarget);
                } else {
                    setTabDragVisual(null); // 松开仍在当前 tab：直接恢复
                }
            } else {
                setTabDragVisual(null); // 无拖动（轻点）：恢复视觉，点击逻辑照常
            }
            tabDragActive = false;
            tabDragMoved = false;
            tabDragTouchId = null;
            tabDragTarget = null;
        });
        tabDragBar.addEventListener('touchcancel', function () {
            setTabDragVisual(null);
            tabDragActive = false;
            tabDragMoved = false;
            tabDragTouchId = null;
            tabDragTarget = null;
        });
        // 捕获阶段拦截拖拽后的 click
        document.addEventListener('click', function (e) {
            if (tabDragSuppressClick) {
                e.preventDefault();
                e.stopPropagation();
                tabDragSuppressClick = false;
            }
        }, true);
    }
}

if (document.readyState === 'loading') {
    // 延迟初始化，给 WebView 足够时间完成布局，防止移动端闪退
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            init().catch(function(err) {
                console.error('Init failed:', err);
            });
            // ★2026-08-19 打开应用自动检测更新（有网大弹窗/没网小提示+恢复重试）
            setTimeout(autoCheckUpdateOnLaunch, 800);
        }, 100);
    });
} else {
    init();
    setTimeout(autoCheckUpdateOnLaunch, 900);

}
