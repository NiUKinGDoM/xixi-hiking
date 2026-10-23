// XiXiの徒步小记 · 主题×省电 矩阵检查（★2026-10-23 新增，补 E2E 的盲区）
// 背景：E2E 只在「默认状态」截图，省电模式 0 覆盖 ⇒ 深色卡片发白 / 弹窗穿透 这类问题全都漏掉。
// 本工具把「主题(浅/深) × 省电(关/开)」四个组合都跑一遍，用**可量化的业务指标**做断言：
//   ① 省电开时 backdrop-filter 必须全为 none（功能真的生效）
//   ② 省电开关不应改变页面卡片底色（防 --glass-alpha 被误改 → 深色发白）
//   ③ 省电开时弹窗必须接近不透明（防「半透穿透」）
//   ④ 省电关时弹窗必须保持原值（防误改默认观感）
// 用法：node tools/themecheck.js   （输出「N 通过 / M 失败」，可被 checkall.sh 直接采集）
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

// 页面内探针：四个组合各测一遍，返回结构化数据（不在这里做断言）
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
            dialogRgb: d ? [Math.round(d.r), Math.round(d.g), Math.round(d.b)].join(',') : null,
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

    var res = {};
    var combos = [
        ['lightOff', false, false], ['lightOn', false, true],
        ['darkOff', true, false], ['darkOn', true, true]
    ];
    for (var i = 0; i < combos.length; i++) {
        document.body.classList.toggle('dark-mode', combos[i][1]);
        document.body.classList.toggle('power-save', combos[i][2]);
        res[combos[i][0]] = snap();
    }
    document.body.classList.remove('power-save');
    document.body.classList.remove('dark-mode');
    return res;
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

    console.log('== themecheck ==  主题 × 省电 矩阵');
    console.log('');
    // ★playwright 的 evaluate 可直接吃「表达式字符串」——不要用 new Function 包（会依赖 toString，且容易序列化失败）
    const r = await page.evaluate(PROBE);

    console.log('  ── 实测值 ──');
    ['lightOff', 'lightOn', 'darkOff', 'darkOn'].forEach(k => {
        const v = r[k];
        console.log('   ' + k.padEnd(9) + ' 模糊=' + String(v.blurs).padStart(2) +
            ' 弹窗alpha=' + (v.dialogA === null ? 'N/A' : v.dialogA) +
            ' 卡片=' + v.panelBg + ' 设置项=' + v.itemBg +
            (v.minText === null ? '' : ' 最低文字对比=' + v.minText));
    });
    console.log('');
    console.log('  ── 断言 ──');

    // ① 省电模式必须真的关掉模糊
    ok('省电关：模糊元素 > 0（玻璃配方生效）', r.lightOff.blurs > 0, '实际 ' + r.lightOff.blurs);
    ok('省电开：模糊元素 = 0（真的关掉了）', r.lightOn.blurs === 0, '实际 ' + r.lightOn.blurs);
    ok('省电开：深色下模糊也为 0', r.darkOn.blurs === 0, '实际 ' + r.darkOn.blurs);

    // ② 省电开关不得改变页面卡片底色（防 --glass-alpha 被误改 → 深色发白）
    ok('浅色：省电开关不改变卡片底色', r.lightOff.panelBg === r.lightOn.panelBg, r.lightOff.panelBg + ' → ' + r.lightOn.panelBg);
    ok('深色：省电开关不改变卡片底色', r.darkOff.panelBg === r.darkOn.panelBg, r.darkOff.panelBg + ' → ' + r.darkOn.panelBg);
    ok('浅色：省电开关不改变设置项底色', r.lightOff.itemBg === r.lightOn.itemBg, r.lightOff.itemBg + ' → ' + r.lightOn.itemBg);
    ok('深色：省电开关不改变设置项底色', r.darkOff.itemBg === r.darkOn.itemBg, r.darkOff.itemBg + ' → ' + r.darkOn.itemBg);

    // ③ 省电开时弹窗必须接近不透明（否则背后文字穿透）
    ok('浅色·省电开：弹窗 alpha ≥ 0.95（不穿透）', r.lightOn.dialogA !== null && r.lightOn.dialogA >= 0.95, '实际 ' + r.lightOn.dialogA);
    ok('深色·省电开：弹窗 alpha ≥ 0.95（不穿透）', r.darkOn.dialogA !== null && r.darkOn.dialogA >= 0.95, '实际 ' + r.darkOn.dialogA);

    // ④ 省电关时必须保持原设计值（0.15 白 / 0.32 深蓝）
    ok('浅色·省电关：弹窗仍为原值 0.15', r.lightOff.dialogA !== null && Math.abs(r.lightOff.dialogA - 0.15) < 0.02, '实际 ' + r.lightOff.dialogA);
    ok('深色·省电关：弹窗仍为原值 0.32', r.darkOff.dialogA !== null && Math.abs(r.darkOff.dialogA - 0.32) < 0.02, '实际 ' + r.darkOff.dialogA);

    // ⑤ 省电开时弹窗内文字对比度（信号，允许图标略低）
    ok('浅色·省电开：弹窗内文字对比 ≥ 4.0', r.lightOn.minText === null || r.lightOn.minText >= 4.0, '实际 ' + r.lightOn.minText);
    ok('深色·省电开：弹窗内文字对比 ≥ 3.0', r.darkOn.minText === null || r.darkOn.minText >= 3.0, '实际 ' + r.darkOn.minText);

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
