/* e2e/inspect.js 用的巡检片段：检查"断网时页面是否还完整"
 * 用法：
 *   node e2e/inspect.js --file tools/snippets/offline-check.js            （在线）
 *   node e2e/inspect.js --file tools/snippets/offline-check.js --offline  （模拟断网）
 */
function info(sel, props) {
    var e = document.querySelector(sel);
    if (!e) return 'no-el';
    var c = getComputedStyle(e), o = {};
    props.forEach(function (p) { o[p] = c[p]; });
    return o;
}
var icon = document.querySelector('.material-icons');
return {
    // ① 图标字体是否可用（断网时曾整片失效）
    iconFontReady: (function () { try { return document.fonts.check('24px "Material Icons"'); } catch (e) { return 'err'; } })(),
    iconFontFamily: icon ? getComputedStyle(icon).fontFamily : 'no-icon-el',
    iconSample: icon ? (icon.textContent || '').trim().slice(0, 20) : '',
    // ② 关键布局（Tailwind 运行时若挂，这些最先崩）
    bottomBar: info('#bottomTabBar', ['display', 'position', 'height']),
    statGrid: info('div.grid.gap-3', ['display', 'gridTemplateColumns', 'gap']),
    statCard: info('.stat-card, .ov-card', ['display', 'padding', 'borderRadius']),
    settings: info('.settings-group, .settings-card', ['display', 'padding']),
    // ③ 四类提示（颜色/位置/内边距）
    toast: (function () {
        try {
            showInfoMessage('测试信息', 600000);
            showLoadingToast('正在打包…');
            var i = document.querySelector('.info-message'), ic = getComputedStyle(i), ir = i.getBoundingClientRect();
            var infoBg = ic.backgroundColor, infoPad = ic.paddingLeft + '/' + ic.paddingRight, infoZ = ic.zIndex;
            var infoW = Math.round(ir.width), infoOnScreen = ir.top >= 0 && ir.bottom <= 844;
            var l = document.querySelector('.toast-glass.loading');
            var lbg = 'no-el', lz = 'no-el', lcls = 'no-el';
            // ⚠ getComputedStyle 返回 live 对象：必须在元素移除前把值读成字符串快照
            if (l) { var lc = getComputedStyle(l); lbg = lc.backgroundColor; lz = lc.zIndex; lcls = l.className; }
            if (typeof hideLoadingToast === 'function') hideLoadingToast();
            return {
                infoBg: infoBg, infoPad: infoPad, infoZ: infoZ,
                infoW: infoW, infoOnScreen: infoOnScreen,
                loadingClass: lcls,
                loadingBg: lbg,
                loadingZ: lz,
                sameRecipe: lbg === infoBg
            };
        } catch (e) { return 'err:' + e.message; }
    })(),
    // ④ 页面基本渲染
    bodyBg: getComputedStyle(document.body).backgroundColor,
    docH: document.documentElement.scrollHeight,
    hasBackdrop: getComputedStyle(document.body).backdropFilter
};
