// 查「数据管理说明」弹窗内对比度偏低的元素（判断是真 bug 还是图标/按钮误报）
return new Promise(function (resolve) {
    setTimeout(function () {
        function pc(c) { if (!c) return null; var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: (p.length > 3 ? p[3] : 1) }; }
        function over(f, b) { var a = f.a; return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 }; }
        function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
        function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
        function effBg(el, base) { var st = [], n = el; while (n && n.nodeType === 1) { var b = pc(getComputedStyle(n).backgroundColor); if (b && b.a > 0.01) st.push(b); n = n.parentElement; } var cur = base; for (var i = st.length - 1; i >= 0; i--) cur = over(st[i], cur); return cur; }

        var lc = document.getElementById('legalConsentModal'); if (lc) lc.style.display = 'none';
        closeOpenModals(true);
        document.querySelectorAll('.confirm-modal').forEach(function (m) { m.remove(); });
        switchTab('settings');
        showDataInfoModal();

        setTimeout(function () {
            var dlg = document.querySelector('.confirm-modal-content');
            if (!dlg) { resolve('无弹窗'); return; }
            var base = pc(getComputedStyle(document.body).backgroundColor) || { r: 238, g: 242, b: 247, a: 1 };
            var all = dlg.querySelectorAll('*'), bad = [];
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
                if (r < 4.2) {
                    var inBtn = !!el.closest('button');
                    bad.push({ r: Math.round(r * 100) / 100, txt: (el.textContent || '').trim().slice(0, 14), cls: (el.className || '').toString().slice(0, 24), color: cs.color, size: cs.fontSize, btn: inBtn });
                }
            }
            bad.sort(function (a, b) { return a.r - b.r; });
            var out = ['弹窗内 <4.2 共 ' + bad.length + ' 个：'];
            bad.slice(0, 8).forEach(function (b) {
                out.push('   ' + b.r + '  "' + b.txt + '"  ' + b.color + ' ' + b.size + '  class=' + b.cls + (b.btn ? ' ←按钮' : ''));
            });
            resolve(out.join('\n'));
        }, 500);
    }, 1400);
});
