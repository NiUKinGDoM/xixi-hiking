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
        const data = await AppStore.getItem(SYNC_FILES_KEY);
        return (data && Array.isArray(data.files)) ? data.files : [];
    } catch (e) {
        console.error('loadSyncFilesIndex error:', e);
        return [];
    }
}

async function saveSyncFilesIndex(files) {
    await AppStore.setItem(SYNC_FILES_KEY, { files: files.slice(0, SYNC_MAX_FILES) });
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
            AppStore.getItem(SYNC_CONFIG_KEY),
            AppStore.getItem(SYNC_AUTO_KEY),
            AppStore.getItem(SYNC_STATUS_KEY)
        ]);
        if (cfgData.status === 'fulfilled' && cfgData.value) {
            syncConfig = {
                server: cfgData.value.server || '',
                username: cfgData.value.username || '',
                password: decPwd(cfgData.value.password || '')   // ★2026-08-25 解密（老明文兼容）
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
        // ★备份提醒（★2026-09-01 改通知栏）：配置了同步但超过 7 天没备份 → 通知栏提示（点通知跳设置页）
        // 网页版无通知栏 → showSystemNotification 自动降级 toast；同一天不重复提醒
        if (syncConfig.server && syncConfig.username && lastSync) {
            const days = (Date.now() - new Date(lastSync).getTime()) / 86400000;
            if (days >= 7) {
                setTimeout(function () {
                    try {
                        const todayStr = new Date().toDateString();
                        if (localStorage.getItem('hiking_backup_remind_date') === todayStr) return;
                        localStorage.setItem('hiking_backup_remind_date', todayStr);
                        showSystemNotification('备份提醒', '距上次同步已 ' + Math.floor(days) + ' 天，建议上传备份到云端', 'settings');
                    } catch (e) { /* 提醒失败不影响启动 */ }
                }, 1500);
            }
        }
    } catch (e) {
        console.error('加载同步配置失败:', e);
    }
}

// ★2026-09-01 通知权限引导行：仅原生 App + 权限未开启时显示「通知权限未开启 → 点击去开启」
// 网页版（无桥/无通知栏）永远隐藏；权限已开隐藏；点击跳系统通知设置
let notifyPermRowBound = false;
function refreshNotifyPermRow() {
    try {
        const el = document.getElementById('notifyPermItem');
        if (!el) return;
        const isApp = window.XixiFileBridge && typeof window.XixiFileBridge.checkNotificationPermission === 'function';
        if (!isApp) { el.style.display = 'none'; return; }
        let granted = true;
        try { granted = !!window.XixiFileBridge.checkNotificationPermission(); } catch (e) { /* 桥异常按已开启 */ }
        el.style.display = granted ? 'none' : 'flex';
        if (!notifyPermRowBound) {
            notifyPermRowBound = true;
            el.addEventListener('click', function () {
                try {
                    if (window.XixiFileBridge && typeof window.XixiFileBridge.openNotificationSettings === 'function') {
                        window.XixiFileBridge.openNotificationSettings();
                    }
                } catch (e) { /* 跳转失败忽略 */ }
            });
        }
    } catch (e) { /* 忽略 */ }
}

// ★2026-08-11 设置页手动刷新（底栏点击当前"设置"tab 时调用）：
//   只刷新动态状态行 + 重播逐块浮现动画；不覆盖输入框、不发网络请求（不卡顿）
async function refreshSettingsUI() {
    try {
        refreshNotifyPermRow(); // ★2026-09-01 每次进设置页刷新通知权限引导行
    } catch (e) { /* 忽略 */ }
    try {
        const statusData = await AppStore.getItem(SYNC_STATUS_KEY);
        if (statusData && statusData.lastSyncAt) {
            syncUiState.lastSyncAt = statusData.lastSyncAt; // 2026-08-12 状态行删除 → 存全局
        }
    } catch (e) { console.error('refresh settings status failed:', e); }
    const settingsChildren = document.querySelectorAll('#tab-settings .glass-panel > *');
    settingsChildren.forEach(function (child) {
        child.classList.remove('block-anim');
        void child.offsetWidth;
        child.classList.add('block-anim');
    });
    setTimeout(function () {
        settingsChildren.forEach(function (child) {
            child.classList.remove('block-anim');
        });
    }, 950);
}

// ★2026-08-11 WebDAV 状态自动回正：点击设置页操作命令后 delay 毫秒，重新检测连接
//   把状态行刷新回"连接正常 ✓"；未配置完整时跳过（不发无谓请求）；
//   只挂在命令按钮上，与底栏切换无关 → 不影响切 tab 流畅度
let syncStatusRefreshTimer = null;
function scheduleSyncStatusRefresh(delay) {
    if (syncStatusRefreshTimer) clearTimeout(syncStatusRefreshTimer);
    syncStatusRefreshTimer = setTimeout(function () {
        syncStatusRefreshTimer = null;
        if (syncConfig.server && syncConfig.username && syncConfig.password) {
            autoCheckSyncConnection(false);
        }
    }, delay || 2000);
}

// ==================== 应用内更新（2026-08-11：GitHub Release + 国内镜像） ====================
// 版本比较：1.0.8.6 vs 1.0.10.0 逐段数字比较（正确处理进位）
function versionGreater(a, b) {
    const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y;
    }
    return false;
}
function parseTagVersion(tag) {
    return String(tag || '').replace(/^v/i, '').trim();
}
function escapeHtml(s) {
    // ★2026-08-28 安全加固：补引号转义（防记录名/计划名/云端文件名含 " ' 时属性注入）
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let updaterBusy = false;
let pendingUpdate = null;

// ★2026-08-19 v1.1.0.0：检查更新改异步 fetch——根治没网卡死
// （原生 checkUpdate 是同步 join(15s)，主线程被占=卡死；navigator.onLine 在 WebView 也不可靠）
// fetch + AbortController 8s 超时，失败走 catch，永远不阻塞 UI
function fetchLatestRelease(timeoutMs) {
    var ctrl = null;
    var timer = null;
    if (typeof AbortController !== 'undefined') {
        ctrl = new AbortController();
        timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs || 8000);
    }
    return fetch('https://api.github.com/repos/NiUKinGDoM/xixi-hiking/releases/latest', {
        signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }).then(function (d) {
        return {
            tag: d.tag_name || '',
            apkUrl: (d.assets && d.assets.length ? d.assets[0].browser_download_url : '') || '',
            name: d.name || '',
            body: d.body || ''
        };
    }).then(function (v) {
        if (timer) clearTimeout(timer);
        return v;
    }, function (e) {
        if (timer) clearTimeout(timer);
        throw e;
    });
}

// ★2026-08-19 v1.1.0.1 双保险：Promise.race 兜底——即使 AbortController 在某些 WebView 上不生效，
// race 也会在超时后强制 reject，JS 永不悬挂、绝不卡死
function fetchLatestReleaseGuarded(timeoutMs) {
    var ms = timeoutMs || 8000;
    var raceReject = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms + 500);
    });
    return Promise.race([fetchLatestRelease(ms), raceReject]);
}
// ★2026-08-26 按 tag 拉取 Release body（确认弹窗显示当前版本更新内容用；超时/不存在返回空）

// ★2026-08-27 检查更新确认弹窗已删（功能与「关于页 → 查看更新日志」重复）：
// 点击「检查更新」直接检查，发现新版本弹大窗，无新版 toast「已是最新」
// 更新内容回顾请看设置页底部「关于应用 → 查看更新日志」

// 检查更新（设置页按钮）：异步 fetch，永不卡死
function checkForUpdate() {
    if (updaterBusy) return;
    // ★2026-08-27 离线优化：断网时直接提示，不再发起注定失败的请求
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showErrorMessage('当前处于离线状态，无法检查更新，请联网后重试');
        return;
    }
    // App 判定：有下载桥（无桥 = 网页版）
    if (!window.XixiFileBridge || typeof window.XixiFileBridge.downloadAndInstall !== 'function') {
        showErrorMessage('网页版无需更新（请使用安装版）');
        return;
    }
    updaterBusy = true;
    const desc = document.getElementById('checkUpdateDesc');
    if (desc) desc.textContent = '正在检查更新…';
    fetchLatestReleaseGuarded(8000).then(function (info) {
        const latest = parseTagVersion(info.tag);
        if (!latest) {
            if (desc) desc.textContent = '未获取到版本信息';
            showErrorMessage('未获取到版本信息');
            return;
        }
        if (versionGreater(latest, APP_VERSION)) {
            if (desc) desc.textContent = '发现新版本 v' + latest;
            pendingUpdate = { apkUrl: info.apkUrl || '', tag: latest, name: info.name || '', body: info.body || '' };
            showUpdateModal(pendingUpdate);
        } else {
            if (desc) desc.textContent = '已是最新版本 v' + APP_VERSION;
            showSuccessMessage('已是最新版本 v' + APP_VERSION);
        }
        updaterBusy = false;
    }, function (e) {
        if (desc) desc.textContent = '检查失败，请稍后重试';
        showErrorMessage('检查更新失败：网络异常或超时');
        updaterBusy = false;
    });
}

// ★2026-08-19 打开应用自动检测更新：
// - 有网 → 延迟检查（不挡首屏）→ 有新版弹大窗，无新版静默
// - 没网 → 不调原生桥（防卡死）→ 小 toast 提示 → 监听网络恢复后自动重试再弹窗
var autoUpdateCheckedOnce = false;
var autoUpdateOnlineHandler = null;

function autoCheckUpdateOnLaunch() {
    if (autoUpdateCheckedOnce) return; // 每次启动只自动检查一次
    autoUpdateCheckedOnce = true;
    // 网页版无下载桥 → 跳过（静默，不打扰）
    if (!window.XixiFileBridge || typeof window.XixiFileBridge.downloadAndInstall !== 'function') return;
    // 延迟 1.5s 检查（让首屏先渲染）；异步 fetch，任何网络状况都不卡 UI
    setTimeout(function () {
        fetchLatestReleaseGuarded(8000).then(function (info) {
            const latest = parseTagVersion(info.tag);
            if (!latest) return;
            if (versionGreater(latest, APP_VERSION)) {
                pendingUpdate = { apkUrl: info.apkUrl || '', tag: latest, name: info.name || '', body: info.body || '' };
                showUpdateModal(pendingUpdate); // ★大弹窗
            }
            // 无新版：静默
        }, function () {
            // 检查失败：只有明确离线才提示；网络恢复后自动重试
            showErrorMessage('检测更新失败：网络异常，请检查网络后重试');
                // 网络恢复后自动重试
                if (navigator.onLine === false) {
                if (!autoUpdateOnlineHandler) {
                    autoUpdateOnlineHandler = function () {
                        window.removeEventListener('online', autoUpdateOnlineHandler);
                        autoUpdateOnlineHandler = null;
                        autoUpdateCheckedOnce = false; // 允许恢复后重试一次
                        setTimeout(autoCheckUpdateOnLaunch, 1500);
                    };
                    window.addEventListener('online', autoUpdateOnlineHandler);
                }
            }
        });
    }, 1500);
}

// 新版本弹窗：版本号 + 更新内容 + 立即更新
function showUpdateModal(info) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    const bodyText = (info.body || '').slice(0, 400);
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #185fa5;">system_update_alt</span>发现新版本 v' + escapeHtml(info.tag) + '</div>' +
        '<div class="confirm-modal-message" style="text-align:left;font-size:13px;line-height:1.7;max-height:200px;overflow-y:auto;">' +
        '<div style="font-weight:600;margin-bottom:4px;">当前 v' + APP_VERSION + ' → 新 v' + escapeHtml(info.tag) + '</div>' +
        (bodyText ? '<div style="white-space:pre-wrap;">' + escapeHtml(bodyText) + '</div>' : '') +   /* ★v1.1.2.9 更新内容跟随主题色（原固定灰蓝浅色偏淡/深色看不清） */
        '</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="updateLaterBtn">稍后</button>' +
        '<button class="confirm-btn-delete check-go-btn ripple-effect" id="updateNowBtn">立即更新</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('updateLaterBtn').addEventListener('click', function () { document.body.removeChild(modal); });
    document.getElementById('updateNowBtn').addEventListener('click', function () {
        document.body.removeChild(modal);
        startUpdate();
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}

// 开始下载并安装：镜像优先（原生内部失败自动兜底官方直链）
function startUpdate() {
    if (!pendingUpdate || !pendingUpdate.apkUrl) {
        showErrorMessage('缺少下载地址');
        return;
    }
    if (!window.XixiFileBridge || typeof window.XixiFileBridge.downloadAndInstall !== 'function') {
        showErrorMessage('当前环境不支持应用内更新');
        return;
    }
    const mirrorUrl = UPDATE_MIRROR_PREFIX + pendingUpdate.apkUrl.replace(/^https?:\/\//, '');
    const desc = document.getElementById('checkUpdateDesc');
    if (desc) desc.textContent = '正在下载新版本（镜像加速）…';
    showLoadingToast('正在下载新版本…');
    window.XixiFileBridge.downloadAndInstall(pendingUpdate.apkUrl, mirrorUrl);
}

// 原生下载/安装回调
window.XixiUpdaterCallback = function (state, message) {
    const desc = document.getElementById('checkUpdateDesc');
    try {
        if (state === 'progress') {
            // ★2026-08-27 下载进度（原生流式 300ms 回调；格式 done/total 字节）——toast 简洁百分比
            // 「正在下载更新… 56%」；镜像无总大小时兜底显示已下载大小
            const parts = String(message || '').split('/');
            const doneBytes = parseInt(parts[0], 10) || 0;
            const totalBytes = parseInt(parts[1], 10) || 0;
            let progTxt;
            if (totalBytes > 0) {
                progTxt = '正在下载更新… ' + Math.round(doneBytes * 100 / totalBytes) + '%';
            } else {
                progTxt = '正在下载更新… 已下载 ' + (doneBytes / 1024 / 1024).toFixed(1) + ' MB';
            }
            updateLoadingToast(progTxt);
            if (desc) desc.textContent = totalBytes > 0 ? '正在下载新版本… ' + Math.round(doneBytes * 100 / totalBytes) + '%' : '正在下载新版本…';
        } else if (state === 'need_permission') {
            hideLoadingToast();
            showErrorMessage('首次更新需在系统设置中允许安装未知应用，开启后重新点击更新');
            if (desc) desc.textContent = '请允许安装未知应用后重试';
        } else if (state === 'installing') {
            hideLoadingToast();
            // ★2026-09-01 通知分级：下载完成 → 通知栏（用户可能切到别的应用等安装）
            showSystemNotification('更新下载完成', '已下载完成，正在安装…');
            if (desc) desc.textContent = '已下载完成，请按系统提示安装';
            pendingUpdate = null;
        } else if (state === 'error') {
            hideLoadingToast();
            showErrorMessage(message || '更新失败，请稍后重试');
            if (desc) desc.textContent = '更新失败，可重试';
        }
    } catch (e) { console.error('updater callback error:', e); }
};

// 下载中常驻提示（toast 1 秒消失不够用）
let loadingToastEl = null;
function showLoadingToast(message) {
    hideLoadingToast();
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:100;max-width:90vw;';
    div.className = 'toast-glass px-5 py-3';
    div.innerHTML = '<div class="flex items-center gap-2"><span class="material-icons" style="animation:spin 1s linear infinite;">autorenew</span><span style="font-size:14px;">' + escapeHtml(message) + '</span></div>';
    document.body.appendChild(div);
    loadingToastEl = div;
}
function hideLoadingToast() {
    if (loadingToastEl && loadingToastEl.parentNode) loadingToastEl.parentNode.removeChild(loadingToastEl);
    loadingToastEl = null;
}
// ★2026-08-26 更新下载进度文案（不重建 DOM，避免进度条闪烁）
function updateLoadingToast(message) {
    if (loadingToastEl) {
        const span = loadingToastEl.querySelector('span[style*="font-size"]');
        if (span) span.textContent = message;
    } else {
        showLoadingToast(message);
    }
}

// ★备份提醒弹窗（v1.4.10.1）：提示用户去上传备份
// ★2026-09-01 备份提醒已改通知栏（见 loadSyncState），旧弹窗版删除
//（通知栏版：距上次同步 ≥7 天 → showSystemNotification('备份提醒',...,'settings')，同一天不重复）

function renderSyncForm(lastSync) {
    const serverInput = document.getElementById('syncServer');
    const userInput = document.getElementById('syncUsername');
    const passInput = document.getElementById('syncPassword');
    const autoToggle = document.getElementById('syncAutoToggle');
    if (serverInput) serverInput.value = syncConfig.server || '';
    if (userInput) userInput.value = syncConfig.username || '';
    if (passInput) passInput.value = syncConfig.password || '';
    if (autoToggle) autoToggle.checked = syncAuto;
    syncUiState.lastSyncAt = lastSync || ''; // 2026-08-12 状态行删除 → 存全局，弹窗读取
    // ★2026-09-03 未配置引导已融合进「自动同步」卡健康子行（updateSyncHealthRow），不再单独蓝条
}

// 从表单读取并保存配置
async function saveSyncConfigFromForm() {
    syncConfig.server = (document.getElementById('syncServer') || {}).value || '';
    syncConfig.username = (document.getElementById('syncUsername') || {}).value || '';
    syncConfig.password = (document.getElementById('syncPassword') || {}).value || '';   // 内存保持明文（webdavRequest 用）
    // ★2026-08-25 存储时密码加密（本地不再明文）
    await AppStore.setItem(SYNC_CONFIG_KEY, {
        server: syncConfig.server,
        username: syncConfig.username,
        password: encPwd(syncConfig.password)
    });
}

// 调用原生 WebDAV 桥；浏览器环境降级用 fetch（同源/支持CORS时可用）
// ★2026-08-19 v1.1.0.2：新增异步桥回调序号
var webdavCbSeq = 0;
// ★2026-08-27 同步/网络错误中文化：把原生桥或 fetch 的英文错误翻译成直观中文
// （用户反馈：Unable to resolve host "dav.jianguoyun.com" 这种看不懂 → 统一翻译）
function friendlySyncError(text) {
    var s = String(text || '').toLowerCase();
    // 保留状态码信息（如 500/502）——数字展示无碍
    var m = s.match(/status\s*code\s*(\d{3})/) || s.match(/(\d{3})\s*(?:error|failed)/);
    var code = m ? m[1] : '';
    if (s.indexOf('unable to resolve host') >= 0 || s.indexOf('unknownhost') >= 0
        || s.indexOf('no address associated') >= 0 || s.indexOf('enotfound') >= 0
        || s.indexOf('nodename nor servname') >= 0) {
        return '找不到服务器地址，请检查网络连接和服务器地址是否正确';
    }
    if (s.indexOf('timeout') >= 0 || s.indexOf('timed out') >= 0
        || s.indexOf('sockettimeout') >= 0 || s.indexOf('timeoutexception') >= 0) {
        return '连接超时：服务器响应太慢，请检查网络后重试';
    }
    if (s.indexOf('refused') >= 0 || s.indexOf('econnrefused') >= 0
        || s.indexOf('connection refused') >= 0 || s.indexOf('failed to connect') >= 0
        || s.indexOf('connectexception') >= 0 || s.indexOf('unreachable') >= 0
        || s.indexOf('connect failed') >= 0) {
        return '无法连接服务器：请检查网络连接或服务器是否可用';
    }
    if (s.indexOf('ssl') >= 0 || s.indexOf('certificate') >= 0 || s.indexOf('sslhandshake') >= 0) {
        return '安全连接失败：网络环境可能被拦截，请更换网络后重试';
    }
    if (s.indexOf('failed to fetch') >= 0 || s.indexOf('networkerror') >= 0
        || s.indexOf('fetch failed') >= 0 || s.indexOf('net::') >= 0
        || s.indexOf('network is unreachable') >= 0 || s.indexOf('no internet') >= 0) {
        return '网络请求失败，请检查网络连接';
    }
    if (s.indexOf('404') >= 0 || s.indexOf('not found') >= 0) {
        return '云端文件不存在，可能已被删除';
    }
    if (code) return '服务器错误（状态码 ' + code + '），请稍后重试';
    if (s && s.length < 30) return text; // 已是短中文（如桥返回异常）或简短信息，原样
    // 兜底：不展示看不懂的英文长错误
    return '网络异常，请检查网络连接后重试';
}

async function webdavRequest(url, method, bodyBase64) {
    // ★2026-08-19 v1.1.0.2 优先异步桥：调用立即返回，原生后台请求后回调——UI 零阻塞，根治弱网卡死
    if (window.XixiFileBridge && typeof window.XixiFileBridge.webdavRequestAsync === 'function') {
        return await new Promise(function (resolve) {
            var cbName = '_wd_cb_' + (++webdavCbSeq);
            window[cbName] = function (raw) {
                delete window[cbName];
                try { resolve(JSON.parse(raw)); }
                catch (e) { resolve({ status: 0, body: '', error: '桥返回异常: ' + raw }); }
            };
            // ★2026-08-21 v1.1.1.10 安全兜底：原生回调异常丢失时 90s 后自行结束（原 10s 会掐断大备份上传——
            // 原生 PUT 已放宽 60s，JS 却 10s 先超时报 timeout，原生线程实际传完后回调已被删，成功结果丢失）
            setTimeout(function () {
                if (window[cbName]) {
                    delete window[cbName];
                    resolve({ status: 0, body: '', error: 'timeout' });
                }
            }, 90000);
            try {
                window.XixiFileBridge.webdavRequestAsync(url, method, syncConfig.username, syncConfig.password, bodyBase64 || '', cbName);
            } catch (e) {
                delete window[cbName];
                resolve({ status: 0, body: '', error: '桥调用失败: ' + (e && e.message ? e.message : e) });
            }
        });
    }
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
        // ★2026-08-25 改 arrayBuffer：resp.text() 会把 zip 二进制按 UTF-8 解码损坏；原始字节 base64 与原生桥一致
        const resp = await fetch(url, { method, headers });
        const buf = await resp.arrayBuffer();
        const out = new Uint8Array(buf);
        let bin = '';
        out.forEach(b => bin += String.fromCharCode(b));
        return { status: resp.status, body: out.length ? btoa(bin) : '', error: null };
    }
}

// 上传备份：全量数据打包 JSON → PUT 到云端
async function uploadSyncBackup(silent) {
    await saveSyncConfigFromForm();
    const fileName = buildSyncFileName(); // 每次备份独立文件名（带时间戳）
    const url = buildSyncFileUrl(fileName);
    if (!url) {
        showErrorMessage('请先填写服务器地址');
        return;
    }
    if (syncInProgress) return;
    syncInProgress = true;
    setSyncBusy(true, '正在打包备份…'); // ★2026-08-26 阶段1：打包（zip 含照片耗时）
    try {
        // ★2026-08-25 完整备份改 zip 压缩包上传（照片二进制省 33%，下载时兼容 zip + 老 HTML）
        const zip = await buildFullBackupZip(true);
        const bodyBase64 = uint8ToBase64(zip);
        // ★2026-08-26 阶段2：打包完成 → 上传中（带大小提示；原生桥无字节进度回调，阶段式提示）
        const sizeMB = (bodyBase64.length * 3 / 4 / 1024 / 1024).toFixed(1);
        setSyncBusy(true, '上传中（' + sizeMB + ' MB）…');
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
            await recordSyncFile(fileName, buildFullBackupPayload()); // 记录到本地索引
            await AppStore.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'upload' });
            // ★2026-08-25 上传成功 → 对号 + 弹窗「上传成功」（10 秒后 finally 恢复连接检测）
            setSyncStatus('上传成功', 'check_circle', 'success');
            if (!silent) showSuccessMessage('备份上传成功');
            // ★2026-09-01 通知分级：自动上传（silent）成功 → 通知栏
            else showSystemNotification('自动同步完成', '备份已上传云端');
            // ★2026-08-21 v1.1.1.6 云端自动清理：保留最近 2 份，更旧的自动删除（防备份堆积）
            try {
                const cloudFiles = await listSyncFilesFromCloud();
                if (cloudFiles && cloudFiles.length > 2) {
                    // 文件名带时间戳（xixi_hiking_backup_YYYYMMDD_HHMMSS.html），字典序=时间序
                    const sorted = cloudFiles.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
                    const toDelete = sorted.slice(0, cloudFiles.length - 2);
                    for (let i = 0; i < toDelete.length; i++) {
                        try {
                            const delUrl = buildSyncFileUrl(toDelete[i].name);
                            if (delUrl) await webdavRequest(delUrl, 'DELETE');
                        } catch (e) { /* 单个删除失败不影响后续 */ }
                    }
                }
            } catch (e) {
                console.warn('[Sync] 云端自动清理失败:', e && e.message);
            }
        } else if (result.status === 401 || result.status === 403) {
            setSyncStatus('认证失败，请检查账号和应用密码', 'error', 'error');
            if (!silent) showErrorMessage('认证失败，请检查账号和应用密码');
            else notifySyncFailure('自动同步失败：认证错误，请检查账号和应用密码');
        } else {
            const detail = friendlySyncError(result.error ? result.error : ('HTTP ' + result.status));
            const bodyPreview = result.body ? base64ToUtf8(result.body).slice(0, 200) : '';
            setSyncStatus('上传失败：' + detail, 'error', 'error');
            if (!silent) showErrorMessage('上传失败：' + detail + (bodyPreview ? '（' + bodyPreview + '）' : ''));
            else notifySyncFailure('自动同步失败：' + detail);
            console.error('[Sync] 上传失败', url, result.status, bodyPreview);
        }
    } catch (e) {
        setSyncStatus('上传失败：' + friendlySyncError(e.message || e), 'error', 'error');
        if (!silent) showErrorMessage('上传失败：' + friendlySyncError(e.message || e));
        else notifySyncFailure('自动同步失败：' + friendlySyncError(e.message || e));
    } finally {
        syncInProgress = false;
        setSyncBusy(false);
        // ★2026-08-25 上传结束（成功/失败）→ 展示对号/错号 10 秒后自动恢复连接检测状态
        scheduleSyncStatusRefresh(10000);
    }
}

// 下载恢复：GET 云端文件 → 覆盖本地
async function downloadSyncBackup() {
    if (window.__downloadBusy) return; // ★2026-08-29 防连点：读取云端列表期间重复点击直接忽略
    window.__downloadBusy = true;
    const dlBtn = document.getElementById('syncDownloadBtn');
    if (dlBtn) {
        dlBtn.disabled = true;
        const txt = dlBtn.querySelector('.text-sm');
        if (txt) txt.textContent = '读取中…';
    }
    try {
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
    } finally {
        window.__downloadBusy = false;
        if (dlBtn) {
            dlBtn.disabled = false;
            const txt = dlBtn.querySelector('.text-sm');
            if (txt) txt.textContent = '下载';
        }
    }
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
            // 转成备份文件列表（统一 .html 格式，★2026-08-20 v1.1.0.5 不再兼容老 .json）
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
    closeOpenModals(); // ★2026-08-29 防重入：连点下载按钮不再叠加弹窗
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    // 最多显示 6 条，更多滚动
    const listHtml = files.map((f, i) => `
        <button class="restore-file-item" data-name="${escapeHtml(f.name)}" style="border-radius: 12px;">
            <span class="material-icons" style="color: #4f46e5;">description</span>
            <span class="restore-file-info">
                <span class="restore-file-label">${formatSyncFileLabel(f.name)}</span>
                <span class="restore-file-desc">${f.fromCloud ? '云端备份' : ('记录 ' + (f.records || 0) + ' 条 · 计划 ' + (f.plans || 0) + ' 条')}</span>
            </span>
            <span class="material-icons hm-chevron" style="font-size: 18px;">chevron_right</span>
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
    setSyncBusy(true, '下载中…'); // ★2026-08-26 阶段1：下载
    try {
        const result = await webdavRequest(url, 'GET', '');
        if (result.status >= 200 && result.status < 300 && result.body) {
            // ★2026-08-26 阶段2：下载完成 → 恢复合并中（解压 zip + 照片补 + 合并保存）
            setSyncBusy(true, '恢复合并中…');
            // ★2026-08-25 统一解析：zip 压缩包（照片二进制）/ 老 HTML / 老 JSON
            const payload = await parseSyncFileBody(result.body);
            if (payload && Array.isArray(payload.records) && Array.isArray(payload.plannedTrips)) {
                // ★2026-08-25 下载恢复改合并（复用 importFullBackupPayload：照片补 + 按 id 合并取新 + 保存刷新）
                await importFullBackupPayload(payload);
                const now = formatSyncTime(new Date());
                await AppStore.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'download' });
                // ★2026-08-25 下载成功 → 对号 + 弹窗「下载成功」
                setSyncStatus('下载成功', 'cloud_download', 'success');
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
            const msg = friendlySyncError(result.error ? result.error : ('状态码 ' + result.status));
            setSyncStatus('下载失败：' + msg, 'error', 'error');
            showErrorMessage('下载失败：' + msg);
        }
    } catch (e) {
        setSyncStatus('下载失败：' + friendlySyncError(e.message || e), 'error', 'error');
        showErrorMessage('下载失败：' + friendlySyncError(e.message || e));
    } finally {
        syncInProgress = false;
        setSyncBusy(false);
        // ★2026-08-25 下载结束（成功/失败）→ 展示对号/错号 10 秒后自动恢复连接检测状态
        scheduleSyncStatusRefresh(10000);
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
            // ★2026-08-25 统一解析：zip 压缩包 / 老 HTML / 老 JSON
            const payload = await parseSyncFileBody(result.body);
            if (payload && Array.isArray(payload.records) && Array.isArray(payload.plannedTrips)) {
                // ★照片恢复：本地缺哪张补哪张
                if (payload.photos) {
                    const added = await restorePhotosFromPayload(payload);
                    if (added > 0 && !silent) showSuccessMessage('已恢复 ' + added + ' 张照片');
                }
                // ★2026-08-26 合并记录：时间戳取新 + 空字段补全（与导入/恢复规则统一）
                records = mergeRecordsWith(payload.records || [], records, false);

                // ★2026-08-26 合并计划：同样时间戳取新 + 字段补全
                plannedTrips = mergeRecordsWith(payload.plannedTrips || [], plannedTrips, true);

                await saveToStorage();
                await savePlannedTripsToStorage();
                updateStatistics();
                renderTable();
                renderPlannedTripsTable();
                const now = formatSyncTime(new Date());
                await AppStore.setItem(SYNC_STATUS_KEY, { lastSyncAt: now, type: 'merge' });
                if (!silent) {
                    setSyncStatus('合并完成：' + now, 'sync', 'success');
                    showSuccessMessage('合并同步完成');
                } else {
                    // ★2026-09-01 自动同步完成 → 通知栏（App 启动后台跑，用户不一定盯着界面）
                    showSystemNotification('自动同步完成', '数据已与云端合并');
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
            } else {
                notifySyncFailure('自动同步失败：认证错误，请检查账号和应用密码');
            }
        } else if (!silent) {
            const msg = friendlySyncError(result.error ? result.error : ('状态码 ' + result.status));
            setSyncStatus('合并失败：' + msg, 'error', 'error');
            showErrorMessage('合并失败：' + msg);
        } else {
            notifySyncFailure('自动同步失败：' + friendlySyncError(result.error ? result.error : ('状态码 ' + result.status)));
        }
    } catch (e) {
        if (!silent) {
            setSyncStatus('合并失败：' + friendlySyncError(e.message || e), 'error', 'error');
            showErrorMessage('合并失败：' + friendlySyncError(e.message || e));
        } else {
            notifySyncFailure('自动同步失败：' + friendlySyncError(e.message || e));
        }
    } finally {
        syncInProgress = false;
        setSyncBusy(false);   /* ★v18 无条件关转圈：自动同步(silent)结束后也停（原 if(!silent) 导致自动同步转圈永转） */
        // ★2026-08-25 合并/自动同步结束 → 结果展示后 10 秒自动恢复连接检测状态
        scheduleSyncStatusRefresh(10000);
    }
}

// ★2026-08-21 v1.1.1.6 自动同步失败提醒：限频（10 分钟内最多提示一次，避免静默也避免轰炸）
// ★2026-09-01 通知分级：自动同步失败上通知栏（网页版自动降级 toast）
function notifySyncFailure(msg) {
    var now = Date.now();
    if (!window._lastSyncErrAt || now - window._lastSyncErrAt > 600000) {
        window._lastSyncErrAt = now;
        showSystemNotification('自动同步失败', msg);
    }
}

// 全量数据打包（含应用版本、标题、暗色模式等元信息）
function buildFullBackupPayload() {
    return {
        app: 'XiXiHiking',
        appName: '徒步小记',
        version: '1.1.0.3',
        exportedAt: new Date().toISOString(),
        records: records || [],
        plannedTrips: plannedTrips || []
    };
}

// ===== ★2026-08-25 ZIP store（无压缩）打包/解包：完整备份压缩包用（照片二进制化省 base64 33% 体积）=====
var _crcTable = null;
function crc32(u8) {
    if (!_crcTable) {
        _crcTable = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _crcTable[i] = c >>> 0;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var j = 0; j < u8.length; j++) crc = _crcTable[(crc ^ u8[j]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
// 打包：files = [{name, data:Uint8Array}]
function zipStorePack(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    var localParts = [], centralParts = [], offset = 0;
    files.forEach(function (f) {
        var nameBytes = enc.encode(f.name);
        var data = f.data;
        var crc = crc32(data);
        var lh = new Uint8Array(30);
        var dv = new DataView(lh.buffer);
        dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
        dv.setUint16(8, 0, true); dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
        dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
        dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
        localParts.push(lh, nameBytes, data);
        var ch = new Uint8Array(46);
        var cdv = new DataView(ch.buffer);
        cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
        cdv.setUint16(8, 0x0800, true); cdv.setUint16(10, 0, true); cdv.setUint16(12, dosTime, true);
        cdv.setUint16(14, dosDate, true); cdv.setUint32(16, crc, true);
        cdv.setUint32(20, data.length, true); cdv.setUint32(24, data.length, true);
        cdv.setUint16(28, nameBytes.length, true); cdv.setUint16(30, 0, true); cdv.setUint16(32, 0, true);
        cdv.setUint32(42, offset, true);
        centralParts.push(ch, nameBytes);
        offset += 30 + nameBytes.length + data.length;
    });
    var cdSize = 0;
    centralParts.forEach(function (p) { cdSize += p.length; });
    var eocd = new Uint8Array(22);
    var edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true); edv.setUint32(12, cdSize, true); edv.setUint32(16, offset, true);
    var out = new Uint8Array(offset + cdSize + 22);
    var pos = 0;
    function app(arr) { out.set(arr, pos); pos += arr.length; }
    localParts.forEach(app); centralParts.forEach(app); app(eocd);
    return out;
}
// 解包 store zip：返回 {name: Uint8Array}
function zipStoreUnpack(u8) {
    if (u8.length < 22) return null;
    var eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i >= u8.length - 65557; i--) {
        if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var edv = new DataView(u8.buffer, eocd, 22);
    var count = edv.getUint16(10, true);
    var p = edv.getUint32(16, true);
    var files = {};
    var dec = new TextDecoder();
    for (var n = 0; n < count; n++) {
        var cdv = new DataView(u8.buffer, p, 46);
        if (cdv.getUint32(0, true) !== 0x02014b50) break;
        var method = cdv.getUint16(10, true);
        var nameLen = cdv.getUint16(28, true), extraLen = cdv.getUint16(30, true), commentLen = cdv.getUint16(32, true);
        var compSize = cdv.getUint32(20, true);
        var localOffset = cdv.getUint32(42, true);
        var name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
        if (method === 0 && compSize) {
            var ldv = new DataView(u8.buffer, localOffset, 30);
            var lnameLen = ldv.getUint16(26, true), lextraLen = ldv.getUint16(28, true);
            var ds = localOffset + 30 + lnameLen + lextraLen;
            files[name] = u8.slice(ds, ds + compSize);
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}
function bytesToDataURL(u8, mime) {
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return 'data:' + (mime || 'image/jpeg') + ';base64,' + btoa(bin);
}
// ★2026-08-25 二进制 → base64（分块防栈溢出，zip 备份导出用）
function uint8ToBase64(u8) {
    var CHUNK = 0x8000;
    var bin = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
    }
    return btoa(bin);
}

// ===== ★2026-08-20 v1.1.0.3 HTML 单文件完整备份（回忆册样式 + script 数据块，App 可导入恢复）=====
function buildBackupHTMLString(payload) {
    var esc = function (s) { return escapeHtml(s === undefined || s === null ? '' : String(s)); };
    // ★2026-08-20 导出文档标题跟随 App 顶栏设置标题（#appTitle）
    var appTitleEl = document.getElementById('appTitle');
    var appTitle = (appTitleEl && appTitleEl.textContent && appTitleEl.textContent.trim()) || 'XiXiの徒步小记';
    var escTitle = esc(appTitle);
    var photos = payload.photos || {};
    var recCards = (payload.records || []).map(function (r) {
        var imgs = (r.photos || []).map(function (pid) {
            var d = photos[pid];
            return d ? '<img src="' + d + '" style="max-width:140px;max-height:140px;border-radius:8px;margin:4px;vertical-align:top;">' : '';
        }).join('');
        return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:12px 0;background:#ffffff;">' +
            '<h3 style="margin:0 0 6px;color:#1e293b;">' + esc(r.name || '未命名') + '</h3>' +
            '<!-- ★2026-08-25 回忆册补里程/用时（难度·海拔·里程·用时·时间） -->' +
            '<div style="color:#64748b;font-size:13px;">难度 ' + esc(r.difficulty !== undefined ? r.difficulty : '-') + ' 级 · 海拔 ' + esc(r.elevation || 0) + ' m' + (r.distance ? ' · 里程 ' + esc(r.distance) + ' km' : '') + (r.duration ? ' · 用时 ' + esc(formatDuration(r.duration)) : '') + ' · ' + esc(r.createdAt ? new Date(r.createdAt).toLocaleString() : '') + '</div>' +
            '<!-- 2026-08-21 v1.1.2.0 备份回忆册：补心情/天气/同行人 -->' +
            ((r.mood || r.weather || r.companions) ? '<div style="color:#475569;font-size:13px;margin-top:4px;">' + (r.mood ? '心情 ' + esc(r.mood) + '　' : '') + (r.weather ? '天气 ' + esc(r.weather) + '　' : '') + (r.companions ? '同行 ' + esc(r.companions) : '') + '</div>' : '') +
            (imgs ? '<div style="margin-top:8px;">' + imgs + '</div>' : '') +
            '</div>';
    }).join('');
    var planCards = (payload.plannedTrips || []).map(function (t) {
        return '<div style="border:1px dashed #cbd5e1;border-radius:12px;padding:12px;margin:10px 0;background:#f1f5f9;">' +
            '<h4 style="margin:0 0 4px;color:#334155;">' + esc(t.name || '未命名') + '</h4>' +
            '<div style="color:#64748b;font-size:13px;">难度 ' + esc(t.difficulty !== undefined ? t.difficulty : '-') + ' 级 · ' + esc(t.createdAt || '') + '</div>' +
            '</div>';
    }).join('');
    var dataJson = JSON.stringify(payload).replace(/<\/script/g, '<\\/script');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + escTitle + ' · 完整备份</title>' +
        '<style>body{font-family:"SimSun",serif;max-width:720px;margin:0 auto;padding:20px 16px;background:#f8fafc;color:#1e293b;}h1{text-align:center;margin-bottom:4px;}p.sub{text-align:center;color:#64748b;font-size:14px;}h2{color:#4f46e5;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:28px;}footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:40px;}</style></head><body>' +
        '<h1>🥾 ' + escTitle + '</h1><p class="sub">完整备份 · 共 ' + (payload.records || []).length + ' 条徒步记录 · ' + (payload.plannedTrips || []).length + ' 条计划 · 导出于 ' + new Date(payload.exportedAt || Date.now()).toLocaleString() + '</p>' +
        '<h2>📝 徒步记录</h2>' + (recCards || '<p style="color:#94a3b8;">暂无记录</p>') +
        '<h2>🗓️ 计划徒步</h2>' + (planCards || '<p style="color:#94a3b8;">暂无计划</p>') +
        '<footer>Made by XiXi 💛 · 此文件可在 App 内导入恢复</footer>' +
        '<script id="backup-data" type="application/json">' + dataJson + '</' + 'script>' +
        '</body></html>';
}
// 组装完整备份 HTML（文字 + 照片 base64）
async function buildFullBackupHTML(includePhotos) {
    var payload = buildFullBackupPayload();
    if (includePhotos === false) {
        // ★2026-08-21 v1.1.1.6 纯数据备份：不含照片（体积小，日常快速备份用）
        payload.photos = {};
        return buildBackupHTMLString(payload);
    }
    var allIds = {};
    (payload.records || []).forEach(function (r) { (r.photos || []).forEach(function (p) { allIds[p] = true; }); });
    var ids = Object.keys(allIds);
    var photos = {};
    for (var i = 0; i < ids.length; i++) {
        try {
            var p = await photoGet(ids[i]);
            if (p && p.blob) photos[ids[i]] = await blobToDataURL(p.blob);
        } catch (e) { /* 单张失败跳过 */ }
    }
    payload.photos = photos;
    return buildBackupHTMLString(payload);
}
// ★2026-08-25 完整备份压缩包（zip store）：xixi-data.json（记录+计划+照片引用）+ photos/<id>.jpg（二进制）+ 回忆册.html（纯文字可看）
function blobToUint8(blob) {
    return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(new Uint8Array(r.result)); };
        r.onerror = function () { reject(new Error('blob-read-fail')); };
        r.readAsArrayBuffer(blob);
    });
}
async function buildFullBackupZip(includePhotos) {
    var payload = buildFullBackupPayload();
    var enc = new TextEncoder();
    var files = [];
    // 回忆册（纯文字版，照片不内嵌——照片在 zip 二进制目录里）
    var memPayload = JSON.parse(JSON.stringify(payload));
    memPayload.photos = {};
    files.push({ name: '回忆册.html', data: enc.encode(buildBackupHTMLString(memPayload)) });
    // 照片二进制（photos/<id>.jpg，比 base64 省约 33% 体积）
    var photoRefs = {};
    if (includePhotos !== false) {
        var all = await photoGetAll();
        for (var i = 0; i < (all || []).length; i++) {
            var p = all[i];
            if (!p || !p.blob) continue;
            try {
                var u8 = await blobToUint8(p.blob);
                var fname = 'photos/' + p.id + '.jpg';
                photoRefs[p.id] = fname;
                files.push({ name: fname, data: u8 });
            } catch (e) { /* 单张失败跳过 */ }
        }
    }
    // 数据文件（照片引用路径，导入时按名字取二进制）
    var dataPayload = {
        app: payload.app, appName: payload.appName, version: payload.version,
        exportedAt: payload.exportedAt,
        records: payload.records,
        plannedTrips: payload.plannedTrips,
        photoRefs: photoRefs,
        zip: true
    };
    files.unshift({ name: 'xixi-data.json', data: enc.encode(JSON.stringify(dataPayload)) });
    return zipStorePack(files);
}
// 从备份文本提取数据（HTML 数据块 or 老格式纯 JSON）
function extractBackupData(text) {
    if (!text) return null;
    var m = text.match(/<script id="backup-data"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
        try { return JSON.parse(m[1]); } catch (e) { return null; }
    }
    try { return JSON.parse(text); } catch (e) { return null; }
}
// ★2026-08-25 云端下载内容解析：兼容 zip 压缩包 + 老 HTML/JSON（body 为原始字节 base64）
function parseSyncFileBody(bodyBase64) {
    if (!bodyBase64) return Promise.resolve(null);
    try {
        var bin = atob(bodyBase64);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b) {
            // zip 压缩包
            var files = zipStoreUnpack(u8);
            if (!files || !files['xixi-data.json']) return Promise.resolve(null);
            var payload = JSON.parse(new TextDecoder().decode(files['xixi-data.json']));
            if (!payload || !Array.isArray(payload.records)) return Promise.resolve(null);
            var refs = payload.photoRefs || {};
            var photoData = {};
            Object.keys(refs).forEach(function (pid) {
                var fname = refs[pid];
                if (files[fname]) photoData[pid] = bytesToDataURL(files[fname]);
            });
            if (Object.keys(photoData).length) payload.photos = photoData;
            return Promise.resolve(payload);
        }
        return Promise.resolve(extractBackupData(base64ToUtf8(bodyBase64)));
    } catch (e) {
        return Promise.resolve(null);
    }
}
// 恢复照片入库：本地已存在的跳过（缺哪张补哪张）
async function restorePhotosFromPayload(payload) {
    var photos = payload.photos || {};
    var ids = Object.keys(photos);
    if (!ids.length) return 0;
    var added = 0;
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        try {
            var existing = await photoGet(id);
            if (existing && existing.blob) continue;
            var blob = dataURLToBlob(photos[id]);
            await photoPut(id, blob);
            added++;
        } catch (e) { /* 单张失败继续 */ }
    }
    return added;
}

function formatSyncTime(date) {
    const p = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) +
        ' ' + p(date.getHours()) + ':' + p(date.getMinutes());
}

function setSyncStatus(text, icon, type) {
    // ★2026-09-03 i 标识已删：状态视觉全部由健康行承担（setSyncStatus → updateSyncHealthRow）
    syncUiState.text = text || '';
    syncUiState.icon = icon || 'info';
    syncUiState.status = type === 'success' ? 'success' : (type === 'error' ? 'error' : 'idle');
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
}

// ★2026-09-03 P1 同步健康行（融合在自动同步卡内）：优先反映最近一次操作结果，其次距上次同步天数
//   未配置灰引导 / 同步中转圈蓝 / 失败红 / 成功绿 / 闲置按天龄（绿≤3 黄4-7 红>7）
async function updateSyncHealthRow() {
    try {
        const txt = document.getElementById('syncHealthText');
        const dot = document.getElementById('syncHealthDot');
        if (!txt || !dot) return;
        const url = buildSyncFileUrl();
        const hasCfg = !!(url && syncConfig && syncConfig.username && syncConfig.password);
        let color = '#94a3b8';
        let label = '还没连接云端 · 点这里配置备份';
        if (!hasCfg) { dot.style.background = color; txt.textContent = label; return; }
        // 同步中：蓝点 + 文案
        if (syncUiBusy) { color = '#4f46e5'; label = syncUiState.text || '正在同步…'; dot.style.background = color; txt.textContent = label; return; }
        // 最近一次失败：红 + 错误提示（点击弹详情）
        if (syncUiState.status === 'error') { color = '#dc2626'; label = (syncUiState.text || '同步失败') + ' · 点这里查看'; dot.style.background = color; txt.textContent = label; return; }
        let lastSyncAt = '';
        try { const d = await AppStore.getItem(SYNC_STATUS_KEY); if (d && d.lastSyncAt) lastSyncAt = d.lastSyncAt; } catch (e) { /* 忽略 */ }
        if (!lastSyncAt) {
            color = '#d97706';
            label = '已连接，还没备份过 · 建议先上传一次';
        } else {
            const diffDays = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 86400000);
            if (diffDays <= 0) { color = '#16a34a'; label = '上次同步：刚刚 · 云端有备份'; }
            else if (diffDays === 1) { color = '#16a34a'; label = '上次同步：昨天 · 云端有备份'; }
            else if (diffDays <= 3) { color = '#16a34a'; label = '上次同步：' + diffDays + ' 天前 · 云端有备份'; }
            else if (diffDays <= 7) { color = '#d97706'; label = '上次同步：' + diffDays + ' 天前 · 快一周了，抽空备份一下'; }
            else { color = '#dc2626'; label = '上次同步：' + diffDays + ' 天前 · 有点久了，建议立即备份'; }
        }
        dot.style.background = color;
        txt.textContent = label;
    } catch (e) { /* 静默 */ }
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
    syncUiBusy = !!busy;
    if (busy && label) {
        syncUiState.text = label;
        syncUiState.status = 'busy';
    }
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
}

// 2026-08-12 同步状态 UI 重构：状态行 → 自动同步卡健康行（★2026-09-03 i 标识已删）
let syncUiState = { status: 'idle', text: '', icon: 'info', lastSyncAt: '' };
let syncUiBusy = false;

// 2026-08-12 i 标识点击弹窗：上次同步时间 + 连接状态（成功✓绿/失败✗红/同步中转圈）
async function showSyncStatusModal() {
    let lastSyncAt = '';
    try {
        const d = await AppStore.getItem(SYNC_STATUS_KEY);
        if (d && d.lastSyncAt) lastSyncAt = d.lastSyncAt;
    } catch (e) { /* 读取失败静默 */ }

    let statusHtml = '';
    if (syncUiBusy) {
        // ★2026-08-25 转圈时显示具体动作（上传中/下载中/合并中）
        statusHtml = '<div class="sync-status-line"><span class="material-icons sync-spin" style="color:#4f46e5;">sync</span>' + (syncUiState.text || '同步中…') + '</div>';
    } else if (syncUiState.status === 'success') {
        // ★2026-08-25 成功显示结果文案（上传成功/下载成功/连接成功）
        statusHtml = '<div class="sync-status-line"><span class="material-icons" style="color:#16a34a;">check_circle</span>' + (syncUiState.text || '连接成功') + '</div>';
    } else if (syncUiState.status === 'error') {
        statusHtml = '<div class="sync-status-line"><span class="material-icons" style="color:#dc2626;">error</span>' + (syncUiState.text || '连接失败') + '</div>';
    } else {
        statusHtml = '<div class="sync-status-line"><span class="material-icons" style="color:rgba(100,116,139,0.65);">info</span>尚未检测连接</div>';
    }
    const timeHtml = '<div class="sync-status-time">上次同步时间：' + (lastSyncAt || '暂无同步记录') + '</div>';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">sync_alt</span>
                同步状态
            </div>
            <div class="confirm-modal-message">
                ${statusHtml}
                ${timeHtml}
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="sync-status-close">知道了</button>
            </div>
        </div>
    `;
    closeOpenModals(); // ★2026-08-29 防重入：async 函数 await 后创建前再清一次（防等待期间连点叠加）
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('sync-status-close');
    const closeModal = () => document.body.removeChild(modal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

// 自动检测连接：进入设置页或输入配置后调用，结果展示在同步健康行 + 可选 toast 提示
async function autoCheckSyncConnection(showTip) {
    if (!document.getElementById('syncHealthRow')) return; // ★2026-09-03 守卫改健康行（i 标识已删）
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
    syncUiBusy = true; // 2026-08-12 检测中状态（健康行蓝点 + 文案）
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
    try {
        const dirsResult = await ensureSyncParentDirs(url);
        if (!dirsResult.ok) {
            syncUiBusy = false;
            setSyncStatus(friendlySyncError(dirsResult.detail), 'error', 'error');
            if (showTip) showErrorMessage('连接失败：' + friendlySyncError(dirsResult.detail));
            return;
        }
        // 目录存在：再试一次真实连通性（探测目录 GET 成功即代表认证+网络都通）
        syncUiBusy = false;
        // ★2026-08-25 文案统一「连接成功」（恢复检测后的状态显示）
        setSyncStatus('连接成功', 'check_circle', 'success');
        if (showTip) showSuccessMessage('连接成功，可以同步');
    } catch (e) {
        syncUiBusy = false;
        setSyncStatus('连接失败：' + friendlySyncError(e.message || e), 'error', 'error');
        if (showTip) showErrorMessage('连接失败：' + friendlySyncError(e.message || e));
    }
}

function setupSyncEventListeners() {
    // ★2026-09-03 i 标识已删：同步状态入口统一由健康行承担（见下方 healthRow 绑定）
    // ★2026-09-03 P1 同步健康行（融合在自动同步卡内）：已配置 → 弹状态弹窗；未配置 → 展开配置折叠并聚焦服务器输入框
    const healthRow = document.getElementById('syncHealthRow');
    if (healthRow) {
        const hHandler = function () {
            try {
                const url = buildSyncFileUrl();
                const configured = !!(url && syncConfig && syncConfig.username && syncConfig.password);
                if (configured) { showSyncStatusModal(); return; }
                const toggleBtn = document.getElementById('syncConfigToggleBtn');
                const collapse = document.getElementById('syncConfigCollapse');
                if (toggleBtn && collapse && !collapse.classList.contains('open')) toggleBtn.click();
                const serverInput = document.getElementById('syncServer');
                setTimeout(function () { if (serverInput) { try { serverInput.focus(); } catch (e) { /* 忽略 */ } } }, 350);
            } catch (e) { /* 静默 */ }
        };
        healthRow.addEventListener('click', hHandler);
        cleanupFunctions.push(() => healthRow.removeEventListener('click', hHandler));
    }
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
    const uploadBtn = document.getElementById('syncUploadBtn');
    if (uploadBtn) {
        // ★2026-08-25 上传完成后由函数内部 10 秒恢复连接状态（原 2 秒回正会盖掉「上传成功」对号）
        const handler = function () {
            uploadSyncBackup();
        };
        uploadBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => uploadBtn.removeEventListener('click', handler));
    }
    const downloadBtn = document.getElementById('syncDownloadBtn');
    if (downloadBtn) {
        const handler = function () {
            downloadSyncBackup();
        };
        downloadBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => downloadBtn.removeEventListener('click', handler));
    }
    // ★管理云端备份（v1.4.10.1）：列出 + 删除网盘备份文件
    const manageBtn = document.getElementById('syncManageBtn');
    if (manageBtn) {
        const handler = function () {
            manageCloudBackups();
            scheduleSyncStatusRefresh(2000);
        };
        manageBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => manageBtn.removeEventListener('click', handler));
    }
    // ★2026-08-25 WebDAV 弹窗示例（仅网页版显示：无原生桥时预览弹窗效果）
    const syncDemoBtn = document.getElementById('syncDemoBtn');
    if (syncDemoBtn) {
        const isWeb = !window.XixiFileBridge || typeof window.XixiFileBridge.webdavRequest !== 'function';
        if (isWeb) syncDemoBtn.style.display = 'block';
        const handler = showSyncDemoModal;
        syncDemoBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => syncDemoBtn.removeEventListener('click', handler));
    }
    // ★配置折叠区（v1.4.10.1；v1.4.10.10 加回弹展开/平滑收起）
    const configToggle = document.getElementById('syncConfigToggleBtn');
    if (configToggle) {
        const handler = function () {
            const collapse = document.getElementById('syncConfigCollapse');
            if (!collapse) return;
            const isOpen = collapse.classList.contains('open');
            if (isOpen) {
                // 收起（2026-08-12 v1.0.10.0 终版：无动画瞬间收起！
                // 8 版动画方案（max-height/transform/grid/height）在用户 WebView 上均有跳变/错位，
                // 无动画过程=物理上不存在"跳一下"；展开保留平滑动画）
                collapse.classList.remove('open');
                collapse.style.display = 'none';
                collapse.style.transition = '';
                collapse.style.height = '';
                collapse.style.paddingTop = '';
                collapse.style.opacity = '';
                collapse.style.borderTopWidth = '';
                collapse.style.borderTopColor = '';
                configToggle.classList.remove('open');
            } else {
                // 展开（height 0→实际高度：先 auto 实测完整高度（含 margin/padding），再动画展开，绝不裁切；
                // 2026-08-12 不再加 no-blur（它会导致背景跳亮变暗））
                collapse.style.display = 'block';
                collapse.classList.add('open');
                configToggle.classList.add('open');
                collapse.style.height = 'auto';
                collapse.style.paddingTop = '12px';
                collapse.style.opacity = '0';
                collapse.style.borderTopColor = 'transparent';
                const target = collapse.offsetHeight; // 真实完整高度（含 padding，含子项 margin）
                collapse.style.height = '0px';
                collapse.style.paddingTop = '0px';
                requestAnimationFrame(function () {
                    collapse.style.transition = 'height 0.3s cubic-bezier(0.25, 0.85, 0.3, 1), padding-top 0.3s ease, opacity 0.25s ease, border-top-color 0.3s ease';
                    collapse.style.height = target + 'px';
                    collapse.style.paddingTop = '12px';
                    collapse.style.opacity = '1';
                    collapse.style.borderTopColor = '';
                });
                setTimeout(function () {
                    collapse.style.transition = '';
                    collapse.style.height = '';
                    collapse.style.paddingTop = '';
                    collapse.style.opacity = '';
                    collapse.style.borderTopColor = '';
                }, 360);
            }
        };
        configToggle.addEventListener('click', handler);
        cleanupFunctions.push(() => configToggle.removeEventListener('click', handler));
    }
    const autoToggle = document.getElementById('syncAutoToggle');
    if (autoToggle) {
        const handler = async function (e) {
            syncAuto = e.target.checked;
            await AppStore.setItem(SYNC_AUTO_KEY, { enabled: syncAuto });
            // 开启自动同步时立即上传一次，确保云端有最新备份
            if (syncAuto && syncConfig.server && syncConfig.username) {
                setTimeout(function () { uploadSyncBackup(); }, 500);
            }
        };
        autoToggle.addEventListener('change', handler);
        cleanupFunctions.push(() => autoToggle.removeEventListener('change', handler));
    }
}

// ★管理云端备份（v1.4.10.1）：PROPFIND 列出网盘备份文件，支持逐个删除
async function manageCloudBackups() {
    if (window.__manageBusy) return; // ★2026-08-29 防连点：网络请求期间重复点击直接忽略
    window.__manageBusy = true;
    const manageBtn = document.getElementById('syncManageBtn');
    if (manageBtn) {
        manageBtn.disabled = true;
        const txt = manageBtn.querySelector('.text-sm');
        if (txt) txt.textContent = '读取中…';
    }
    try {
        await saveSyncConfigFromForm();
        const url = buildSyncFileUrl();
        if (!url) {
            showErrorMessage('请先填写服务器地址');
            return;
        }
        setSyncStatus('正在读取云端备份…', 'info', '');
        const files = await listSyncFilesFromCloud();
        if (!files || files.length === 0) {
            setSyncStatus('云端没有备份文件', 'error', 'error');
            showErrorMessage('云端没有备份文件');
            return;
        }
        showManageBackupsModal(files);
    } finally {
        window.__manageBusy = false;
        if (manageBtn) {
            manageBtn.disabled = false;
            const txt = manageBtn.querySelector('.text-sm');
            if (txt) txt.textContent = '管理';
        }
    }
}

// ★2026-08-25 WebDAV 弹窗示例（网页版预览用）：假数据展示「管理云端备份」弹窗
function showSyncDemoModal() {
    const demoFiles = [
        { name: 'xixi-hiking-backup-20260824_153012.html' },
        { name: 'xixi-hiking-backup-20260825_090512.html' },
        { name: 'xixi-hiking-backup-20260825_163045.html' }
    ];
    showManageBackupsModal(demoFiles);
}
// ★2026-08-29 全局弹窗防重入：打开任何弹窗前先移除所有已存在弹窗（导出/导入/管理叠加的根治）
function closeOpenModals() {
    document.querySelectorAll('.confirm-modal, #exportModal, #importMethodModal').forEach(function (m) {
        if (m && m.parentNode) m.parentNode.removeChild(m);
    });
}
// 云端备份管理弹窗：列出全部备份 + 每个可删除
function showManageBackupsModal(files) {
    closeOpenModals(); // ★2026-08-29 防重入：连点管理按钮不再叠加弹窗
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    const listHtml = files.map((f, i) => `
        <div class="restore-file-item" style="border-radius: 12px; margin-bottom: 8px;">
            <span class="material-icons" style="color: #4f46e5;">description</span>
            <span class="restore-file-info">
                <span class="restore-file-label">${formatSyncFileLabel(f.name)}</span>
                <span class="restore-file-desc">云端备份 · 第 ${i + 1} 个</span>
            </span>
            <button class="manage-delete-btn" data-name="${escapeHtml(f.name)}" title="删除此备份" style="border: none; background: none; cursor: pointer; padding: 6px;">
                <span class="material-icons" style="color: #ef4444; font-size: 20px;">delete</span>
            </button>
        </div>
    `).join('');
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: 92vw;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">folder_open</span>
                管理云端备份
            </div>
            <div class="confirm-modal-message">
                共 ${files.length} 个备份，点击垃圾桶删除：
            </div>
            <div class="restore-file-list" style="max-height: 280px; overflow-y: auto; padding: 2px 0 10px;">
                ${listHtml}
            </div>
            <button id="manageCloseBtn" class="mt-2 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                关闭
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // 删除按钮：确认后 DELETE 云端文件 + 清理本地索引
    modal.querySelectorAll('.manage-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
            const name = this.getAttribute('data-name');
            const ok = confirm('确定删除云端备份「' + formatSyncFileLabel(name) + '」？\n删除后无法恢复！');
            if (!ok) return;
            this.disabled = true;
            this.querySelector('.material-icons').style.opacity = '0.4';
            try {
                await saveSyncConfigFromForm();
                const url = buildSyncFileUrl(name);
                const r = await webdavRequest(url, 'DELETE', '');
                if (r.status === 204 || r.status === 200 || r.status === 404) {
                    await removeSyncFileFromIndex(name);
                    // 刷新弹窗列表
                    document.body.removeChild(modal);
                    showSuccessMessage('已删除：' + formatSyncFileLabel(name));
                    setTimeout(function () { manageCloudBackups(); }, 300);
                } else {
                    showErrorMessage('删除失败（HTTP ' + r.status + '）：' + (r.error || ''));
                }
            } catch (e) {
                showErrorMessage('删除失败：' + (e.message || e));
            }
        });
    });
    document.getElementById('manageCloseBtn').addEventListener('click', function () {
        document.body.removeChild(modal);
    });
    modal.addEventListener('click', function (e) {
        if (e.target === modal) document.body.removeChild(modal);
    });
}

// 设置页 tab 切换时自动检测连接（进入设置页才触发，避免每次启动都联网）
function bindAutoCheckOnSettingsTab() {
    // 2026-08-10 修复"设置页切走卡顿"：删除进设置页自动发网络请求(autoCheckSyncConnection)
    // 根因：每次点设置 tab 都发起 WebDAV 连接检测（async 网络请求），切走时请求还在飞 → 卡
    // 保留：输入配置变化后防抖检测（下方）
    // 输入配置后自动检测：服务器/账号/密码任一变化 → 防抖 800ms 后自动检测并提示
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
    closeOpenModals(); // ★2026-08-29 全局防重入（替代原 exportModal 单查重，防任意弹窗叠加）

    const modalHtml = `
        <div id="exportModal" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-animate" style="background: rgba(0,0,0,0.3);">
            <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: 90vw;">
                <div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">backup</span>导出备份</div>

                <div class="space-y-3">
                    <button id="exportRecordsBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">backup</span>
                        <span>导出完整备份压缩包（含照片）</span>
                    </button>
                    <!-- 2026-08-21 v1.1.1.6 纯数据备份（不含照片，体积小，适合日常快速备份） -->
                    <button id="exportDataOnlyBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">description</span>
                        <span>导出纯数据备份（不含照片）</span>
                    </button>
                    <!-- 2026-08-21 v1.1.2.1 导出诊断报告（并入导出弹窗） -->
                    <button id="exportDiagBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">bug_report</span>
                        <span>导出诊断报告</span>
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
    const exportDataOnlyBtn = document.getElementById('exportDataOnlyBtn');
    const exportDiagBtn = document.getElementById('exportDiagBtn');

    const closeModal = () => {
        // ★2026-08-27 淡出关闭取消（用户要求）：与确认弹窗一致，直接移除
        if (modal.parentNode) modal.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    exportRecordsBtn.addEventListener('click', async () => {
        closeModal();
        await performBackupExport(true);
    });
    exportDataOnlyBtn.addEventListener('click', async () => {
        closeModal();
        await performBackupExport(false);
    });
    exportDiagBtn.addEventListener('click', () => {
        closeModal();
        exportDiagnostics();
    });
}

// ★2026-08-20 导出备份（★2026-08-25 完整备份改 zip 压缩包：照片二进制省 33%；纯数据仍 HTML）
async function performBackupExport(includePhotos) {
    try {
        showLoadingToast('正在打包备份…');
        const isFull = includePhotos !== false;
        const dateStr = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
        let fileName, outData, mime;
        if (isFull) {
            const zip = await buildFullBackupZip(true);
            fileName = 'XiXi徒步备份-' + dateStr + '.zip';
            outData = uint8ToBase64(zip);
            mime = 'application/zip';
        } else {
            const html = await buildFullBackupHTML(false);
            fileName = 'XiXi纯数据备份-' + dateStr + '.html';
            outData = utf8ToBase64(html);
            mime = 'text/html;charset=utf-8';
        }
        if (window.XixiFileBridge && typeof window.XixiFileBridge.saveBase64 === 'function') {
            const ok = window.XixiFileBridge.saveBase64(outData, fileName);
            if (ok === true || ok === 'true' || ok === null) showSuccessMessage('备份已导出：' + fileName);
            else showErrorMessage('导出失败');
        } else {
            // 网页版：下载（★2026-08-25 iOS Safari a.download 无效 → 新窗口打开预览）
            const bin = atob(outData);
            const bytes = new Uint8Array(bin.length);
            for (var bi = 0; bi < bin.length; bi++) bytes[bi] = bin.charCodeAt(bi);
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            if (isIOSWebview()) {
                window.open(url, '_blank');
                showSuccessMessage('备份已生成，已打开预览（长按/分享可存储）');
            } else {
                const a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
                showSuccessMessage('备份已开始下载');
            }
        }
    } catch (e) {
        showErrorMessage('导出失败：' + (e.message || e));
    } finally {
        hideLoadingToast();
    }
}

// ==================== 完整备份导入功能 ====================

// ★2026-08-26 字段级合并工具：时间戳取新 + 空字段补全（undefined/null/''/0 都算空——海拔 0 即空数据）
function isFieldEmpty(v) {
    return v === undefined || v === null || v === '' || v === 0;
}
// 合并两个数组：同 id 取 createdAt 新的为基础，空字段用旧的补；独有的保留
function mergeRecordsWith(imported, existing, isPlan) {
    const fields = isPlan ? ['name', 'difficulty'] : ['name', 'elevation', 'difficulty', 'distance', 'duration', 'mood', 'weather', 'companions'];
    const localMap = new Map(existing.map(x => [x.id, x]));
    const impMap = new Map(imported.map(x => [x.id, x]));
    const merged = new Map();
    localMap.forEach((r, id) => {
        const c = impMap.get(id);
        if (!c) { merged.set(id, r); return; }
        // ★2026-08-26 按最后修改时间（updatedAt）取新，老数据无 updatedAt 回退 createdAt
        const lv = r.updatedAt || r.createdAt || '', cv = c.updatedAt || c.createdAt || '';
        const fresh = cv > lv ? c : r;
        const stale = cv > lv ? r : c;
        const out = JSON.parse(JSON.stringify(fresh));
        fields.forEach(k => {
            if (isFieldEmpty(out[k]) && !isFieldEmpty(stale[k])) out[k] = stale[k];
        });
        merged.set(id, out);
    });
    impMap.forEach((r, id) => { if (!merged.has(id)) merged.set(id, r); });
    return Array.from(merged.values());
}

function showImportModal() {
    closeOpenModals(); // ★2026-08-29 全局防重入（替代原 importMethodModal 单查重）

    const modal = document.createElement('div');
    modal.id = 'importMethodModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center modal-backdrop-animate';
    modal.style.background = 'rgba(0,0,0,0.3)';   /* ★v1.1.2.8 浅色遮罩调淡 */
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: 90vw;">
            <div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">upload_file</span>导入</div>
            <div class="space-y-3">
                <button id="selectFileBtn" class="w-full py-3 px-4 modal-option-btn flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">upload_file</span>
                    <span>选择备份文件</span>
                </button>
            </div>
            <button id="cancelImportModal" class="mt-4 w-full py-2 px-4 rounded-lg modal-cancel-btn">
                取消
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // 淡出关闭
    const fadeOutModal = () => {
        // ★2026-08-27 淡出关闭取消（用户要求）：与确认弹窗一致，直接移除
        if (modal.parentNode) modal.remove();
    };

    document.getElementById('selectFileBtn').addEventListener('click', () => {
        // 先触发文件选择（保持用户手势上下文，Android WebView 要求），再移除弹窗
        importBackup();
        fadeOutModal();
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

// ★2026-08-20 v1.1.0.3 导入完整备份（HTML 数据块 / 老 JSON），照片一起恢复
function importBackup() {
    const fileInput = document.getElementById('backupFileInput');
    if (!fileInput) return;
    fileInput.click();
    fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                if (typeof ev.target.result === 'string') {
                    // 老格式 HTML / JSON 文本备份
                    const payload = extractBackupData(ev.target.result);
                    if (!payload || !Array.isArray(payload.records)) {
                        showErrorMessage('不是有效的备份文件（需为备份压缩包或 HTML 备份）');
                        return;
                    }
                    importFullBackupPayload(payload);
                } else {
                    // ★2026-08-25 zip 压缩包备份（PK 头检测）
                    const u8 = new Uint8Array(ev.target.result);
                    if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 0x03 || u8[2] === 0x05)) {
                        importZipBackup(u8);
                    } else {
                        const txt = new TextDecoder().decode(u8);
                        const payload = extractBackupData(txt);
                        if (!payload || !Array.isArray(payload.records)) {
                            showErrorMessage('不是有效的备份文件（需为备份压缩包或 HTML 备份）');
                            return;
                        }
                        importFullBackupPayload(payload);
                    }
                }
            } catch (err) {
                console.error('导入备份失败:', err);
                showErrorMessage('备份解析失败，请确认文件是有效备份');
            }
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = '';
    };
}
// ★2026-08-25 导入 zip 压缩包备份：xixi-data.json + photos/*.jpg 二进制恢复
async function importZipBackup(u8) {
    const files = zipStoreUnpack(u8);
    if (!files || !files['xixi-data.json']) {
        showErrorMessage('压缩包解析失败，缺少数据文件');
        return;
    }
    const payload = JSON.parse(new TextDecoder().decode(files['xixi-data.json']));
    if (!payload || !Array.isArray(payload.records)) {
        showErrorMessage('压缩包数据格式不正确');
        return;
    }
    // 照片二进制 → dataURL（复用 restorePhotosFromPayload 的补缺逻辑）
    const refs = payload.photoRefs || {};
    const photoData = {};
    Object.keys(refs).forEach(function (pid) {
        const fname = refs[pid];
        if (files[fname]) photoData[pid] = bytesToDataURL(files[fname]);
    });
    if (Object.keys(photoData).length) payload.photos = photoData;
    await importFullBackupPayload(payload);
}
async function importFullBackupPayload(payload) {
    try {
        if (payload.photos) {
            const added = await restorePhotosFromPayload(payload);
            if (added > 0) showSuccessMessage('已恢复 ' + added + ' 张照片');
        }
        // ★2026-08-26 导入/下载恢复：同 id 时间戳取新 + 空字段补全（含 0 海拔=空）；独有的保留
        records = mergeRecordsWith(payload.records || [], records, false);

        // ★2026-08-26 计划同理（name/difficulty 补全）
        plannedTrips = mergeRecordsWith(payload.plannedTrips || [], plannedTrips, true);

        await saveToStorage();
        await savePlannedTripsToStorage();
        thumbCacheClear(); // ★2026-08-27 导入恢复：照片全变，缩略图缓存全清
        updateStatistics();
        renderTable();
        renderPlannedTripsTable();
        showSuccessMessage('完整备份导入成功：' + records.length + ' 条记录');
    } catch (e) {
        console.error('导入完整备份失败:', e);
        showErrorMessage('导入失败：' + (e.message || e));
    }
}

// ★2026-08-26 清理：showLoadingMessage/hideLoadingMessage 死代码已删（showLoadingToast 取代）

