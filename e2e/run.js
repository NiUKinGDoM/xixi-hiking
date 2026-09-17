// XiXiの徒步小记 · 真实渲染回归（E2E 视觉回归）
// 用法：node e2e/run.js [--update]   （--update = 刷新基线截图）
// 依赖：playwright-core + 系统 Edge；静态服务 serve.js 先行
// 说明：App 网页版与 APK 同代码（Capacitor 打包同一份 www），真实 Chromium 渲染可抓 CSS/布局回归；
//       真机 WebView 差异需 USB 设备接 Appium（此脚本核心链路可复用）。
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8123/index.html';
const SHOTS = path.resolve(__dirname, 'shots');
const BASELINE = path.join(SHOTS, process.env.E2E_BASELINE || 'baseline');   // E2E_BASELINE=baseline-obf 验证混淆副本
const UPDATE = process.argv.includes('--update');
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name + (extra ? ' | ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); }
}

const http = require('http');
function serverUp() {
  return new Promise(function (resolve) {
    const req = http.get('http://127.0.0.1:8123/index.html', function () { req.destroy(); resolve(true); });
    req.on('error', function () { resolve(false); });
    req.setTimeout(1500, function () { req.destroy(); resolve(false); });
  });
}
(async () => {
  // 静态服务未起则自动拉起（serve.js 同目录）
  if (!(await serverUp())) {
    const { spawn } = require('child_process');
    const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { stdio: 'ignore', detached: false });
    let ok = false;
    for (let i = 0; i < 20; i++) { await new Promise(function (r) { setTimeout(r, 200); }); if (await serverUp()) { ok = true; break; } }
    if (!ok) { console.error('E2E 静态服务器启动失败'); process.exit(1); }
    srv.unref();
  }

  if (!fs.existsSync(EDGE)) { console.error('Edge 未找到:', EDGE); process.exit(1); }
  fs.mkdirSync(BASELINE, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; E2E) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
  });
  // ★2026-09-14 视觉回归降噪（根治跨天必失败）：
  //   ① 固定「今天」——概览热力图高亮在当天格子，随真实日期移动 → 每跨一天跑 E2E 都误报（9/11、9/14 各一次）
  //   ② 关闭 FPS 显示——右上角数字秒变，同样造成噪音
  //   两者都是「真实数据变化」而非代码回归，必须降噪，否则会掩盖真 bug。
  await ctx.addInitScript(() => {
    try { localStorage.setItem('hiking_show_fps', JSON.stringify({ showFps: false })); } catch (e) { }
    try {
      const FIXED = new Date('2026-01-15T12:00:00+08:00').getTime();
      const Orig = Date;
      function FakeDate() {
        if (arguments.length === 0) return new Orig(FIXED);
        var a = Array.prototype.slice.call(arguments);
        return new (Function.prototype.bind.apply(Orig, [null].concat(a)))();
      }
      FakeDate.prototype = Orig.prototype;
      FakeDate.now = function () { return FIXED; };
      FakeDate.parse = Orig.parse;
      FakeDate.UTC = Orig.UTC;
      window.Date = FakeDate;
    } catch (e) { }
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  async function shot(name) {
    const fp = path.join(BASELINE, name + '.png');
    await page.screenshot({ path: fp, fullPage: false });
    return fp;
  }
  // 与基线像素差（粗检：采样行 hash；完整 diff 可后续接 pixelmatch）
  // 像素差比例（<0.3% 视为一致，容忍 AA/亚像素波动；> 阈值为视觉回归失败）
  function pngDiffRatio(bufA, bufB) {
    try {
      const a = PNG.sync.read(bufA);
      const b = PNG.sync.read(bufB);
      if (a.width !== b.width || a.height !== b.height) return 1;
      const n = a.width * a.height;
      let diff = 0;
      for (let i = 0; i < n; i++) {
        const ia = i * 4, ib = i * 4;
        if (Math.abs(a.data[ia] - b.data[ib]) > 24 || Math.abs(a.data[ia + 1] - b.data[ib + 1]) > 24 || Math.abs(a.data[ia + 2] - b.data[ib + 2]) > 24) diff++;
      }
      return diff / n;
    } catch (e) { return 1; }
  }
  async function shotAndCheck(name, keySel, opts) {
    const cmp = !(opts && opts.noCompare);   // noCompare：动态数据区不做视觉比
    await page.waitForTimeout(650);   // 等渐入/滚动动画结束再截（01/02 界面有 0.3-0.5s 入场动画）
    if (UPDATE) {   // --update：无条件刷新基线（内容/排版预期变化时用）
      await page.screenshot({ path: path.join(BASELINE, name + '.png') });
      ok(name + '（基线已更新）', true);
      if (keySel) { const f = await page.locator(keySel).count(); ok(name + ' 关键元素[' + keySel + ']在', f > 0); }
      return;
    }
    await page.screenshot({ path: path.join(SHOTS, name + '.latest.png') });
    const base = path.join(BASELINE, name + '.png');
    if (!fs.existsSync(base)) {
      fs.copyFileSync(path.join(SHOTS, name + '.latest.png'), base);
      ok(name + '（新基线已存）', true);
    } else if (cmp) {
      const ratio = pngDiffRatio(fs.readFileSync(base), fs.readFileSync(path.join(SHOTS, name + '.latest.png')));
      ok(name + '（视觉一致 diff=' + (ratio * 100).toFixed(2) + '% ≤0.5%）', ratio <= 0.005, 'diff=' + (ratio * 100).toFixed(2) + '%');
    }
    if (keySel) {
      const found = await page.locator(keySel).count();
      ok(name + ' 关键元素[' + keySel + ']在', found > 0);
    }
  }

  console.log('== E2E: 打开 App ==');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  // 概览页应出现统计卡
  ok('概览页统计卡渲染', await page.locator('#overviewPanel, .ov-grid, .stat-card').first().count() > 0 || (await page.content()).length > 2000, 'content=' + (await page.content()).length);
  await shotAndCheck('01-overview-light', '.stat-card, .ov-card', { noCompare: true });

  console.log('== E2E: 计划日历 ==');
  // 切计划 tab（底栏第二项，找文本「计划」的 tab）
  await page.locator('[data-testid="tab-plans"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('plans'); } catch (e) {} }); });
  await page.waitForTimeout(600);
  const calState = await page.evaluate(() => {
    const cv = document.getElementById('plannedCalendarView');
    const lv = document.getElementById('plannedListView');
    const mode = (typeof window.plansViewMode !== 'undefined') ? window.plansViewMode : '?';
    return {
      mode: mode,
      calDisp: cv ? getComputedStyle(cv).display : 'n/a',
      calLen: cv ? cv.innerHTML.length : -1,
      listDisp: lv ? getComputedStyle(lv).display : 'n/a'
    };
  });
  ok('计划日历渲染(#plannedCalendarView 可见非空)', calState.mode === 'calendar' && calState.calDisp !== 'none' && calState.calLen > 100, JSON.stringify(calState));
  await shotAndCheck('02-plans-calendar-light', '#plannedCalendarView');

  console.log('== E2E: 记录 tab + 示例数据 ==');
  await page.locator('[data-testid="tab-records"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('records'); } catch (e) {} }); });
  await page.waitForTimeout(500);
  const recEmpty = await page.locator('text=还没有记录, 或是没有更多了').count();
  // 加载示例数据（App 内置 API）
  await page.evaluate(() => {
    try { if (typeof window.loadSampleData === 'function') { window.loadSampleData(); return 'ok'; } return 'no-fn'; } catch (e) { return 'err:' + e.message; }
  }).then(async (r) => { console.log('  sampleData:', r); });
  await page.waitForTimeout(800);
  await shotAndCheck('03-records-with-sample', '.table-row-advanced, .rd-name-main', { noCompare: true });

  console.log('== E2E: 记录详情弹窗（阅读态 v2 核心 UI）==');
  const rowCount = await page.locator('.table-row-advanced').count();
  ok('示例数据已渲染记录行', rowCount > 0, 'rows=' + rowCount);
  if (rowCount > 0) {
    await page.locator('.table-row-advanced').first().click();
    await page.waitForTimeout(500);
    const dtl = await page.locator('.record-detail-modal, #rd-modal, [class*="record-detail"]').count();
    ok('点行打开记录详情弹窗', dtl > 0, 'dtl=' + dtl);
    await shotAndCheck('06-records-detail-light', '.record-detail-modal');
    // 关闭详情（优先 ✕，兜底遮罩）
    await page.evaluate(() => {
      const c = document.querySelector('.record-detail-modal');
      if (!c) return;
      const btn = c.querySelector('[id$="close"], [class*="close"]');
      if (btn) { btn.click(); return; }
      c.style.display = 'none';
    });
    await page.waitForTimeout(300);
  }

  console.log('== E2E: 设置页 → 照片占用弹窗 ==');
  await page.locator('[data-testid="tab-settings"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('settings'); } catch (e) {} }); });
  await page.waitForTimeout(700);
  const openPu = await page.evaluate(() => {
    try { if (typeof window.openPhotoUsageDetailModal === 'function') { window.openPhotoUsageDetailModal(); return 'ok'; } return 'no-fn'; } catch (e) { return 'err'; }
  });
  await page.waitForSelector('#puModal', { timeout: 4000 }).catch(() => {});
  const puModalTxt = await page.locator('#puModal').textContent().catch(() => '');
  ok('照片占用弹窗打开', openPu === 'ok' && puModalTxt.indexOf('照片占用') >= 0, openPu + ' | ' + puModalTxt.slice(0, 30));
  await shotAndCheck('07-photo-usage-light', '#puModal');
  await page.evaluate(() => { const b = document.getElementById('puClose'); if (b) b.click(); });
  await page.waitForTimeout(300);

  console.log('== E2E: 设置页 → 隐私政策弹窗 ==');
  await page.locator('[data-testid="tab-settings"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('settings'); } catch (e) {} }); });
  await page.waitForTimeout(700);
  const hasPrivacy = await page.locator('#privacyPolicyBtn').count();
  ok('设置页隐私政策入口在', hasPrivacy > 0);
  if (hasPrivacy > 0) {
    await page.locator('#privacyPolicyBtn').click();
    await page.waitForTimeout(400);
    const modalText = await page.locator('.confirm-modal-content').textContent().catch(() => '');
    ok('隐私弹窗打开(玻璃卡片+条目)', modalText.indexOf('隐私与数据说明') >= 0 && modalText.indexOf('数据存在哪') >= 0 && modalText.indexOf('联网行为') >= 0, modalText.slice(0, 40));
    await shotAndCheck('04-privacy-modal-light', '.confirm-modal-content');
    // 深色模式隐私弹窗
    await page.evaluate(() => { try { window.AppStore && AppStore.setItem('darkMode', true); } catch (e) {} });
    await page.waitForTimeout(300);
    await shotAndCheck('05-privacy-modal-dark', '.confirm-modal-content');
    await page.evaluate(() => { const b = document.getElementById('privacy-close'); if (b) b.click(); });
    await page.waitForTimeout(300);
  }

  console.log('== E2E: 深色模式关键屏 ==');
  // 08 深色概览
  await page.locator('[data-testid="tab-overview"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('overview'); } catch (e) {} }); });
  await page.waitForTimeout(700);
  await shotAndCheck('08-overview-dark', '.stat-card, .ov-card');
  // 09 深色记录详情弹窗
  await page.locator('[data-testid="tab-records"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('records'); } catch (e) {} }); });
  await page.waitForTimeout(600);
  const rowD2 = await page.locator('.table-row-advanced').count();
  if (rowD2 > 0) {
    await page.locator('.table-row-advanced').first().click();
    await page.waitForTimeout(500);
    await shotAndCheck('09-records-detail-dark', '.record-detail-modal');
  } else {
    ok('09-records-detail-dark（无记录跳过）', true);
  }

  console.log('== E2E: 崩溃采集钩子 ==');
  const crashTest = await page.evaluate(() => {
    try {
      const before = (typeof window.__getCrashQueue === 'function') ? window.__getCrashQueue().length : -1;
      // 触发一次 JS error（会进持久队列）
      window.setTimeout(() => { throw new Error('E2E synthetic crash test'); }, 0);
      return before;
    } catch (e) { return -99; }
  });
  await page.waitForTimeout(400);
  const crashAfter = await page.evaluate(() => (typeof window.__getCrashQueue === 'function') ? window.__getCrashQueue().length : -1);
  ok('JS 崩溃进持久队列', crashAfter > (crashTest >= 0 ? crashTest : 0), 'before=' + crashTest + ' after=' + crashAfter);
  // 清掉测试队列
  await page.evaluate(() => { try { window.__clearCrashQueue(); } catch (e) {} });

  console.log('== E2E: 里程碑一览行布局（描述不得折行）==');
  const msLayout = await page.evaluate(() => {
    try {
      const backup = window.records;
      // 造数据：4 座山 + 300km → 触发「300.0 / 1000 km」这种最长进度串
      window.records = [
        { id: 'L1', name: '太白山', distance: 120, elevation: 3767, difficulty: 5, weather: '☀️', createdAt: '2026-03-10T09:00:00.000Z' },
        { id: 'L2', name: '华山', distance: 80, elevation: 2154, difficulty: 4, weather: '🌤️', createdAt: '2026-06-10T09:00:00.000Z' },
        { id: 'L3', name: '翠华山', distance: 60, elevation: 1600, difficulty: 2, weather: '☁️', createdAt: '2026-09-10T09:00:00.000Z' },
        { id: 'L4', name: '南五台山', distance: 40, elevation: 1688, difficulty: 3, weather: '🌧️', createdAt: '2026-12-10T09:00:00.000Z' }
      ];
      if (typeof window.renderMilestoneEntry === 'function') window.renderMilestoneEntry();
      window.showMilestoneList();
      let card = null;
      document.querySelectorAll('.modal-backdrop-animate').forEach(function (n) { if (n.querySelector('#msListClose')) card = n.firstElementChild; });
      if (!card) { window.records = backup; return { ok: false, reason: '一览未打开' }; }
      let rows = 0; const wrapped = []; let progressInside = true;
      card.querySelectorAll('.ms-scroll > div').forEach(function (row) {
        if (row.children.length !== 2) { progressInside = false; return; }
        rows++;
        const mid = row.children[1];
        const tRow = mid.children[0], desc = mid.children[1], sub = mid.children[2];
        const lh = parseFloat(getComputedStyle(desc).lineHeight) || 0;
        if (lh && Math.round(desc.clientHeight / lh) > 1) wrapped.push(tRow.children[0].textContent);
        if (sub) {
          const slh = parseFloat(getComputedStyle(sub).lineHeight) || 0;
          if (slh && Math.round(sub.clientHeight / slh) > 1) wrapped.push(tRow.children[0].textContent + '(清单)');
        }
      });
      const close = document.getElementById('msListClose');
      if (close) close.click();
      const total = window.MILESTONES.length;
      window.records = backup;
      if (typeof window.renderMilestoneEntry === 'function') window.renderMilestoneEntry();
      return { ok: true, rows: rows, wrapped: wrapped, progressInside: progressInside, total: total };
    } catch (e) { return { ok: false, reason: e.message }; }
  });
  ok('里程碑一览-档位行齐全', msLayout.ok && msLayout.rows === msLayout.total, JSON.stringify(msLayout).slice(0, 90));
  ok('里程碑一览-进度并入标题行（行仅 2 子元素）', msLayout.ok === true && msLayout.progressInside === true, JSON.stringify(msLayout).slice(0, 90));
  ok('里程碑一览-描述/清单全部单行', msLayout.ok === true && Array.isArray(msLayout.wrapped) && msLayout.wrapped.length === 0, (msLayout.wrapped || []).join(','));


  // ★2026-09-16 回归：概览入场动画不得被「同 tab 刷新」的 WAAPI 残留动画盖掉
  //   旧 bug：同 tab 点击会用 el.animate(..., {fill:'both'}) 做刷新反馈，播完后仍生效（WAAPI 优先级 > CSS 动画）
  //   → 统计卡/热力图/里程碑卡被钉在 opacity:1，从别的页面切回概览时“看不见渐入”
  console.log('== E2E: 概览入场动画（同 tab 刷新后不得残留覆盖）==');
  const animCheck = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const opOf = (el) => (el ? parseFloat(getComputedStyle(el).opacity) : -1);
    const leftoverOf = (el) => (el && el.getAnimations ? el.getAnimations().filter((a) => !a.animationName).length : -1);
    if (typeof switchTab === 'function') switchTab('overview');
    await sleep(320);                       // ① 先确保当前就是概览（否则同 tab 分支不会跑，断言就是假的）
    if (typeof switchTab === 'function') switchTab('overview');   // ② 同 tab 再点一次 = 触发刷新反馈动画（旧 bug 的来源）
    await sleep(560);                       // 等那段 380ms 反馈动画播完
    if (typeof switchTab === 'function') switchTab('records');
    await sleep(320);
    if (typeof switchTab === 'function') switchTab('overview');
    await sleep(100);                       // 刚起步（延迟 0.05~0.64s）
    const card = document.querySelector('#tab-overview .stat-card');
    const mile = document.querySelector('#tab-overview #milestoneEntry');
    const mini = document.querySelector('#tab-overview .ov-mini');
    const snap = {
      statOp: opOf(card), mileOp: opOf(mile), miniOp: opOf(mini),
      statLeftover: leftoverOf(card), mileLeftover: leftoverOf(mile),
    };
    await sleep(1100);                      // 等动画播完
    snap.statFinal = opOf(card);
    snap.mileFinal = opOf(mile);
    return snap;
  });
  ok('概览入场-统计卡真的在渐入（同 tab 刷新后）', animCheck.statOp >= 0 && animCheck.statOp < 0.7, JSON.stringify(animCheck));
  ok('概览入场-里程碑卡真的在渐入', animCheck.mileOp >= 0 && animCheck.mileOp < 0.7, 'mileOp=' + animCheck.mileOp);
  ok('概览入场-无 WAAPI 残留覆盖', animCheck.statLeftover === 0 && animCheck.mileLeftover === 0, 'stat=' + animCheck.statLeftover + ' mile=' + animCheck.mileLeftover);
  ok('概览入场-动画播完归位 opacity=1', animCheck.statFinal === 1 && animCheck.mileFinal === 1, 'stat=' + animCheck.statFinal + ' mile=' + animCheck.mileFinal);

  // ★2026-09-17 回归：同 tab 刷新反馈必须覆盖三个副卡 .ov-mini，且「连续点击」不得叠加动画
  //   旧 bug：fadeTargets 只列了 glass-stat-card/heatmapPanel/milestoneEntry → 三个副卡不跟着刷新；
  //   且连点时上一枚 380ms 动画未清 → 两枚叠加（透明度越点越深）
  console.log('== E2E: 同 tab 刷新反馈（副卡 + 连点不叠加）==');
  const refreshCheck = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const opOf = (el) => (el ? parseFloat(getComputedStyle(el).opacity) : -1);
    const runCount = (el) => (el && el.getAnimations ? el.getAnimations().filter((a) => a.id === 'ovRefresh' && a.playState === 'running').length : -1);
    const miniList = () => Array.prototype.slice.call(document.querySelectorAll('#tab-overview .ov-mini'));
    if (typeof switchTab === 'function') switchTab('overview');
    await sleep(1300);                                  // 等首屏入场动画全部结束（副卡 delay 0.56s + 0.5s）
    const card = document.querySelector('#tab-overview .glass-stat-card');
    const minis = miniList();
    // ★2026-09-17 结构性灵魂：收集概览页「所有靠 CSS fadeInUp 入场」的元素 —— 刷新反馈必须覆盖全部（防止以后新增卡片又漏进名单）
    const entranceEls = [];
    document.querySelectorAll('#tab-overview *').forEach((el) => {
      const an = getComputedStyle(el).animationName || '';
      if (an && an.indexOf('fadeInUp') >= 0) {
        entranceEls.push({ el: el, sig: el.id ? '#' + el.id : '.' + String(el.className).trim().split(/\s+/).join('.') });
      }
    });
    if (typeof switchTab === 'function') switchTab('overview');
    await sleep(90);                                    // 刷新反馈正在播
    const mid = { cardOp: opOf(card), miniOp: opOf(minis[0]), cardRun: runCount(card), miniRun: runCount(minis[0]) };
    mid.entranceTotal = entranceEls.length;
    mid.stale = entranceEls.filter((x) => opOf(x.el) >= 0.95).map((x) => x.sig);   // 没跟着动的
    if (typeof switchTab === 'function') switchTab('overview');   // 连点第 2 次
    await sleep(80);
    if (typeof switchTab === 'function') switchTab('overview');   // 连点第 3 次
    await sleep(80);
    const counts = [runCount(card)].concat(minis.map((m) => runCount(m)));
    await sleep(700);                                   // 等播完
    const end = { cardFinal: opOf(card), miniFinal: opOf(minis[0]), cardLeft: runCount(card), miniLeft: runCount(minis[0]) };
    return { mid: mid, counts: counts, end: end };
  });
  ok('刷新反馈-副卡 .ov-mini 也参与（不再只有大卡动）', refreshCheck.mid.miniRun === 1 && refreshCheck.mid.miniOp >= 0 && refreshCheck.mid.miniOp < 0.8, JSON.stringify(refreshCheck.mid));
  ok('刷新反馈-覆盖全部入场动画元素（防再漏）', refreshCheck.mid.stale.length === 0 && refreshCheck.mid.entranceTotal >= 8, 'total=' + refreshCheck.mid.entranceTotal + ' stale=' + JSON.stringify(refreshCheck.mid.stale));
  ok('刷新反馈-大卡与副卡同步（opacity 相当）', Math.abs(refreshCheck.mid.cardOp - refreshCheck.mid.miniOp) < 0.08, 'card=' + refreshCheck.mid.cardOp + ' mini=' + refreshCheck.mid.miniOp);
  ok('刷新反馈-连点 3 次不叠加（每元素恰好 1 枚运行中）', refreshCheck.counts.every((c) => c === 1), JSON.stringify(refreshCheck.counts));
  ok('刷新反馈-播完无残留且归位 opacity=1', refreshCheck.end.cardLeft === 0 && refreshCheck.end.miniLeft === 0 && refreshCheck.end.cardFinal === 1 && refreshCheck.end.miniFinal === 1, JSON.stringify(refreshCheck.end));


  // ★2026-09-17 回归：数据健壮性（无效日期 / 字段类型异常 / 保存自愈）
  //   修前三个真 bug：①无效日期→列表显示 NaN-NaN-NaN / 年份分组「NaN年」；②搜索对非字符串字段抛 TypeError → 搜索整体失效；③保存校验把类型不符的记录整条静默删除
  console.log('== E2E: 数据健壮性 ==');
  const robustCheck = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const bk = JSON.stringify(records || []);
    const bkLocal = localStorage.getItem('hiking_records');
    const R = (over) => {
      const b = { id: 'e2e-r-' + Math.random().toString(36).slice(2, 8), name: '记录', difficulty: 3, elevation: 1000, duration: 60, distance: 5, mood: '轻松', weather: '晴', companions: '', notes: '', photos: [], createdAt: '2026-09-10T02:00:00.000Z', updatedAt: '2026-09-10T02:00:00.000Z' };
      for (const k in over) b[k] = over[k];
      return b;
    };
    const crash = () => { try { return (window.__getCrashQueue() || []).length; } catch (e) { return -1; } };
    const clearCrash = () => { try { window.__clearCrashQueue(); } catch (e) {} };
    const out = {};
    try {
      // ① 无效日期不得产生 NaN
      records = [R({}), R({ name: 'bad', createdAt: 'not-a-date' }), R({ name: 'obj', createdAt: {} })];
      switchTab('records'); renderTable();
      await sleep(500);
      const scope = document.querySelector('#tab-records');
      out.nanInPage = /NaN/.test(scope.innerText || '');
      out.yearTexts = [].map.call(scope.querySelectorAll('.year-group-text'), (el) => (el.textContent || '').trim());
      out.timeTexts = [].map.call(scope.querySelectorAll('.rd-time-cell'), (el) => (el.textContent || '').trim());

      // ② 搜索在字段类型异常时不得抛错
      clearCrash();
      records = [R({ name: 12345 }), R({ name: '秦岭', notes: 999 })];
      searchQuery = ''; renderTable(); await sleep(250);
      clearCrash();
      searchQuery = '秦岭'; renderTable(); await sleep(260);
      const c1 = crash() > 0 ? 1 : 0;
      clearCrash();
      searchQuery = 'zzz不存在'; renderTable(); await sleep(260);
      const c2 = crash() > 0 ? 1 : 0;
      out.searchCrash = c1 + c2;
      searchQuery = '';

      // ③ 保存自愈：能修的不丢，只丢非对象
      clearCrash();
      records = [R({ name: 'ok' }), R({ name: 'd', difficulty: '3' }), R({ name: 'e', elevation: '1200' }), R({ id: 999, name: 'i' }), null, 'junk'];
      const before = records.length;
      saveToStorage();
      await sleep(800);
      out.save = { before: before, after: (records || []).length, typesOk: (records || []).every((r) => typeof r.difficulty === 'number' && typeof r.elevation === 'number' && typeof r.id === 'string') };
      out.saveCrash = crash() > 0 ? 1 : 0;
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 90); }
    try { records = JSON.parse(bk); } catch (e) {}
    if (bkLocal !== null) { try { localStorage.setItem('hiking_records', bkLocal); } catch (e) {} }
    try { switchTab('records'); renderTable(); await sleep(200); } catch (e) {}
    clearCrash();
    return out;
  });
  ok('数据健壮性-无效日期不再出现 NaN', robustCheck.nanInPage === false, 'yearTexts=' + JSON.stringify(robustCheck.yearTexts));
  ok('数据健壮性-日期异常行显示为 -', (robustCheck.timeTexts || []).filter((x) => x === '-').length === 2, JSON.stringify(robustCheck.timeTexts));
  ok('数据健壮性-搜索在字段类型异常时不崩', robustCheck.searchCrash === 0, 'crash=' + robustCheck.searchCrash + ' err=' + (robustCheck.err || ''));
  ok('数据健壮性-保存只丢非对象（6→4）', !!(robustCheck.save && robustCheck.save.before === 6 && robustCheck.save.after === 4), JSON.stringify(robustCheck.save));
  ok('数据健壮性-保存后字段类型归位', !!(robustCheck.save && robustCheck.save.typesOk === true), JSON.stringify(robustCheck.save));

  // ★2026-09-16 回归：选择器弹窗的「内容 → 取消/确定」必须有间距（曾有三个是 0~6px，真机上看着像重合）
  //   覆盖：天气 / 心情 / 难度 / 日期时间 / 年月（热力图）
  console.log('== E2E: 选择器弹窗内容与按钮间距 ==');
  const pickerGap = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cases = [
      ['weather', () => openMoodWeatherPicker('weather', 'e2e-gap-probe')],
      ['mood', () => openMoodWeatherPicker('mood', 'e2e-gap-probe')],
      ['difficulty', () => openDifficultyPicker('e2e-gap-probe')],
      ['datetime', () => openDateTimePicker('e2e-gap-probe')],
      ['hmym', () => openHmYmPicker()],
    ];
    const out = {};
    for (const [key, open] of cases) {
      try { closeOpenModals(); } catch (e) {}
      await sleep(150);
      try { open(); } catch (e) { out[key] = { err: (e && e.message) || String(e) }; continue; }
      await sleep(300);
      const msg = document.querySelector('.confirm-modal .confirm-modal-message') || document.querySelector('.confirm-modal .confirm-modal-content');
      const btns = document.querySelector('.confirm-modal .confirm-modal-buttons');
      if (!msg || !btns) { out[key] = { err: 'missing-el' }; continue; }
      let maxB = -1;
      msg.querySelectorAll('*').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.height > 2 && r.width > 2 && r.bottom > maxB) maxB = r.bottom;
      });
      const top = btns.getBoundingClientRect().top;
      out[key] = { gap: Math.round(top - maxB), overlap: top < maxB - 0.5 };
    }
    try { closeOpenModals(); } catch (e) {}
    return out;
  });
  const names = { weather: '天气', mood: '心情', difficulty: '难度', datetime: '日期时间', hmym: '年月' };
  Object.keys(names).forEach((k) => {
    const r = pickerGap[k] || {};
    ok('弹窗间距-' + names[k] + '（内容与取消/确定不重合）', !r.err && r.overlap === false && r.gap >= 8, JSON.stringify(r));
  });

  await browser.close();
  console.log('--- 页面 JS 错误(' + errors.length + '):', errors.slice(0, 5).join(' ;; ') || '无');
  console.log('===== E2E: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E 异常:', e); process.exit(2); });
