
// ===== POLYFILL: lingguang API (移动端/浏览器兼容层) =====
(function() {
    // 如果已经有 lingguang 对象（桌面端），直接复用
    if (window.lingguang) {
        console.log('[PF] lingguang already exists, skip polyfill');
        return;
    }

    console.log('[PF] Installing lingguang polyfill...');

    // 封装 localStorage，带错误处理
    function safeStorage(method, key, value) {
        try {
            if (method === 'setItem') {
                localStorage.setItem(key, JSON.stringify(value));
            } else if (method === 'getItem') {
                var raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } else if (method === 'removeItem') {
                localStorage.removeItem(key);
            }
        } catch (e) {
            console.warn('[PF] localStorage.' + method + ' failed:', e.message);
            return null;
        }
    }

    window.lingguang = {
        data: {
            fetch: async function(query, schema) {
                return null; // 移动端不调用搜索 API，直接返回空
            }
        },

        saveFile: async function(options) {
            try {
                // App 原生环境：直接用原生桥把 base64 保存到系统下载目录
                if (window.XixiFileBridge && typeof window.XixiFileBridge.saveBase64 === 'function') {
                    var saved = window.XixiFileBridge.saveBase64(options.data, options.filename || 'export.csv');
                    return { success: !!saved };
                }
                // 网页版：降级为 blob + <a download> 下载
                var decoded = atob(options.data);
                var bytes = new Uint8Array(decoded.length);
                for (var i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
                var blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = options.filename || 'export.csv';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return { success: true };
            } catch (e) {
                console.warn('[PF] saveFile failed:', e.message);
                return { success: false };
            }
        },

        storage: {
            setItem: function(key, value) {
                safeStorage('setItem', key, value);
            },
            getItem: function(key) {
                return safeStorage('getItem', key);
            },
            removeItem: function(key) {
                safeStorage('removeItem', key);
            }
        }
    };

    console.log('[PF] Polyfill ready');
})();

// ===== 全局错误保护（防止移动端 WebView 闪退） =====
window.addEventListener('error', function(e) {
    console.error('[GlobalError]', e.message, 'at', e.filename, ':', e.lineno);
    // 阻止错误传播导致 WebView 崩溃
    e.preventDefault();
    return true;
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('[UnhandledRejection]', e.reason);
    // 阻止未处理的 Promise 拒绝导致 WebView 崩溃
    e.preventDefault();
    return true;
});


/* global lingguang */

// Polyfill for requestIdleCallback
if (typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = function(callback) {
        const start = Date.now();
        return setTimeout(function() {
            callback({
                didTimeout: false,
                timeRemaining: function() {
                    return Math.max(0, 50 - (Date.now() - start));
                }
            });
        }, 1);
    };
}

// 全局变量
let records = [];
let editingId = null;
let searchTimers = new Map();
let searchResults = new Map();
let searchCache = new Map();
let cacheExpiry = new Map();
let currentSort = { field: null, direction: 'asc' };
let isDarkMode = false;
const CACHE_DURATION = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 30;
let isInitialized = false;
let cleanupFunctions = [];
// ===== WebDAV 数据同步 =====
const SYNC_CONFIG_KEY = 'hiking_sync_config';
const SYNC_AUTO_KEY = 'hiking_sync_auto';
const SYNC_STATUS_KEY = 'hiking_sync_status';
const SYNC_FILES_KEY = 'hiking_sync_files'; // 本地维护的备份文件索引
const SYNC_FILE_PREFIX = 'xixi_hiking_backup_'; // 备份文件名前缀（后面带时间戳，每次备份独立文件）
const SYNC_FILE_EXT = '.json';
const SYNC_MAX_FILES = 20; // 本地索引最多保留 20 条
let syncConfig = { server: '', username: '', password: '' };
let syncAuto = false;
let syncInProgress = false;

// 液态玻璃光粒子生成器
// FPS 监控相关变量
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsRAF = null;

// 页面卸载时清理资源
function cleanupResources() {
    try {
        // 停止FPS监控
        stopFPSMonitor();
        
        searchTimers.forEach((timer) => {
            clearTimeout(timer);
        });
        searchTimers.clear();
        
        if (window.currentEventListeners) {
            window.currentEventListeners.forEach(({ element, event, handler }) => {
                if (element && element.removeEventListener) {
                    element.removeEventListener(event, handler);
                }
            });
            window.currentEventListeners = [];
        }
        
        cleanupFunctions.forEach(fn => {
            try { fn(); } catch (e) { console.warn('Cleanup function error:', e); }
        });
        cleanupFunctions = [];
        
        searchCache.clear();
        cacheExpiry.clear();
        searchResults.clear();
        
        console.log('Resources cleaned up');
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

function cleanupEventListeners() {
    if (window.currentEventListeners) {
        window.currentEventListeners.forEach(({ element, event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        window.currentEventListeners = [];
    }
}

// 页面卸载时执行清理
window.addEventListener('beforeunload', cleanupResources);
window.addEventListener('pagehide', cleanupResources);

// 全局错误处理
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    // 显示用户友好的错误信息
    showErrorMessage('应用发生错误，请刷新页面重试');
    return false;
});

// 未处理的Promise错误处理
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    // 显示用户友好的错误信息
    showErrorMessage('网络请求失败，请检查连接后重试');
    event.preventDefault();
});

// FPS 监控函数（优化版：降低采样开销）
function updateFPS() {
    fpsFrameCount++;
    const currentTime = performance.now();
    const elapsed = currentTime - fpsLastTime;
    
    // 每2秒更新一次FPS显示，减少不必要的DOM操作（值未变化时跳过写入）
    if (elapsed >= 2000) {
        const fps = Math.round((fpsFrameCount * 1000) / elapsed);
        const fpsValueElement = document.getElementById('fpsValue');
        if (fpsValueElement && fpsValueElement.textContent !== String(fps)) {
            fpsValueElement.textContent = fps;
            
            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) {
                let bgColor = 'rgba(34, 197, 94, 0.3)';
                if (fps < 55) bgColor = fps >= 30 ? 'rgba(251, 146, 60, 0.3)' : 'rgba(239, 68, 68, 0.3)';
                if (fpsDisplay.style.backgroundColor !== bgColor) {
                    fpsDisplay.style.backgroundColor = bgColor;
                }
            }
        }
        
        fpsFrameCount = 0;
        fpsLastTime = currentTime;
    }
    
    fpsRAF = requestAnimationFrame(updateFPS);
}

// 启动FPS监控
function startFPSMonitor() {
    if (fpsRAF) {
        cancelAnimationFrame(fpsRAF);
    }
    fpsFrameCount = 0;
    fpsLastTime = performance.now();
    fpsRAF = requestAnimationFrame(updateFPS);
}

// 停止FPS监控
function stopFPSMonitor() {
    if (fpsRAF) {
        cancelAnimationFrame(fpsRAF);
        fpsRAF = null;
    }
}

// 应用帧率显示偏好（开关状态 → 顶栏显示 + 监控启停）
function applyFpsPreference() {
    const fpsDisplay = document.getElementById('fpsDisplay');
    if (fpsDisplay) {
        fpsDisplay.style.display = showFps ? 'flex' : 'none';
    }
    const fpsToggle = document.getElementById('fpsToggle');
    if (fpsToggle) {
        fpsToggle.checked = showFps;
    }
    if (showFps) {
        startFPSMonitor();
    } else {
        stopFPSMonitor();
    }
}

const STORAGE_KEY = 'hiking_records';
const PLANNED_TRIPS_KEY = 'planned_trips';
const SHOW_FPS_KEY = 'hiking_show_fps';
let showFps = true;
const DARK_MODE_KEY = 'hiking_dark_mode';
const APP_TITLE_KEY = 'hiking_app_title';
const STATS_TITLE_KEY = 'hiking_stats_title';
const RECORDS_TITLE_KEY = 'hiking_records_title';
const PLANNED_TITLE_KEY = 'hiking_planned_title';
const SETTINGS_TITLE_KEY = 'hiking_settings_title';

// 计划徒步行相关变量
let plannedTrips = [];
let plannedEditingId = null;
let plannedCurrentSort = { field: null, direction: 'asc' };

// 区块标题编辑状态
let isEditingStatsTitle = false;
let isEditingRecordsTitle = false;
let isEditingPlannedTitle = false;
let isEditingSettingsTitle = false;
let originalStatsTitle = '';
let originalRecordsTitle = '';
let originalPlannedTitle = '';
let originalSettingsTitle = '';

// DOM操作辅助函数（性能优化：去除try-catch，getElementById在浏览器永不抛异常）
function safeGetElementById(id) {
    return document.getElementById(id);
}

function safeSetElementContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.replaceChildren();
        element.insertAdjacentHTML('beforeend', content);
        return true;
    }
    return false;
}

function safeSetElementStyle(elementId, styleProperty, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style[styleProperty] = value;
        return true;
    }
    return false;
}

// 测试搜索功能


// 测试API可用性


// 带重试机制的DATAFETCH搜索
async function dataFetchWithRetry(query, schema, maxRetries = 3, baseDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`DATAFETCH搜索尝试 ${attempt}/${maxRetries}:`, query.substring(0, 50) + '...');
            const result = await window.lingguang.data.fetch(query, schema);
            
            if (result && (result.locations || result.mountain_info)) {
                console.log(`DATAFETCH搜索成功，尝试次数: ${attempt}`);
                return result;
            } else {
                console.warn(`DATAFETCH搜索返回空结果，尝试次数: ${attempt}`);
                if (attempt === maxRetries) return null;
            }
        } catch (error) {
            console.warn(`DATAFETCH搜索失败，尝试次数: ${attempt}, 错误:`, error.message);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // 指数退避延迟
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`等待 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return null;
}

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 错误消息显示函数
function showErrorMessage(message) {
    // 移除已存在的错误消息
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    // 内联定位（left 50% + transform translateX(-50%)），避免 Tailwind translate 属性与动画 transform 叠加导致二次偏移
    errorDiv.className = 'error-message toast-pop toast-glass error fixed z-[100] max-w-[90vw] text-sm px-5 py-3';
    errorDiv.style.left = '50%';
    errorDiv.style.bottom = '110px';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-icons">error</span>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // 自动淡出移除错误消息
    setTimeout(() => {
        if (document.body.contains(errorDiv)) {
            errorDiv.classList.add('toast-fade-out');
            setTimeout(() => {
                if (errorDiv.parentNode) errorDiv.remove();
            }, 300);
        }
    }, 1000);
    
    // 点击关闭
    errorDiv.addEventListener('click', () => {
        errorDiv.classList.add('toast-fade-out');
        setTimeout(() => {
            if (errorDiv.parentNode) errorDiv.remove();
        }, 300);
    });
}

// 成功消息显示函数
function showSuccessMessage(message) {
    // 移除已存在的成功消息
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    
    const successDiv = document.createElement('div');
    // 内联定位（left 50% + transform translateX(-50%)），避免 Tailwind translate 属性与动画 transform 叠加导致二次偏移
    successDiv.className = 'success-message toast-pop toast-glass success fixed z-[100] max-w-[90vw] text-sm px-5 py-3';
    successDiv.style.left = '50%';
    successDiv.style.bottom = '110px';
    successDiv.style.transform = 'translateX(-50%)';
    successDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-icons">check_circle</span>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(successDiv);
    
    // 自动淡出移除成功消息
    setTimeout(() => {
        if (document.body.contains(successDiv)) {
            successDiv.classList.add('toast-fade-out');
            setTimeout(() => {
                if (successDiv.parentNode) successDiv.remove();
            }, 300);
        }
    }, 1000);
    
    // 点击关闭
    successDiv.addEventListener('click', () => {
        successDiv.classList.add('toast-fade-out');
        setTimeout(() => {
            if (successDiv.parentNode) successDiv.remove();
        }, 300);
    });
}

// 缓存管理函数
function getCacheKey(query) {
    // 创建标准化缓存键，移除多余空格并转为小写
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCache(key) {
    const cached = searchCache.get(key);
    const expiry = cacheExpiry.get(key);
    
    if (cached && expiry && Date.now() < expiry) {
        return cached;
    }
    
    // 清理过期缓存
    if (cached) {
        searchCache.delete(key);
        cacheExpiry.delete(key);
    }
    
    return null;
}

function setCache(key, data) {
    if (searchCache.size >= MAX_CACHE_SIZE) {
        cleanOldestCache();
    }
    
    searchCache.set(key, data);
    cacheExpiry.set(key, Date.now() + CACHE_DURATION);
}





function cleanOldestCache() {
    const sortedEntries = Array.from(cacheExpiry.entries())
        .sort((a, b) => a[1] - b[1]);
    const toRemove = sortedEntries.slice(0, 10); // 清理最旧的10个
    toRemove.forEach(([key]) => {
        searchCache.delete(key);
        cacheExpiry.delete(key);
    });
}


// 统计概览标题编辑
function startEditStatsTitle() {
    if (isEditingStatsTitle) return;
    
    const titleElement = document.getElementById('statsTitle');
    if (!titleElement) return;
    
    const titleTextElement = titleElement.querySelector('.title-text');
    if (!titleTextElement) return;
    
    isEditingStatsTitle = true;
    originalStatsTitle = titleTextElement.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalStatsTitle;
    input.className = 'text-2xl font-semibold text-white/90 bg-transparent border-2 border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500';
    input.style.minWidth = '100px';
    input.dataset.testid = 'stats-title-input';
    
    titleTextElement.parentNode.replaceChild(input, titleTextElement);
    input.focus();
    input.select();
    
    const saveTitle = () => {
        const newTitle = input.value.trim() || originalStatsTitle;
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = newTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        
        if (newTitle !== originalStatsTitle) {
            saveStatsTitleToStorage(newTitle);
        }
        
        isEditingStatsTitle = false;
        titleElement.addEventListener('click', startEditStatsTitle);
    };
    
    const cancelEdit = () => {
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = originalStatsTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        isEditingStatsTitle = false;
        titleElement.addEventListener('click', startEditStatsTitle);
    };
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// 徒步记录标题编辑
function startEditRecordsTitle() {
    if (isEditingRecordsTitle) return;
    
    const titleElement = document.getElementById('recordsTitle');
    if (!titleElement) return;
    
    const titleTextElement = titleElement.querySelector('.title-text');
    if (!titleTextElement) return;
    
    isEditingRecordsTitle = true;
    originalRecordsTitle = titleTextElement.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalRecordsTitle;
    input.className = 'text-2xl font-semibold text-white/90 bg-transparent border-2 border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500';
    input.style.minWidth = '100px';
    input.dataset.testid = 'records-title-input';
    
    titleTextElement.parentNode.replaceChild(input, titleTextElement);
    input.focus();
    input.select();
    
    const saveTitle = () => {
        const newTitle = input.value.trim() || originalRecordsTitle;
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = newTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        
        if (newTitle !== originalRecordsTitle) {
            saveRecordsTitleToStorage(newTitle);
        }
        
        isEditingRecordsTitle = false;
        titleElement.addEventListener('click', startEditRecordsTitle);
    };
    
    const cancelEdit = () => {
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = originalRecordsTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        isEditingRecordsTitle = false;
        titleElement.addEventListener('click', startEditRecordsTitle);
    };
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// 计划徒步行标题编辑
function startEditPlannedTitle() {
    if (isEditingPlannedTitle) return;
    
    const titleElement = document.getElementById('plannedTitle');
    if (!titleElement) return;
    
    const titleTextElement = titleElement.querySelector('.title-text');
    if (!titleTextElement) return;
    
    isEditingPlannedTitle = true;
    originalPlannedTitle = titleTextElement.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalPlannedTitle;
    input.className = 'text-2xl font-semibold text-white/90 bg-transparent border-2 border-green-300 rounded px-2 py-1 outline-none focus:border-green-500';
    input.style.minWidth = '100px';
    input.dataset.testid = 'planned-title-input';
    
    titleTextElement.parentNode.replaceChild(input, titleTextElement);
    input.focus();
    input.select();
    
    const saveTitle = () => {
        const newTitle = input.value.trim() || originalPlannedTitle;
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = newTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        
        if (newTitle !== originalPlannedTitle) {
            savePlannedTitleToStorage(newTitle);
        }
        
        isEditingPlannedTitle = false;
        titleElement.addEventListener('click', startEditPlannedTitle);
    };
    
    const cancelEdit = () => {
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = originalPlannedTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        isEditingPlannedTitle = false;
        titleElement.addEventListener('click', startEditPlannedTitle);
    };
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// 设置页标题编辑
function startEditSettingsTitle() {
    if (isEditingSettingsTitle) return;
    
    const titleElement = document.getElementById('settingsTitle');
    if (!titleElement) return;
    
    const titleTextElement = titleElement.querySelector('.title-text');
    if (!titleTextElement) return;
    
    isEditingSettingsTitle = true;
    originalSettingsTitle = titleTextElement.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalSettingsTitle;
    input.className = 'text-2xl font-semibold text-white/90 bg-transparent border-2 border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500';
    input.style.minWidth = '100px';
    input.dataset.testid = 'settings-title-input';
    
    titleTextElement.parentNode.replaceChild(input, titleTextElement);
    input.focus();
    input.select();
    
    const saveTitle = () => {
        const newTitle = input.value.trim() || originalSettingsTitle;
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = newTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        
        if (newTitle !== originalSettingsTitle) {
            saveSettingsTitleToStorage(newTitle);
        }
        
        isEditingSettingsTitle = false;
        titleElement.addEventListener('click', startEditSettingsTitle);
    };
    
    const cancelEdit = () => {
        const newTitleTextElement = document.createElement('span');
        newTitleTextElement.className = 'title-text';
        newTitleTextElement.textContent = originalSettingsTitle;
        
        input.parentNode.replaceChild(newTitleTextElement, input);
        isEditingSettingsTitle = false;
        titleElement.addEventListener('click', startEditSettingsTitle);
    };
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

function toggleDarkMode() {
    // 切换期间暂停所有动画，避免动画与主题过渡抢 GPU 导致卡顿
    document.body.classList.add('theme-transitioning');
    
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    
    const darkModeIcon = document.getElementById('darkModeIcon');
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeIcon) {
        darkModeIcon.textContent = isDarkMode ? 'light_mode' : 'dark_mode';
    }
    if (darkModeToggle) {
        darkModeToggle.classList.add('theme-toggle-spin');
        setTimeout(() => darkModeToggle.classList.remove('theme-toggle-spin'), 500);
    }
    
    // 延后到主题切换渲染完成后（下一帧+）再重绘图表，避免同一帧内双重重绘导致卡顿
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            updateStatistics();
            // 主题过渡结束后恢复动画
            setTimeout(() => {
                document.body.classList.remove('theme-transitioning');
            }, 500);
        });
    });
    
    saveDarkModeToStorage();
}

function saveDarkModeToStorage() {
    try {
        window.lingguang.storage.setItem(DARK_MODE_KEY, { isDarkMode });
    } catch (error) {
        console.error('保存深色模式状态失败:', error);
    }
}



async function saveTitleToStorage(title) {
    try {
        await window.lingguang.storage.setItem(APP_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存应用标题失败:', error);
    }
}



// 区块标题保存函数
async function saveStatsTitleToStorage(title) {
    try {
        await window.lingguang.storage.setItem(STATS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存统计概览标题失败:', error);
    }
}

async function saveRecordsTitleToStorage(title) {
    try {
        await window.lingguang.storage.setItem(RECORDS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存徒步记录标题失败:', error);
    }
}

async function savePlannedTitleToStorage(title) {
    try {
        await window.lingguang.storage.setItem(PLANNED_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存计划徒步行标题失败:', error);
    }
}

async function saveSettingsTitleToStorage(title) {
    try {
        await window.lingguang.storage.setItem(SETTINGS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存设置页标题失败:', error);
    }
}

// 区块标题加载函数








function getDifficultyColor(difficulty) {
    const colors = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#dc2626'];
    return colors[difficulty - 1] || '#10b981';
}

function getDifficultyText(difficulty) {
    return `${difficulty}级`;
}

// 格式化日期时间
function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
        return '-';
    }
}

// 格式化日期时间为 datetime-local 输入格式
function formatDateTimeLocal(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

function getSortedRecords() {
    if (!currentSort.field) {
        return records;
    }
    
    const sortedRecords = [...records].sort((a, b) => {
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

function renderTable() {
    if (renderTableRAF) {
        cancelAnimationFrame(renderTableRAF);
    }
    
    renderTableRAF = requestAnimationFrame(() => {
        const tbody = safeGetElementById('recordsTable');
        const emptyState = safeGetElementById('emptyState');
        const sortedRecords = getSortedRecords();
        
        updateStatistics();
        
        if (sortedRecords.length === 0) {
            if (tbody) safeSetElementContent('recordsTable', '');
            if (emptyState) safeSetElementStyle('emptyState', 'display', 'block');
            return;
        }
        
        if (emptyState) safeSetElementStyle('emptyState', 'display', 'none');
    
    const tableContent = sortedRecords.map((record, idx) => {
        if (editingId === record.id) {
            return `
                <tr class="border-b border-gray-200">
                    <td class="p-2" data-label="名称">
                        <div class="input-with-search">
                            <input type="text" 
                                   id="edit-name-${record.id}" 
                                   value="${record.name}" 
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
            `;
        } else {
            return `
                <tr class="table-row-advanced table-row-animate border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="row-${record.id}" style="animation-delay: ${idx * 0.05}s;">
                    <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="name-cell-${record.id}">
                        ${record.name}
                    </td>
                    <td class="p-2 text-white/80 text-base font-medium" data-label="海拔">
                        ${record.elevation}
                    </td>
                    <td class="p-2" data-label="难度">
                        <span class="difficulty-badge difficulty-badge-advanced px-2 py-1 rounded text-white text-sm font-medium"
                              style="background-color: ${getDifficultyColor(record.difficulty)};">
                            ${getDifficultyText(record.difficulty)}
                        </span>
                    </td>
                    <td class="p-2 text-white/60 text-sm" data-label="记录时间">
                        ${formatDateTime(record.createdAt)}
                    </td>
                    <td class="p-2 text-center" data-label="操作">
                        <button id="delete-btn-${record.id}" 
                                data-testid="delete-button-${record.id}"
                                class="ripple-effect btn-click-effect bg-red-600 text-white p-1 rounded hover:bg-red-700 transition-colors inline-flex items-center justify-center">
                            <span class="material-icons">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }
    }).join('');
    
    if (tbody) safeSetElementContent('recordsTable', tableContent);
    
    // 表格横向滚动归位（刷新/重渲染后回到最左）
    if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
        tbody.parentElement.parentElement.scrollLeft = 0;
    }
        
        attachEventListeners();
    });
}

function attachEventListeners() {
    // 先清理所有已存在的事件监听器
    cleanupEventListeners();
    
    const sortedRecords = getSortedRecords();
    const eventListeners = []; // 存储事件监听器引用以便清理
    
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
            
            if (nameInput) {
                const inputHandler = (e) => {
                    const query = e.target.value.trim();
                    if (query.length >= 2) {
                        // 优化防抖时间，提高响应性
                        if (searchTimers.has(record.id)) {
                            clearTimeout(searchTimers.get(record.id));
                        }
                        
                        searchTimers.set(record.id, setTimeout(() => {
                            performSearch(query, record.id);
                        }, 300)); // 减少防抖时间到300ms
                    } else {
                        hideSearchDropdown(record.id);
                    }
                };
                
                const focusHandler = (e) => {
                    // 确保输入框能够正确获得焦点
                    const input = e.target;
                    input.focus();
                    
                    const query = nameInput.value.trim();
                    if (query.length >= 2) {
                        performSearch(query, record.id);
                    }
                };
                
                nameInput.addEventListener('input', inputHandler);
                nameInput.addEventListener('focus', focusHandler);
                
                eventListeners.push(
                    { element: nameInput, event: 'input', handler: inputHandler },
                    { element: nameInput, event: 'focus', handler: focusHandler }
                );
            }
        } else {
            const row = safeGetElementById(`row-${record.id}`);
            const deleteBtn = safeGetElementById(`delete-btn-${record.id}`);
            
            if (row) {
                const rowHandler = (e) => {
                    // 如果点击的是按钮，不触发编辑
                    if (e.target.closest('button')) {
                        return;
                    }
                    startEdit(record.id);
                };
                row.addEventListener('click', rowHandler);
                eventListeners.push({ element: row, event: 'click', handler: rowHandler });
            }
            
            if (deleteBtn) {
                const deleteHandler = () => showDeleteConfirmModal(record.id, record.name);
                deleteBtn.addEventListener('click', deleteHandler);
                eventListeners.push({ element: deleteBtn, event: 'click', handler: deleteHandler });
            }
        }
    });
    
    window.currentEventListeners = eventListeners;
}

function startEdit(id) {
    editingId = id;
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
    
    searchTimers.forEach((timer) => {
        clearTimeout(timer);
    });
    searchTimers.clear();
    searchResults.clear();
    
    document.querySelectorAll('[id^="search-dropdown-"]').forEach(dropdown => {
        if (dropdown && dropdown.style) {
            dropdown.style.display = 'none';
        }
    });
    
    updateStatistics();
    saveToStorage();
    renderTable();
}

async function searchLocation(query, recordId) {
    if (!query || query.length < 1) {
        hideSearchDropdown(recordId);
        return;
    }
    
    showSearchLoading(recordId);
    
    // 检查缓存
    const cacheKey = getCacheKey(query);
    const cachedResult = getCache(cacheKey);
    
    if (cachedResult) {
        searchResults.set(recordId, cachedResult);
        showSearchResults(cachedResult, recordId);
        return;
    }
    
    try {
        // 使用AI进行智能搜索
        const aiSearchResult = await performAISearch(query);
        
        if (aiSearchResult && aiSearchResult.length > 0) {
            // 缓存结果
            setCache(cacheKey, aiSearchResult);
            searchResults.set(recordId, aiSearchResult);
            showSearchResults(aiSearchResult, recordId);
        } else {
            // 如果AI搜索失败，回退到传统搜索
            await fallbackSearch(query, recordId, cacheKey);
        }
    } catch (error) {
        console.error('AI搜索失败，尝试传统搜索:', error);
        // 回退到传统搜索
        await fallbackSearch(query, recordId, cacheKey);
    }
}

async function performAISearch(query) {
    const systemPrompt = `你是一个专业的山峰和景区信息专家。请根据用户查询的山峰或景区名称，提供准确、详细、全面的信息。

支持搜索的类型：
1. 自然山峰（如：南五台山、北五台山、太白山、华山、嵩山、衡山、泰山等）
2. 国家森林公园（如：太平国家森林公园、楼观台国家森林公园、太白山国家森林公园等）
3. 风景名胜区（如：骊山、王顺山、翠华山、终南山等）
4. 自然保护区和地质公园
5. 著名山脉和山峰

请按照以下JSON格式返回结果：
{
  "locations": [
    {
      "name": "山峰或景区准确名称",
      "elevation": 海拔高度(数字),
      "difficulty": 登山或游览难度(1-5数字，1最易5最难),
      "location": "具体地理位置",
      "province": "省份",
      "mountain_range": "山脉名称或区域",
      "park_type": "景区类型（山峰/森林公园/风景区/自然保护区等）",
      "description": "山峰或景区简介",
      "features": "特色景观",
      "best_season": "最佳游览季节",
      "geological_info": "地质特征",
      "climate_info": "气候特点",
      "flora_fauna": "动植物资源",
      "cultural_significance": "文化历史意义",
      "tourism_facilities": "旅游设施情况",
      "transportation": "交通方式",
      "accommodation": "住宿条件",
      "safety_tips": "安全注意事项",
      "equipment_required": "所需装备",
      "nearby_attractions": "周边景点",
      "historical_records": "历史记录",
      "myths_legends": "神话传说",
      "conservation_status": "保护状况",
      "peak_features": "山顶特征",
      "water_sources": "水源情况",
      "emergency_contacts": "紧急联系方式",
      "accuracy_level": 准确度评分(1-10)
    }
  ]
}

注意：
1. 难度分级：1级(休闲散步) - 2级(简单徒步) - 3级(中等挑战) - 4级(困难攀登) - 5级(专业探险)
2. 如果查询不够具体，请提供多个可能的结果
3. 优先返回最知名和最准确的结果
4. 确保所有信息准确可靠，内容要面面俱到
5. 每个字段都要尽量填写具体详细的信息
6. 对于森林公园和风景区，难度应指游览难度而非登山难度`;

    try {
        // 优先使用DATAFETCH API进行联网搜索
        console.log('开始搜索，检查DATAFETCH API可用性...');
        
        if (window.lingguang && window.lingguang.data && typeof window.lingguang.data.fetch === 'function') {
            console.log('DATAFETCH API可用，开始搜索...');
            const dataFetchQuery = `请详细搜索山峰或景区"${query}"的完整信息，当前日期2025-12-09。请特别关注以下类型的地点：
1. 自然山峰（如：南五台山、北五台山、太白山、华山等）
2. 国家森林公园（如：太平国家森林公园、楼观台国家森林公园等）
3. 风景名胜区（如：骊山、王顺山、翠华山等）
4. 自然保护区
5. 地质公园

对于查询的地点，请提供以下详细信息：
- 准确的全称和常用别名
- 海拔高度（米）
- 登山或游览难度（1-5级，1最易5最难）
- 具体地理位置（省市县）
- 所属山脉或区域
- 景区类型（山峰/森林公园/风景区等）
- 特色景观和主要景点
- 最佳游览季节
- 交通方式
- 基础设施情况

请确保信息准确、全面、详细。`;
            
            const schema = {
                type: "object",
                properties: {
                    locations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                elevation: { type: "number" },
                                difficulty: { type: "number", minimum: 1, maximum: 5 },
                                location: { type: "string" },
                                province: { type: "string" },
                                mountain_range: { type: "string" },
                                description: { type: "string" },
                                features: { type: "string" },
                                park_type: { type: "string" },
                                scenic_spots: {
                                    type: "array",
                                    items: { type: "string" },
                                    maxItems: 8
                                },
                                tourism_rating: { type: "string" },
                                opening_hours: { type: "string" },
                                ticket_price: { type: "string" },
                                best_season: { type: "string" },
                                geological_info: { type: "string" },
                                climate_info: { type: "string" },
                                flora_fauna: { type: "string" },
                                cultural_significance: { type: "string" },
                                tourism_facilities: { type: "string" },
                                transportation: { type: "string" },
                                accommodation: { type: "string" },
                                safety_tips: { type: "string" },
                                equipment_required: { type: "string" },
                                nearby_attractions: { type: "string" },
                                historical_records: { type: "string" },
                                myths_legends: { type: "string" },
                                conservation_status: { type: "string" },
                                peak_features: { type: "string" },
                                water_sources: { type: "string" },
                                emergency_contacts: { type: "string" },
                                accuracy_level: { type: "number", minimum: 1, maximum: 10 }
                            },
                            required: ["name", "elevation", "difficulty", "location"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["locations"],
                additionalProperties: false
            };
            
            try {
                const result = await dataFetchWithRetry(dataFetchQuery, schema, 3, 2000);
                
                if (result && result.locations && result.locations.length > 0) {
                    const validLocations = result.locations.filter(loc => {
                        return loc.name && 
                               loc.elevation > 0 && 
                               loc.difficulty >= 1 && 
                               loc.difficulty <= 5 &&
                               loc.location;
                    }).map(loc => ({
                        ...loc,
                        elevation: Math.round(loc.elevation),
                        difficulty: Math.min(5, Math.max(1, Math.round(loc.difficulty))),
                        accuracy_level: loc.accuracy_level || 8
                    }));
                    
                    if (validLocations.length > 0) {
                        console.log('DATAFETCH搜索成功，找到', validLocations.length, '个结果');
                        return validLocations;
                    }
                }
            } catch (dataFetchError) {
                console.warn('DATAFETCH搜索失败，尝试CALLLLM:', dataFetchError.message);
            }
        }
        
        // 回退到CALLLLM
        if (typeof window.callLLM === 'function') {
            const result = await Promise.race([
                window.callLLM(
                    `请详细搜索山峰或景区"${query}"的信息，包括名称、海拔、难度、位置、特色等。支持各类山峰、森林公园、风景名胜区的搜索。`,
                    systemPrompt,
                    20000
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error('CALLLLM搜索超时')), 20000))
            ]);
            
            if (result && result.content) {
                const jsonMatch = result.content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsedData = JSON.parse(jsonMatch[0]);
                    if (parsedData.locations && Array.isArray(parsedData.locations)) {
                        const validLocations = parsedData.locations.filter(loc => {
                            return loc.name && 
                                   loc.elevation > 0 && 
                                   loc.difficulty >= 1 && 
                                   loc.difficulty <= 5 &&
                                   loc.location;
                        }).map(loc => ({
                            ...loc,
                            elevation: Math.round(loc.elevation),
                            difficulty: Math.min(5, Math.max(1, Math.round(loc.difficulty))),
                            accuracy_level: loc.accuracy_level || 7
                        }));
                        
                        if (validLocations.length > 0) {
                            console.log('CALLLLM搜索成功，找到', validLocations.length, '个结果');
                            return validLocations;
                        }
                    }
                }
            }
        }
        
        console.warn('所有搜索方法都失败，返回空结果');
        return [];
    } catch (error) {
        console.error('搜索过程中发生错误:', error);
        return [];
    }
}

async function fallbackSearch(query, recordId, cacheKey) {
    try {
        // 使用DATAFETCH API进行增强搜索
        console.log('增强搜索，检查DATAFETCH API可用性...');
        
        if (window.lingguang && window.lingguang.data && typeof window.lingguang.data.fetch === 'function') {
            console.log('增强搜索：DATAFETCH API可用');
            const enhancedSearchQuery = `请详细搜索山峰或景区"${query}"的完整信息，当前日期2025-12-09。支持搜索：
1. 自然山峰（如：南五台山、北五台山、太白山、华山、嵩山、衡山等）
2. 国家森林公园（如：太平国家森林公园、楼观台国家森林公园、太白山国家森林公园等）
3. 风景名胜区（如：骊山、王顺山、翠华山、终南山等）
4. 自然保护区和地质公园

请提供以下核心信息：
- 准确全称和常用别名
- 海拔高度（米）
- 登山或游览难度（1-5级）
- 具体地理位置（省市县）
- 景区类型和特色
- 交通方式和基础设施

请确保信息准确详细，返回JSON格式。`;
            
            const enhancedSchema = {
                type: "object",
                properties: {
                    locations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                elevation: { type: "number" },
                                difficulty: { type: "number", minimum: 1, maximum: 5 },
                                location: { type: "string" },
                                province: { type: "string" },
                                mountain_range: { type: "string" },
                                park_type: { type: "string" },
                                scenic_spots: {
                                    type: "array",
                                    items: { type: "string" },
                                    maxItems: 6
                                },
                                tourism_rating: { type: "string" },
                                opening_hours: { type: "string" },
                                ticket_price: { type: "string" },
                                description: { type: "string" },
                                accuracy_level: { type: "number", minimum: 1, maximum: 10 }
                            },
                            required: ["name", "elevation", "difficulty", "location"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["locations"],
                additionalProperties: false
            };
            
            try {
                const result = await dataFetchWithRetry(enhancedSearchQuery, enhancedSchema, 2, 1500);
                
                if (result && result.locations && result.locations.length > 0) {
                    const validLocations = result.locations.filter(loc => {
                        return loc.name && 
                               loc.elevation > 0 && 
                               loc.difficulty >= 1 && 
                               loc.difficulty <= 5 &&
                               loc.location;
                    }).map(loc => ({
                        ...loc,
                        elevation: Math.round(loc.elevation),
                                difficulty: Math.min(5, Math.max(1, Math.round(loc.difficulty))),
                        accuracy_level: loc.accuracy_level || 6,
                        description: loc.description || `${loc.name}位于${loc.location}${loc.province ? `，${loc.province}` : ''}`,
                        features: loc.features || "山峰",
                        best_season: loc.best_season || "全年"
                    }));
                    
                    if (validLocations.length > 0) {
                        console.log('增强搜索成功，找到', validLocations.length, '个结果');
                        setCache(cacheKey, validLocations);
                        searchResults.set(recordId, validLocations);
                        showSearchResults(validLocations, recordId);
                        return;
                    }
                }
            } catch (enhancedError) {
                console.warn('增强搜索失败，尝试基本搜索:', enhancedError.message);
            }
        }
        
        // 基本搜索回退
        const searchQuery = `请搜索山峰或景区"${query}"的基本信息，当前日期2025-12-09：
支持搜索各类山峰、森林公园、风景名胜区、自然保护区等。
请提供：
1. 准确的名称
2. 海拔高度（米）
3. 游览难度（1-5级）
4. 地理位置（省市县）
5. 景区类型

请返回准确数据，JSON格式。`;
        
        const schema = {
            type: "object",
            properties: {
                locations: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            elevation: { type: "number" },
                            difficulty: { type: "number", minimum: 1, maximum: 5 },
                            location: { type: "string" },
                            province: { type: "string" },
                            mountain_range: { type: "string" }
                        },
                        required: ["name", "elevation", "difficulty", "location"],
                        additionalProperties: false
                    }
                }
            },
            required: ["locations"],
            additionalProperties: false
        };
        
        console.log('基本搜索，检查DATAFETCH API可用性...');
        
        if (window.lingguang && window.lingguang.data && typeof window.lingguang.data.fetch === 'function') {
            console.log('基本搜索：DATAFETCH API可用');
        } else {
            console.log('基本搜索：DATAFETCH API不可用');
        }
        
        const result = await dataFetchWithRetry(searchQuery, schema, 2, 1000);
        
        if (result && result.locations && result.locations.length > 0) {
            const validLocations = result.locations.filter(loc => {
                return loc.name && 
                       loc.elevation > 0 && 
                       loc.difficulty >= 1 && 
                       loc.difficulty <= 5 &&
                       loc.location;
            }).map(loc => ({
                ...loc,
                elevation: Math.round(loc.elevation),
                difficulty: Math.min(5, Math.max(1, Math.round(loc.difficulty))),
                accuracy_level: 5,
                description: `${loc.name}位于${loc.location}${loc.province ? `，${loc.province}` : ''}`,
                features: "山峰",
                best_season: "全年"
            }));
            
            if (validLocations.length > 0) {
                console.log('基本搜索成功，找到', validLocations.length, '个结果');
                setCache(cacheKey, validLocations);
                searchResults.set(recordId, validLocations);
                showSearchResults(validLocations, recordId);
            } else {
                setCache(cacheKey, []);
                showNoResults(recordId);
            }
        } else {
            setCache(cacheKey, []);
            showNoResults(recordId);
        }
    } catch (error) {
        console.error('所有搜索方法都失败:', error);
        showSearchError(recordId);
        setCache(cacheKey, []);
        
        if (error.message.includes('超时') || error.message.includes('network')) {
            showErrorMessage('网络连接超时，请检查网络后重试');
        } else if (error.message.includes('不可用')) {
            showDefaultSearchResults(recordId, query);
            setCache(cacheKey, []);
        }
    }
}



function showSearchLoading(recordId) {
    const dropdown = safeGetElementById(`search-dropdown-${recordId}`);
    if (dropdown) {
        safeSetElementContent(`search-dropdown-${recordId}`, '<div class="search-loading"><span class="material-icons spin">search</span> 搜索中...</div>');
        safeSetElementStyle(`search-dropdown-${recordId}`, 'display', 'block');
        
        // 触发动画
        requestAnimationFrame(() => {
            dropdown.classList.add('show');
        });
    }
}

function showSearchResults(locations, recordId) {
    const dropdown = safeGetElementById(`search-dropdown-${recordId}`);
    if (!dropdown) return;
    
    // 按准确性排序
    const sortedLocations = locations.sort((a, b) => (b.accuracy_level || 0) - (a.accuracy_level || 0));
    
    const resultsHtml = sortedLocations.map((location, index) => {
        const accuracyStars = location.accuracy_level ? 
            '★'.repeat(Math.min(location.accuracy_level, 5)) + '☆'.repeat(Math.max(0, 5 - location.accuracy_level)) : 
            '★★★☆☆';
        
        const isAISearch = location.accuracy_level > 6;
        const searchBadge = isAISearch ? 
            '<span class="text-xs bg-blue-100 text-blue-700 px-1 rounded">AI智能</span>' : 
            '<span class="text-xs bg-white/10 text-white/60 px-1 rounded">标准搜索</span>';
            
        return `
            <div class="search-option" data-record-id="${recordId}" data-index="${index}" style="animation-delay: ${index * 0.08}s;">
                <div class="flex justify-between items-start mb-2">
                    <div class="font-medium text-white text-base">${location.name}</div>
                    <div class="flex items-center gap-1">
                        ${searchBadge}
                        <div class="text-xs text-amber-500">${accuracyStars}</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div class="bg-blue-50 rounded p-2">
                        <div class="flex items-center gap-1 text-xs text-white/60 mb-1">
                            <span class="material-icons" style="font-size: 12px;">height</span>
                            海拔高度
                        </div>
                        <div class="font-bold text-blue-600">${location.elevation}米</div>
                    </div>
                    <div class="bg-orange-50 rounded p-2">
                        <div class="flex items-center gap-1 text-xs text-white/60 mb-1">
                            <span class="material-icons" style="font-size: 12px;">signal_cellular_alt</span>
                            登山难度
                        </div>
                        <div class="font-bold" style="color: ${getDifficultyColor(location.difficulty)}">
                            ${location.difficulty}级 ${getDifficultyText(location.difficulty)}
                        </div>
                    </div>
                </div>
                
                <div class="text-xs text-white/60 mb-2 flex items-center gap-1">
                    <span class="material-icons" style="font-size: 12px;">location_on</span>
                    ${location.location}${location.province ? ` · ${location.province}` : ''}
                </div>
                
                ${location.mountain_range ? `
                    <div class="text-xs text-white/50 mb-2 flex items-center gap-1">
                        <span class="material-icons" style="font-size: 12px;">terrain</span>
                        ${location.mountain_range}
                    </div>
                ` : ''}
                
                ${location.description ? `
                    <div class="text-xs text-gray-700 mb-2 p-2 bg-white/5 rounded">
                        <span class="material-icons text-white/30" style="font-size: 12px; vertical-align: middle;">info</span>
                        ${location.description}
                    </div>
                ` : ''}
                
                ${location.features ? `
                    <div class="text-xs bg-green-50 text-green-700 rounded p-2 mb-2">
                        <span class="material-icons text-green-500" style="font-size: 12px; vertical-align: middle;">stars</span>
                        ${location.features}
                    </div>
                ` : ''}
                
                ${location.best_season ? `
                    <div class="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-2">
                        <span class="material-icons text-amber-500" style="font-size: 12px; vertical-align: middle;">event</span>
                        最佳季节: ${location.best_season}
                    </div>
                ` : ''}
                
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                    <div class="text-xs text-white/30">
                        点击选择此山峰
                    </div>
                    <div class="text-xs text-blue-600 font-medium">
                        查看详情 →
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    dropdown.innerHTML = resultsHtml;
    dropdown.style.display = 'block';
    
    // 触发动画
    requestAnimationFrame(() => {
        dropdown.classList.add('show');
    });
    
    dropdown.querySelectorAll('.search-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const recordId = e.currentTarget.dataset.recordId;
            const index = parseInt(e.currentTarget.dataset.index);
            selectLocation(recordId, index);
        });
    });
}

function showNoResults(recordId) {
    const dropdown = document.getElementById(`search-dropdown-${recordId}`);
    if (dropdown) {
        dropdown.innerHTML = `
            <div class="search-loading text-center py-3">
                <span class="material-icons text-white/30 text-2xl">search_off</span>
                <p class="text-white/60 mt-1 text-sm">未找到相关山峰</p>
                <p class="text-white/50 text-xs mt-1">请尝试更具体的关键词</p>
            </div>
        `;
        dropdown.style.display = 'block';
    }
}

function showSearchError(recordId) {
    const dropdown = document.getElementById(`search-dropdown-${recordId}`);
    if (dropdown) {
        dropdown.innerHTML = `
            <div class="search-loading text-center py-3">
                <span class="material-icons text-red-400 text-2xl">error</span>
                <p class="text-red-600 mt-1 text-sm">搜索失败</p>
                <p class="text-white/50 text-xs mt-1">请稍后重试</p>
            </div>
        `;
        dropdown.style.display = 'block';
    }
}

function showDefaultSearchResults(recordId, query) {
    const dropdown = document.getElementById(`search-dropdown-${recordId}`);
    if (!dropdown) return;
    
    // 提供一些基本的山峰数据作为默认结果
    const defaultMountains = [
        {
            name: query,
            elevation: 1500,
            difficulty: 3,
            location: '中国',
            province: '未知',
            mountain_range: '未知山脉',
            description: `${query}山峰`,
            features: '自然山峰',
            best_season: '春秋季',
            accuracy_level: 3
        }
    ];
    
    const resultsHtml = defaultMountains.map((location, index) => {
        return `
            <div class="search-option" data-record-id="${recordId}" data-index="${index}">
                <div class="flex justify-between items-start mb-2">
                    <div class="font-medium text-white text-base">${location.name}</div>
                    <div class="flex items-center gap-1">
                        <span class="text-xs bg-white/10 text-white/60 px-1 rounded">默认数据</span>
                        <div class="text-xs text-amber-500">★★★☆☆</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div class="bg-blue-50 rounded p-2">
                        <div class="flex items-center gap-1 text-xs text-white/60 mb-1">
                            <span class="material-icons" style="font-size: 12px;">height</span>
                            海拔高度
                        </div>
                        <div class="font-bold text-blue-600">${location.elevation}米</div>
                    </div>
                    <div class="bg-orange-50 rounded p-2">
                        <div class="flex items-center gap-1 text-xs text-white/60 mb-1">
                            <span class="material-icons" style="font-size: 12px;">signal_cellular_alt</span>
                            登山难度
                        </div>
                        <div class="font-bold" style="color: ${getDifficultyColor(location.difficulty)}">
                            ${location.difficulty}级 ${getDifficultyText(location.difficulty)}
                        </div>
                    </div>
                </div>
                
                <div class="text-xs text-white/60 mb-2 flex items-center gap-1">
                    <span class="material-icons" style="font-size: 12px;">location_on</span>
                    ${location.location}${location.province ? ` · ${location.province}` : ''}
                </div>
                
                <div class="text-xs text-white/50 mb-2">
                    <span class="material-icons text-white/30" style="font-size: 12px; vertical-align: middle;">info</span>
                        由于网络问题，显示默认信息
                </div>
                
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                    <div class="text-xs text-white/30">
                        点击选择此山峰
                    </div>
                    <div class="text-xs text-blue-600 font-medium">
                        查看详情 →
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    dropdown.innerHTML = resultsHtml;
    dropdown.style.display = 'block';
    
    dropdown.querySelectorAll('.search-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const recordId = e.currentTarget.dataset.recordId;
            const index = parseInt(e.currentTarget.dataset.index);
            selectLocation(recordId, index);
        });
    });
}

function hideSearchDropdown(recordId) {
    const dropdown = safeGetElementById(`search-dropdown-${recordId}`);
    if (dropdown) {
        dropdown.classList.remove('show');
        setTimeout(() => {
            safeSetElementStyle(`search-dropdown-${recordId}`, 'display', 'none');
        }, 300);
    }
}

function selectLocation(recordId, index) {
    const locations = searchResults.get(recordId);
    if (!locations || !locations[index]) {
        console.error('Search result not found:', recordId, index);
        return;
    }
    
    const location = locations[index];
    const record = records.find(r => r.id === recordId);
    
    if (!record) {
        console.error('Record not found:', recordId);
        return;
    }
    
    // 更新记录数据 - 包含更全面的信息
    record.name = location.name || '';
    record.elevation = location.elevation || 0;
    record.difficulty = location.difficulty || 3;
    
    // 保存额外的山峰信息用于信息功能 - 面面俱到的详细信息
    record.mountainInfo = {
        name: location.name || '',
        peak_elevation: location.elevation || 0,
        location: location.location || '',
        province: location.province || '',
        mountain_range: location.mountain_range || '',
        park_type: location.park_type || '山峰',
        description: location.description || `${location.name}位于${location.location}${location.province ? `，${location.province}` : ''}`,
        features: location.features || '山峰',
        best_season: location.best_season || '全年',
        geological_info: location.geological_info || '待补充',
        climate_info: location.climate_info || '待补充',
        flora_fauna: location.flora_fauna || '待补充',
        cultural_significance: location.cultural_significance || '待补充',
        tourism_facilities: location.tourism_facilities || '待补充',
        transportation: location.transportation || '待补充',
        accommodation: location.accommodation || '待补充',
        safety_tips: location.safety_tips || '待补充',
        equipment_required: location.equipment_required || '待补充',
        nearby_attractions: location.nearby_attractions || '待补充',
        historical_records: location.historical_records || '待补充',
        myths_legends: location.myths_legends || '待补充',
        conservation_status: location.conservation_status || '待补充',
        peak_features: location.peak_features || '待补充',
        water_sources: location.water_sources || '待补充',
        emergency_contacts: location.emergency_contacts || '待补充',
        opening_hours: location.opening_hours || '待补充',
        ticket_price: location.ticket_price || '待补充',
        accuracy_level: location.accuracy_level || 5
    };
    
    // 验证数据
    if (record.difficulty < 1 || record.difficulty > 5) {
        record.difficulty = 3;
    }
    
    if (record.elevation < 0) {
        record.elevation = 0;
    }
    
    const nameInput = document.getElementById(`edit-name-${recordId}`);
    const elevationInput = document.getElementById(`edit-elevation-${recordId}`);
    const difficultyInput = document.getElementById(`edit-difficulty-${recordId}`);
    
    if (nameInput) {
        nameInput.value = location.name || '';
    }
    
    if (elevationInput) {
        elevationInput.value = location.elevation || 0;
    }
    
    if (difficultyInput && location.difficulty) {
        difficultyInput.value = location.difficulty;
    }
    
    hideSearchDropdown(recordId);
    
    // 显示选择成功的提示
    showSuccessMessage(`已选择 ${location.name}，海拔 ${location.elevation}米，难度 ${location.difficulty}级`);
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
    record.elevation = parseInt(elevationInput.value) || 0;
    
    // 保存记录时间
    if (createdAtInput && createdAtInput.value) {
        record.createdAt = new Date(createdAtInput.value).toISOString();
    }
    
    editingId = null;
    updateStatistics();
    saveToStorage();
    renderTable();
}

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
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




















function showDeleteConfirmModal(recordId, recordName) {
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
                <button class="confirm-btn-delete ripple-effect" id="confirm-delete">
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
        createdAt: new Date().toISOString()
    };
    
    records.unshift(newRecord);
    editingId = newRecord.id;
    updateStatistics();
    renderTable();
}

// 更新山脉数据的函数




function updateStatistics() {
    const totalCount = safeGetElementById('totalCount');
    const avgElevation = safeGetElementById('avgElevation');
    const maxElevation = safeGetElementById('maxElevation');
    const avgDifficulty = safeGetElementById('avgDifficulty');
    const difficultyChart = safeGetElementById('difficultyChart');
    const chartLabels = safeGetElementById('chartLabels');
    const chartLegend = safeGetElementById('chartLegend');
    
    // 辅助函数：更新数字并添加动画（用 WAAPI 取消旧动画，避免强制同步布局重排）
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
        if (avgDifficulty) avgDifficulty.textContent = '0级';
        if (difficultyChart) safeSetElementContent('difficultyChart', '<div class="text-white/50 text-center w-full">暂无数据</div>');
        if (chartLabels) safeSetElementContent('chartLabels', '');
        if (chartLegend) safeSetElementContent('chartLegend', '');
        return;
    }
    
    const total = records.length;
    const totalElevation = records.reduce((sum, record) => sum + record.elevation, 0);
    const averageElevation = Math.round(totalElevation / total);
    const highestElevation = Math.max(...records.map(record => record.elevation));
    const totalDifficulty = records.reduce((sum, record) => sum + record.difficulty, 0);
    const averageDifficulty = (totalDifficulty / total).toFixed(1);
    
    updateWithAnimation(totalCount, total.toString());
    updateWithAnimation(avgElevation, `${averageElevation}m`);
    updateWithAnimation(maxElevation, `${highestElevation}m`);
    updateWithAnimation(avgDifficulty, `${averageDifficulty}级`);
    
    const difficultyCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    records.forEach(record => {
        difficultyCounts[record.difficulty]++;
    });
    
    const maxCount = Math.max(...Object.values(difficultyCounts));
    
    if (difficultyChart && chartLabels && chartLegend) {
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
        let totalRecords = 0;
        
        Object.entries(difficultyCounts).forEach(([difficulty, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const color = difficultyColors[difficulty];
            const gradient = currentGradients[difficulty];
            const name = difficultyNames[difficulty];
            
            chartHtml += `
                <div class="flex flex-col items-center flex-1">
                    <div class="relative w-full max-w-12 h-32 flex items-end justify-center">
                        <div class="chart-bar glass-bar absolute bottom-0 w-full rounded-t-lg transition-all duration-700 hover:scale-105 cursor-pointer"
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
            
            totalRecords += count;
        });
        
        difficultyChart.innerHTML = chartHtml;
        chartLabels.innerHTML = labelsHtml;
        chartLegend.innerHTML = `<span class="${isDarkMode ? 'text-white/70' : 'text-white/60'}">总计: ${totalRecords}条记录</span>`;
        
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
}

// ==================== 计划徒步行功能 ====================

function getSortedPlannedTrips() {
    const sortedTrips = [...plannedTrips];
    
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
    }
    
    return sortedTrips;
}

let renderPlannedTripsTableRAF = null;

function renderPlannedTripsTable() {
    if (renderPlannedTripsTableRAF) {
        cancelAnimationFrame(renderPlannedTripsTableRAF);
    }
    
    renderPlannedTripsTableRAF = requestAnimationFrame(() => {
        const tbody = safeGetElementById('plannedTripsTable');
        const emptyState = safeGetElementById('plannedEmptyState');
        const sortedTrips = getSortedPlannedTrips();
        
        if (sortedTrips.length === 0) {
            if (tbody) safeSetElementContent('plannedTripsTable', '');
            if (emptyState) safeSetElementStyle('plannedEmptyState', 'display', 'block');
            return;
        }
        
        if (emptyState) safeSetElementStyle('plannedEmptyState', 'display', 'none');
        
        const tableContent = sortedTrips.map((trip, idx) => {
            if (plannedEditingId === trip.id) {
                return `
                    <tr class="border-b border-gray-200">
                        <td class="p-2" data-label="名称">
                            <div class="input-with-search">
                                <input type="text" 
                                       id="edit-planned-name-${trip.id}" 
                                       value="${trip.name}" 
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
                return `
                    <tr class="table-row-advanced table-row-animate border-b border-white/10 hover:bg-white/10 transition-colors cursor-pointer" id="planned-row-${trip.id}" style="animation-delay: ${idx * 0.05}s;">
                        <td class="p-2 font-medium text-white text-base" data-label="名称" data-testid="planned-name-cell-${trip.id}">
                            ${trip.name}
                        </td>
                        <td class="p-2 text-white/80 text-base font-medium" data-label="海拔">
                            ${trip.elevation}
                        </td>
                        <td class="p-2" data-label="难度">
                            <span class="difficulty-badge difficulty-badge-advanced px-2 py-1 rounded text-white text-sm font-medium"
                                  style="background-color: ${getDifficultyColor(trip.difficulty)};">
                                ${getDifficultyText(trip.difficulty)}
                            </span>
                        </td>
                        <td class="p-2 text-white/60 text-sm" data-label="记录时间">
                            ${formatDateTime(trip.createdAt)}
                        </td>
                        <td class="p-2 text-center" data-label="操作">
                            <button id="complete-planned-btn-${trip.id}" 
                                    data-testid="complete-planned-button-${trip.id}"
                                    class="ripple-effect btn-click-effect bg-green-600 text-white p-1 rounded hover:bg-green-700 transition-colors inline-flex items-center justify-center mr-1"
                                    title="标记为已完成">
                                <span class="material-icons">check</span>
                            </button>
                            <button id="delete-planned-btn-${trip.id}" 
                                    data-testid="delete-planned-button-${trip.id}"
                                    class="ripple-effect btn-click-effect bg-red-600 text-white p-1 rounded hover:bg-red-700 transition-colors inline-flex items-center justify-center"
                                    title="删除">
                                <span class="material-icons">delete</span>
                            </button>
                        </td>
                    </tr>
                `;
            }
        }).join('');
        
        if (tbody) safeSetElementContent('plannedTripsTable', tableContent);
        
        // 表格横向滚动归位（刷新/重渲染后回到最左）
        if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
            tbody.parentElement.parentElement.scrollLeft = 0;
        }
        
        attachPlannedTripsEventListeners();
    });
}

function attachPlannedTripsEventListeners() {
    const sortedTrips = getSortedPlannedTrips();
    
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
                    if (e.target.closest('button')) {
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
    
    setTimeout(() => {
        const nameInput = safeGetElementById(`edit-planned-name-${id}`);
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }
    }, 50);
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
        createdAt: new Date().toISOString()
    };
    
    plannedTrips.unshift(newTrip);
    plannedEditingId = newTrip.id;
    renderPlannedTripsTable();
}

function showConfirmCompleteModal(tripId, tripName) {
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
                <button class="confirm-btn-delete ripple-effect" id="confirm-complete-ok">
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
    
    // 添加到 records（用当前时间作为完成时间）
    records.push({
        id: generateId(),
        name: trip.name,
        elevation: trip.elevation,
        difficulty: trip.difficulty,
        createdAt: new Date().toISOString()
    });
    
    // 保存两边的数据
    savePlannedTripsToStorage();
    saveToStorage();
    
    // 刷新两个表格
    updateStatistics();
    renderTable();
    renderPlannedTripsTable();
    
    // 确认后不再弹成功提示（用户要求：确认后不加弹窗了）
}

function showDeletePlannedTripConfirmModal(tripId, tripName) {
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
                <button class="confirm-btn-delete ripple-effect" id="confirm-planned-delete">
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
            
            await window.lingguang.storage.setItem(PLANNED_TRIPS_KEY, { trips: validTrips });
        } catch (error) {
            console.error('Save planned trips storage error:', error);
            showErrorMessage('计划保存失败，请稍后重试');
        }
    }, 300);
}

async function loadPlannedTripsFromStorage() {
    try {
        const data = await window.lingguang.storage.getItem(PLANNED_TRIPS_KEY);
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
            console.log(`Loaded ${plannedTrips.length} planned trips from storage`);
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
            
            await window.lingguang.storage.setItem(STORAGE_KEY, { records: validRecords });
        } catch (error) {
            console.error('Save storage error:', error);
            showErrorMessage('数据保存失败，请稍后重试');
        }
    }, 300);
}

async function performSearch(query, recordId) {
    const cacheKey = getCacheKey(query);
    
    // 检查缓存
    const cachedResult = getCache(cacheKey);
    if (cachedResult) {
        console.log('使用缓存结果:', query);
        searchResults.set(recordId, cachedResult);
        showSearchResults(cachedResult, recordId);
        return;
    }
    
    // 显示加载状态
    showSearchLoading(recordId);
    
    try {
        const results = await searchLocation(query, recordId);
        if (results && results.length > 0) {
            // 缓存结果
            setCache(cacheKey, results);
            searchResults.set(recordId, results);
            showSearchResults(results, recordId);
        } else {
            showNoResults(recordId);
        }
    } catch (error) {
        console.error('搜索失败:', error);
        showSearchError(recordId);
    }
}

// ==================== WebDAV 数据同步 ====================

// 工具：字符串转 Base64（支持中文，UTF-8）
function utf8ToBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
        // 兼容更严格的编码
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        return btoa(binary);
    }
}

// 工具：Base64 转字符串（支持中文，UTF-8）
function base64ToUtf8(base64) {
    try {
        return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
        const bytes = atob(base64).split('').map(c => c.charCodeAt(0));
        return new TextDecoder().decode(new Uint8Array(bytes));
    }
}

// 生成带时间戳的备份文件名：xixi_hiking_backup_20260809_175312.json
function buildSyncFileName(now) {
    const d = now || new Date();
    const p = n => String(n).padStart(2, '0');
    return SYNC_FILE_PREFIX + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + SYNC_FILE_EXT;
}

// 拼接云端文件完整 URL（服务器地址末尾自动补 /；filename 缺省用最新）
function buildSyncFileUrl(filename) {
    let server = (syncConfig.server || '').trim();
    if (!server) return '';
    if (!/^https?:\/\//i.test(server)) {
        server = 'https://' + server;
    }
    if (!server.endsWith('/')) server += '/';
    // ★坚果云 WebDAV 根目录（dav/）不允许直接 PUT 文件，必须放子目录：
    // 固定放 xixi-hiking/ 下；该目录需存在（可由用户手动创建，或已由本 App 提示创建后存在）
    const name = filename || getLatestSyncFileName() || buildSyncFileName();
    return server + 'xixi-hiking/' + name;
}

// 本地备份文件索引（localStorage）：[{ name, time, label, records, plans }] 新→旧
async function loadSyncFilesIndex() {
    try {
        const data = await window.lingguang.storage.getItem(SYNC_FILES_KEY);
        return (data && Array.isArray(data.files)) ? data.files : [];
    } catch (e) {
        console.error('loadSyncFilesIndex error:', e);
        return [];
    }
}

async function saveSyncFilesIndex(files) {
    await window.lingguang.storage.setItem(SYNC_FILES_KEY, { files: files.slice(0, SYNC_MAX_FILES) });
}

async function getLatestSyncFileName() {
    const files = await loadSyncFilesIndex();
    return files.length > 0 ? files[0].name : null;
}

// 备份完成后记录到索引（新记录插最前）
async function recordSyncFile(name, payload) {
    const files = await loadSyncFilesIndex();
    const entry = {
        name: name,
        time: payload.exportedAt || new Date().toISOString(),
        records: (payload.records || []).length,
        plans: (payload.plannedTrips || []).length
    };
    // 去重（同名替换），然后按 time 倒序
    const filtered = files.filter(f => f.name !== name);
    filtered.unshift(entry);
    filtered.sort((a, b) => (b.time > a.time ? 1 : -1));
    await saveSyncFilesIndex(filtered);
    return entry;
}

// 从文件名解析可读时间标签（20260809_175312 → 2026-08-09 17:53:12）
function formatSyncFileLabel(name) {
    const m = name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    if (!m) return name;
    return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
}

// 删除本地索引中的某条（云端文件被删时同步清理）
async function removeSyncFileFromIndex(name) {
    const files = await loadSyncFilesIndex();
    const filtered = files.filter(f => f.name !== name);
    await saveSyncFilesIndex(filtered);
}

// 检查云端目录是否可用：用 GET 探测（只读，标准方法，百分百可靠），
// 返回 { ok, exists } —— exists=true 目录存在可用；false 目录不存在
// ★不再用 MKCOL/PROPFIND 自动建目录：这俩是非标准方法，Android HttpURLConnection
// 反射发非标准方法在真机上不可靠（字段改了但实际按 GET 发出，导致假 403/404）。
// 社区共识（CSDN 踩坑实录/PT-Plugin-Plus）：云盘 WebDAV 阉割版不支持 MKCOL，
// 正确做法 = 目录由用户手动创建，App 只做 GET 检查 + PUT/GET。
async function ensureSyncParentDirs(fileUrl) {
    try {
        const u = new URL(fileUrl);
        const segs = u.pathname.split('/').filter(Boolean);
        segs.pop(); // 去掉文件名，只留目录层级
        let dir = u.origin;
        for (const seg of segs) {
            dir += '/' + seg;
            // GET 目录探测：200/301/302=存在；★403=坚果云对目录的 GET 常返回 403（禁止列目录），
            // 但目录本身存在，视为可继续（真正的权限问题交给 PUT 暴露）；
            // 404=目录不存在；401=认证失败
            const r = await webdavRequest(dir + '/', 'GET', '');
            if (r.status === 200 || r.status === 301 || r.status === 302 || r.status === 403 || (r.status >= 200 && r.status < 300)) {
                continue; // 目录存在，进入下一级
            }
            if (r.status === 404) {
                return { ok: false, exists: false, detail: '云端缺少目录 ' + dir + '/，请在坚果云网页端手动创建后再同步' };
            }
            if (r.status === 401) {
                return { ok: false, exists: false, detail: '认证失败，请检查账号/应用密码' };
            }
            return { ok: false, exists: false, detail: '检查目录 ' + dir + ' 失败：' + (r.error ? r.error : ('HTTP ' + r.status)) };
        }
        return { ok: true, exists: true, detail: '' };
    } catch (e) {
        console.error('ensureSyncParentDirs error:', e);
        return { ok: false, exists: false, detail: (e.message || e) };
    }
}

// 读取/保存同步配置与状态
async function loadSyncState() {
    try {
        const [cfgData, autoData, statusData] = await Promise.allSettled([
            window.lingguang.storage.getItem(SYNC_CONFIG_KEY),
            window.lingguang.storage.getItem(SYNC_AUTO_KEY),
            window.lingguang.storage.getItem(SYNC_STATUS_KEY)
        ]);
        if (cfgData.status === 'fulfilled' && cfgData.value) {
            syncConfig = {
                server: cfgData.value.server || '',
                username: cfgData.value.username || '',
                password: cfgData.value.password || ''
            };
        }
        if (autoData.status === 'fulfilled' && autoData.value && typeof autoData.value.enabled === 'boolean') {
            syncAuto = autoData.value.enabled;
        }
        let lastSync = '';
        if (statusData.status === 'fulfilled' && statusData.value && statusData.value.lastSyncAt) {
            lastSync = statusData.value.lastSyncAt;
        }
        renderSyncForm(lastSync);
    } catch (e) {
        console.error('加载同步配置失败:', e);
    }
}

function renderSyncForm(lastSync) {
    const serverInput = document.getElementById('syncServer');
    const userInput = document.getElementById('syncUsername');
    const passInput = document.getElementById('syncPassword');
    const autoToggle = document.getElementById('syncAutoToggle');
    const statusText = document.getElementById('syncStatusText');
    if (serverInput) serverInput.value = syncConfig.server || '';
    if (userInput) userInput.value = syncConfig.username || '';
    if (passInput) passInput.value = syncConfig.password || '';
    if (autoToggle) autoToggle.checked = syncAuto;
    if (statusText) {
        statusText.textContent = lastSync ? '上次同步：' + lastSync : '尚未同步';
    }
}

// 从表单读取并保存配置
async function saveSyncConfigFromForm() {
    syncConfig.server = (document.getElementById('syncServer') || {}).value || '';
    syncConfig.username = (document.getElementById('syncUsername') || {}).value || '';
    syncConfig.password = (document.getElementById('syncPassword') || {}).value || '';
    await window.lingguang.storage.setItem(SYNC_CONFIG_KEY, syncConfig);
}

// 调用原生 WebDAV 桥；浏览器环境降级用 fetch（同源/支持CORS时可用）
async function webdavRequest(url, method, bodyBase64) {
    if (window.XixiFileBridge && typeof window.XixiFileBridge.webdavRequest === 'function') {
        const raw = window.XixiFileBridge.webdavRequest(
            url, method, syncConfig.username, syncConfig.password, bodyBase64 || ''
        );
        try {
            return JSON.parse(raw);
        } catch (e) {
            return { status: 0, body: '', error: '桥返回异常: ' + raw };
        }
    }
    // 网页版降级：fetch + Basic Auth
    const headers = { 'User-Agent': 'XiXiHiking/1.0' };
    if (syncConfig.username) {
        headers['Authorization'] = 'Basic ' + utf8ToBase64(syncConfig.username + ':' + syncConfig.password);
    }
    if (bodyBase64) {
        headers['Content-Type'] = 'application/octet-stream';
        const binary = atob(bodyBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const resp = await fetch(url, { method, headers, body: bytes });
        const buf = await resp.arrayBuffer();
        const out = new Uint8Array(buf);
        let bin = '';
        out.forEach(b => bin += String.fromCharCode(b));
        return { status: resp.status, body: out.length ? btoa(bin) : '', error: null };
    } else {
        const resp = await fetch(url, { method, headers });
        const text = await resp.text();
        return { status: resp.status, body: text ? utf8ToBase64(text) : '', error: null };
    }
}

// 测试连接：OPTIONS 请求服务器根
async function testSyncConnection() {
    await saveSyncConfigFromForm();
    const url = buildSyncFileUrl();
    if (!url) {
        showErrorMessage('请先填写服务器地址');
        return;
    }
    if (syncInProgress) return;
    syncInProgress = true;
    setSyncBusy(true, '测试中…');
    try {
        const result = await webdavRequest(url, 'OPTIONS', '');
        if (result.status >= 200 && result.status < 300) {
            setSyncStatus('连接成功 ✓', 'check_circle', 'success');
            showSuccessMessage('连接成功，可以同步');
        } else if (result.status === 401 || result.status === 403) {
            setSyncStatus('账号或应用密码错误', 'error', 'error');
            showErrorMessage('认证失败，请检查账号和应用密码');
        } else if (result.error) {
            setSyncStatus('连接失败：' + result.error, 'error', 'error');
            showErrorMessage('连接失败：' + result.error);
        } else {
            setSyncStatus('服务器响应异常（状态码 ' + result.status + '）', 'error', 'error');
            showErrorMessage('服务器响应异常（状态码 ' + result.status + '）');
        }
    } catch (e) {
        setSyncStatus('连接失败：' + (e.message || e), 'error', 'error');
        showErrorMessage('连接失败：' + (e.message || e));
    } finally {
        syncInProgress = false;
        setSyncBusy(false);
    }
}

// 上传备份：全量数据打包 JSON → PUT 到云端
async function uploadSyncBackup() {
    await saveSyncConfigFromForm();
    const fileName = buildSyncFileName(); // 每次备份独立文件名（带时间戳）
    const url = buildSyncFileUrl(fileName);
    if (!url) {
        showErrorMessage('请先填写服务器地址');
        return;
    }
    if (syncInProgress) return;
    syncInProgress = true;
    setSyncBusy(true, '上传中…');
    try {
        const payload = buildFullBackupPayload();
        const json = JSON.stringify(payload, null, 2);
        const bodyBase64 = utf8ToBase64(json);
        // 坚果云要求目录先存在：上传前无条件先逐级创建目录（幂等，已存在返回 405/409 视为 OK）
        const dirsResult = await ensureSyncParentDirs(url);
        if (!dirsResult.ok) {
            const detail = dirsResult.detail || '未知错误';
            setSyncStatus('目录检查失败：' + detail, 'error', 'error');
            showErrorMessage('目录检查失败：' + detail);
            return;
        }
        const result = await webdavRequest(url, 'PUT', bodyBase64);
        if (result.status >= 200 && result.status < 300) {
            const now = formatSyncTime(new Date());
            await recordSyncFile(fileName, payload); // 记录到本地索引
            await window.lingguang.storage.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'upload' });
            setSyncStatus('备份已上传：' + now, 'cloud_upload', 'success');
            showSuccessMessage('备份上传成功');
        } else if (result.status === 401 || result.status === 403) {
            setSyncStatus('认证失败，请检查账号和应用密码', 'error', 'error');
            showErrorMessage('认证失败，请检查账号和应用密码');
        } else {
            const detail = result.error ? result.error : ('HTTP ' + result.status);
            const bodyPreview = result.body ? base64ToUtf8(result.body).slice(0, 200) : '';
            setSyncStatus('上传失败：' + detail, 'error', 'error');
            showErrorMessage('上传失败：' + detail + (bodyPreview ? '（' + bodyPreview + '）' : ''));
            console.error('[Sync] 上传失败', url, result.status, bodyPreview);
        }
    } catch (e) {
        setSyncStatus('上传失败：' + (e.message || e), 'error', 'error');
        showErrorMessage('上传失败：' + (e.message || e));
    } finally {
        syncInProgress = false;
        setSyncBusy(false);
    }
}

// 下载恢复：GET 云端文件 → 覆盖本地
async function downloadSyncBackup() {
    await saveSyncConfigFromForm();
    const url = buildSyncFileUrl();
    if (!url) {
        showErrorMessage('请先填写服务器地址');
        return;
    }
    setSyncStatus('正在读取云端备份…', 'info', '');
    // ★优先从网盘实时读取备份文件列表（PROPFIND），失败再回退本地索引
    const cloudFiles = await listSyncFilesFromCloud();
    if (cloudFiles && cloudFiles.length > 0) {
        showRestoreFileModal(cloudFiles);
        return;
    }
    // 网盘读取失败或无文件：回退本地索引
    const files = await loadSyncFilesIndex();
    if (files.length === 0) {
        setSyncStatus('云端没有备份文件，请先上传备份', 'error', 'error');
        showErrorMessage('云端没有备份文件，请先上传备份');
        return;
    }
    showRestoreFileModal(files);
}

// ★从网盘实时列出备份文件（PROPFIND 列目录，解析 XML 提取文件名）
async function listSyncFilesFromCloud() {
    try {
        const server = (syncConfig.server || '').trim();
        if (!server) return null;
        // 目录 URL：服务器地址 + xixi-hiking/
        let dir = server;
        if (!/^https?:\/\//i.test(dir)) dir = 'https://' + dir;
        if (!dir.endsWith('/')) dir += '/';
        dir += 'xixi-hiking/';
        const r = await webdavRequest(dir, 'PROPFIND', '');
        if (r.status !== 207 || !r.body) {
            console.warn('[Sync] PROPFIND 失败', r.status, r.error);
            return null;
        }
        const xml = base64ToUtf8(r.body);
        // 解析 <D:href>...</D:href>（或 <href>）提取路径
        const hrefs = [];
        const re = /<[^:>]*:?href[^>]*>([^<]+)<\/[^:>]*:?href[^>]*>/gi;
        let m;
        while ((m = re.exec(xml)) !== null) {
            const h = decodeURIComponent(m[1]).trim();
            if (h) hrefs.push(h);
        }
        // 转成备份文件列表（只保留 xixi_hiking_backup_*.json）
        const files = [];
        for (const h of hrefs) {
            const name = h.split('/').filter(Boolean).pop() || '';
            if (name.startsWith(SYNC_FILE_PREFIX) && name.endsWith(SYNC_FILE_EXT)) {
                files.push({
                    name: name,
                    time: '',
                    records: 0,
                    plans: 0,
                    fromCloud: true
                });
            }
        }
        // 按文件名（时间戳）倒序：最新的在最前
        files.sort((a, b) => (b.name > a.name ? 1 : -1));
        return files;
    } catch (e) {
        console.error('[Sync] listSyncFilesFromCloud error:', e);
        return null;
    }
}

// 下载恢复：列出之前备份过的文件，让用户选择恢复哪一个
function showRestoreFileModal(files) {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    // 最多显示 6 条，更多滚动
    const listHtml = files.map((f, i) => `
        <button class="restore-file-item" data-name="${f.name}" style="border-radius: 12px;">
            <span class="material-icons" style="color: #4f46e5;">description</span>
            <span class="restore-file-info">
                <span class="restore-file-label">${formatSyncFileLabel(f.name)}</span>
                <span class="restore-file-desc">${f.fromCloud ? '云端备份' : ('记录 ' + (f.records || 0) + ' 条 · 计划 ' + (f.plans || 0) + ' 条')}</span>
            </span>
            <span class="material-icons" style="color: rgba(148,163,184,0.7); font-size: 18px;">chevron_right</span>
        </button>
    `).join('');
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 320px; width: 90vw;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">cloud_download</span>
                选择备份文件
            </div>
            <div class="confirm-modal-message">
                共 ${files.length} 个备份，选择要恢复的：
            </div>
            <div class="restore-file-list" style="max-height: 260px; overflow-y: auto; padding: 2px 0 10px;">
                ${listHtml}
            </div>
            <button id="restoreCancelBtn" class="mt-2 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                取消
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // 每个文件按钮点击 → 恢复该文件
    modal.querySelectorAll('.restore-file-item').forEach(btn => {
        btn.addEventListener('click', function () {
            const name = this.getAttribute('data-name');
            document.body.removeChild(modal);
            doRestoreFromCloud(name);
        });
    });
    document.getElementById('restoreCancelBtn').addEventListener('click', function () {
        document.body.removeChild(modal);
    });
    // 点空白关闭
    modal.addEventListener('click', function (e) {
        if (e.target === modal) document.body.removeChild(modal);
    });
}

// 执行云端下载并恢复指定备份文件
async function doRestoreFromCloud(fileName) {
    const url = buildSyncFileUrl(fileName);
    if (!url || syncInProgress) return;
    syncInProgress = true;
    setSyncBusy(true, '下载中…');
    try {
        const result = await webdavRequest(url, 'GET', '');
        if (result.status >= 200 && result.status < 300 && result.body) {
            const json = base64ToUtf8(result.body);
            const payload = JSON.parse(json);
            if (payload && Array.isArray(payload.records) && Array.isArray(payload.plannedTrips)) {
                records = payload.records;
                plannedTrips = payload.plannedTrips;
                await saveToStorage();
                await savePlannedTripsToStorage();
                updateStatistics();
                renderTable();
                renderPlannedTripsTable();
                const now = formatSyncTime(new Date());
                await window.lingguang.storage.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'download' });
                setSyncStatus('已恢复「' + formatSyncFileLabel(fileName) + '」：' + now, 'cloud_download', 'success');
                showSuccessMessage('恢复成功');
            } else {
                setSyncStatus('云端文件格式不正确', 'error', 'error');
                showErrorMessage('云端文件格式不正确');
            }
        } else if (result.status === 404) {
            await removeSyncFileFromIndex(fileName); // 文件已不存在，清理索引
            setSyncStatus('该备份文件已不在云端', 'error', 'error');
            showErrorMessage('该备份文件已不在云端，可能已被删除');
        } else if (result.status === 401 || result.status === 403) {
            setSyncStatus('认证失败，请检查账号和应用密码', 'error', 'error');
            showErrorMessage('认证失败，请检查账号和应用密码');
        } else {
            const msg = result.error ? result.error : ('状态码 ' + result.status);
            setSyncStatus('下载失败：' + msg, 'error', 'error');
            showErrorMessage('下载失败：' + msg);
        }
    } catch (e) {
        setSyncStatus('下载失败：' + (e.message || e), 'error', 'error');
        showErrorMessage('下载失败：' + (e.message || e));
    } finally {
        syncInProgress = false;
        setSyncBusy(false);
    }
}

// 合并同步：下载云端 → 与本地按 id 去重、时间戳取新 → 保存
async function mergeSyncBackup(silent) {
    await saveSyncConfigFromForm();
    const url = buildSyncFileUrl();
    if (!url) {
        if (!silent) showErrorMessage('请先填写服务器地址');
        return;
    }
    if (syncInProgress) return;
    syncInProgress = true;
    if (!silent) {
        setSyncBusy(true, '合并中…');
    }
    try {
        const result = await webdavRequest(url, 'GET', '');
        if (result.status === 404) {
            // 云端无文件：若为非静默调用，提示先上传
            if (!silent) {
                setSyncStatus('云端还没有备份文件，请先上传', 'error', 'error');
                showErrorMessage('云端还没有备份文件，请先上传');
            }
            return;
        }
        if (result.status >= 200 && result.status < 300 && result.body) {
            const json = base64ToUtf8(result.body);
            const payload = JSON.parse(json);
            if (payload && Array.isArray(payload.records) && Array.isArray(payload.plannedTrips)) {
                // 合并记录：按 id 去重，时间戳（createdAt）取新
                const localMap = new Map(records.map(r => [r.id, r]));
                const cloudMap = new Map(payload.records.map(r => [r.id, r]));
                const merged = new Map();
                localMap.forEach((r, id) => {
                    const c = cloudMap.get(id);
                    if (!c) { merged.set(id, r); return; }
                    const lv = r.createdAt || '';
                    const cv = c.createdAt || '';
                    merged.set(id, cv > lv ? c : r);
                });
                cloudMap.forEach((r, id) => {
                    if (!merged.has(id)) merged.set(id, r);
                });
                records = Array.from(merged.values());

                // 合并计划：同样按 id 去重，时间戳取新
                const localPMap = new Map(plannedTrips.map(t => [t.id, t]));
                const cloudPMap = new Map(payload.plannedTrips.map(t => [t.id, t]));
                const mergedP = new Map();
                localPMap.forEach((t, id) => {
                    const c = cloudPMap.get(id);
                    if (!c) { mergedP.set(id, t); return; }
                    const lv = t.createdAt || '';
                    const cv = c.createdAt || '';
                    mergedP.set(id, cv > lv ? c : t);
                });
                cloudPMap.forEach((t, id) => {
                    if (!mergedP.has(id)) mergedP.set(id, t);
                });
                plannedTrips = Array.from(mergedP.values());

                await saveToStorage();
                await savePlannedTripsToStorage();
                updateStatistics();
                renderTable();
                renderPlannedTripsTable();
                const now = formatSyncTime(new Date());
                await window.lingguang.storage.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'merge' });
                if (!silent) {
                    setSyncStatus('合并完成：' + now, 'sync', 'success');
                    showSuccessMessage('合并同步完成');
                }
            } else {
                if (!silent) {
                    setSyncStatus('云端文件格式不正确', 'error', 'error');
                    showErrorMessage('云端文件格式不正确');
                }
            }
        } else if (result.status === 401 || result.status === 403) {
            if (!silent) {
                setSyncStatus('认证失败，请检查账号和应用密码', 'error', 'error');
                showErrorMessage('认证失败，请检查账号和应用密码');
            }
        } else if (!silent) {
            const msg = result.error ? result.error : ('状态码 ' + result.status);
            setSyncStatus('合并失败：' + msg, 'error', 'error');
            showErrorMessage('合并失败：' + msg);
        }
    } catch (e) {
        if (!silent) {
            setSyncStatus('合并失败：' + (e.message || e), 'error', 'error');
            showErrorMessage('合并失败：' + (e.message || e));
        }
    } finally {
        syncInProgress = false;
        if (!silent) setSyncBusy(false);
    }
}

// 全量数据打包（含应用版本、标题、暗色模式等元信息）
function buildFullBackupPayload() {
    return {
        app: 'XiXiHiking',
        appName: 'XiXiの徒步小记',
        version: '1.4.10.0',
        exportedAt: new Date().toISOString(),
        records: records || [],
        plannedTrips: plannedTrips || []
    };
}

function formatSyncTime(date) {
    const p = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) +
        ' ' + p(date.getHours()) + ':' + p(date.getMinutes());
}

function setSyncStatus(text, icon, type) {
    const statusText = document.getElementById('syncStatusText');
    if (!statusText) return;
    statusText.innerHTML = '';
    const container = statusText.closest('.sync-status');
    if (container) {
        const iconEl = container.querySelector('.material-icons');
        if (iconEl) {
            iconEl.textContent = icon || 'info';
            if (type === 'success') iconEl.style.color = '#16a34a';
            else if (type === 'error') iconEl.style.color = '#dc2626';
            else iconEl.style.color = '';
        }
    }
    statusText.textContent = text;
}

function setSyncBusy(busy, label) {
    const btns = ['syncUploadBtn', 'syncDownloadBtn'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (busy) {
            btn.setAttribute('disabled', 'disabled');
            btn.style.opacity = '0.55';
        } else {
            btn.removeAttribute('disabled');
            btn.style.opacity = '';
        }
    });
    const statusText = document.getElementById('syncStatusText');
    if (busy && label && statusText) {
        statusText.textContent = label;
    }
}

// 自动检测连接：进入设置页或输入配置后调用，结果展示在状态行 + 可选 toast 提示
async function autoCheckSyncConnection(showTip) {
    const statusText = document.getElementById('syncStatusText');
    if (!statusText) return;
    await saveSyncConfigFromForm();
    const url = buildSyncFileUrl();
    if (!url) {
        setSyncStatus('请先填写服务器地址', 'info', '');
        return;
    }
    if (!syncConfig.username || !syncConfig.password) {
        setSyncStatus('请填写账号和应用密码', 'info', '');
        return;
    }
    setSyncStatus('正在检测连接…', 'info', '');
    try {
        const dirsResult = await ensureSyncParentDirs(url);
        if (!dirsResult.ok) {
            setSyncStatus(dirsResult.detail, 'error', 'error');
            if (showTip) showErrorMessage('连接失败：' + dirsResult.detail);
            return;
        }
        // 目录存在：再试一次真实连通性（探测目录 GET 成功即代表认证+网络都通）
        setSyncStatus('连接正常 ✓ 云端目录就绪', 'check_circle', 'success');
        if (showTip) showSuccessMessage('连接成功，可以同步');
    } catch (e) {
        setSyncStatus('连接失败：' + (e.message || e), 'error', 'error');
        if (showTip) showErrorMessage('连接失败：' + (e.message || e));
    }
}

function setupSyncEventListeners() {
    const uploadBtn = document.getElementById('syncUploadBtn');
    if (uploadBtn) {
        const handler = uploadSyncBackup;
        uploadBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => uploadBtn.removeEventListener('click', handler));
    }
    const downloadBtn = document.getElementById('syncDownloadBtn');
    if (downloadBtn) {
        const handler = downloadSyncBackup;
        downloadBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => downloadBtn.removeEventListener('click', handler));
    }
    const autoToggle = document.getElementById('syncAutoToggle');
    if (autoToggle) {
        const handler = async function (e) {
            syncAuto = e.target.checked;
            await window.lingguang.storage.setItem(SYNC_AUTO_KEY, { enabled: syncAuto });
        };
        autoToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => autoToggle.removeEventListener('change', handler));
    }
}

// 设置页 tab 切换时自动检测连接（进入设置页才触发，避免每次启动都联网）
function bindAutoCheckOnSettingsTab() {
    const settingsTabBtn = document.querySelector('#bottomTabBar .tab-btn[data-tab="settings"]');
    if (settingsTabBtn) {
        const handler = function () {
            setTimeout(function () {
                autoCheckSyncConnection(false);
            }, 400); // 等设置页渲染动画结束再检测，避免闪烁
        };
        settingsTabBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => settingsTabBtn.removeEventListener('click', handler));
    }
    // ★输入配置后自动检测：服务器/账号/密码任一变化 → 防抖 800ms 后自动检测并提示
    ['syncServer', 'syncUsername', 'syncPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        let timer = null;
        const handler = function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                autoCheckSyncConnection(true);
            }, 800);
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        cleanupFunctions.push(() => {
            el.removeEventListener('input', handler);
            el.removeEventListener('change', handler);
        });
    });
}


// ==================== 导出功能 ====================

function exportRecords() {
    showExportModal();
}

function showExportModal() {
    // 移除已存在的模态框
    const existingModal = document.getElementById('exportModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalHtml = `
        <div id="exportModal" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-animate" style="background: rgba(0,0,0,0.5);">
            <div class="glass-modal modal-fade-scale p-6 w-80 max-w-[90vw]">
                <h3 class="text-lg font-semibold mb-4 text-white">导出</h3>

                <div class="space-y-3">
                    <button id="exportRecordsBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">hiking</span>
                        <span>导出徒步记录</span>
                    </button>
                    <button id="exportPlannedBtn" class="w-full py-3 px-4 modal-option-btn green flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">event_note</span>
                        <span>导出计划徒步</span>
                    </button>
                    <button id="exportCodeBtn" class="w-full py-3 px-4 modal-option-btn purple flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">code</span>
                        <span>导出应用代码</span>
                    </button>
                </div>
                <button id="closeExportModal" class="mt-4 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                    取消
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('exportModal');
    const closeBtn = document.getElementById('closeExportModal');
    const exportRecordsBtn = document.getElementById('exportRecordsBtn');
    const exportPlannedBtn = document.getElementById('exportPlannedBtn');
    const exportCodeBtn = document.getElementById('exportCodeBtn');

    const closeModal = () => {
        // 淡出后移除：淡出期间加 body.modal-closing 禁用 backdrop-filter（避免重模糊卡顿），完成后清理
        document.body.classList.add('modal-closing');
        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
            document.body.classList.remove('modal-closing');
        }, 250);
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    exportRecordsBtn.addEventListener('click', async () => {
        closeModal();
        await performExport('records', 'csv');
    });

    exportPlannedBtn.addEventListener('click', async () => {
        closeModal();
        await performExport('planned', 'csv');
    });

    exportCodeBtn.addEventListener('click', async () => {
        closeModal();
        await exportAppCode();
    });
}

function escapeCsvField(field) {
    if (field === null || field === undefined) {
        return '';
    }
    const str = String(field);
    // 如果包含逗号、引号或换行符，需要用引号包裹并转义内部引号
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function formatDateForExport(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function performExport(type, format = 'csv') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    // 准备数据
    let recordsData = [];
    let plannedData = [];
    
    if (type === 'records') {
        if (records && records.length > 0) {
            recordsData = records.map(record => ({
                '名称': record.name || '',
                '海拔(米)': record.elevation || 0,
                '难度': record.difficulty || 1,
                '记录时间': formatDateForExport(record.createdAt)
            }));
        }
    }
    
    if (type === 'planned') {
        if (plannedTrips && plannedTrips.length > 0) {
            plannedData = plannedTrips.map(trip => ({
                '名称': trip.name || '',
                '海拔(米)': trip.elevation || 0,
                '难度': trip.difficulty || 1,
                '记录时间': formatDateForExport(trip.createdAt)
            }));
        }
    }
    
    // 检查是否有数据
    const hasRecords = recordsData.length > 0;
    const hasPlanned = plannedData.length > 0;

    if (type === 'records' && !hasRecords) {
        showErrorMessage('没有徒步记录可导出');
        return;
    }

    if (type === 'planned' && !hasPlanned) {
        showErrorMessage('没有计划徒步可导出');
        return;
    }


    // 导出 CSV
    await exportToCsv(type, recordsData, plannedData, dateStr);
}

async function exportToCsv(type, recordsData, plannedData, dateStr) {
    let csvContent = '';
    let filename = '';
    
    // UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    
    if (type === 'records') {
        csvContent = BOM + '名称,海拔(米),难度,记录时间\n';
        recordsData.forEach(record => {
            csvContent += `${escapeCsvField(record['名称'])},${record['海拔(米)']},${record['难度']},${record['记录时间']}\n`;
        });
        filename = `徒步记录_${dateStr}.csv`;
    } else if (type === 'planned') {
        csvContent = BOM + '名称,海拔(米),难度,记录时间\n';
        plannedData.forEach(trip => {
            csvContent += `${escapeCsvField(trip['名称'])},${trip['海拔(米)']},${trip['难度']},${trip['记录时间']}\n`;
        });
        filename = `计划徒步_${dateStr}.csv`;

    }
    
    await downloadCsvFile(csvContent, filename);
}

async function downloadCsvFile(content, filename) {
    // 使用 lingguang.saveFile API 直接保存文件
    try {
        // 将内容转换为纯 Base64 格式（不包含 Data URL 前缀）
        const base64Content = btoa(encodeURIComponent(content).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode('0x' + p1);
            }));

        const result = await window.lingguang.saveFile({
            data: base64Content,
            filename: filename
        });

        if (result.success) {
            showSuccessMessage(`导出成功，已保存到「下载」文件夹：${filename}`);
        } else {
            showErrorMessage('导出失败，请重试');
        }
    } catch (error) {
        console.error('CSV 导出失败:', error);
        if (error.name === 'PERMISSION_DENIED') {
            showErrorMessage('保存权限被拒绝');
        } else {
            showErrorMessage('导出失败，请重试');
        }
    }
}

// ==================== CSV 导入功能 ====================

let pendingImportData = null;

function showImportModal() {
    const existing = document.getElementById('importMethodModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'importMethodModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center modal-backdrop-animate';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.innerHTML = `
        <div class="glass-modal modal-fade-scale p-6 w-80 max-w-[90vw]">
            <h3 class="text-lg font-semibold mb-2 text-white">导入徒步数据</h3>
            <p class="text-sm text-white/60 mb-4">请选择操作</p>
            <div class="space-y-3">
                <button id="selectFileBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">upload_file</span>
                    <span>选择CSV文件</span>
                </button>
                <button id="downloadSampleBtn" class="w-full py-3 px-4 modal-option-btn purple flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">description</span>
                    <span>下载导入示例</span>
                </button>
            </div>
            <button id="cancelImportModal" class="mt-4 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                取消
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // 淡出关闭（用于下载示例和取消）
    const fadeOutModal = () => {
        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
        }, 250);
    };

    document.getElementById('selectFileBtn').addEventListener('click', () => {
        // 先触发文件选择（保持用户手势上下文，Android WebView 要求），再移除弹窗
        importCSV();
        fadeOutModal();
    });

    document.getElementById('downloadSampleBtn').addEventListener('click', () => {
        fadeOutModal();
        downloadSampleCSV();
    });

    document.getElementById('cancelImportModal').addEventListener('click', () => {
        fadeOutModal();
    });

    // 点击遮罩空白处关闭（与导出弹窗统一）
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            fadeOutModal();
        }
    });
}

function downloadSampleCSV() {
    const BOM = '\uFEFF';
    const header = '名称,海拔(米),难度,记录时间\n';
    const samples = [
        ['太白山拔仙台', '3767', '5', '2026-07-15 08:00:00'],
        ['华山北峰', '2155', '4', '2026-06-20 06:30:00'],
        ['终南山', '2604', '3', '2026-05-10 07:00:00'],
        ['光头山', '2887', '4', '2026-04-18 06:00:00'],
        ['翠华山', '2132', '3', '2026-03-22 08:30:00'],
        ['骊山', '1302', '2', '2026-02-14 09:00:00'],
        ['牛背梁', '2802', '4', '2026-01-08 07:30:00'],
    ];

    let csvContent = BOM + header;
    samples.forEach(s => {
        csvContent += `${escapeCsvField(s[0])},${s[1]},${s[2]},${s[3]}\n`;
    });

    downloadCsvFile(csvContent, '徒步导入示例.csv');
}

function importCSV() {
    const fileInput = document.getElementById('csvFileInput');
    if (!fileInput) return;
    fileInput.click();
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const text = ev.target.result;
                const cleanText = text.replace(/^\uFEFF/, '');
                const lines = cleanText.trim().split('\n');
                if (lines.length < 2) {
                    showErrorMessage('CSV 文件为空');
                    return;
                }
                
                const header = lines[0].split(',');
                const nameIdx = header.findIndex(h => h.includes('名称'));
                const altIdx = header.findIndex(h => h.includes('海拔'));
                const diffIdx = header.findIndex(h => h.includes('难度'));
                const timeIdx = header.findIndex(h => h.includes('时间'));
                
                const parsedRecords = [];
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',');
                    if (cols.length < 3) continue;
                    
                    // 解析日期：支持 "2026/6/22 13:16" 和 "2026-08-07 13:56:00" 两种格式
                    let isoDate;
                    if (cols[timeIdx]) {
                        const raw = cols[timeIdx].trim();
                        // 尝试用 Date 对象解析（兼容 / 和 - 分隔符）
                        const d = new Date(raw.replace(/\//g, '-'));
                        if (!isNaN(d.getTime())) {
                            isoDate = d.toISOString();
                        } else {
                            isoDate = new Date().toISOString();
                        }
                    } else {
                        isoDate = new Date().toISOString();
                    }
                    
                    const record = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2) + i,
                        name: (cols[nameIdx] || '').trim(),
                        elevation: parseInt(cols[altIdx]) || 0,
                        difficulty: parseInt(cols[diffIdx]) || 3,
                        createdAt: isoDate
                    };
                    
                    if (!record.name) continue;
                    parsedRecords.push(record);
                }
                
                if (parsedRecords.length === 0) {
                    showErrorMessage('CSV 中没有有效记录');
                    return;
                }
                
                // 弹出选择：导入到徒步记录还是计划徒步行
                pendingImportData = parsedRecords;
                showImportChoiceModal(parsedRecords.length);
                
            } catch (err) {
                console.error('CSV 导入失败:', err);
                showErrorMessage('CSV 解析失败，请检查文件格式');
            }
        };
        reader.readAsText(file, 'UTF-8');
        fileInput.value = '';
    };
}

function showImportChoiceModal(count) {
    const existing = document.getElementById('importChoiceModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'importChoiceModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center modal-backdrop-animate';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.innerHTML = `
        <div class="glass-modal modal-fade-scale p-6 w-80 max-w-[90vw]">
            <h3 class="text-lg font-semibold mb-2 text-white">导入 ${count} 条记录到...</h3>
            <p class="text-sm text-white/60 mb-4">请选择导入目标</p>
            <div class="space-y-3">
                <button id="importToRecords" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">hiking</span>
                    <span>徒步记录</span>
                </button>
                <button id="importToPlanned" class="w-full py-3 px-4 modal-option-btn green flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">event_note</span>
                    <span>计划徒步</span>
                </button>
            </div>
            <button id="cancelImport" class="mt-4 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                取消
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 淡出关闭
    const fadeOutModal = () => {
        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
        }, 250);
    };
    
    function finishImport(targetArray, targetKey, tableName) {
        let imported = 0;
        for (const rec of pendingImportData) {
            const exists = targetArray.some(r => r.name === rec.name && r.createdAt === rec.createdAt);
            if (exists) continue;
            targetArray.push(rec);
            imported++;
        }
        
        if (imported > 0) {
            // 保存到对应的 storage
            if (targetKey === 'planned_trips') {
                window.lingguang.storage.setItem(targetKey, { trips: targetArray });
            } else {
                saveToStorage();
            }
            updateStatistics();
            renderTable();
            if (targetKey === 'planned_trips') {
                renderPlannedTripsTable();
            }
            showSuccessMessage(`已导入 ${imported} 条到"${tableName}"`);
        } else {
            showErrorMessage('没有新记录可导入（可能已存在）');
        }
        
        pendingImportData = null;
        fadeOutModal();
    }
    
    document.getElementById('importToRecords').addEventListener('click', () => {
        finishImport(records, 'hiking_records', '徒步记录');
    });
    
    document.getElementById('importToPlanned').addEventListener('click', () => {
        finishImport(plannedTrips, 'planned_trips', '计划徒步行');
    });
    
    document.getElementById('cancelImport').addEventListener('click', () => {
        pendingImportData = null;
        fadeOutModal();
    });
    
    // 点击遮罩关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            pendingImportData = null;
            modal.remove();
        }
    });
}

// ==================== 导出应用代码 ====================

// 嵌入的文件内容（在构建时注入）
const EMBEDDED_MANIFEST = '{"navigationBar": {"visible": false, "title": "XiXiの徒步小记", "backgroundColor": "#667eea", "foregroundColor": "#ffffff"}}';

const EMBEDDED_README = `# XiXiの徒步小记 应用

一个用于记录和管理徒步登山活动的移动端轻应用。

## 功能特点

- **记录管理**：添加、编辑、删除徒步记录
- **山峰信息**：自动搜索山峰海拔、难度等信息
- **数据统计**：总记录数、平均海拔、最高海拔、平均难度
- **难度分布**：柱状图展示不同难度的记录分布
- **深色模式**：支持深色模式切换
- **可编辑标题**：点击标题可自定义应用名称
- **数据持久化**：自动保存数据到本地存储

## 使用方式

1. 点击右上角 **+** 按钮添加新记录
2. 输入山峰名称，系统会自动搜索相关信息
3. 从搜索结果中选择山峰，自动填充海拔和难度
4. 点击 **保存** 完成记录
5. 点击记录行可编辑，点击删除按钮可删除
6. 点击右上角月亮图标切换深色模式
7. 点击标题可自定义应用名称

## 技术说明

- 使用 \`lingguang.storage\` API 进行数据持久化
- 使用 \`lingguang.data.fetch\` API 进行山峰信息搜索
- 支持离线缓存，提升搜索响应速度
- 优化的防抖策略，减少不必要的搜索请求
- 响应式设计，适配移动端显示`;

async function exportAppCode() {
    try {
        showLoadingMessage('正在获取代码文件...');

        // 获取当前时间戳
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const exportTime = new Date().toLocaleString('zh-CN');

        // 获取所有代码文件内容
        let indexHtmlContent = '';
        let appJsContent = '';
        let manifestContent = EMBEDDED_MANIFEST;
        let readmeContent = EMBEDDED_README;

        // 1. 获取 index.html
        try {
            const htmlResponse = await fetch('index.html');
            if (htmlResponse.ok) {
                indexHtmlContent = await htmlResponse.text();
            } else {
                throw new Error('HTTP error ' + htmlResponse.status);
            }
        } catch (e) {
            // 如果 fetch 失败，使用当前页面的 HTML
            indexHtmlContent = document.documentElement.outerHTML;
        }

        // 2. 获取 app.js - 尝试多种方式
        try {
            // 方式1: 直接 fetch
            const appJsResponse = await fetch('app.js');
            if (appJsResponse.ok) {
                appJsContent = await appJsResponse.text();
            } else {
                throw new Error('HTTP error ' + appJsResponse.status);
            }
        } catch (e) {
            console.warn('fetch app.js 失败，尝试其他方式...');
            try {
                // 方式2: 使用 XMLHttpRequest
                appJsContent = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', 'app.js', true);
                    xhr.onload = function() {
                        if (this.status === 200) {
                            resolve(this.responseText);
                        } else {
                            reject(new Error('XHR error: ' + this.status));
                        }
                    };
                    xhr.onerror = function() {
                        reject(new Error('XHR network error'));
                    };
                    xhr.send();
                });
            } catch (e2) {
                console.warn('XMLHttpRequest 也失败，尝试获取内联脚本...');
                // 方式3: 检查是否有内联脚本或通过其他方式获取
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    if (script.src && script.src.includes('app.js')) {
                        // 尝试重新 fetch
                        try {
                            const resp = await fetch(script.src);
                            if (resp.ok) {
                                appJsContent = await resp.text();
                                break;
                            }
                        } catch (e3) {
                            console.warn('通过 script.src 获取失败');
                        }
                    }
                }
            }
        }

        // 如果仍然没有获取到 app.js，尝试从 HTML 中提取内联脚本
        if (!appJsContent && indexHtmlContent) {
            console.log('尝试从 HTML 中提取内联脚本...');
            // 查找内联 script 标签（不包含 src 属性的 script 标签）
            const scriptMatch = indexHtmlContent.match(/<script>([\s\S]*?)<\/script>/);
            if (scriptMatch && scriptMatch[1]) {
                appJsContent = scriptMatch[1].trim();
                console.log('成功从 HTML 中提取内联脚本，长度:', appJsContent.length);
            }
        }

        // 如果仍然没有获取到 app.js，添加提示
        if (!appJsContent) {
            appJsContent = '// 注意：app.js 内容需要手动从源文件复制\n// 请从应用的 app.js 文件中复制完整内容';
        }

        hideLoadingMessage();

        // 创建包含所有代码文件的文档
        const separator = '\n\n' + '='.repeat(80) + '\n\n';
        const fileSeparator = (filename) => `\n\n${'='.repeat(80)}\n文件: ${filename}\n${'='.repeat(80)}\n\n`;

        const fullContent = `# XiXiの徒步小记 - 完整代码导出
导出时间: ${exportTime}

================================================================================
使用说明
================================================================================

本文档包含应用的所有源代码文件，每个文件用分隔线标注文件名。

使用方法：
1. 复制本文档内容
2. 根据分隔线标注的文件名，将对应内容保存为相应文件
3. 或使用下方的分割脚本自动提取文件

================================================================================
自动分割脚本 (保存为 split.py 后运行)
================================================================================

import re

with open('代码导出.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到所有文件分隔符
pattern = r'=+\n文件: (.+?)\n=+\n'
parts = re.split(pattern, content)

# 第一个部分是说明文档，跳过
i = 1
while i < len(parts) - 1:
    filename = parts[i].strip()
    file_content = parts[i + 1].strip()
    # 移除末尾的下一个分隔符之前的内容
    if i + 2 < len(parts):
        file_content = file_content.split('=\\n' + '='.repeat(80))[0].strip()
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(file_content)
    print(f'已提取: {filename}')
    i += 2

print('提取完成！')

================================================================================
部署说明
================================================================================

方式一：直接打开
双击 index.html 文件即可在浏览器中打开使用。

方式二：静态网站部署
将所有文件上传到任意静态网站托管平台：
- GitHub Pages
- Vercel
- Netlify
- 阿里云 OSS + CDN
- 腾讯云 COS + CDN

方式三：打包为移动端 App
使用 Cordova 或 Capacitor 打包为 Android/iOS 应用。

================================================================================
重要注意事项
================================================================================

1. 平台特定 API 替换：
   window.lingguang.storage.setItem() → localStorage.setItem()
   window.lingguang.storage.getItem() → localStorage.getItem()
   lingguang.storage.removeItem() → localStorage.removeItem()
   lingguang.data.fetch() → fetch() 或 axios

2. 外部依赖（已通过 CDN 引入）：
   - Tailwind CSS
   - Material Icons
   - 基础库

独立部署时需替换为公共 CDN 或下载到本地引用。

================================================================================
源代码文件
================================================================================
${fileSeparator('index.html')}${indexHtmlContent}${fileSeparator('app.js')}${appJsContent}${fileSeparator('manifest.json')}${manifestContent}${fileSeparator('README.md')}${readmeContent}${separator}
导出完成！共 4 个文件。
`;

        // 转换为 Base64
        const base64Content = btoa(encodeURIComponent(fullContent).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode('0x' + p1);
            }));

        // 保存文件
        const filename = `XiXi徒步小记_代码_${timestamp.replace(/-/g, '').replace(/T/g, '_').slice(0, 15)}.txt`;
        const result = await window.lingguang.saveFile({
            data: base64Content,
            filename: filename
        });

        if (result.success) {
            showSuccessMessage('代码文件已导出，保存到「下载」文件夹');
        } else {
            showErrorMessage('导出失败，请重试');
        }
    } catch (error) {
        console.error('代码导出失败:', error);
        hideLoadingMessage();
        if (error.name === 'PERMISSION_DENIED') {
            showErrorMessage('保存权限被拒绝');
        } else {
            showErrorMessage('导出失败，请重试');
        }
    }
}

function showLoadingMessage(message) {
    // 移除已存在的提示
    const existingHint = document.getElementById('loadingMessage');
    if (existingHint) {
        existingHint.remove();
    }

    const hintHtml = `
        <div id="loadingMessage" class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-2xl max-w-[90vw] flex items-center gap-3 toast-glass loading">
            <div class="animate-spin w-5 h-5 border-2 rounded-full" style="border-color: currentColor; border-top-color: transparent;"></div>
            <span>${message}</span>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', hintHtml);
}

function hideLoadingMessage() {
    const hint = document.getElementById('loadingMessage');
    if (hint) {
        hint.remove();
    }
}

async function init() {
    if (isInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    isInitialized = true;
    const startTime = performance.now();

    try {
        renderTable();
        
        const [storageData, darkModeData, titleData, statsTitleData, recordsTitleData, plannedTitleData, settingsTitleData, fpsData] = await Promise.allSettled([
            window.lingguang.storage.getItem(STORAGE_KEY),
            window.lingguang.storage.getItem(DARK_MODE_KEY),
            window.lingguang.storage.getItem(APP_TITLE_KEY),
            window.lingguang.storage.getItem(STATS_TITLE_KEY),
            window.lingguang.storage.getItem(RECORDS_TITLE_KEY),
            window.lingguang.storage.getItem(PLANNED_TITLE_KEY),
            window.lingguang.storage.getItem(SETTINGS_TITLE_KEY),
            window.lingguang.storage.getItem(SHOW_FPS_KEY)
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
            console.log(`Loaded ${records.length} records in ${(performance.now() - startTime).toFixed(2)}ms`);
        }
        
        if (darkModeData.status === 'fulfilled' && darkModeData.value && typeof darkModeData.value.isDarkMode === 'boolean') {
            isDarkMode = darkModeData.value.isDarkMode;
            document.body.classList.toggle('dark-mode', isDarkMode);
            const darkModeIcon = document.getElementById('darkModeIcon');
            if (darkModeIcon) {
                darkModeIcon.textContent = isDarkMode ? 'light_mode' : 'dark_mode';
            }
        }
        
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
        }
        
        // 帧率显示开关
        if (fpsData.status === 'fulfilled' && fpsData.value && typeof fpsData.value.showFps === 'boolean') {
            showFps = fpsData.value.showFps;
        }
        applyFpsPreference();
        
        updateStatistics();
        renderTable();
        
        // 加载计划徒步行数据
        await loadPlannedTripsFromStorage();
        renderPlannedTripsTable();
        
        setupEventListeners();
        updateSortIcons();
        
        // WebDAV 同步：加载配置/状态，若开启自动同步则静默合并
        try {
            await loadSyncState();
            setupSyncEventListeners();
            bindAutoCheckOnSettingsTab();
            if (syncAuto && syncConfig.server && syncConfig.username) {
                console.log('[Sync] Auto sync enabled, merging...');
                setTimeout(function () { mergeSyncBackup(true); }, 800);
            }
        } catch (e) {
            console.error('Sync init error:', e);
        }
        
        console.log(`App initialized in ${(performance.now() - startTime).toFixed(2)}ms`);
    } catch (error) {
        console.error('Initialization error:', error);
        records = [];
        renderTable();
    }
}

function setupEventListeners() {
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        const handler = addNewRecord;
        addBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => addBtn.removeEventListener('click', handler));
    }
    
    // 导入按钮
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        const handler = showImportModal;
        importBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => importBtn.removeEventListener('click', handler));
    }
    
    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        const handler = exportRecords;
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
    
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        const handler = toggleDarkMode;
        darkModeToggle.addEventListener('click', handler);
        cleanupFunctions.push(() => darkModeToggle.removeEventListener('click', handler));
    }
    
    // 顶栏标题不可修改（已锁定，移除点击编辑）
    
    // 区块标题点击事件
    const statsTitle = document.getElementById('statsTitle');
    if (statsTitle) {
        const handler = startEditStatsTitle;
        statsTitle.addEventListener('click', handler);
        cleanupFunctions.push(() => statsTitle.removeEventListener('click', handler));
    }
    
    const recordsTitle = document.getElementById('recordsTitle');
    if (recordsTitle) {
        const handler = startEditRecordsTitle;
        recordsTitle.addEventListener('click', handler);
        cleanupFunctions.push(() => recordsTitle.removeEventListener('click', handler));
    }
    
    const plannedTitle = document.getElementById('plannedTitle');
    if (plannedTitle) {
        const handler = startEditPlannedTitle;
        plannedTitle.addEventListener('click', handler);
        cleanupFunctions.push(() => plannedTitle.removeEventListener('click', handler));
    }
    
    const settingsTitle = document.getElementById('settingsTitle');
    if (settingsTitle) {
        const handler = startEditSettingsTitle;
        settingsTitle.addEventListener('click', handler);
        cleanupFunctions.push(() => settingsTitle.removeEventListener('click', handler));
    }
    
    // 帧率显示开关
    const fpsToggle = document.getElementById('fpsToggle');
    if (fpsToggle) {
        const handler = async () => {
            showFps = fpsToggle.checked;
            try {
                await window.lingguang.storage.setItem(SHOW_FPS_KEY, { showFps });
            } catch (e) {
                console.error('保存帧率开关失败:', e);
            }
            applyFpsPreference();
        };
        fpsToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => fpsToggle.removeEventListener('change', handler));
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
    function switchTab(tabId) {
        var pages = { overview: 'tab-overview', plans: 'tab-plans', records: 'tab-records', settings: 'tab-settings' };
        var pageId = pages[tabId];
        if (!pageId) return;
        // 切换界面时自动取消正在进行的编辑，恢复编辑前数据
        if (typeof editingId !== 'undefined' && editingId !== null) {
            cancelEdit();
        }
        if (typeof plannedEditingId !== 'undefined' && plannedEditingId !== null) {
            plannedEditingId = null;
            renderPlannedTripsTable();
        }
        document.querySelectorAll('.tab-page').forEach(function (p) {
            p.style.display = 'none';
        });
        var page = safeGetElementById(pageId);
        if (page) {
            page.style.display = 'block';
            // 重新触发淡入动画
            page.style.animation = 'none';
            void page.offsetHeight;
            page.style.animation = '';
        }
        tabButtons.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
        });
        // 切到概览时刷新统计数据
        if (tabId === 'overview' && typeof updateStatistics === 'function') {
            try { updateStatistics(); } catch (e) { console.error('updateStatistics failed:', e); }
        }
        // 切到记录/计划时表格横向滚动归位
        if (tabId === 'records' || tabId === 'plans') {
            var tbl = safeGetElementById(tabId === 'records' ? 'recordsTable' : 'plannedTripsTable');
            if (tbl && tbl.parentElement && tbl.parentElement.parentElement) {
                tbl.parentElement.parentElement.scrollLeft = 0;
            }
        }
    }
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
}

if (document.readyState === 'loading') {
    // 延迟初始化，给 WebView 足够时间完成布局，防止移动端闪退
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            init().catch(function(err) {
                console.error('Init failed:', err);
            });
        }, 100);
    });
} else {
    init();
}