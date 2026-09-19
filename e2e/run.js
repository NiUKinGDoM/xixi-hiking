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
    // ★2026-09-18 同意留存：默认预置「已同意」——否则每个用例都会被同意弹窗挡住。
    //   要测「未同意」态的用例，先置 __e2e_legal_clear 哨兵，本脚本就跳过预置。
    try {
      if (!localStorage.getItem('__e2e_legal_clear')) {
        localStorage.setItem('hiking_legal_agree', JSON.stringify({ version: '2026-09-18', at: '2026-01-15T12:00:00.000Z' }));
      }
    } catch (e) { }
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

  // ★2026-09-20 日历「完成/延期」：过期/当天=「完成/延期」、未过期=「完成」（用户需求）
  const codBtnState = await page.evaluate(() => {
    try {
      const iso = (n) => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x.toISOString(); };
      plannedTrips = [
        { id: 'cod_ov', name: '过期计划E2E', elevation: 1000, difficulty: 2, createdAt: iso(-2) },
        { id: 'cod_td', name: '今天计划E2E', elevation: 1100, difficulty: 3, createdAt: iso(0) },
        { id: 'cod_fu', name: '未来计划E2E', elevation: 1200, difficulty: 4, createdAt: iso(6) }
      ];
      calendarViewYear = new Date().getFullYear();
      calendarViewMonth = new Date().getMonth();
      calendarSelKey = null;
      try { switchTab('plans'); } catch (e) { }
      renderPlannedCalendar();
      const box = document.getElementById('calDayDetail');
      const out = [];
      if (box) {
        box.querySelectorAll('[data-complete], [data-complete-delay]').forEach((b) => {
          out.push({ txt: b.textContent.trim(), delay: b.hasAttribute('data-complete-delay') });
        });
      }
      return out;
    } catch (e) { return 'err:' + e.message; }
  });
  ok('日历「完成/延期」：过期+当天为「完成/延期」、未过期为「完成」',
    Array.isArray(codBtnState) && codBtnState.length === 3
      && codBtnState.filter((x) => x.delay && x.txt === '完成/延期').length === 2
      && codBtnState.filter((x) => !x.delay && x.txt === '完成').length === 1,
    JSON.stringify(codBtnState));
  const codModalState = await page.evaluate(() => {
    try {
      const b = document.querySelector('[data-complete-delay="cod_ov"]');
      if (!b) return { err: 'no-btn' };
      b.click();
      const r = {
        hasComplete: !!document.getElementById('cod-complete'),
        hasDelay: !!document.getElementById('cod-delay'),
        hasCancel: !!document.getElementById('cod-cancel'),
        msg: (document.querySelector('.confirm-modal-message') || {}).textContent || ''
      };
      document.getElementById('cod-delay').click();
      const ttl = Array.from(document.querySelectorAll('.rd-tt')).some((n) => n.textContent.indexOf('编辑计划') >= 0);
      r.editOpen = !!document.getElementById('pd-body') && ttl;
      try { closeOpenModals(); } catch (e) { }
      return r;
    } catch (e) { return { err: e.message }; }
  });
  ok('点「完成/延期」→ 弹窗三按钮；选「延期」→ 打开编辑计划弹窗',
    !codModalState.err && codModalState.hasComplete && codModalState.hasDelay && codModalState.hasCancel
      && codModalState.editOpen && codModalState.msg.indexOf('过期计划E2E') >= 0,
    JSON.stringify(codModalState));
  const codDoneState = await page.evaluate(() => {
    try {
      const before = (records || []).length;
      showCompleteOrDelayModal('cod_ov', '过期计划E2E');
      document.getElementById('cod-complete').click();
      const t = document.querySelector('[data-testid="tab-records"]');
      return {
        before: before,
        after: (records || []).length,
        plans: (plannedTrips || []).length,
        tabActive: t ? (t.className || '').indexOf('active') >= 0 : false,
        recName: (records || []).length ? records[records.length - 1].name : ''
      };
    } catch (e) { return { err: e.message }; }
  });
  ok('点「完成」→ 记录 +1、计划移除、自动切到记录页',
    !codDoneState.err && codDoneState.after === codDoneState.before + 1 && codDoneState.tabActive
      && codDoneState.plans === 2 && codDoneState.recName === '过期计划E2E',
    JSON.stringify(codDoneState));

  // ★本段自造数据且触发了「完成→庆祝卡」，必须收尾恢复干净状态：
  //   否则庆祝卡会遮住后续用例的点击 → Playwright 超时 → E2E 以异常退出（exit 2，非断言失败，排查时极易误导）。
  await page.evaluate(() => {
    // 三类残留层都**不在 closeOpenModals 管辖内**，必须逐个清：
    //   ① 庆祝卡 #celebrateOverlay（完成计划时弹）
    //   ② 计划编辑弹窗 .record-detail-modal（点「延期」会打开；它是“独立层、子弹窗可叠加”设计 → 不归 closeOpenModals）
    //   ③ 普通确认弹窗 .confirm-modal
    //   漏掉任何一个都会遮住后续点击（intercepts pointer events）→ Playwright 超时 → E2E 以 exit 2 异常退出（非断言失败，排查时极易误读）
    try { if (typeof plannedEditingId !== 'undefined' && plannedEditingId) cancelPlannedEdit(); } catch (e) { }
    try { closeOpenModals(true); } catch (e) { }
    const celOv = document.getElementById('celebrateOverlay');
    if (celOv) { try { celOv.remove(); } catch (e) { } }
    document.querySelectorAll('.confirm-modal, .record-detail-modal').forEach((n) => { try { n.remove(); } catch (e) { } });
    try {
      records = (records || []).filter((r) => r.name !== '过期计划E2E');
      plannedTrips = [];
      saveToStorage();
      savePlannedTripsToStorage();
      renderTable();
      updateStatistics();
      renderPlannedTripsTable();
    } catch (e) { }
  });
  await page.waitForTimeout(500);

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
    ok('隐私弹窗打开(玻璃卡片+条目)', modalText.indexOf('隐私政策') >= 0 && modalText.indexOf('数据存储位置') >= 0 && modalText.indexOf('联网行为') >= 0, modalText.slice(0, 40));
    // ★2026-09-18 法律要素：生效日期/权利/未成年人/适用法律缺一不可（政策专业化后不得被后续改文案删掉）
    ok('隐私政策含法律要素(生效日期/你的权利/未成年人/适用法律)',
       modalText.indexOf('生效日期：2026-09-18') >= 0 && modalText.indexOf('你的权利') >= 0 &&
       modalText.indexOf('未成年人保护') >= 0 && modalText.indexOf('中华人民共和国法律') >= 0,
       modalText.length + ' 字');
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


  console.log('== E2E: 同步入口改造（账号卡 + 绑定弹窗）==');
  await page.locator('[data-testid="tab-settings"]').click().catch(async () => { await page.evaluate(() => { try { switchTab('settings'); } catch (e) {} }); });
  await page.waitForTimeout(800);
  const entry = await page.evaluate(async function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var out = {};
    var card = document.getElementById('syncAccountCard');
    var auto = document.getElementById('autoSyncCard');
    out.hasCard = !!card;
    out.cardBeforeAuto = !!(card && auto) && (card.compareDocumentPosition(auto) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    out.formNotInSettings = !document.getElementById('syncServer');
    try { openSyncBindModal(); } catch (e) { out.openErr = String(e); }
    await sleep(450);
    out.modalOpen = !!document.getElementById('syncBindModal');
    out.steps = (document.querySelector('#syncBindModal .sync-bind-steps') || {}).textContent || '';
    out.providerCount = document.querySelectorAll('#syncBindModal .sync-provider-card').length;
    var pj = document.getElementById('syncProvJianguo');
    out.defaultJianguo = !!(pj && pj.classList.contains('sel'));
    out.serverFilled = (document.getElementById('syncServer') || {}).value || '';
    out.serverHidden = (document.getElementById('syncServerWrap') || {}).style.display === 'none';
    try { pickSyncProvider('other'); } catch (e) { out.pickErr = String(e); }
    await sleep(150);
    out.serverShown = (document.getElementById('syncServerWrap') || {}).style.display === 'block';
    out.serverCleared = ((document.getElementById('syncServer') || {}).value || '') === '';
    out.userLabel = (document.getElementById('syncUserLabel') || {}).textContent || '';
    // ★2026-09-17 用户反馈：切「其他 WebDAV」→ 弹窗变窄 / 账号框残留坚果云邮箱 / 密码提示写死 16 位
    var mc = document.querySelector('#syncBindModal .confirm-modal-content');
    out.wOther = Math.round(mc.getBoundingClientRect().width * 10) / 10;
    out.phOtherUser = (document.getElementById('syncUsername') || {}).placeholder || '';
    out.phOtherPwd = (document.getElementById('syncPassword') || {}).placeholder || '';
    out.subsOther = Array.prototype.map.call(document.querySelectorAll('#syncBindModal .sync-provider-sub'), function (e) { return e.textContent; }).join(' | ');
    try { pickSyncProvider('jianguo'); } catch (e) {}
    await sleep(150);
    out.serverBack = (document.getElementById('syncServer') || {}).value || '';
    out.wJianguo = (mc && mc.parentNode) ? Math.round(mc.getBoundingClientRect().width * 10) / 10 : -1;
    document.getElementById('syncUsername').value = 'e2e@test.com';
    document.getElementById('syncPassword').value = 'e2epassword1234';
    try { submitSyncBind(); } catch (e) { out.submitErr = String(e); }
    await sleep(1100);
    out.modalClosed = !document.getElementById('syncBindModal');
    var off = document.getElementById('syncAcctOff');
    var on = document.getElementById('syncAcctOn');
    out.boundState = !!(off && on) && off.style.display === 'none' && on.style.display !== 'none';
    out.shownMail = (document.getElementById('syncAcctMail') || {}).textContent || '';
    out.shownProvider = (document.getElementById('syncAcctProvider') || {}).textContent || '';
    try { await saveSyncConfigFromForm(); } catch (e) { out.guardErr = String(e); }
    await sleep(150);
    out.keptUser = (typeof syncConfig !== 'undefined') ? (syncConfig.username || '') : 'NA';
    out.keptPwdLen = (typeof syncConfig !== 'undefined') ? String(syncConfig.password || '').length : -1;
    // ★2026-09-17 解绑改走 askConfirm 玻璃弹窗（不再用原生 confirm）→ 断言改为驱动弹窗
    try { unbindSyncAccount(); } catch (e) { out.unbindErr = String(e); }
    await sleep(480);
    out.unbindModalShown = !!document.getElementById('askConfirmModal');
    out.unbindModalCls = ((document.getElementById('askConfirmModal') || {}).className || 'MISSING');
    var unbindOk = document.getElementById('askConfirmOk');
    if (unbindOk) unbindOk.click();
    await sleep(520);
    out.unboundBack = !!(off && on) && off.style.display !== 'none' && on.style.display === 'none';
    // ★2026-09-17 残留账号处理：模拟「已绑定坚果云」后切「其他 WebDAV」
    syncConfig = { server: 'https://dav.jianguoyun.com/dav/', username: 'old@example.com', password: 'x' };
    try { openSyncBindModal(); } catch (e) { out.resErr = String(e); }
    await sleep(470);
    out.resPrefill = (document.getElementById('syncUsername') || {}).value || '';
    try { pickSyncProvider('other'); } catch (e) {}
    await sleep(180);
    out.resAfter = (document.getElementById('syncUsername') || {}).value || '';
    out.resPh = (document.getElementById('syncUsername') || {}).placeholder || '';
    try { pickSyncProvider('jianguo'); } catch (e) {}
    await sleep(180);
    out.resBack = (document.getElementById('syncUsername') || {}).value || '';
    document.getElementById('syncUsername').value = 'typed@x.com';   // 用户手动改过 → 切走不该清
    try { pickSyncProvider('other'); } catch (e) {}
    await sleep(150);
    out.resTyped = (document.getElementById('syncUsername') || {}).value || '';
    closeSyncBindModal();
    await sleep(120);
    syncConfig = { server: '', username: '', password: '' };
    return out;
  });
  ok('同步账号卡在设置页', entry.hasCard === true, JSON.stringify(entry).slice(0, 110));
  ok('账号卡排在自动同步卡之前（先绑定）', entry.cardBeforeAuto === true);
  ok('配置表单已收进弹窗（不在设置页）', entry.formNotInSettings === true);
  ok('绑定弹窗可打开且无异常', entry.modalOpen === true && !entry.openErr, entry.openErr || '');
  ok('弹窗含「选网盘 → 填账号」步骤条', entry.steps.indexOf('选网盘') >= 0 && entry.steps.indexOf('填账号') >= 0, entry.steps);
  ok('弹窗 2 个网盘选项且默认坚果云', entry.providerCount === 2 && entry.defaultJianguo === true, 'count=' + entry.providerCount);
  ok('选坚果云：地址自动填好且输入框隐藏', entry.serverFilled.indexOf('jianguoyun.com') >= 0 && entry.serverHidden === true, entry.serverFilled);
  ok('切「其他 WebDAV」：显示地址框并清空预填', entry.serverShown === true && entry.serverCleared === true);
  ok('切回坚果云：地址恢复', entry.serverBack.indexOf('jianguoyun.com') >= 0, entry.serverBack);
  ok('提交后弹窗关闭且账号卡变已绑定', entry.modalClosed === true && entry.boundState === true && entry.shownMail === 'e2e@test.com', JSON.stringify([entry.modalClosed, entry.boundState, entry.shownMail]));
  ok('已绑定态显示网盘名', entry.shownProvider === '坚果云', entry.shownProvider);
  ok('★弹窗关闭后保存不清空配置（空表单守卫）', entry.keptUser === 'e2e@test.com' && entry.keptPwdLen === 'e2epassword1234'.length, entry.keptUser + '/' + entry.keptPwdLen);
  ok('解绑后回到未绑定态', entry.unboundBack === true && !entry.unbindErr, entry.unbindErr || '');
  ok('解绑确认改用玻璃弹窗（非原生 confirm）', entry.unbindModalShown === true && entry.unbindModalCls.indexOf('confirm-modal') >= 0, entry.unbindModalCls);
  // ★2026-09-17 用户反馈 4 项（宽度跳变 / 账号残留 / 16位文案 / 副标题）
  ok('★切「其他 WebDAV」弹窗不再变窄（两态同宽）', entry.wOther > 100 && Math.abs(entry.wOther - entry.wJianguo) < 1, entry.wJianguo + ' vs ' + entry.wOther);
  ok('★账号框占位提示随服务商切换', entry.phOtherUser.length > 0 && entry.phOtherUser.indexOf('坚果云') < 0, entry.phOtherUser);
  ok('★应用密码占位不再写死「16 位」', entry.phOtherPwd.indexOf('16') < 0 && entry.phOtherPwd.indexOf('应用密码') >= 0, entry.phOtherPwd);
  ok('★网盘副标题已清理（无"免费额度"/"群晖"）', entry.subsOther.indexOf('免费额度') < 0 && entry.subsOther.indexOf('群晖') < 0, entry.subsOther);
  ok('★切其他 WebDAV 清掉坚果云残留账号', entry.resPrefill === 'old@example.com' && entry.resAfter === '' && entry.resPh.indexOf('坚果云') < 0, entry.resPrefill + ' → ' + JSON.stringify(entry.resAfter));
  ok('★切回坚果云恢复预填账号', entry.resBack === 'old@example.com', entry.resBack);
  ok('★用户手动输入的账号不被切走清掉', entry.resTyped === 'typed@x.com', entry.resTyped);
  console.log('== E2E: 全局错误提示（无信息量不再弹窗）==');
  const errRep = await page.evaluate(async function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var out = {};
    var seen = [];
    var origErr = window.showErrorMessage;
    window.showErrorMessage = function (m) { seen.push(String(m)); return origErr.apply(this, arguments); };
    try { window.__diagLogs.length = 0; } catch (e) {}
    // ① 无原因的 Promise 拒绝（切后台/生命周期中断的典型形态）→ 不应再弹「未知错误」
    window._lastGlobalErrToast = 0;
    seen.length = 0;   // 每步独立采集
    Promise.reject();
    await sleep(300);
    out.afterNoReason = seen.slice();
    // ② 有原因 → 照常提示（回归保护）
    window._lastGlobalErrToast = 0;
    seen.length = 0;   // 每步独立采集
    Promise.reject(new Error('boom-test'));
    await sleep(300);
    out.afterReason = seen.slice();
    // ③ error 事件但错误对象为空（原生注入脚本的典型情形）→ 用 event.message 兜底
    window._lastGlobalErrToast = 0;
    seen.length = 0;   // 每步独立采集
    try {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'Uncaught SyntaxError: Invalid or unexpected token',
        filename: 'native-inject', lineno: 1, error: null }));
    } catch (e) { out.dispatchErr = String(e); }
    await sleep(300);
    out.afterNullErr = seen.slice();
    out.diagLog = (window.__diagLogs || []).join(' || ');
    window.showErrorMessage = origErr;
    return out;
  });
  ok('★无原因的 Promise 拒绝不再弹「未知错误」', errRep.afterNoReason.length === 0, JSON.stringify(errRep.afterNoReason));
  ok('★无原因拒绝写入诊断日志（可导出排查）', errRep.diagLog.indexOf('静默') >= 0, errRep.diagLog.slice(0, 130));
  ok('★有原因的错误照常提示（回归保护）', errRep.afterReason.length === 1 && errRep.afterReason[0].indexOf('boom-test') >= 0, JSON.stringify(errRep.afterReason));
  ok('★错误对象为空时用 event.message 兜底（不再显示未知错误）', errRep.afterNullErr.length === 1 && errRep.afterNullErr[0].indexOf('未知错误') < 0 && !errRep.dispatchErr, JSON.stringify(errRep.afterNullErr) + (errRep.dispatchErr || ''));
  console.log('== E2E: 备份包含同步配置 ==');
  const cfgChk = await page.evaluate(async function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var out = {};
    var crash0 = (typeof __getCrashQueue === 'function') ? __getCrashQueue().length : -1;
    syncConfig = { server: '', username: '', password: '' };
    out.a_null = (buildFullBackupPayload({ includeCfg: true, includePwd: false }).syncConfig === null);
    syncConfig = { server: 'https://dav.jianguoyun.com/dav/', username: 'e2e@test.com', password: 'pwd1234567890ab' };
    try { renderSyncForm(''); } catch (e) {}
    var p1 = buildFullBackupPayload({ includeCfg: true, includePwd: false }).syncConfig;
    out.b_cfg = !!(p1 && p1.server === 'https://dav.jianguoyun.com/dav/' && p1.username === 'e2e@test.com');
    out.b_pwdEmpty = (p1.password === '');
    out.b_noPlain = (JSON.stringify(p1).indexOf('pwd1234567890ab') < 0);
    var p2 = buildFullBackupPayload({ includeCfg: true, includePwd: true }).syncConfig;
    out.c_pwdSet = String(p2.password || '').length > 0;
    out.c_notPlain = (p2.password !== 'pwd1234567890ab');
    out.d_null = (buildFullBackupPayload({ includeCfg: false, includePwd: false }).syncConfig === null);
    // ★防污染：自动/上传路径不传 opts（默认）→ 即使前面勾过密码，也必须不带密码
    var pAuto = buildFullBackupPayload().syncConfig;
    out.d_autoNoPwd = !!(pAuto && pAuto.password === '');
    try { showExportModal(); } catch (e) { out.e_err = String(e); }
    await sleep(400);
    out.e_block = !!document.getElementById('exportSyncCfgBlock');
    out.e_cfgChecked = !!(document.getElementById('exportIncludeSyncCfg') || {}).checked;
    out.e_pwdUnchecked = !(document.getElementById('exportIncludeSyncPwd') || {}).checked;
    out.e_pwdWrapShown = ((document.getElementById('exportSyncPwdWrap') || {}).style.display !== 'none');
    try { closeOpenModals(); } catch (e) {}
    await sleep(200);
    var cfg = buildFullBackupPayload().syncConfig;
    syncConfig = { server: '', username: '', password: '' };
    var pr = askRestoreSyncConfig(cfg);
    await sleep(450);
    out.f_open = !!document.getElementById('syncRestoreAskModal');
    out.f_info = ((document.querySelector('#syncRestoreAskModal .sync-restore-info') || {}).textContent || '').trim();
    out.f_btnCount = document.querySelectorAll('#syncRestoreAskModal .confirm-modal-buttons button').length;
    document.getElementById('syncRestoreOnlyRecords').click();
    out.f_choiceRecords = await pr;
    out.f_cfgUntouched = (syncConfig.server === '' && syncConfig.username === '');
    var pr2 = askRestoreSyncConfig(cfg);
    await sleep(400);
    document.getElementById('syncRestoreAll').click();
    out.g_choiceRestore = await pr2;
    var applied = await applySyncConfigFromBackup(cfg);
    await sleep(250);
    out.g_applied = (applied === true);
    out.g_restored = (syncConfig.username === 'e2e@test.com' && syncConfig.server === 'https://dav.jianguoyun.com/dav/');
    out.g_pwdEmpty = (syncConfig.password === '');
    out.g_cardBound = (document.getElementById('syncAcctOn') || {}).style.display === 'block';
    syncConfig = { server: 'https://dav.jianguoyun.com/dav/', username: 'e2e@test.com', password: 'pwd1234567890ab' };
    var cfgP = buildFullBackupPayload({ includeCfg: true, includePwd: true }).syncConfig;
    syncConfig = { server: '', username: '', password: '' };
    await applySyncConfigFromBackup(cfgP);
    out.h_pwdBack = (syncConfig.password === 'pwd1234567890ab');
    syncConfig = { server: '', username: '', password: '' };
    AppStore.setItem('hiking_sync_config', { server: '', username: '', password: '' });
    try { renderSyncForm(''); } catch (e) {}
    try { closeOpenModals(); } catch (e) {}
    out.z_noCrash = ((typeof __getCrashQueue === 'function') ? __getCrashQueue().length : -1) === crash0;
    return out;
  });
  ok('备份配置-未绑定时不带配置', cfgChk.a_null === true);
  ok('备份配置-默认带服务器与账号', cfgChk.b_cfg === true);
  ok('备份配置-默认不含密码且无明文', cfgChk.b_pwdEmpty === true && cfgChk.b_noPlain === true);
  ok('备份配置-勾选后带密码且为密文', cfgChk.c_pwdSet === true && cfgChk.c_notPlain === true);
  ok('备份配置-取消勾选则不带', cfgChk.d_null === true);
  ok('★自动/上传路径默认不带密码（防全局选项污染）', cfgChk.d_autoNoPwd === true);
  ok('导出弹窗有「包含网盘配置」且默认勾上', cfgChk.e_block === true && cfgChk.e_cfgChecked === true, JSON.stringify(cfgChk).slice(0, 110));
  ok('导出弹窗-密码项默认不勾', cfgChk.e_pwdUnchecked === true);
  ok('导出弹窗-默认勾选时密码项可见', cfgChk.e_pwdWrapShown === true);
  ok('导入询问弹窗出现且显示账号', cfgChk.f_open === true && cfgChk.f_info.indexOf('e2e@test.com') >= 0, cfgChk.f_info);
  ok('询问弹窗为并列两按钮', cfgChk.f_btnCount === 2);
  ok('选「只恢复记录」不动本机配置', cfgChk.f_choiceRecords === 'records' && cfgChk.f_cfgUntouched === true);
  ok('选「恢复配置」后本机配置被填好', cfgChk.g_choiceRestore === 'restore' && cfgChk.g_applied === true && cfgChk.g_restored === true, JSON.stringify([cfgChk.g_applied, cfgChk.g_restored]));
  ok('恢复后密码留空待补填', cfgChk.g_pwdEmpty === true);
  ok('恢复后账号卡变已绑定', cfgChk.g_cardBound === true);
  ok('带密码的备份可还原密码', cfgChk.h_pwdBack === true);
  ok('备份配置流程无运行时错误', cfgChk.z_noCrash === true);
  console.log('== E2E: 弹窗健壮性（永挂 / 间距）==');
  const dlgRobust = await page.evaluate(async function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var out = {};
    var holder = 'pending';
    var p = askRestoreSyncConfig({ server: 'https://dav.jianguoyun.com/dav/', username: 'e2e@test.com', password: '' });
    p.then(function (v) { holder = v; });
    await sleep(400);
    out.opened = !!document.getElementById('syncRestoreAskModal');
    try { closeOpenModals(); } catch (e) {}
    await sleep(550);
    out.afterForceClose = holder;
    var h2 = 'pending';
    var p2 = askRestoreSyncConfig({ server: 'https://dav.jianguoyun.com/dav/', username: 'e2e@test.com', password: '' });
    p2.then(function (v) { h2 = v; });
    await sleep(400);
    var btn = document.getElementById('syncRestoreAll');
    if (btn) btn.click();
    await sleep(300);
    out.afterClickAll = h2;
    out.modalGone = !document.getElementById('syncRestoreAskModal');
    try { closeOpenModals(); } catch (e) {}
    await sleep(200);
    try { showSyncStatusModal(); } catch (e) { out.err = String(e); }
    await sleep(450);
    var msg = document.querySelector('.confirm-modal .confirm-modal-message') || document.querySelector('.confirm-modal .confirm-modal-content');
    var btns = document.querySelector('.confirm-modal .confirm-modal-buttons');
    if (msg && btns) {
      var maxB = -1;
      msg.querySelectorAll('*').forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.height > 2 && r.width > 2 && r.bottom > maxB) maxB = r.bottom;
      });
      out.statusGap = Math.round(btns.getBoundingClientRect().top - maxB);
      out.statusOverlap = btns.getBoundingClientRect().top < maxB - 0.5;
    } else { out.statusGap = 'missing'; }
    try { closeOpenModals(); } catch (e) {}
    return out;
  });
  ok('询问弹窗被外部关闭时 Promise 仍 resolve（不永挂）', dlgRobust.opened === true && dlgRobust.afterForceClose === 'records', String(dlgRobust.afterForceClose));
  ok('询问弹窗正常点「恢复配置」仍返回 restore', dlgRobust.afterClickAll === 'restore' && dlgRobust.modalGone === true, String(dlgRobust.afterClickAll));
  ok('同步状态弹窗内容与按钮不重合（≥8px）', dlgRobust.statusOverlap === false && dlgRobust.statusGap >= 8, 'gap=' + dlgRobust.statusGap);

  console.log('== E2E: 弹窗体系统一（层级 / 遮罩 / 旧写法残留）==');
  const dlgUni = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const zOf = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).zIndex : 'MISSING'; };
    const bgOf = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundColor : 'MISSING'; };
    const run = (fn) => { try { fn(); } catch (e) { out.err = (out.err || '') + String(e) + ';'; } };
    const lightZ = [], lightBg = [];
    run(() => { closeOpenModals(); showExportModal(); });                    await sleep(380);
    lightZ.push(zOf('#exportModal')); lightBg.push(bgOf('#exportModal'));
    run(() => { closeOpenModals(); showImportModal(); });                    await sleep(380);
    lightZ.push(zOf('#importMethodModal')); lightBg.push(bgOf('#importMethodModal'));
    run(() => { closeOpenModals(); openSyncBindModal(); });                  await sleep(380);
    lightZ.push(zOf('#syncBindModal')); lightBg.push(bgOf('#syncBindModal'));
    run(() => { closeOpenModals(); askRestoreSyncConfig({ server: 'https://dav.jianguoyun.com/dav/', username: 'a@b.com', password: '' }); });
    await sleep(380);
    lightZ.push(zOf('#syncRestoreAskModal')); lightBg.push(bgOf('#syncRestoreAskModal'));
    try { closeOpenModals(); } catch (e) {}
    await sleep(140);
    out.lightZ = lightZ; out.lightBg = lightBg;
    out.leftover = document.querySelectorAll('#exportModal, #importMethodModal, #syncBindModal, #syncRestoreAskModal').length;
    out.oldCls = document.querySelectorAll('.sync-config-toggle-btn, .sync-config-collapse').length;
    // 按钮体系（原 modal-option-btn / modal-cancel-btn 已统一为标准按钮）
    const pickBtn = (sel) => { const e = document.querySelector(sel); if (!e) return 'MISSING'; const c = getComputedStyle(e); return c.backgroundColor + '|' + c.borderTopLeftRadius + '|' + c.cursor + '|' + c.color; };
    try { closeOpenModals(); showExportModal(); } catch (e) {}
    await sleep(380);
    out.btnWideOption = pickBtn('#exportRecordsBtn');
    out.btnWideCancel = pickBtn('#closeExportModal');
    out.oldBtnCls = document.querySelectorAll('.modal-option-btn, .modal-cancel-btn').length;   // ★须在弹窗仍打开时采样
    // ★2026-09-17 危险操作确认（askConfirm）：确定按钮必须仍是红色（红色只给重要/危险操作）
    try { closeOpenModals(); askConfirm({ title: 't', message: 'm', danger: true, okText: '确认', cancelText: '取消' }); } catch (e) {}
    await sleep(420);
    out.dangerOk = pickBtn('#askConfirmOk');
    out.askModalCls = ((document.querySelector('#askConfirmModal') || {}).className || 'MISSING');
    try { closeOpenModals(); } catch (e) {}
    await sleep(160);
    try { closeOpenModals(); } catch (e) {}
    await sleep(160);
    try { closeOpenModals(); openSyncBindModal(); } catch (e) {}
    await sleep(380);
    out.btnStdPrimary = pickBtn('#syncBindModal .check-go-btn');
    out.btnStdCancel = pickBtn('#syncBindModal .confirm-btn-cancel');
    try { closeOpenModals(); } catch (e) {}
    // 深色：旧的 inline 0.3 会压过 .confirm-modal 的深色 0.7 → 导出/导入弹窗遮罩比别的淡
    document.body.classList.add('dark-mode');
    await sleep(260);
    run(() => { closeOpenModals(); showExportModal(); });   await sleep(360);
    out.darkExportBg = bgOf('#exportModal');
    run(() => { closeOpenModals(); openSyncBindModal(); }); await sleep(360);
    out.darkBindBg = bgOf('#syncBindModal');
    try { closeOpenModals(); } catch (e) {}
    document.body.classList.remove('dark-mode');
    return out;
  });
  ok('四类弹窗层级统一为 100（导出/导入原为 50）', dlgUni.lightZ.length === 4 && dlgUni.lightZ.every((v) => v === '100') && !dlgUni.err, 'z=' + (dlgUni.lightZ || []).join(',') + (dlgUni.err ? ' err=' + dlgUni.err : ''));
  ok('四类弹窗浅色遮罩一致（同一套 .confirm-modal）', dlgUni.lightBg.length === 4 && dlgUni.lightBg.every((v) => v === dlgUni.lightBg[0]), (dlgUni.lightBg || []).join(' | '));
  ok('四类弹窗深色遮罩一致（原导出/导入被内联 0.3 压淡）', dlgUni.darkExportBg === dlgUni.darkBindBg, 'export=' + dlgUni.darkExportBg + ' bind=' + dlgUni.darkBindBg);
  ok('四类弹窗均能被 closeOpenModals 清理（无残留）', dlgUni.leftover === 0, String(dlgUni.leftover));
  ok('旧折叠区类已从 DOM 彻底移除', dlgUni.oldCls === 0, String(dlgUni.oldCls));
  ok('弹窗按钮旧类已彻底移除（modal-option-btn / modal-cancel-btn）', dlgUni.oldBtnCls === 0, String(dlgUni.oldBtnCls));
  ok('导出弹窗「选项按钮」为中性玻璃（红色不铺在普通选项上）', (dlgUni.btnWideOption || '').indexOf('185, 28, 28') < 0 && (dlgUni.btnWideOption || '').indexOf('rgba(255, 255, 255') >= 0, 'wide=' + dlgUni.btnWideOption);
  ok('★红色语义守卫：危险操作确认按钮仍是红色', (dlgUni.dangerOk || '').indexOf('185, 28, 28') >= 0, dlgUni.dangerOk);
  ok('askConfirm 用标准玻璃弹窗外壳', (dlgUni.askModalCls || '').indexOf('confirm-modal') >= 0, dlgUni.askModalCls);
  ok('导出弹窗「取消按钮」配色与全站取消按钮一致', dlgUni.btnWideCancel === dlgUni.btnStdCancel, 'wide=' + dlgUni.btnWideCancel + ' std=' + dlgUni.btnStdCancel);

  // ==================== 同意留存（★2026-09-18）：显式勾选 + 条款版本 + 时间戳 ====================
  console.log('== E2E: 同意留存（隐私政策 / 免责声明）==');
  await page.evaluate(() => {
    try { localStorage.setItem('__e2e_legal_clear', '1'); localStorage.removeItem('hiking_legal_agree'); } catch (e) { }
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1700);   // 等启动自动弹（600ms 触发 + 渐入）
  const consent0 = await page.evaluate(() => {
    const m = document.getElementById('legalConsentModal');
    const c = document.getElementById('legalAgreeChk');
    return {
      hasModal: !!m,
      text: m ? m.textContent : '',
      chkChecked: c ? c.checked : null,
      agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null,
      stored: (function () { try { return localStorage.getItem('hiking_legal_agree'); } catch (e) { return 'ERR'; } })()
    };
  });
  ok('首次启动自动弹出同意弹窗', consent0.hasModal === true, consent0.text.slice(0, 30));
  ok('同意弹窗含条款链接与勾选框', consent0.text.indexOf('《隐私政策》') >= 0 && consent0.text.indexOf('《免责声明》') >= 0 && consent0.text.indexOf('我已阅读并同意') >= 0);
  ok('初始未勾选且未记录同意', consent0.chkChecked === false && consent0.agreed === false && !consent0.stored);
  await shotAndCheck('10-legal-consent-light', '.confirm-modal-content');

  await page.locator('#legalAgree').click();   // 未勾选直接点同意
  await page.waitForTimeout(250);
  const consent1 = await page.evaluate(() => ({
    still: !!document.getElementById('legalConsentModal'),
    agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null
  }));
  ok('未勾选时点「同意并继续」被拦下（弹窗未关、未记录）', consent1.still === true && consent1.agreed === false);

  await page.locator('#legalAgreeChk').click();          // 勾选
  await page.locator('#legalOpenPrivacy').click();       // 查看隐私政策
  await page.waitForTimeout(500);
  const viewing = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('.confirm-modal'));
    return {
      privacyOpen: !!document.getElementById('privacy-close'),
      consentKept: !!document.getElementById('legalConsentModal'),
      total: a.length,
      consentFirst: a.length === 2 && a[0].id === 'legalConsentModal',
      agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null
    };
  });
  ok('点《隐私政策》能叠层查看（条款弹窗在上）', viewing.privacyOpen === true);
  ok('★同意弹窗免疫 closeOpenModals（data-persist，无需临时摘 DOM）', viewing.consentKept === true && viewing.total === 2 && viewing.consentFirst === true, 'n=' + viewing.total + ' first=' + viewing.consentFirst);
  ok('查看条款不会误记录同意', viewing.agreed === false);
  await page.locator('#privacy-close').click();
  await page.waitForTimeout(450);
  const restored = await page.evaluate(() => {
    const m = document.getElementById('legalConsentModal');
    const c = document.getElementById('legalAgreeChk');
    return { back: !!m, onlyOne: document.querySelectorAll('.confirm-modal').length === 1, keepChecked: c ? c.checked : null };
  });
  ok('关掉条款弹窗后回到同意弹窗（唯一弹窗、无残留）', restored.back === true && restored.onlyOne === true);
  ok('勾选状态保留（无需重新勾）', restored.keepChecked === true);

  // ★豁免机制本身：普通 closeOpenModals() 不得误清常驻弹窗；force 才清得掉
  const persistChk = await page.evaluate(() => {
    closeOpenModals();
    const kept = !!document.getElementById('legalConsentModal');
    closeOpenModals(true);
    return { kept: kept, forceCleared: !document.getElementById('legalConsentModal') };
  });
  ok('★closeOpenModals() 豁免 data-persist 弹窗', persistChk.kept === true);
  ok('closeOpenModals(true) 可强制清理常驻弹窗（保留强制口子）', persistChk.forceCleared === true);
  await page.evaluate(() => { showLegalConsentModal(); });
  await page.waitForTimeout(400);

  await page.locator('#legalLater').click();   // 暂不同意
  await page.waitForTimeout(300);
  const later = await page.evaluate(() => ({
    closed: !document.getElementById('legalConsentModal'),
    agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null
  }));
  ok('「暂不同意」关闭弹窗且不记录', later.closed === true && later.agreed === false);

  await page.evaluate(() => { showLegalConsentModal(); });
  await page.waitForTimeout(400);
  await page.locator('#legalAgreeChk').click();
  await page.locator('#legalAgree').click();   // 正式同意
  await page.waitForTimeout(450);
  const consent2 = await page.evaluate(() => ({
    closed: !document.getElementById('legalConsentModal'),
    agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null,
    rec: (function () { try { return JSON.parse(localStorage.getItem('hiking_legal_agree')); } catch (e) { return null; } })()
  }));
  ok('勾选后同意 → 弹窗关闭且已记录', consent2.closed === true && consent2.agreed === true);
  ok('同意记录含条款版本 + ISO 时间戳', !!(consent2.rec && consent2.rec.version === '2026-09-18' && /^\d{4}-\d{2}-\d{2}T/.test(consent2.rec.at || '')), JSON.stringify(consent2.rec));

  await page.evaluate(() => { try { localStorage.removeItem('__e2e_legal_clear'); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1700);
  const after = await page.evaluate(() => ({
    noModal: !document.getElementById('legalConsentModal'),
    agreed: (typeof hasAgreedLegal === 'function') ? hasAgreedLegal() : null
  }));
  ok('已同意后启动不再打扰（刷新验证）', after.noModal === true && after.agreed === true);

  await page.evaluate(() => { showPrivacyPolicyModal(); });
  await page.waitForTimeout(450);
  const stampTxt = await page.locator('.confirm-modal-message').textContent().catch(() => '');
  ok('隐私政策弹窗展示「同意时间 + 条款版本」（可查证）', stampTxt.indexOf('你已于') >= 0 && stampTxt.indexOf('条款版本') >= 0, (stampTxt.match(/你已于[^）]*）/) || [''])[0]);
  await page.evaluate(() => { const b = document.getElementById('privacy-close'); if (b) b.click(); });
  await page.waitForTimeout(300);

  // 未同意时「首次进关于应用（设置页）」也征求同意
  await page.evaluate(() => {
    try { localStorage.setItem('__e2e_legal_clear', '1'); localStorage.removeItem('hiking_legal_agree'); } catch (e) { }
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { closeOpenModals(); } catch (e) { } });   // 关掉启动那次
  await page.evaluate(() => { const b = document.querySelector('.tab-btn[data-tab="settings"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  const tabPrompt = await page.evaluate(() => !!document.getElementById('legalConsentModal'));
  ok('未同意时首次进入「关于应用」页也征求同意', tabPrompt === true);
  await page.evaluate(() => {
    try {
      const c = document.getElementById('legalAgreeChk'); if (c) c.click();
      const b = document.getElementById('legalAgree'); if (b) b.click();
    } catch (e) { }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { try { localStorage.removeItem('__e2e_legal_clear'); } catch (e) { } });

  await browser.close();
  console.log('--- 页面 JS 错误(' + errors.length + '):', errors.slice(0, 5).join(' ;; ') || '无');
  console.log('===== E2E: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E 异常:', e); process.exit(2); });
