/* tools/snippets/perf-check.js —— 流畅度体检（★2026-09-16 五项优化③新增）
 * 用 e2e/inspect.js 在真实浏览器里跑，逐页测量：
 *   ① rAF 帧间隔 → 平均 FPS / p95 帧耗时 / 掉帧数（>32ms，约等于掉 2 帧以上）
 *   ② PerformanceObserver('longtask') → 长任务条数与总时长（主线程卡顿根因）
 *   ③ 运行中的动画数、其中「不在视口内」的数量（白烧 GPU 的动画）
 *   ④ 合成层压力：backdrop-filter / will-change / 运行中 animation 的元素数
 *   ⑤ DOM 节点数、滚动一次记录列表的帧表现
 * 用法：node e2e/inspect.js --file tools/snippets/perf-check.js
 */
function __frames(dur) {
    return new Promise(function (resolve) {
        var arr = [], last = performance.now(), t0 = last;
        function step(t) { arr.push(t - last); last = t; if (t - t0 < dur) requestAnimationFrame(step); else resolve(arr); }
        requestAnimationFrame(step);
    });
}
function __stats(frames) {
    if (!frames.length) return { n: 0 };
    var sorted = frames.slice().sort(function (a, b) { return a - b; });
    var p = function (q) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]; };
    var sum = frames.reduce(function (a, b) { return a + b; }, 0);
    return {
        n: frames.length,
        fps: Math.round(1000 / (sum / frames.length) * 10) / 10,
        avg: Math.round(sum / frames.length * 10) / 10,
        p95: Math.round(p(0.95) * 10) / 10,
        worst: Math.round(sorted[sorted.length - 1] * 10) / 10,
        jank: frames.filter(function (f) { return f > 32; }).length,
    };
}
function __bigFrames(frames) {
    // 把 >50ms 的帧挑出来（掉 3 帧以上，用户能明显感到卡）
    return frames.filter(function (f) { return f > 50; }).map(function (f) { return Math.round(f); });
}

var longTasks = [];
try {
    new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) { longTasks.push(Math.round(e.duration)); });
    }).observe({ entryTypes: ['longtask'] });
} catch (e) { longTasks.push(-1); }

var tabs = ['overview', 'records', 'plans', 'settings'];
var out = { tabs: {}, longTasks: null, anim: null, layers: null, dom: null };

return (async function () {
    for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        try { switchTab(t); } catch (e) {}
        await new Promise(function (r) { setTimeout(r, 350); });
        var f = await __frames(1400);
        var r = __stats(f);
        r.bigFrames = __bigFrames(f);

        // 该页运行中的动画：总量 + 视口外的（白烧）
        var anims = [];
        try { anims = document.getAnimations(); } catch (e) { anims = []; }
        var offscreen = 0;
        anims.forEach(function (a) {
            var el = a.effect && a.effect.target;
            if (!el || !el.getBoundingClientRect) return;
            var b = el.getBoundingClientRect();
            if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) offscreen++;
        });
        r.anims = anims.length;
        r.animsOffscreen = offscreen;
        out.tabs[t] = r;
    }

    // 记录页滚动帧表现（列表最长的页面）
    try { switchTab('records'); } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 300); });
    var scroller = document.querySelector('#recordsTable') || document.querySelector('.container') || document.body;
    var frames = [], last = performance.now(), t0 = last, y = 0;
    var scrollP = new Promise(function (resolve) {
        function step(t) {
            frames.push(t - last); last = t;
            y += 60;
            scrollTo(0, y);
            if (t - t0 < 1000) requestAnimationFrame(step); else resolve();
        }
        requestAnimationFrame(step);
    });
    await scrollP;
    out.scroll = __stats(frames);

    // 合成层/合成压力面
    var all = document.querySelectorAll('*');
    var bf = 0, wc = 0, anim = 0;
    all.forEach(function (e) {
        var cs = getComputedStyle(e);
        if (cs.backdropFilter && cs.backdropFilter !== 'none') bf++;
        if (cs.willChange && cs.willChange !== 'auto') wc++;
        if (cs.animationName && cs.animationName !== 'none') anim++;
    });
    out.layers = { backdropFilter: bf, willChange: wc, animated: anim };
    out.dom = { nodes: all.length };
    out.longTasks = longTasks;
    try { switchTab('overview'); } catch (e) {}
    return JSON.stringify(out);
})();
