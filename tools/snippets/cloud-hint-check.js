/* tools/snippets/cloud-hint-check.js —— iOS PWA 云备份提示条（TASK_iOS-PWA 二期）验收
 * 用法：node e2e/inspect.js --file tools/snippets/cloud-hint-check.js
 * 验三种状态：① 非 PWA 不显示 ② PWA + 未配置 → 显示 ③ PWA + 已配置 → 隐藏
 * 跑完恢复原配置，不留副作用。最后一行必须是表达式（inspect 取它的值）。 */
var __el = document.getElementById('cloudBackupHint');
var __out = {};
if (!__el) { __out = { error: 'cloudBackupHint 元素不存在' }; } else {
    var __raw = null;
    try { __raw = AppStore.getItem(SYNC_CONFIG_KEY); } catch (e) {}

    Object.defineProperty(navigator, 'standalone', { get: function () { return false; }, configurable: true });
    window.refreshCloudHint();
    __out.nonPwa = __el.style.display;

    Object.defineProperty(navigator, 'standalone', { get: function () { return true; }, configurable: true });
    AppStore.setItem(SYNC_CONFIG_KEY, { server: '', username: '', password: '' });
    window.refreshCloudHint();
    __out.pwaNoConfig = __el.style.display;

    AppStore.setItem(SYNC_CONFIG_KEY, { server: 'https://dav.jianguoyun.com/dav/', username: 'u', password: 'p' });
    window.refreshCloudHint();
    __out.pwaConfigured = __el.style.display;

    try {
        if (__raw) AppStore.setItem(SYNC_CONFIG_KEY, __raw);
        else AppStore.setItem(SYNC_CONFIG_KEY, { server: '', username: '', password: '' });
    } catch (e) {}
    window.refreshCloudHint();

    __out.pass = (__out.nonPwa === 'none' && __out.pwaNoConfig === 'flex' && __out.pwaConfigured === 'none');
}
console.log('CLOUD_HINT_RESULT ' + JSON.stringify(__out))
