// XiXiの徒步小记 · 地基压测（★2026-10-26 新增，把一次性排查固化成门禁）
// 覆盖四类「平时看不出来、出事才要命」的问题：
//   A 泄漏：反复开关弹窗/切页/灯箱，DOM 节点不得持续增长
//   B 性能：500/1000 条记录下渲染与切页必须够快（分页生效）
//   C 边界：空数据 / 缺字段 / null photos / 非法日期 / 超长文本 不得崩
//   D 安全：XSS 注入必须被转义；错误捕获真的能把错误存进崩溃队列
// 用法：node tools/stresscheck.js  （输出「N 通过 / M 失败」，可被 checkall.sh 采集）
const { chromium } = require('playwright-core');
const http = require('http');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8123/index.html';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) pass++;
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

const PROBE_LEAK = `(function(){
    function n(){ return document.querySelectorAll('*').length; }
    var base = n();
    for (var i=0;i<30;i++){
        try{ showDataInfoModal(); }catch(e){}
        try{ closeOpenModals(true); }catch(e){}
        try{ document.querySelectorAll('.confirm-modal').forEach(function(m){m.remove();}); }catch(e){}
    }
    var afterModal = n() - base;
    var tabs=['overview','records','plans','settings'];
    for (var j=0;j<40;j++){ try{ switchTab(tabs[j%4]); }catch(e){} }
    var afterTab = n() - base;
    for (var k=0;k<20;k++){
        try{ ensureLightbox(); photoLightboxEl.style.display='block'; }catch(e){}
        try{ if(typeof closePhotoLightbox==='function') closePhotoLightbox(); }catch(e){}
    }
    var afterLb = n() - base;
    var lbCount = document.querySelectorAll('#photoLightbox').length;
    return { base: base, afterModal: afterModal, afterTab: afterTab, afterLb: afterLb, lbCount: lbCount };
})()`;

const PROBE_PERF = `(function(){
    var backup = records.slice();
    function mk(n){ var a=[]; for(var i=0;i<n;i++){ var d=new Date(Date.now()-i*86400000*3);
        a.push({id:'perf'+i,name:'测试山'+i,distance:5,duration:90,elevation:800,difficulty:2,
        createdAt:d.toISOString(),updatedAt:d.toISOString(),photos:[]}); } return a; }
    function t(fn){ var t0=performance.now(); try{ fn(); }catch(e){ return -1; } return Math.round(performance.now()-t0); }
    var r={};
    [500,1000].forEach(function(n){
        records = mk(n);
        r['list'+n] = t(function(){ renderTable(); });
        r['tab'+n] = t(function(){ switchTab('plans'); switchTab('records'); });
        r['mtn'+n] = t(function(){ recordsViewMode='mountain'; renderMountainBook(); recordsViewMode='list'; });
    });
    records = backup;
    try{ renderTable(); }catch(e){}
    return r;
})()`;

const PROBE_EDGE = `(function(){
    var out = {}, backup = records.slice();
    function safe(label, fn){ try{ fn(); out[label]='ok'; }catch(e){ out[label]='CRASH:'+e.message; } }
    records = [];
    safe('empty_list', function(){ renderTable(); });
    safe('empty_mtn', function(){ recordsViewMode='mountain'; renderMountainBook(); recordsViewMode='list'; });
    safe('empty_otd', function(){ renderOnThisDay(); });
    records = [{ id:'x1', createdAt:new Date().toISOString() }];
    safe('no_fields', function(){ renderTable(); });
    records = [{ id:'x2', name:'A', photos:null, createdAt:'not-a-date', distance:'NaN' }];
    safe('null_photos', function(){ renderTable(); });
    records = [{ id:'x3', name:'山'.repeat(500), createdAt:new Date().toISOString(), distance:5 }];
    safe('long_name', function(){ renderTable(); });
    // XSS
    var payload = '<img src=x onerror="window.__XSS_HIT=1">';
    records = [{ id:'x4', name:payload, mood:payload, weather:payload, createdAt:new Date().toISOString(), distance:5 }];
    window.__XSS_HIT = 0;
    try{ renderTable(); }catch(e){}
    try{ recordsViewMode='mountain'; renderMountainBook(); recordsViewMode='list'; }catch(e){}
    try{ renderOnThisDay(); }catch(e){}
    out.xss = window.__XSS_HIT ? 'HIT' : 'escaped';
    records = backup;
    try{ renderTable(); }catch(e){}
    return out;
})()`;

const PROBE_ERRCAP = `(function(){
    try{ window.__clearCrashQueue(); }catch(e){}
    var before = (window.__getCrashQueue()||[]).length;
    // 制造一个未捕获错误
    setTimeout(function(){ throw new Error('stresscheck-fake-error'); }, 0);
    return { before: before };
})()`;

const PROBE_ERRCAP2 = `(function(){
    var q = (window.__getCrashQueue()||[]);
    return { count: q.length, hit: q.some(function(x){ return String(x.msg||'').indexOf('stresscheck-fake-error')>=0; }), logs: (window.__diagLogs||[]).length };
})()`;

(async () => {
    let srv = null;
    if (!(await serverUp())) {
        const { spawn } = require('child_process');
        srv = spawn(process.execPath, [path.join(__dirname, '..', 'e2e', 'serve.js')], { stdio: 'ignore' });
        await new Promise(r => setTimeout(r, 1400));
    }
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', () => { });   // 故意制造的错误，属预期
    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(1800);

    console.log('== stresscheck ==  地基压测（泄漏 / 性能 / 边界 / 安全）');

    section('A. 泄漏（反复操作后 DOM 节点不得持续增长）');
    const leak = await page.evaluate(PROBE_LEAK);
    console.log('   基线 ' + leak.base + ' 节点 → 弹窗×30 ' + (leak.afterModal >= 0 ? '+' : '') + leak.afterModal +
        ' / 切页×40 ' + (leak.afterTab >= 0 ? '+' : '') + leak.afterTab + ' / 灯箱×20 ' + (leak.afterLb >= 0 ? '+' : '') + leak.afterLb);
    ok('弹窗开关 30 次不增长', leak.afterModal < 30, '增长 ' + leak.afterModal);
    ok('切页 40 次不增长', leak.afterTab < 30, '增长 ' + leak.afterTab);
    ok('灯箱开合 20 次不增长', leak.afterLb < 30, '增长 ' + leak.afterLb);
    ok('灯箱实例唯一', leak.lbCount === 1, '实例 ' + leak.lbCount);

    section('B. 性能（50ms 内完成即达标）');
    const perf = await page.evaluate(PROBE_PERF);
    console.log('   500 条: 列表 ' + perf.list500 + 'ms / 切页 ' + perf.tab500 + 'ms / 山册 ' + perf.mtn500 + 'ms');
    console.log('   1000 条: 列表 ' + perf.list1000 + 'ms / 切页 ' + perf.tab1000 + 'ms / 山册 ' + perf.mtn1000 + 'ms');
    ok('500 条列表渲染 < 50ms', perf.list500 >= 0 && perf.list500 < 50, perf.list500 + 'ms');
    ok('1000 条列表渲染 < 50ms', perf.list1000 >= 0 && perf.list1000 < 50, perf.list1000 + 'ms');
    ok('500 条切页 < 50ms', perf.tab500 >= 0 && perf.tab500 < 50, perf.tab500 + 'ms');
    ok('1000 条切页 < 50ms', perf.tab1000 >= 0 && perf.tab1000 < 50, perf.tab1000 + 'ms');
    ok('1000 条山册 < 60ms', perf.mtn1000 >= 0 && perf.mtn1000 < 60, perf.mtn1000 + 'ms');

    section('C. 边界（脏数据不得崩）');
    const edge = await page.evaluate(PROBE_EDGE);
    ['empty_list', 'empty_mtn', 'empty_otd', 'no_fields', 'null_photos', 'long_name'].forEach(function (k) {
        ok('边界 ' + k + ' 不崩', edge[k] === 'ok', edge[k]);
    });
    ok('XSS 注入被转义', edge.xss === 'escaped', edge.xss);

    section('D. 错误捕获（伪造异常必须落进崩溃队列）');
    await page.evaluate(PROBE_ERRCAP);
    await page.waitForTimeout(700);
    const ec = await page.evaluate(PROBE_ERRCAP2);
    console.log('   崩溃队列 ' + ec.count + ' 条 / 内存日志 ' + ec.logs + ' 条');
    ok('未捕获异常进入崩溃队列', ec.hit === true, '队列 ' + ec.count + ' 条');
    ok('内存错误日志有记录', ec.logs > 0, ec.logs);

    await browser.close();
    if (srv) { try { srv.kill(); } catch (e) { } }
    console.log('');
    console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})().catch(e => {
    console.log('  ❌ stresscheck 运行失败: ' + e.message);
    console.log('结果: 0 通过 / 1 失败');
    process.exit(1);
});
