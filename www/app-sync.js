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
// ★2026-09-16 五项优化⑤（安全）：**下面两处用 innerHTML 渲染**（toast、云端备份列表），
//   因此从 WebDAV 服务端 / 网络返回的文本（错误正文、文件名等）拼进去前必须过 esc()，
//   否则服务端返回的 HTML 会被当标记渲染（破版 / 注入）。本地用户数据（记录名等）同理。
function esc(s) { return escapeHtml(String(s == null ? '' : s)); }
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
        showInfoMessage('网页版无需更新（请使用安装版）');
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
// ★2026-09-08 崩溃报告构建（仅版本/时间/错误信息，绝不含记录与照片）：JS 持久队列 + 原生崩溃日志
function buildCrashReport() {
    var parts = [];
    try {
        var q = (typeof window.__getCrashQueue === 'function') ? window.__getCrashQueue() : [];
        if (q && q.length) {
            parts.push('=== JS 崩溃记录（' + q.length + ' 条）===');
            q.forEach(function (c) { parts.push((c && c.t ? c.t : '?') + ' | ' + (c && c.msg ? c.msg : '')); });
        }
    } catch (e) { /* 忽略 */ }
    try {
        if (window.XixiFileBridge && typeof window.XixiFileBridge.getNativeCrashLog === 'function') {
            var nlog = window.XixiFileBridge.getNativeCrashLog();
            if (nlog) { parts.push('=== 原生崩溃记录 ==='); parts.push(String(nlog)); }
        }
    } catch (e2) { /* 忽略 */ }
    if (!parts.length) return '';
    var head = 'XiXiの徒步小记 崩溃报告\n版本: ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?')
        + '\n时间: ' + new Date().toLocaleString()
        + '\n设备: ' + String(navigator.userAgent || '?').slice(0, 120) + '\n\n';
    return head + parts.join('\n\n');
}

// ★2026-09-08 崩溃自动上报：仅 App 内 + 已配 WebDAV + 有待报崩溃 + 当日未上报 → PUT 到坚果云 xixi-hiking/；成功清队列记当日；失败静默下轮再试
function maybeUploadCrashReport() {
    try {
        var hasAsyncBridge = window.XixiFileBridge && typeof window.XixiFileBridge.webdavRequestAsync === 'function';
        var hasSyncBridge = window.XixiFileBridge && typeof window.XixiFileBridge.webdavRequest === 'function';
        if (!hasAsyncBridge && !hasSyncBridge) return;   // 网页版不上报
        if (!syncConfig || !syncConfig.server || !syncConfig.username || !syncConfig.password) return;   // 未配云
        var report = buildCrashReport();
        if (!report) return;
        // ★2026-09-17 改用本地日期：toISOString() 是 UTC，中国时区 08:00 前会算成“昨天”——同一天内可能重复上报
        var dToday = new Date();
        var padToday = function (n) { return String(n).padStart(2, '0'); };
        var today = dToday.getFullYear() + '-' + padToday(dToday.getMonth() + 1) + '-' + padToday(dToday.getDate());
        var lastUp = '';
        try { lastUp = AppStore.getItem('hiking_crash_uploaded') || ''; } catch (e) { lastUp = ''; }
        if (lastUp === today) return;   // 当日已上报
        var d = new Date();
        var p2 = function (n) { return String(n).padStart(2, '0'); };
        var url = buildSyncFileUrl('xixi_crash_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.txt');
        if (!url) return;
        Promise.resolve(ensureSyncParentDirs(url)).then(function () {
            return webdavRequest(url, 'PUT', utf8ToBase64(report));
        }).then(function (res) {
            if (res && res.status >= 200 && res.status < 300) {
                try {
                    if (typeof window.__clearCrashQueue === 'function') window.__clearCrashQueue();
                    if (window.XixiFileBridge && typeof window.XixiFileBridge.clearNativeCrashLog === 'function') window.XixiFileBridge.clearNativeCrashLog();
                    AppStore.setItem('hiking_crash_uploaded', today);
                } catch (e3) { /* 忽略 */ }
                if (typeof showInfoMessage === 'function') showInfoMessage('已自动上报一次崩溃报告');
            }
        }).catch(function () { /* 静默：网络/目录失败下轮再试 */ });
    } catch (e5) { /* 上报异常不影响启动 */ }
}

// ★2026-09-07 已下载待安装包的记忆 key（本地缓存 xixi_update.apk 对应版本 tag；同版本再点更新 → 直接安装不重下）
const PENDING_APK_TAG_KEY = 'hiking_pending_apk_tag';
function hasLocalApkFor(tag) {
    try { return AppStore.getItem(PENDING_APK_TAG_KEY) === tag; } catch (e) { return false; }
}
function rememberLocalApkTag(tag) {
    try { if (tag) AppStore.setItem(PENDING_APK_TAG_KEY, tag); } catch (e) { /* 忽略 */ }
}
function clearLocalApkTag() {
    try { AppStore.removeItem(PENDING_APK_TAG_KEY); } catch (e) { /* 忽略 */ }
}
// 直接安装本地包（同版本已下载过）：原生无此能力或文件缺失 → 自动重下兜底
function installLocalUpdate() {
    if (!window.XixiFileBridge || typeof window.XixiFileBridge.installDownloadedApk !== 'function') {
        startUpdate();   // 旧包无直装桥 → 走原下载安装
        return;
    }
    try { window.XixiFileBridge.installDownloadedApk(); } catch (e) { startUpdate(); }
}

function showUpdateModal(info) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    var bodyText = (info.body || '').trim();   // ★2026-09-18 去掉 400 字符硬截断（更新弹窗日志曾显示不全；内容区已有 max-height+滚动兜底）
    bodyText = bodyText.replace(/^##[^\n]*\n\s*/i, '');   // 去掉 markdown 标题行（弹窗标题已含版本号，且与设置页日志观感一致）
    // ★2026-09-07 直装判定：本地已下载过且版本一致 → 不再重下，直接弹「立即安装」
    const localReady = hasLocalApkFor('v' + info.tag);
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: calc(100vw - 44px); box-sizing: border-box;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #185fa5;">system_update_alt</span>发现新版本 v' + escapeHtml(info.tag) + '</div>' +
        '<div class="confirm-modal-message" style="text-align:left;font-size:13px;line-height:1.7;max-height:200px;overflow-y:auto;">' +
        '<div style="font-weight:600;margin-bottom:4px;">当前 v' + APP_VERSION + ' → 新 v' + escapeHtml(info.tag) + '</div>' +
        (localReady ? '<div style="margin-bottom:6px;font-size:12px;color:#16a34a;background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.3);border-radius:10px;padding:7px 10px;">安装包已下载好，点下面按钮直接安装，不用重新下载</div>' : '') +
        (bodyText ? '<div style="white-space:pre-wrap;">' + escapeHtml(bodyText) + '</div>' : '') +   /* ★v1.1.2.9 更新内容跟随主题色（原固定灰蓝浅色偏淡/深色看不清） */
        '</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="updateLaterBtn">稍后</button>' +
        '<button class="confirm-btn-delete check-go-btn ripple-effect" id="updateNowBtn">' + (localReady ? '立即安装' : '立即更新') + '</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('updateLaterBtn').addEventListener('click', function () { document.body.removeChild(modal); });
    document.getElementById('updateNowBtn').addEventListener('click', function () {
        document.body.removeChild(modal);
        if (localReady) installLocalUpdate(); else startUpdate();
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
        showInfoMessage('当前环境不支持应用内更新');
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
        } else if (state === 'downloaded') {
            // ★2026-09-07 下载完成 → 记下待装版本（本地 xixi_update.apk 就绪）；用户若退出安装界面，下次同版本检查可直装
            try { if (pendingUpdate && pendingUpdate.tag) rememberLocalApkTag('v' + pendingUpdate.tag); } catch (eD) { /* 忽略 */ }
        } else if (state === 'no_local_apk') {
            // ★2026-09-07 本地包不存在/被系统清理 → 清记忆并自动重新下载（不死路）
            hideLoadingToast();
            clearLocalApkTag();
            showInfoMessage('本地安装包已失效，正在重新下载');
            setTimeout(function () { try { startUpdate(); } catch (e2) { /* 忽略 */ } }, 300);
            if (desc) desc.textContent = '重新下载中…';
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
    div.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:300;max-width:90vw;padding:12px 20px;';
    div.className = 'toast-pop toast-glass loading';   // ★2026-09-10 内联 padding（px-5 死类）；样式类名不再依赖 Tailwind   // ★2026-09-10 补 loading 变体类（原先漏加 → 底色透明看不出是提示）+ 层级 100→300
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
    try { renderSyncAccountCard(); } catch (e) { /* 静默 */ }
}

// ===== ★2026-09-17 入口改造（改法 C）：账号卡 + 「绑定账号」弹窗 =====
// 背景：原先三个输入框（服务器地址（WebDAV）/ 账号 / 应用密码）直接摊在设置页折叠区里，
//       术语晦涩、换机要重新查一遍，也不像"登录"。
// 现在：设置页只留一张账号卡（未绑定 / 已绑定两态），表单收进弹窗，弹窗内用
//       「① 选网盘 → ② 填账号」两步引导，选坚果云时地址自动填好。
// ★三个输入框 id（syncServer/syncUsername/syncPassword）保持不变 ⇒ renderSyncForm /
//   saveSyncConfigFromForm 等既有逻辑零改动即可复用（配合上面的"空表单守卫"）。
const SYNC_PROVIDER_JIANGUO_URL = 'https://dav.jianguoyun.com/dav/';

function syncProviderOf(server) {
    return String(server || '').indexOf('jianguoyun.com') >= 0 ? '坚果云' : 'WebDAV';
}

// 账号卡两态渲染（绑定 / 解绑 / 配置变化后都要调）
function renderSyncAccountCard() {
    const off = document.getElementById('syncAcctOff');
    const on = document.getElementById('syncAcctOn');
    if (!off || !on) return;
    const bound = !!(syncConfig && syncConfig.server && syncConfig.username);
    off.style.display = bound ? 'none' : 'block';
    on.style.display = bound ? 'block' : 'none';
    if (!bound) return;
    const provEl = document.getElementById('syncAcctProvider');
    const mailEl = document.getElementById('syncAcctMail');
    if (provEl) provEl.textContent = syncProviderOf(syncConfig.server);
    if (mailEl) mailEl.textContent = syncConfig.username || '';
}

// 弹窗内「选网盘」辅助：账号框的「占位提示 / 预填值」随网盘类型切换
// ★2026-09-17 用户反馈：切到「其他 WebDAV」后，账号框里还留着坚果云的邮箱（提示也仍写"你的坚果云邮箱"）
var syncBindPrefillUser = '';          // 打开弹窗时的账号预填值（用于判断用户是否手动改过）
var syncBindUserAutoCleared = false;   // 该值是否由本次切换自动清掉（切回时恢复，避免误丢）

function syncBindUserSync(isJ) {
    const el = document.getElementById('syncUsername');
    if (!el) return;
    el.placeholder = isJ ? '你的坚果云邮箱' : '你的 WebDAV 账号';
    const v = el.value || '';
    if (isJ) {
        // 切回坚果云：把刚才自动清掉的预填值还回来
        if (syncBindUserAutoCleared) { el.value = syncBindPrefillUser; syncBindUserAutoCleared = false; }
    } else if (v === syncBindPrefillUser) {
        // 用户没手动改过 → 清掉另一家的账号，避免带着坚果云邮箱去连别的 WebDAV
        el.value = '';
        syncBindUserAutoCleared = !!syncBindPrefillUser;
    }
}

// 弹窗内「选网盘」切换：坚果云 → 地址自动填 + 隐藏地址框；其他 → 显示地址框让用户填
function pickSyncProvider(kind) {
    const isJ = kind === 'jianguo';
    const cardJ = document.getElementById('syncProvJianguo');
    const cardO = document.getElementById('syncProvOther');
    const wrap = document.getElementById('syncServerWrap');
    const serverEl = document.getElementById('syncServer');
    const label = document.getElementById('syncUserLabel');
    const hint = document.getElementById('syncPwdHint');
    if (cardJ) cardJ.classList.toggle('sel', isJ);
    if (cardO) cardO.classList.toggle('sel', !isJ);
    if (wrap) wrap.style.display = isJ ? 'none' : 'block';
    if (serverEl) {
        if (isJ) serverEl.value = SYNC_PROVIDER_JIANGUO_URL;
        else if (serverEl.value === SYNC_PROVIDER_JIANGUO_URL) serverEl.value = '';   // 切换时清掉预填，避免误用
    }
    if (label) label.textContent = isJ ? '坚果云账号（邮箱）' : '账号';
    syncBindUserSync(isJ);   // ★账号占位提示 + 残留账号随服务商切换
    if (hint) hint.textContent = isJ
        ? '坚果云 → 右上角头像 → 账户信息 → 安全选项 → 应用密码 → 添加'
        : '填你的 WebDAV 服务商提供的账号与应用密码';
}

function closeSyncBindModal() {
    const m = document.getElementById('syncBindModal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
}

// 绑定弹窗（观感取改法 B：步骤条 + 服务商卡片 + 主按钮）
function openSyncBindModal() {
    closeOpenModals();   // 防重入：连点不叠加
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.id = 'syncBindModal';
    modal.innerHTML =
        '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: calc(100vw - 44px); box-sizing: border-box;">' +
            '<div class="confirm-modal-title">' +
                '<span class="material-icons" style="color: #4f46e5;">link</span>' +
                '绑定账号' +
            '</div>' +
            '<div class="confirm-modal-message" style="margin-bottom: 12px;">' +
                '<div class="sync-bind-steps"><b>① 选网盘</b> ── ② 填账号</div>' +
                '<div class="sync-provider-card sel" id="syncProvJianguo" data-testid="sync-prov-jianguo">' +
                    '<div><div class="sync-provider-name">坚果云</div>' +
                    '<div class="sync-provider-sub">推荐</div></div>' +
                    '<div class="sync-provider-tick">✓</div>' +
                '</div>' +
                '<div class="sync-provider-card" id="syncProvOther" data-testid="sync-prov-other">' +
                    '<div><div class="sync-provider-name">其他 WebDAV</div>' +
                    '<div class="sync-provider-sub">自建 / 其他网盘</div></div>' +
                    '<div class="sync-provider-tick">✓</div>' +
                '</div>' +
                '<div class="sync-config-item" id="syncServerWrap" style="display: none; margin-top: 12px;">' +
                    '<label class="sync-config-label" for="syncServer">服务器地址</label>' +
                    '<input type="text" id="syncServer" class="sync-input" placeholder="https://dav.example.com/dav/" autocomplete="off" spellcheck="false">' +
                '</div>' +
                '<div class="sync-config-item" style="margin-top: 12px;">' +
                    '<label class="sync-config-label" for="syncUsername" id="syncUserLabel">坚果云账号（邮箱）</label>' +
                    '<input type="text" id="syncUsername" class="sync-input" placeholder="你的坚果云邮箱" autocomplete="off" spellcheck="false">' +
                '</div>' +
                '<div class="sync-config-item" style="margin-bottom: 0;">' +
                    '<label class="sync-config-label" for="syncPassword">应用密码</label>' +
                    '<input type="password" id="syncPassword" class="sync-input" placeholder="应用密码，不是登录密码" autocomplete="off" spellcheck="false">' +
                    '<div class="sync-bind-hint" id="syncPwdHint">坚果云 → 右上角头像 → 账户信息 → 安全选项 → 应用密码 → 添加</div>' +
                '</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
                '<button class="confirm-btn-cancel ripple-effect" id="syncBindCancel">取消</button>' +
                '<button class="check-go-btn ripple-effect" id="syncBindSubmit" data-testid="sync-bind-submit">绑定并同步</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);

    // 回填已有配置（改绑场景：预填旧值，只改要改的那项）
    const serverEl = document.getElementById('syncServer');
    const userEl = document.getElementById('syncUsername');
    const passEl = document.getElementById('syncPassword');
    if (serverEl) serverEl.value = (syncConfig && syncConfig.server) || '';
    if (userEl) userEl.value = (syncConfig && syncConfig.username) || '';
    if (passEl) passEl.value = (syncConfig && syncConfig.password) || '';
    // 已配非坚果云 → 默认落在「其他 WebDAV」；否则默认坚果云
    const isJianguo = !syncConfig || !syncConfig.server || syncConfig.server.indexOf('jianguoyun.com') >= 0;
    syncBindPrefillUser = (syncConfig && syncConfig.username) || '';   // ★切换服务商时用它判断"用户有没有手动改过账号"
    syncBindUserAutoCleared = false;
    pickSyncProvider(isJianguo ? 'jianguo' : 'other');

    const jianguoCard = document.getElementById('syncProvJianguo');
    const otherCard = document.getElementById('syncProvOther');
    if (jianguoCard) jianguoCard.addEventListener('click', function () { pickSyncProvider('jianguo'); });
    if (otherCard) otherCard.addEventListener('click', function () { pickSyncProvider('other'); });
    const cancelBtn = document.getElementById('syncBindCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeSyncBindModal);
    const submitBtn = document.getElementById('syncBindSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submitSyncBind);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSyncBindModal(); });
    if (userEl) setTimeout(function () { try { userEl.focus(); } catch (err) { /* 忽略 */ } }, 320);
}

// 提交绑定：校验 → 保存（表单此刻在 DOM 内，可正常读值）→ 刷新账号卡 → 测连接
async function submitSyncBind() {
    const serverEl = document.getElementById('syncServer');
    const userEl = document.getElementById('syncUsername');
    const passEl = document.getElementById('syncPassword');
    if (!serverEl || !userEl || !passEl) return;
    const server = (serverEl.value || '').trim();
    const user = (userEl.value || '').trim();
    const pass = passEl.value || '';
    if (!server) { showErrorMessage('请先选择网盘，或填写服务器地址'); return; }
    if (!user) { showErrorMessage('请填写账号'); return; }
    if (!pass) { showErrorMessage('请填写应用密码'); return; }
    await saveSyncConfigFromForm();          // 表单在 DOM 内，正常写入并持久化
    closeSyncBindModal();                    // 关闭弹窗（清掉弹窗 DOM）
    renderSyncForm(syncUiState.lastSyncAt || '');
    renderSyncAccountCard();
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
    showSuccessMessage('已绑定，正在测试连接…');
    // 弹窗已关闭（输入框不在 DOM）→ autoCheckSyncConnection 内部的 saveSyncConfigFromForm
    // 靠「空表单守卫」保住刚保存的配置，不会被清空
    try { await autoCheckSyncConnection(true); } catch (e) { /* 静默 */ }
}

// ★2026-09-18 查看网盘信息（账号卡「网盘信息」按钮）：显示网盘类型/服务器/账号，密码加密脱敏不显示明文
function showSyncInfoModal() {
    closeOpenModals();
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    const srv = (syncConfig && syncConfig.server) || '';
    const usr = (syncConfig && syncConfig.username) || '';
    const hasPwd = !!(syncConfig && syncConfig.password);
    const prov = syncProviderOf(srv);
    const IS_DARK = typeof document.body !== 'undefined' && document.body.classList && document.body.classList.contains('dark-mode');
    const LB = IS_DARK ? 'rgba(255,255,255,0.5)' : '#52606f';
    const VL = IS_DARK ? '#f1f5f9' : '#1e293b';
    const row = function (k, v, wrap) {
        return '<div style="display:flex;justify-content:space-between;gap:14px;font-size:13px;line-height:1.6;">' +
            '<span style="color:' + LB + ';flex-shrink:0;">' + k + '</span>' +
            '<span style="color:' + VL + ';font-weight:600;text-align:right;' + (wrap ? 'word-break:break-all;min-width:0;' : '') + '">' + v + '</span></div>';
    };
    modal.innerHTML =
        '<div class="confirm-modal-content modal-fade-scale" style="max-width: 360px;width:calc(100vw - 44px);box-sizing:border-box;">' +
            '<div class="confirm-modal-title">' +
                '<span class="material-icons" style="color: #4f46e5;">cloud</span>' +
                '网盘信息' +
            '</div>' +
            '<div class="confirm-modal-message" style="text-align:left;display:flex;flex-direction:column;gap:10px;margin-bottom: 16px;">' +
                row('网盘类型', esc(prov)) +
                row('服务器地址', esc(srv || '—'), true) +
                row('账号', esc(usr || '—'), true) +
                row('应用密码', hasPwd ? '••••••••（已加密保存）' : '（未保存）') +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
                '<button class="confirm-btn-cancel ripple-effect" id="syncInfoClose">关闭</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    document.getElementById('syncInfoClose').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}

// 解绑：清空本机配置（云端已有备份文件不动）
function unbindSyncAccount() {
    // ★2026-09-17 改用统一确认弹窗（原为原生 confirm()，系统样式不符设计语言）
    askConfirm({
        title: '解绑账号',
        icon: 'link_off',
        danger: true,
        message: '解绑后本机不再自动备份到云端。<br>云端已有的备份文件不会被删除，之后可重新绑定取回。',
        okText: '解绑',
        cancelText: '取消'
    }).then(function (ok) {
        if (!ok) return;
        syncConfig = { server: '', username: '', password: '' };
        // ★AppStore.setItem 是同步函数（内部 localStorage，返回 undefined）→ 不能接 .then()；顺序执行即可
        AppStore.setItem(SYNC_CONFIG_KEY, { server: '', username: '', password: '' });
        renderSyncForm(syncUiState.lastSyncAt || '');   // 内部会刷新账号卡 → 切回未绑定态
        try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
        showSuccessMessage('已解绑');
    });
}

// 从表单读取并保存配置
async function saveSyncConfigFromForm() {
    // ★2026-09-17 入口改造配套守卫（★安全加固）：绑定表单现只存在于「绑定账号」弹窗内，
    //   而上传/下载/管理/测试连接等所有操作前都会调用本函数；若弹窗未打开（三输入框不在 DOM）
    //   仍照旧赋空字符串，会把已绑定的配置**静默清空**。故：读不到输入框 → 保持内存原值，不覆盖。
    const serverEl = document.getElementById('syncServer');
    const userEl = document.getElementById('syncUsername');
    const passEl = document.getElementById('syncPassword');
    if (!serverEl && !userEl && !passEl) return;
    syncConfig.server = (serverEl || {}).value || '';
    syncConfig.username = (userEl || {}).value || '';
    syncConfig.password = (passEl || {}).value || '';   // 内存保持明文（webdavRequest 用）
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
        showErrorMessage('请先绑定账号');
        return;
    }
    if (syncInProgress) return;
    syncInProgress = true;
    setSyncBusy(true, '正在打包备份…'); // ★2026-08-26 阶段1：打包（zip 含照片耗时）
    try {
        // ★2026-08-25 完整备份改 zip 压缩包上传（照片二进制省 33%，下载时兼容 zip + 老 HTML）
        const zip = await buildFullBackupZip(true, { includeCfg: true, includePwd: true });   // ★2026-09-18 云端上传带网盘配置（含加密密码），换机一键配置
        const bodyBase64 = uint8ToBase64(zip);
        // ★2026-08-26 阶段2：打包完成 → 上传中（带大小提示；原生桥无字节进度回调，阶段式提示）
        const sizeMB = (bodyBase64.length * 3 / 4 / 1024 / 1024).toFixed(1);
        setSyncBusy(true, '上传中（' + sizeMB + ' MB）…');
        // 坚果云要求目录先存在：上传前无条件先逐级创建目录（幂等，已存在返回 405/409 视为 OK）
        const dirsResult = await ensureSyncParentDirs(url);
        if (!dirsResult.ok) {
            const detail = dirsResult.detail || '未知错误';
            setSyncStatus('目录检查失败：' + detail, 'error', 'error');
            showErrorMessage('目录检查失败：' + esc(detail));
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
            if (!silent) showErrorMessage('上传失败：' + esc(detail) + (bodyPreview ? '（' + esc(bodyPreview) + '）' : ''));
            else notifySyncFailure('自动同步失败：' + detail);
            console.error('[Sync] 上传失败', url, result.status, bodyPreview);
        }
    } catch (e) {
        setSyncStatus('上传失败：' + friendlySyncError(e.message || e), 'error', 'error');
        if (!silent) showErrorMessage('上传失败：' + esc(friendlySyncError(e.message || e)));
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
            showErrorMessage('请先绑定账号');
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
                <span class="restore-file-label">${esc(formatSyncFileLabel(f.name))}</span>
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
            <button id="restoreCancelBtn" class="mt-2 w-full py-2 px-4 confirm-btn-cancel">
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
                // ★2026-09-18 下载恢复一键配置：备份是本机云端的，配置（含加密密码）直接恢复，不必重填
                await importFullBackupPayload(payload, { applySyncConfig: true });
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
            showErrorMessage('下载失败：' + esc(msg));
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
        if (!silent) showErrorMessage('请先绑定账号');
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
            showErrorMessage('合并失败：' + esc(msg));
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

// ★2026-09-17 备份包含同步配置：导出时把网盘配置一并写进备份包
//   - 默认带「服务器 + 账号」（本身不敏感），新机导入后自动填好 —— 这正是换机少填几步的关键
//   - 密码由导出弹窗的勾选决定（默认不带）；带则用与本地同款 encPwd 混淆，不写明文
//   - 选项由**调用方以参数传入**（只有「手动导出」这条链会传；自动/上传路径不传 → 走安全默认）
function buildSyncConfigForBackup(opts) {
    try {
        // ★2026-09-17 改参数化（原读全局 window.__backupSyncOpts）：全局状态会**残留** ——
        //   用户手动导出勾了「含密码」后，后续自动上传 / 每周本地备份也会带上密码
        //   （等于网盘上躺着一份含密码的包）。现在只有"手动导出"这条链会传 opts，
        //   自动 / 上传路径不传 → 走安全默认（带配置、不带密码）。
        const o = opts || { includeCfg: true, includePwd: false };
        if (!o.includeCfg) return null;
        if (!syncConfig || !syncConfig.server || !syncConfig.username) return null;   // 未绑定 → 不带
        return {
            server: syncConfig.server,
            username: syncConfig.username,
            password: (o.includePwd && syncConfig.password) ? encPwd(syncConfig.password) : ''
        };
    } catch (e) { return null; }
}

// 全量数据打包（含应用版本、标题、暗色模式等元信息）
function buildFullBackupPayload(opts) {
    return {
        app: 'XiXiHiking',
        appName: '徒步小记',
        // ★2026-09-11 修复：原先硬编码 '1.1.0.3'（早已过期，实际版本见 APP_VERSION）——
        //   导致导出的备份元数据版本号与真实 App 不符（排查/兼容判断会读到错值）；改为动态取 APP_VERSION
        version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.1.0.3'),
        exportedAt: new Date().toISOString(),
        records: records || [],
        plannedTrips: plannedTrips || [],
        syncConfig: buildSyncConfigForBackup(opts)   // ★2026-09-17 备份含同步配置（未绑定/未勾选 = null）
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
    function pad2h(x) { x = String(x); return x.length < 2 ? '0' + x : x; }
    function diffDots(n) { var h = ''; n = (n === undefined || n === null || n === '') ? 0 : Number(n); for (var k = 1; k <= 5; k++) { h += '<i' + (k <= n ? ' class="on"' : '') + '></i>'; } return h; }
    function fmtDtCN(ts) { try { var d = new Date(ts); if (isNaN(d.getTime())) return ''; var wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]; return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + wd; } catch (e) { return ''; } }
    function dayMarkCN(ts) { try { var d = new Date(ts); return pad2h(d.getMonth() + 1) + '.' + pad2h(d.getDate()); } catch (e) { return ''; } }
    var recCards = (payload.records || []).map(function (r) {
        var imgs = (r.photos || []).map(function (pid) {
            var d = photos[pid];
            return d ? '<img src="' + d + '" alt="">' : '';
        }).join('');
        var metaBits = [];
        if (r.mood) metaBits.push('心情 ' + esc(r.mood));
        if (r.weather) metaBits.push('天气 ' + esc(r.weather));
        var comp = Array.isArray(r.companions) ? r.companions.join('、') : (r.companions || '');
        if (comp) metaBits.push('同行 ' + esc(comp));
        var metaLine = metaBits.length ? metaBits.join(' · ') : '';
        var dtTxt = r.createdAt ? fmtDtCN(r.createdAt) : '';
        var dayTxt = r.createdAt ? dayMarkCN(r.createdAt) : '';
        var facts = [];
        facts.push('难度 <b>' + esc(r.difficulty !== undefined && r.difficulty !== '' ? r.difficulty : '-') + '</b> 级<span class="diff5">' + diffDots(r.difficulty) + '</span>');
        if (r.elevation) facts.push('海拔 <b>' + esc(r.elevation) + '</b> m');
        if (r.distance) facts.push('里程 <b>' + esc(r.distance) + '</b> km');
        if (r.duration) facts.push('用时 <b>' + esc(formatDuration(r.duration)) + '</b>');
        var note = (r.notes && String(r.notes).trim()) ? '<div class="diary"><span class="lab">小日记</span>' + esc(String(r.notes).trim()) + '</div>' : '';
        var longCls = (r.notes && String(r.notes).length > 60) ? ' entry-long' : '';
        return '<div class="entry' + longCls + '">' +
            '<div class="entry-head">' +
            '<div class="entry-date">' + (dayTxt ? '<span class="day">' + dayTxt + '</span>' : '') + '<span class="meta">' + dtTxt + (metaLine ? ' · ' + metaLine : '') + '</span></div>' +
            '<div class="entry-name">' + esc(r.name || '未命名') + '</div>' +
            '<div class="facts">' + facts.join('<span class="gap"></span>') + '</div>' +
            '</div>' +
            note +
            (imgs ? '<div class="photos">' + imgs + '</div>' : '') +
            '</div>';
    }).join('');
    var planCards = (payload.plannedTrips || []).map(function (t) {
        return '<div class="plan"><b>' + esc(t.name || '未命名') + '</b>' +
            ' —— 难度 ' + esc(t.difficulty !== undefined && t.difficulty !== '' ? t.difficulty : '-') + ' 级' +
            (t.createdAt ? ' · ' + fmtDtCN(t.createdAt) : '') + '</div>';
    }).join('');
    var dataJson = JSON.stringify(payload).replace(/<\/script/g, '<\\/script');
    // ★2026-09-09 回忆册 → PDF：日记样式（纸感排版 + 小日记正文 + A4 分页友好），浏览器 Ctrl+P → 另存为 PDF 即成册
    var printCss = `
body{font-family:"SimSun","Songti SC","STSong",serif;background:#f5f1e8;margin:0 auto;padding:30px 14px 56px;max-width:780px;color:#292524;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
h1{margin:6px 0 2px;font-size:26px;text-align:center;letter-spacing:2px;color:#1c1917;}
p.sub{margin:0 0 24px;text-align:center;color:#a8a29e;font-size:13px;}
.tipbar{background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca;border-radius:10px;padding:8px 12px;font-size:13px;text-align:center;margin-bottom:20px;}
h2{font-size:17px;color:#44403c;margin:34px 0 14px;}
h2 .t{display:inline-block;border-bottom:2px solid #d97706;padding-bottom:3px;letter-spacing:1px;}
.entry{margin:0 0 28px;padding-bottom:24px;border-bottom:1px dashed #ddd3bd;}
.entry:last-of-type{border-bottom:none;}
.entry-head{break-inside:avoid;page-break-inside:avoid;page-break-after:avoid;}
.entry-date{display:flex;align-items:baseline;gap:10px;margin-bottom:3px;flex-wrap:wrap;}
.entry-date .day{font-size:26px;font-weight:700;color:#b45309;line-height:1;}
.entry-date .meta{font-size:13px;color:#a8a29e;}
.entry-name{margin:2px 0 7px;font-size:21px;color:#1c1917;letter-spacing:.5px;}
.facts{display:flex;flex-wrap:wrap;font-size:13px;color:#57534e;margin-bottom:9px;}
.facts .gap{display:inline-block;width:2px;margin:0 12px;color:transparent;}
.facts b{font-weight:700;color:#44403c;}
.diff5{display:inline-block;margin-left:8px;}
.diff5 i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px;background:#e7e0d0;}
.diff5 i.on{background:#d97706;}
.diary{background:#fdf6e3;border-left:3px solid #e7c98a;border-radius:0 10px 10px 0;padding:9px 13px;margin:2px 0 12px;font-size:14px;line-height:1.9;white-space:pre-wrap;word-break:break-word;color:#44403c;break-inside:avoid;page-break-inside:avoid;}
.diary .lab{color:#b45309;font-weight:700;margin-right:6px;}
.photos{margin-top:6px;line-height:0;}
.photos img{display:inline-block;width:104px;height:104px;object-fit:cover;border-radius:8px;margin:0 6px 6px 0;vertical-align:top;}
.plan{border-left:3px solid #cbd5e1;padding:7px 0 7px 12px;margin:8px 0;font-size:14px;color:#57534e;break-inside:avoid;page-break-inside:avoid;}
.plan b{color:#292524;}
footer{text-align:center;color:#a8a29e;font-size:12px;margin-top:34px;}
@page{size:A4;margin:14mm 13mm;}
@media print{.tipbar{display:none!important;}body{background:#fff;padding:0;max-width:none;}.entry{break-inside:avoid-page;page-break-inside:avoid;}.entry-long{break-inside:auto;page-break-inside:auto;}.photos{break-inside:avoid;page-break-inside:avoid;}img{width:82px!important;height:82px!important;}h1{margin-top:4mm;}}`;
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + escTitle + ' · 完整备份</title>' +
        '<style>' + printCss + '</style></head><body>' +
        '<div class="tipbar">📄 想存成 PDF？按 Ctrl+P（手机：浏览器菜单「打印」），目标选「另存为 PDF」即可成册保存</div>' +
        '<h1>🥾 ' + escTitle + '</h1><p class="sub">完整备份 · 共 ' + (payload.records || []).length + ' 条徒步记录 · ' + (payload.plannedTrips || []).length + ' 条计划 · 导出于 ' + new Date(payload.exportedAt || Date.now()).toLocaleString() + '</p>' +
        '<h2><span class="t">徒步记录</span></h2>' + (recCards || '<p style="color:#94a3b8;">暂无记录</p>') +
        '<h2><span class="t">计划徒步</span></h2>' + (planCards || '<p style="color:#94a3b8;">暂无计划</p>') +
        '<footer>Made by XiXi 💛 · 此文件可在 App 内导入恢复</footer>' +
        '<script id="backup-data" type="application/json">' + dataJson + '</' + 'script>' +
        '</body></html>';
}
// 组装完整备份 HTML（文字 + 照片 base64）
async function buildFullBackupHTML(includePhotos, opts) {
    var payload = buildFullBackupPayload(opts);
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
async function buildFullBackupZip(includePhotos, opts) {
    var payload = buildFullBackupPayload(opts);
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
        const simple = document.getElementById('syncHealthSimple');
        const grid = document.getElementById('syncHealthGrid');
        const txt = document.getElementById('syncHealthText');
        const dot = document.getElementById('syncHealthDot');
        if (!txt || !dot) return;
        const url = buildSyncFileUrl();
        const hasCfg = !!(url && syncConfig && syncConfig.username && syncConfig.password);
        if (!hasCfg) {
            if (simple) simple.style.display = 'flex';
            if (grid) grid.style.display = 'none';
            dot.style.background = '#94a3b8';
            txt.textContent = '还没连接云端 · 点这里配置备份';
            return;
        }
        // ★2026-09-18 连接态：单行 → 两行四维（网盘数据/图片 · 徒步计划/徒步记录）
        if (simple) simple.style.display = 'none';
        if (grid) grid.style.display = 'flex';
        // 同步中：四维统一灰 sync 旋转
        if (syncUiBusy) {
            ['syncDimNet', 'syncDimPhoto', 'syncDimPlan', 'syncDimRecord'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) { el.textContent = 'sync'; el.style.color = '#94a3b8'; }
            });
            return;
        }
        let lastSyncAt = '';
        try { const d = await AppStore.getItem(SYNC_STATUS_KEY); if (d && d.lastSyncAt) lastSyncAt = d.lastSyncAt; } catch (e) { /* 忽略 */ }
        const failed = syncUiState.status === 'error';
        let diffDays = -1;
        if (lastSyncAt) diffDays = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 86400000);
        // 阈值：开了自动同步 3 天没同步=超时；没开 7 天=超时（用户 2026-09-18 定）
        const thr = syncAuto ? 3 : 7;
        const synced = !failed && diffDays >= 0 && diffDays <= thr;
        const overdue = !failed && diffDays > thr;
        let photoCount = 0;
        try { const u = await photoGetUsage(); photoCount = (u && u.count) || 0; } catch (e) { /* 忽略 */ }
        const dims = [
            { id: 'syncDimNet', has: true },
            { id: 'syncDimPhoto', has: photoCount > 0 },
            { id: 'syncDimPlan', has: (plannedTrips || []).length > 0 },
            { id: 'syncDimRecord', has: (records || []).length > 0 }
        ];
        for (let i = 0; i < dims.length; i++) {
            const el = document.getElementById(dims[i].id);
            if (!el) continue;
            let icon, color;
            if (failed) { icon = 'cancel'; color = '#dc2626'; }
            else if (!dims[i].has) { icon = 'circle'; color = '#16a34a'; }
            else if (synced) { icon = 'check_circle'; color = '#16a34a'; }
            else if (overdue) { icon = 'cancel'; color = '#dc2626'; }
            else { icon = 'circle'; color = '#16a34a'; }
            el.textContent = icon;
            el.style.color = color;
        }
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
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 320px;width:calc(100vw - 44px);box-sizing:border-box;">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">sync_alt</span>
                同步状态
            </div>
            <!-- ★2026-09-17 与「弹窗间距规范」对齐：内容 → 按钮 固定 12px（原先实测 0px，文字贴着按钮） -->
            <div class="confirm-modal-message" style="margin-bottom: 12px;">
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
        setSyncStatus('请先绑定账号', 'info', '');
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
            if (showTip) showErrorMessage('连接失败：' + esc(friendlySyncError(dirsResult.detail)));
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
                // ★2026-09-17 入口改造：未绑定时直接打开「绑定账号」弹窗（原为展开折叠配置区）
                openSyncBindModal();
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
    // ★2026-09-17 入口改造（改法 C）：配置表单收进弹窗后，此处只绑账号卡上的按钮
    const bindOpenBtn = document.getElementById('syncBindOpenBtn');
    if (bindOpenBtn) {
        const handler = function () { openSyncBindModal(); };
        bindOpenBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => bindOpenBtn.removeEventListener('click', handler));
    }
    const infoBtn = document.getElementById('syncInfoBtn');
    if (infoBtn) {
        const handler = function () { showSyncInfoModal(); };
        infoBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => infoBtn.removeEventListener('click', handler));
    }
    const unbindBtn = document.getElementById('syncUnbindBtn');
    if (unbindBtn) {
        const handler = function () { unbindSyncAccount(); };
        unbindBtn.addEventListener('click', handler);
        cleanupFunctions.push(() => unbindBtn.removeEventListener('click', handler));
    }
    try { renderSyncAccountCard(); } catch (e) { /* 静默 */ }
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
            showErrorMessage('请先绑定账号');
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
    document.querySelectorAll('.confirm-modal').forEach(function (m) {
        if (m && m.parentNode) m.parentNode.removeChild(m);
    });
}
// ★2026-09-17 通用确认弹窗（Promise）——彻底替代原生 confirm()，统一设计语言
//   原生 confirm() 在 APK / iOS 网页里都是系统样式（灰底方块 + 系统字体），与全站玻璃语言完全不搭且不可控。
//   用法：askConfirm({ title, message, okText, cancelText, icon, danger }).then(function (ok) { ... })
//   注意：message 允许 HTML（调用方拼接用户数据时必须自己 esc()）
//   兜底：弹窗被外部 closeOpenModals() 移除时也 resolve(false)（防调用方 await 永挂）
function askConfirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
        closeOpenModals();
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.id = 'askConfirmModal';
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale">' +
                '<div class="confirm-modal-title">' +
                    '<span class="material-icons" style="color: ' + (opts.danger ? '#dc2626' : '#4f46e5') + ';">' +
                    (opts.icon || 'help_outline') + '</span>' +
                    escapeHtml(opts.title || '确认') +
                '</div>' +
                '<div class="confirm-modal-message">' + (opts.message || '') + '</div>' +
                '<div class="confirm-modal-buttons">' +
                    '<button class="confirm-btn-cancel ripple-effect" id="askConfirmCancel">' +
                    escapeHtml(opts.cancelText || '取消') + '</button>' +
                    '<button class="check-go-btn ripple-effect" id="askConfirmOk">' +
                    escapeHtml(opts.okText || '确定') + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        let settled = false;
        let obs = null;
        const done = function (v) {
            if (settled) return;
            settled = true;
            try { if (obs) obs.disconnect(); } catch (e) { /* 忽略 */ }
            try { modal.remove(); } catch (e) { /* 忽略 */ }
            resolve(v);
        };
        obs = new MutationObserver(function () {
            if (!document.body.contains(modal)) done(false);
        });
        try { obs.observe(document.body, { childList: true }); } catch (e) { /* 忽略 */ }
        document.getElementById('askConfirmCancel').addEventListener('click', function () { done(false); });
        document.getElementById('askConfirmOk').addEventListener('click', function () { done(true); });
        modal.addEventListener('click', function (e) { if (e.target === modal) done(false); });
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
                <span class="restore-file-label">${esc(formatSyncFileLabel(f.name))}</span>
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
            <button id="manageCloseBtn" class="mt-2 w-full py-2 px-4 confirm-btn-cancel">
                关闭
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // 删除按钮：确认后 DELETE 云端文件 + 清理本地索引
    modal.querySelectorAll('.manage-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
            const name = this.getAttribute('data-name');
            // ★2026-09-17 改用统一确认弹窗（原为原生 confirm()）
            const ok = await askConfirm({
                title: '删除云端备份',
                icon: 'warning',
                danger: true,
                message: '确定删除云端备份「' + esc(formatSyncFileLabel(name)) + '」？<br>删除后无法恢复！',
                okText: '删除',
                cancelText: '取消'
            });
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
                    showSuccessMessage('已删除：' + esc(formatSyncFileLabel(name)));
                    setTimeout(function () { manageCloudBackups(); }, 300);
                } else {
                    showErrorMessage('删除失败（HTTP ' + r.status + '）：' + esc(r.error || ''));
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
        <div id="exportModal" class="confirm-modal modal-backdrop-animate">
            <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: 90vw;">
                <div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">backup</span>导出备份</div>

                <div class="space-y-3">
                    <button id="exportRecordsBtn" class="w-full py-3 px-4 glass-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">backup</span>
                        <span>导出完整备份压缩包（含照片）</span>
                    </button>
                    <!-- 2026-08-21 v1.1.1.6 纯数据备份（不含照片，体积小，适合日常快速备份） -->
                    <button id="exportDataOnlyBtn" class="w-full py-3 px-4 glass-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">description</span>
                        <span>导出纯数据备份（不含照片）</span>
                    </button>
                    <!-- 2026-08-21 v1.1.2.1 导出诊断报告（并入导出弹窗） -->
                    <button id="exportDiagBtn" class="w-full py-3 px-4 glass-btn flex items-center justify-center gap-2">
                        <span class="material-icons text-xl">bug_report</span>
                        <span>导出诊断报告</span>
                    </button>
                </div>
                <!-- ★2026-09-17 备份包含同步配置：换机导入后自动填好（默认带配置、默认不带密码） -->
                <div id="exportSyncCfgBlock" class="export-sync-opt" style="margin-top: 12px;">
                    <label class="chk-row">
                        <input type="checkbox" id="exportIncludeSyncCfg" checked>
                        <span>同时包含网盘配置
                            <span class="chk-sub">换机导入后自动填好地址与账号（不含密码）</span></span>
                    </label>
                    <div id="exportSyncPwdWrap" style="margin: 9px 0 0 24px;">
                        <label class="chk-row">
                            <input type="checkbox" id="exportIncludeSyncPwd">
                            <span>连应用密码一起带上
                                <span class="chk-sub">新机彻底免填；但这份文件一旦外泄，别人就能访问你的网盘</span></span>
                        </label>
                    </div>
                </div>
                <!-- ★2026-09-06 说明移入「数据管理」标题旁 i 弹窗（用户要求：弹窗只留操作，说明收进数据管理说明） -->
                <button id="closeExportModal" class="mt-4 w-full py-2 px-4 confirm-btn-cancel">
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

    // ★2026-09-17 备份含配置：读勾选并**作为参数**传给导出链（不写全局，防污染自动备份）
    const readBackupSyncOpts = function () {
        const c = document.getElementById('exportIncludeSyncCfg');
        const p = document.getElementById('exportIncludeSyncPwd');
        return {
            includeCfg: !!(c && c.checked),
            includePwd: !!(c && c.checked && p && p.checked)
        };
    };
    const cfgBlock = document.getElementById('exportSyncCfgBlock');
    if (cfgBlock && !(syncConfig && syncConfig.server && syncConfig.username)) cfgBlock.style.display = 'none';   // 未绑定 → 无意义
    const cfgChk = document.getElementById('exportIncludeSyncCfg');
    const pwdWrap = document.getElementById('exportSyncPwdWrap');
    const syncPwdToggle = function () {
        if (pwdWrap) pwdWrap.style.display = (cfgChk && cfgChk.checked) ? 'block' : 'none';
    };
    if (cfgChk) cfgChk.addEventListener('change', syncPwdToggle);
    syncPwdToggle();
    exportRecordsBtn.addEventListener('click', async () => {
        const opts = readBackupSyncOpts();
        closeModal();
        await performBackupExport(true, opts);
    });
    exportDataOnlyBtn.addEventListener('click', async () => {
        const opts = readBackupSyncOpts();
        closeModal();
        await performBackupExport(false, opts);
    });
    exportDiagBtn.addEventListener('click', () => {
        closeModal();
        exportDiagnostics();
    });
}

// ★2026-09-05 P1-7 本地每周自动备份兜底：仅 App（XixiFileBridge）且数据非空时，距上次 >=7 天自动存一份纯数据备份到系统下载目录；
//   （records/plannedTrips 有内容才备；成功走通知栏提示，失败静默等下次；网页版无桥自动跳过）
function autoLocalBackupIfDue() {
    try {
        if (!window.XixiFileBridge || typeof window.XixiFileBridge.saveBase64 !== 'function') return;
        var hasData = (typeof records !== 'undefined' && records && records.length > 0) ||
                      (typeof plannedTrips !== 'undefined' && plannedTrips && plannedTrips.length > 0);
        if (!hasData) return;
        var last = AppStore.getItem('hiking_local_backup_at');
        if (typeof last === 'number' && Date.now() - last < 7 * 86400000) return;
        // ★2026-09-05 优化⑤：last 记录移到成功回调——原实现导出前先记，失败也算完成 → 实际 7 天后才重试；
        //   现失败不记 last，下次启动继续试，直到成功才刷新「距上次备份」时间
        performBackupExport(false).then(function () {
            try { AppStore.setItem('hiking_local_backup_at', Date.now()); } catch (e0) { /* 记录失败下次再备 */ }
            try {
                if (typeof showSystemNotification === 'function') {
                    showSystemNotification('本地自动备份完成', '数据已存入系统「下载」目录，7 天内不再重复');
                }
            } catch (e2) { /* 通知失败不影响 */ }
        }).catch(function () { /* 失败不记 last，等下次启动重试 */ });
    } catch (e3) { /* 自动备份绝不影响启动 */ }
}

// ★2026-08-20 导出备份（★2026-08-25 完整备份改 zip 压缩包：照片二进制省 33%；纯数据仍 HTML）
async function performBackupExport(includePhotos, opts) {
    try {
        showLoadingToast('正在打包备份…');
        const isFull = includePhotos !== false;
        const dateStr = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
        let fileName, outData, mime;
        if (isFull) {
            const zip = await buildFullBackupZip(true, opts);
            fileName = 'XiXi徒步备份-' + dateStr + '.zip';
            outData = uint8ToBase64(zip);
            mime = 'application/zip';
        } else {
            const html = await buildFullBackupHTML(false, opts);
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
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
        <div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: 90vw;">
            <div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">upload_file</span>导入</div>
            <div class="space-y-3">
                <button id="selectFileBtn" class="w-full py-3 px-4 glass-btn flex items-center justify-center gap-2">
                    <span class="material-icons text-xl">upload_file</span>
                    <span>选择备份文件</span>
                </button>
            </div>
            <button id="cancelImportModal" class="mt-4 w-full py-2 px-4 confirm-btn-cancel">
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
                    importFullBackupPayloadWithConfigAsk(payload);   // ★先问是否恢复网盘配置
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
                        importFullBackupPayloadWithConfigAsk(payload);   // ★先问是否恢复网盘配置
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
    await importFullBackupPayloadWithConfigAsk(payload);   // ★先问是否恢复网盘配置
}
async function importFullBackupPayload(payload, opts) {
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
        // ★2026-09-17 备份含配置：只有「手动导入 + 用户选择恢复」才应用网盘配置
        //   （WebDAV 自动下载/合并路径不传 opts → 绝不动本机已有配置）
        if (opts && opts.applySyncConfig) {
            const applied = await applySyncConfigFromBackup(payload.syncConfig);
            if (applied && !(payload.syncConfig && payload.syncConfig.password)) {
                showInfoMessage('已恢复网盘配置，请补填应用密码');
            } else if (applied) {
                showSuccessMessage('已恢复网盘配置');
            }
        }
        showSuccessMessage('完整备份导入成功：' + records.length + ' 条记录');
    } catch (e) {
        console.error('导入完整备份失败:', e);
        showErrorMessage('导入失败：' + (e.message || e));
    }
}

// ===== ★2026-09-17 备份包含同步配置（导入侧） =====

// 把备份里的网盘配置写入本机（含密码则解密后按本地规则重新加密存储）
async function applySyncConfigFromBackup(cfg) {
    if (!cfg || !cfg.server || !cfg.username) return false;
    syncConfig.server = cfg.server;
    syncConfig.username = cfg.username;
    syncConfig.password = cfg.password ? decPwd(cfg.password) : '';   // 密码可能未随包带 → 留空待补填
    AppStore.setItem(SYNC_CONFIG_KEY, {
        server: syncConfig.server,
        username: syncConfig.username,
        password: encPwd(syncConfig.password)
    });
    try { renderSyncForm(syncUiState.lastSyncAt || ''); } catch (e) { /* 静默 */ }
    try { renderSyncAccountCard(); } catch (e) { /* 静默 */ }
    try { updateSyncHealthRow(); } catch (e) { /* 静默 */ }
    return true;
}

// 导入前询问：这份备份带了网盘配置，要不要一并恢复？（不静默改配置）
function askRestoreSyncConfig(cfg) {
    return new Promise(function (resolve) {
        closeOpenModals();
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.id = 'syncRestoreAskModal';
        modal.innerHTML =
            '<div class="confirm-modal-content modal-fade-scale" style="max-width: 340px; width: calc(100vw - 44px); box-sizing: border-box;">' +
                '<div class="confirm-modal-title">' +
                    '<span class="material-icons" style="color: #4f46e5;">cloud_download</span>' +
                    '发现网盘配置' +
                '</div>' +
                '<div class="confirm-modal-message" style="margin-bottom: 12px;">' +
                    '<div class="sync-restore-warn">这份备份里带有网盘配置</div>' +
                    '<div class="sync-restore-info">' + esc(syncProviderOf(cfg.server)) + ' · ' + esc(cfg.username) + '</div>' +
                    '<div class="sync-bind-hint">恢复后本机就能直接同步，不必重新填地址与账号。' +
                        (cfg.password ? '' : '（备份里没有密码，恢复后补填一次即可）') +
                        '<br>如果这不是你自己的备份文件，请选「只恢复记录」。</div>' +
                '</div>' +
                '<div class="confirm-modal-buttons">' +
                    '<button class="confirm-btn-cancel ripple-effect" id="syncRestoreOnlyRecords">只恢复记录</button>' +
                    '<button class="check-go-btn ripple-effect" id="syncRestoreAll">恢复配置</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        // ★2026-09-17 防「Promise 永挂」：本弹窗可能被外部 closeOpenModals() 强制移除（用户点别处 / 流程触发）
        //   → 此时也必须 resolve，否则调用方 await 永远挂着、备份静默不导入且无任何提示。
        //   保守取 'records'（不动本机配置）。
        let settled = false;
        let obs = null;
        const done = function (v) {
            if (settled) return;
            settled = true;
            try { if (obs) obs.disconnect(); } catch (e) { /* 忽略 */ }
            try { modal.remove(); } catch (e) { /* 忽略 */ }
            resolve(v);
        };
        obs = new MutationObserver(function () {
            if (!document.body.contains(modal)) done('records');
        });
        try { obs.observe(document.body, { childList: true }); } catch (e) { /* 忽略 */ }
        document.getElementById('syncRestoreOnlyRecords').addEventListener('click', function () { done('records'); });
        document.getElementById('syncRestoreAll').addEventListener('click', function () { done('restore'); });
        modal.addEventListener('click', function (e) { if (e.target === modal) done('records'); });   // 点遮罩 = 保守选择
    });
}

// ★手动导入统一入口：备份带配置就先问一句，再按选择导入
//   （WebDAV 自动下载恢复不经过这里 → 本机配置不受影响）
async function importFullBackupPayloadWithConfigAsk(payload) {
    const cfg = payload && payload.syncConfig;
    if (!cfg || !cfg.server || !cfg.username) {
        await importFullBackupPayload(payload);
        return;
    }
    let choice = 'records';
    try { choice = await askRestoreSyncConfig(cfg); } catch (e) { choice = 'records'; }
    await importFullBackupPayload(payload, { applySyncConfig: choice === 'restore' });
}

// ★2026-08-26 清理：showLoadingMessage/hideLoadingMessage 死代码已删（showLoadingToast 取代）

