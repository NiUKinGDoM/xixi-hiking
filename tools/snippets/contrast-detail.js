// 列出页面里对比度最低的 6 个元素，判断是误报还是真问题
return new Promise(function (resolve) {
    setTimeout(function () {
        var out = [];
        function pc(c) { if (!c) return null; var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: (p.length > 3 ? p[3] : 1) }; }
        function over(f, b) { var a = f.a; return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 }; }
        function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
        function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
        function effBg(el, base) { var st = [], n = el; while (n && n.nodeType === 1) { var b = pc(getComputedStyle(n).backgroundColor); if (b && b.a > 0.01) st.push(b); n = n.parentElement; } var cur = base; for (var i = st.length - 1; i >= 0; i--) cur = over(st[i], cur); return cur; }
        function baseBg() { var b = pc(getComputedStyle(document.body).backgroundColor); if (b && b.a > 0.5) return b; return { r: 238, g: 242, b: 247, a: 1 }; }

        ['records', 'overview'].forEach(function (tab) {
            switchTab(tab);
            var base = baseBg();
            var pages = document.querySelectorAll('.tab-page');
            var cur = null;
            for (var i = 0; i < pages.length; i++) { if (pages[i].offsetWidth > 0 && getComputedStyle(pages[i]).display !== 'none') { cur = pages[i]; break; } }
            if (!cur) { out.push(tab + ': 无可见 tab'); return; }
            var all = cur.querySelectorAll('*'), bad = [];
            for (var j = 0; j < all.length; j++) {
                var el = all[j];
                if (!el.offsetWidth || !el.offsetHeight) continue;
                var has = false;
                for (var k = 0; k < el.childNodes.length; k++) { var nd = el.childNodes[k]; if (nd.nodeType === 3 && nd.textContent.trim()) { has = true; break; } }
                if (!has) continue;
                var cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
                var fg = pc(cs.color); if (!fg || fg.a < 0.1) continue;
                var bg = effBg(el, base);
                var r = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
                if (r < 3.0) {
                    var inBtn = !!el.closest('button, .glass-btn, .check-go-btn, .confirm-btn-cancel');
                    bad.push({ r: Math.round(r * 100) / 100, txt: (el.textContent || '').trim().slice(0, 10), cls: (el.className || '').toString().slice(0, 26), btn: inBtn });
                }
            }
            bad.sort(function (a, b) { return a.r - b.r; });
            out.push('[' + tab + '] 低于3.0共 ' + bad.length + ' 个，最低5个:');
            bad.slice(0, 5).forEach(function (b) {
                out.push('    ' + b.r + '  "' + b.txt + '"  class=' + b.cls + (b.btn ? '  ←按钮内(误报)' : ''));
            });
        });
        resolve(out.join('\n'));
    }, 1400);
});
