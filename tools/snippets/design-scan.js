// tools/snippets/design-scan.js —— 设计一致性扫描（供 tools/designcheck.js 调用）
// 扫「当前页面」所有可见元素的：圆角 / 字体 / 玻璃配方(backdrop-filter) / 层级(z-index) 分布。
// designcheck.js 负责切 tab（它把本文件内容拼在 switchTab(...) 之后一起执行），本文件只扫当前页。
//
// ★2026-09-16 五项优化①：原来 designcheck.js 把这段扫描逻辑**内联复制**在自己文件里，
//   本文件成了没人引用的死文件；现在改为「designcheck 读本文件 → 拼 tab 切换 → 执行」，
//   扫描逻辑只有一份（单一事实来源），并新增玻璃配方与层级两个维度。
function __scanAll() {
    var out = { radii: {}, fonts: {}, glass: {}, zIndex: {} };
    function bump(map, key, sel) {
        if (!key) return;
        if (!map[key]) map[key] = { count: 0, sample: [] };
        map[key].count++;
        if (map[key].sample.length < 4 && sel && map[key].sample.indexOf(sel) < 0) map[key].sample.push(sel);
    }
    document.querySelectorAll('*').forEach(function (e) {
        if (!e.getClientRects || e.getClientRects().length === 0) return;
        var cs = getComputedStyle(e);
        var cls = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        var sel = e.tagName.toLowerCase() + (cls ? '.' + cls : '');

        // ① 圆角
        var r = cs.borderTopLeftRadius;
        if (r && r !== '0px') bump(out.radii, r, sel);

        // ② 字体
        var f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        out.fonts[f] = (out.fonts[f] || 0) + 1;

        // ③ 玻璃配方（全站统一 blur 2px + saturate 150%；出现 blur 变大/饱和度漂移即报警）
        var bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
        if (bf && bf !== 'none') bump(out.glass, bf, sel);

        // ④ 层级（z-index 非 auto 的元素，用于核对层叠顺序是否符合规范）
        if (cs.zIndex !== 'auto') bump(out.zIndex, cs.zIndex, sel);
    });
    return out;
}
return __scanAll();
