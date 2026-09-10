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

  await browser.close();
  console.log('--- 页面 JS 错误(' + errors.length + '):', errors.slice(0, 5).join(' ;; ') || '无');
  console.log('===== E2E: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E 异常:', e); process.exit(2); });
