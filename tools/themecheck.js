// XiXiの徒步小记 · 主题（浅/深）视觉检查（★2026-10-23 从「省电矩阵」改造而来 —— 省电模式已按用户要求删除）
// 背景：E2E 只在「浅色默认态」截图，深色下「时光机山名看不见」这类问题漏掉过。
// 本工具对浅/深两主题各测一遍，断言：
//   ① 弹窗底色保持原值（浅 0.15 / 深 0.32，防误改默认观感）
//   ② 玻璃配方生效（模糊元素 > 0）
//   ③ 弹窗内文字对比度达标（浅 ≥4.0 / 深 ≥3.0）
//   ④ 页面卡片/设置项底色不透明或半透明（不是被误清成 transparent）
// 用法：node tools/themecheck.js   （输出「N 通过 / M 失败」，可被 checkall.sh 采集）
const { chromium } = require('playwright-core');
const http = require('http');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8123/index.html';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); }
}

function serverUp() {
    return new Promise(function (resolve) {
        const req = http.get(BASE, function () { req.destroy(); resolve(true); });
        req.on('error', function () { resolve(false); });
        req.setTimeout(1500, function () { req.destroy(); resolve(false); });
    });
}

const PROBE = `
(function () {
    function pc(c) {
        if (!c) return null;
        var m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        var p = m[1].split(',').map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: (p.length > 3 ? p[3] : 1) };
    }
    function over(f, b) {
        var a = f.a;
        return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 };
    }
    function lum(c) {
        function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function ratio(a, b) {
        var l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function effBg(el, base) {
        var st = [], n = el;
        while (n && n.nodeType === 1) {
            var b = pc(getComputedStyle(n).backgroundColor);
            if (b && b.a > 0.01) st.push(b);
            n = n.parentElement;
        }
        var cur = base;
        for (var i = st.length - 1; i >= 0; i--) cur = over(st[i], cur);
        return cur;
    }
    function baseBg() {
        var b = pc(getComputedStyle(document.body).backgroundColor);
        if (b && b.a > 0.5) return b;
        return document.body.classList.contains('dark-mode')
            ? { r: 11, g: 18, b: 32, a: 1 } : { r: 238, g: 242, b: 247, a: 1 };
    }
    function blurCount() {
        var n = 0, all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var cs = getComputedStyle(all[i]);
            var bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
            if (bf && bf !== 'none') n++;
        }
        return n;
    }
    function minTextContrast(rootSel) {
        var root = document.querySelector(rootSel);
        if (!root) return null;
        var base = baseBg(), worst = 99;
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
            var cs2 = getComputedStyle(el);
            if (cs2.visibility === 'hidden' || parseFloat(cs2.opacity) < 0.1) continue;
            var fg = pc(cs2.color);
            if (!fg || fg.a < 0.1) continue;
            var bg = effBg(el, base);
            var fgs = fg.a < 1 ? over(fg, bg) : fg;
            var r = ratio(fgs, bg);
            if (r < worst) worst = r;
        }
        return worst === 99 ? null : Math.round(worst * 100) / 100;
    }
    function snap() {
        var dlg = document.querySelector('.confirm-modal-content');
        var d = dlg ? pc(getComputedStyle(dlg).backgroundColor) : null;
        var panel = document.querySelector('.glass-panel');
        var item = document.querySelector('.settings-item');
        return {
            blurs: blurCount(),
            dialogA: d ? d.a : null,
            panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
            itemBg: item ? getComputedStyle(item).backgroundColor : null,
            minText: dlg ? minTextContrast('.confirm-modal-content') : null
        };
    }
    var lc = document.getElementById('legalConsentModal');
    if (lc) lc.style.display = 'none';
    try { if (typeof closeOpenModals === 'function') closeOpenModals(true); } catch (e) { }
    document.querySelectorAll('.confirm-modal').forEach(function (m) { m.remove(); });
    switchTab('settings');
    try { if (typeof showDataInfoModal === 'function') showDataInfoModal(); } catch (e) { }

    var light = null, dark = null;
    document.body.classList.remove('dark-mode');
    light = snap();
    document.body.classList.add('dark-mode');
    dark = snap();
    document.body.classList.remove('dark-mode');
    return { light: light, dark: dark };
})()
`;

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

    console.log('== themecheck ==  主题（浅/深）视觉检查');
    console.log('');
    const r = await page.evaluate(PROBE);

    console.log('  ── 实测值 ──');
    ['light', 'dark'].forEach(k => {
        const v = r[k];
        console.log('   ' + k.padEnd(6) + ' 模糊=' + String(v.blurs).padStart(2) +
            ' 弹窗alpha=' + (v.dialogA === null ? 'N/A' : v.dialogA) +
            ' 卡片=' + v.panelBg + ' 设置项=' + v.itemBg +
            (v.minText === null ? '' : ' 最低文字对比=' + v.minText));
    });
    console.log('');
    console.log('  ── 断言 ──');

    // ① 弹窗底色保持原值（防误改默认观感）
    ok('浅色弹窗底 = 原值 0.15', r.light.dialogA !== null && Math.abs(r.light.dialogA - 0.15) < 0.02, '实际 ' + r.light.dialogA);
    ok('深色弹窗底 = 原值 0.32', r.dark.dialogA !== null && Math.abs(r.dark.dialogA - 0.32) < 0.02, '实际 ' + r.dark.dialogA);

    // ② 玻璃配方生效（模糊元素 > 0，两主题都有玻璃）
    ok('浅色：玻璃模糊生效', r.light.blurs > 0, '实际 ' + r.light.blurs);
    ok('深色：玻璃模糊生效', r.dark.blurs > 0, '实际 ' + r.dark.blurs);

    // ③ 弹窗内文字对比度
    ok('浅色弹窗文字对比 ≥ 4.0', r.light.minText === null || r.light.minText >= 4.0, '实际 ' + r.light.minText);
    ok('深色弹窗文字对比 ≥ 3.0', r.dark.minText === null || r.dark.minText >= 3.0, '实际 ' + r.dark.minText);

    // ④ 卡片/设置项底色未被误清
    ok('浅色卡片有底色', r.light.panelBg && r.light.panelBg !== 'transparent', r.light.panelBg);
    ok('深色设置项有底色', r.dark.itemBg && r.dark.itemBg !== 'transparent', r.dark.itemBg);

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
