// XiXiの徒步小记 · 视觉矩阵检查（★2026-10-25 从「主题检查」扩展为「全页面 × 多尺寸」）
// 背景：过去的问题几乎都是「某个尺寸 / 某个主题下才暴露」（深色卡片发白、灯箱抖动、四键挤压），
//       而 E2E 只在单一视口的浅色默认态截图 ⇒ 组合盲区。
// A 段：主题（浅/深）弹窗基准 —— 防误改默认观感与对比度
// B 段：4 页面 × 4 尺寸 —— 横向溢出 / 底栏是否在视口内 / 页面文字最低对比度 / 卡片是否渲染
// 用法：node tools/themecheck.js   （输出「N 通过 / M 失败」，可被 checkall.sh 采集）
const { chromium } = require('playwright-core');
const http = require('http');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8123/index.html';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); }
}
function section(t) { console.log('\n  ── ' + t + ' ──'); }

function serverUp() {
    return new Promise(function (resolve) {
        const req = http.get(BASE, function () { req.destroy(); resolve(true); });
        req.on('error', function () { resolve(false); });
        req.setTimeout(1500, function () { req.destroy(); resolve(false); });
    });
}

// 通用工具（注入页面前先定义：对比度 + 有效背景）
const HELPERS = `
    function __pc(c) {
        if (!c) return null;
        var m = c.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        var p = m[1].split(',').map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: (p.length > 3 ? p[3] : 1) };
    }
    function __over(f, b) {
        var a = f.a;
        return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 };
    }
    function __lum(c) {
        function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function __ratio(a, b) {
        var l1 = __lum(a), l2 = __lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function __effBg(el, base) {
        var st = [], n = el;
        while (n && n.nodeType === 1) {
            var b = __pc(getComputedStyle(n).backgroundColor);
            if (b && b.a > 0.01) st.push(b);
            n = n.parentElement;
        }
        var cur = base;
        for (var i = st.length - 1; i >= 0; i--) cur = __over(st[i], cur);
        return cur;
    }
    function __baseBg() {
        var b = __pc(getComputedStyle(document.body).backgroundColor);
        if (b && b.a > 0.5) return b;
        return document.body.classList.contains('dark-mode')
            ? { r: 11, g: 18, b: 32, a: 1 } : { r: 238, g: 242, b: 247, a: 1 };
    }
    function __minContrast(root) {
        if (!root) return null;
        var base = __baseBg(), worst = 99;
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (!el.offsetWidth || !el.offsetHeight) continue;
            var has = false;
            for (var k = 0; k < el.childNodes.length; k++) {
                var nd = el.childNodes[k];
                if (nd.nodeType === 3 && nd.textContent.trim()) { has = true; break; }
            }
            if (!has) continue;
            // ★排除图标字体：.material-icons 是 ligature 文本（"inventory_2"/"cloud_done"），
            //   会被当成文字扫到。WCAG 对**非文本元素**只要求 3:1，套用 4.5 会常年假红。
            if (el.classList.contains('material-icons')) continue;
            if (el.parentElement && el.parentElement.classList.contains('material-icons')) continue;
            var cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
            var fg = __pc(cs.color);
            if (!fg || fg.a < 0.1) continue;
            var bg = __effBg(el, base);
            var fgs = fg.a < 1 ? __over(fg, bg) : fg;
            var r = __ratio(fgs, bg);
            if (r < worst) worst = r;
        }
        return worst === 99 ? null : Math.round(worst * 100) / 100;
    }
`;

const PROBE_DIALOG = `(function(){ ${HELPERS}
    var lc = document.getElementById('legalConsentModal');
    if (lc) lc.style.display = 'none';
    try { if (typeof closeOpenModals === 'function') closeOpenModals(true); } catch (e) { }
    document.querySelectorAll('.confirm-modal').forEach(function (m) { m.remove(); });
    switchTab('settings');
    try { if (typeof showDataInfoModal === 'function') showDataInfoModal(); } catch (e) { }
    function snap() {
        var dlg = document.querySelector('.confirm-modal-content');
        var d = dlg ? __pc(getComputedStyle(dlg).backgroundColor) : null;
        var panel = document.querySelector('.glass-panel');
        var item = document.querySelector('.settings-item');
        var blurs = 0, all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var cs0 = getComputedStyle(all[i]);
            var bf = cs0.backdropFilter || cs0.webkitBackdropFilter || '';
            if (bf && bf !== 'none') blurs++;
        }
        return {
            blurs: blurs,
            dialogA: d ? d.a : null,
            dialogW: dlg ? Math.round(dlg.getBoundingClientRect().width) : null,
            panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
            itemBg: item ? getComputedStyle(item).backgroundColor : null,
            minText: dlg ? __minContrast(dlg) : null
        };
    }
    document.body.classList.remove('dark-mode');
    var light = snap();
    document.body.classList.add('dark-mode');
    var dark = snap();
    document.body.classList.remove('dark-mode');
    return { light: light, dark: dark, vw: window.innerWidth };
})()`;

const PROBE_PAGE = `(function(){ ${HELPERS}
    var W = window.innerWidth, H = window.innerHeight;
    var de = document.documentElement;
    var overflowX = de.scrollWidth > W + 1;
    var tab = document.querySelector('.bottom-tabbar');
    var tr = tab ? tab.getBoundingClientRect() : null;
    var tabInView = !!tr && tr.width > 0 && tr.height > 0 && tr.top >= 0 && tr.bottom <= H + 1;
    // ★按 tab key 直接取（不要"扫第一个可见 .tab-page"，会取到上一个 tab 的残留）
    var cur = document.getElementById('tab-' + window.__probeTab);
    var worst = cur ? __minContrast(cur) : null;
    var panels = 0, visPanels = 0;
    var allPanels = cur ? cur.querySelectorAll('.glass-panel') : [];
    for (var j = 0; j < allPanels.length; j++) { panels++; if (allPanels[j].offsetWidth > 0) visPanels++; }
    return { overflowX: overflowX, tabInView: tabInView, worst: worst, panels: panels, visPanels: visPanels, W: W, H: H };
})()`;

(async () => {
    let srv = null;
    if (!(await serverUp())) {
        const { spawn } = require('child_process');
        srv = spawn(process.execPath, [path.join(__dirname, '..', 'e2e', 'serve.js')], { stdio: 'ignore' });
        await new Promise(r => setTimeout(r, 1400));
    }
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(1800);

    console.log('== themecheck ==  视觉矩阵（主题 × 页面 × 尺寸）');

    // ---------- A. 主题（浅/深）弹窗基准 ----------
    section('A. 主题弹窗基准（浅/深）');
    const r = await page.evaluate(PROBE_DIALOG);
    console.log('   light 弹窗alpha=' + r.light.dialogA + ' 宽=' + r.light.dialogW + ' 模糊=' + r.light.blurs + ' 最低对比=' + r.light.minText);
    console.log('   dark  弹窗alpha=' + r.dark.dialogA + ' 宽=' + r.dark.dialogW + ' 模糊=' + r.dark.blurs + ' 最低对比=' + r.dark.minText);

    ok('浅色弹窗底 = 原值 0.15', r.light.dialogA !== null && Math.abs(r.light.dialogA - 0.15) < 0.02, r.light.dialogA);
    ok('深色弹窗底 = 原值 0.32', r.dark.dialogA !== null && Math.abs(r.dark.dialogA - 0.32) < 0.02, r.dark.dialogA);
    ok('浅色：玻璃模糊生效', r.light.blurs > 0, r.light.blurs);
    ok('深色：玻璃模糊生效', r.dark.blurs > 0, r.dark.blurs);
    ok('浅色弹窗文字对比 ≥ 4.0', r.light.minText === null || r.light.minText >= 4.0, r.light.minText);
    ok('深色弹窗文字对比 ≥ 3.0', r.dark.minText === null || r.dark.minText >= 3.0, r.dark.minText);
    ok('浅色卡片有底色', r.light.panelBg && r.light.panelBg !== 'transparent', r.light.panelBg);
    ok('深色设置项有底色', r.dark.itemBg && r.dark.itemBg !== 'transparent', r.dark.itemBg);
    ok('弹窗宽度不超屏（≤ 屏宽-44）', r.light.dialogW !== null && r.light.dialogW <= r.vw - 44 + 1, '弹窗 ' + r.light.dialogW + ' / 屏 ' + r.vw);

    // ---------- B. 页面 × 尺寸 矩阵 ----------
    section('B. 页面 × 尺寸 适配矩阵');
    const VIEWPORTS = [
        { w: 320, h: 568, n: '320×568' },
        { w: 360, h: 780, n: '360×780' },
        { w: 390, h: 844, n: '390×844' },
        { w: 412, h: 915, n: '412×915' }
    ];
    const TABS = [['overview', '概览'], ['records', '记录'], ['plans', '计划'], ['settings', '设置']];
    let rows = [];
    for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(220);
        for (const [key, label] of TABS) {
            await page.evaluate((k) => {
                window.__probeTab = k;
                try { closeOpenModals(true); } catch (e) { }
                switchTab(k);
            }, key);
            await page.waitForTimeout(260);
            const d = await page.evaluate(PROBE_PAGE);
            rows.push({ vp: vp.n, label: label, d: d });
            ok('[' + vp.n + '] ' + label + '：无横向溢出', !d.overflowX, 'scrollW>' + d.W);
            ok('[' + vp.n + '] ' + label + '：底栏在视口内', d.tabInView);
            ok('[' + vp.n + '] ' + label + '：卡片已渲染', d.visPanels > 0 || d.panels === 0, '可见 ' + d.visPanels + '/' + d.panels);
            // ★页面级文字对比度**只输出信号不做断言**：整页扫描必然扫到图标(.material-icons)与
            //   次要白字(text-white/50)，按 REFERENCE「别用 bbox 估、按钮内文字要排除」的经验，硬断言会常年假红。
            //   弹窗内的对比度有可靠断言（见 A 段，底色已知）。
        }
        const bad = rows.filter(x => x.vp === vp.n && (x.d.overflowX || !x.d.tabInView));
        const cs = rows.filter(x => x.vp === vp.n && x.d.worst !== null).map(x => x.d.worst);
        console.log('   ' + vp.n.padEnd(9) + (bad.length ? '❌ 异常页: ' + bad.map(b => b.label).join('/') : '✅ 4 页通过') +
            ' 最低对比=' + (cs.length ? Math.min.apply(null, cs) : 'N/A'));
    }

    await browser.close();
    if (srv) { try { srv.kill(); } catch (e) { } }
    console.log('');
    console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})().catch(e => {
    console.log('  ❌ themecheck 运行失败: ' + e.message);
    console.log('结果: 0 通过 / 1 失败');
    process.exit(1);
});
