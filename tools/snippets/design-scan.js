// tools/snippets/design-scan.js —— 设计一致性扫描（供 tools/designcheck.js 调用）
// 扫「当前页面」所有可见元素的圆角/字体分布；由 designcheck.js 负责切 tab 后多次调用。
function __scanInto(radii, fonts) {
    document.querySelectorAll('*').forEach(function (e) {
        if (!e.getClientRects || e.getClientRects().length === 0) return;
        var cs = getComputedStyle(e);
        var r = cs.borderTopLeftRadius;
        if (r && r !== '0px') {
            if (!radii[r]) radii[r] = { count: 0, sample: [] };
            radii[r].count++;
            if (radii[r].sample.length < 4) {
                var cls = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
                radii[r].sample.push(e.tagName.toLowerCase() + (cls ? '.' + cls : ''));
            }
        }
        var f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        fonts[f] = (fonts[f] || 0) + 1;
    });
}
var radii = {}, fonts = {};
__scanInto(radii, fonts);
return { radii: radii, fonts: fonts, tab: (typeof currentTabId !== 'undefined' ? currentTabId : '?') };
