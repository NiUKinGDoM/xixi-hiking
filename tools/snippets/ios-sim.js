/* iOS 网页版模拟探测（供 tools/ioscheck.js 调用）
 * 目的：在「无原生桥 + 无 navigator.vibrate」环境下跑一遍所有平台差异能力，
 *       确认每个入口都走降级路径、不抛异常、不出现「点了没反应」。
 * 说明：沙箱 Chrome 本身无 XixiFileBridge，天然接近网页版；此处再屏蔽 vibrate
 *       并把 UA 伪装成 iPhone，尽量贴近 iOS Safari。
 */
var out = {};
try {
    Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        configurable: true
    });
} catch (e) { out['UA伪装'] = '失败'; }

// iOS Safari 无 navigator.vibrate —— 从原型链上屏蔽，尽量贴近真机
try {
    Object.defineProperty(Navigator.prototype, 'vibrate', {
        get: function () { return undefined; }, configurable: true
    });
} catch (e) { out['vibrate屏蔽'] = '失败:' + e.message; }

out['有原生桥'] = !!window.XixiFileBridge;
out['navigator.vibrate'] = String(typeof navigator.vibrate);

var errs = [];
window.addEventListener('error', function (e) { errs.push(String(e && e.message).slice(0, 70)); });

function T(name, fn) {
    try { fn(); out[name] = 'ok'; }
    catch (e) { out[name] = 'ERR:' + String(e && e.message).slice(0, 60); }
}

// ① 震动（iOS 无 vibrate → 应静默跳过、不抛错）
T('①震动降级', function () { if (typeof triggerHaptic === 'function') triggerHaptic(); });

// ② 系统通知（网页版无通知栏 → 应降级为 toast 而非报错）
T('②通知降级', function () { if (typeof showSystemNotification === 'function') showSystemNotification('探测', '内容'); });

// ③ 更新判定：无桥 = 网页版 → 必须走「网页版无需更新」分支，绝不去下载 APK
out['③更新判定函数'] = typeof checkForUpdate === 'function';
out['③有下载桥'] = !!(window.XixiFileBridge && typeof window.XixiFileBridge.downloadAndInstall === 'function');
out['③判定结果'] = out['③有下载桥'] ? '会走下载分支（异常）' : '走网页版分支（正确）';
T('③调用检查更新', function () { if (typeof checkForUpdate === 'function') checkForUpdate(); });

// ④ 导出备份（无桥应走 a[download]；iOS 下应提示长按）
var backupLen = 0;
T('④导出备份', function () {
    if (typeof buildFullBackupPayload === 'function' && typeof buildBackupHTMLString === 'function') {
        backupLen = String(buildBackupHTMLString(buildFullBackupPayload()) || '').length;
    }
});
out['④备份HTML长度'] = backupLen;

// ⑤ iOS 判定函数（决定下载类功能走「长按保存」还是 a[download]）
out['⑤isIOSWebview'] = typeof isIOSWebview === 'function' ? isIOSWebview() : '函数缺失';
out['⑤分享卡降级链'] = typeof shareCardImage === 'function' ? '存在' : '缺失';

// ⑥ 四个页面渲染均无异常
['overview', 'records', 'plans', 'settings'].forEach(function (t) {
    T('⑥页面:' + t, function () { switchTab(t); });
});

// ⑦ 收款码（无桥应走长按提示，非报错）
T('⑦收款码降级', function () {
    if (typeof showInfoMessage === 'function') showInfoMessage('长按二维码图片即可保存到相册');
});

out['未捕获错误数'] = errs.length;
out['未捕获错误'] = errs.slice(0, 3);
return JSON.stringify(out);
