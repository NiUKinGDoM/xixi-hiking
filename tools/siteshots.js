#!/usr/bin/env node
/**
 * tools/siteshots.js — 用「真机渲染」生成官网截图（2026-09-28 建）
 *
 * 为什么不用 puppeteer：本机 node 的 child_process.spawn 一律 EBUSY。
 * 所以 Chrome 由 **外部** 起（--remote-debugging-port=9333），本脚本只用 ws 连上去。
 * 又因为 App 的照片走 IndexedDB（file:// 下不可靠），www/ 必须走 **http** 服务。
 *
 * ★用法：必须和 chrome / http server 写在「同一条 shell 命令」里（后台进程会随 shell 退出被杀）
 *   python -m http.server 8123 --directory www &
 *   chrome --headless=new --disable-gpu --hide-scrollbars --remote-debugging-port=9333 \
 *          --user-data-dir="$TEMP/cr-prof" --no-first-run about:blank &
 *   sleep 4
 *   export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1
 *   node tools/siteshots.js
 *
 * 参数： --only=<name,name>   只生成指定几张
 *        --out=<dir>          输出目录（默认 ../site/assets/shots）
 *        --base=<url>         默认 http://127.0.0.1:8123/index.html
 *
 * ★演示数据是「真的灌进 App 的 localStorage」再由 App 自己算出来的，
 *   LEGAL_VERSION / 数据结构全部从源码读，禁写死（写死了一改政策就失效）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const PORT = 9333;
const argOf = (n) => {
  const eq = process.argv.filter(a => a.indexOf('--' + n + '=') === 0)[0];
  if (eq) return eq.slice(n.length + 3);
  const i = process.argv.indexOf('-' + n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const OUT_DIR = argOf('out') || path.join(ROOT, 'site', 'assets', 'shots');   // ★注意：site/ 在 hiking-app3 内，不是 ROOT/..
const BASE = argOf('base') || 'http://127.0.0.1:8123/index.html';
const ONLY = (argOf('only') || '').split(',').map(s => s.trim()).filter(Boolean);

// ── 从源码读 LEGAL_VERSION（禁写死） ──────────────────────────────────────
const APP_DATA_SRC = fs.readFileSync(path.join(WWW, 'app-data.js'), 'utf8');
const LEGAL_VERSION = (APP_DATA_SRC.match(/const LEGAL_VERSION = '([^']+)'/) || [])[1];
if (!LEGAL_VERSION) { console.error('✗ 读不到 LEGAL_VERSION'); process.exit(1); }
const APP_VERSION = (fs.readFileSync(path.join(WWW, 'app-core.js'), 'utf8').match(/var APP_VERSION = '([^']+)'/) || [])[1];

// ── 演示数据（37 条，2023-04 ~ 2026-09；数字都是 App 自己算的） ─────────────
// [山名, 海拔m, 难度1-5, 用时min, 里程km, 心情emoji, 天气emoji, 同行人, 小日记]
const RECORDS = [
  // 2026
  ['太白山', 3767, 5, 480, 22.6, '🤩', '☀️', '俱乐部', '拔仙台的风大到站不稳，下次轻装。'],
  ['冰晶顶', 3015, 4, 420, 18.2, '🤩', '☀️', '老搭档', '凌晨四点上路，赶在云海散之前登顶。'],
  ['鳌太线', 3475, 5, 1560, 68.4, '😮‍💨', '🌧️', '三人行', '第二天雾大到看不见路标，第三天从塘口下撤。'],
  ['东梁', 2965, 4, 390, 16.5, '😄', '🌤️', '周末小队', '草甸上风一直没停，晚上睡觉像有人在拉帐篷。'],
  ['首阳山', 2719, 4, 355, 14.8, '😌', '☀️', '老搭档', '落叶松黄成一片，踩上去沙沙响。'],
  ['跑马梁', 2887, 4, 400, 17.3, '😄', '☁️', '俱乐部', '梁上视野开阔，能看见远处三道山脊。'],
  ['翠华山', 2132, 3, 260, 11.4, '😌', '🌤️', '家人', '山崩石海那段路好走，带孩子也合适。'],
  ['南五台', 1688, 3, 240, 9.8, '😄', '☀️', '家人', '台阶多但一路有树荫，山顶看得见长安城。'],
  ['嘉午台', 1870, 3, 280, 10.6, '😌', '☀️', '周末小队', '龙背那段有点窄，走中间别靠边。'],
  ['子午峪', 1200, 2, 200, 8.2, '😄', '🌤️', '独行', '溪水一路跟着走，夏天来最舒服。'],
  ['太平峪', 1750, 3, 250, 10.1, '😌', '☀️', '周末小队', '柳叶桥那边人多，往上走就清净了。'],
  // 2025
  ['贡嘎环线', 4300, 5, 3300, 76.5, '🤩', '🌤️', '三人行', '海拔上了四千米之后，走十步就得喘一会儿。'],
  ['四姑娘山二峰', 5276, 5, 720, 26.8, '🤩', '❄️', '俱乐部', '雪线以上全是碎石，下撤那条沟别走。'],
  ['武功山', 1918, 3, 300, 13.2, '😄', '☁️', '老搭档', '金顶的云海等到下午才散开。'],
  ['太白山', 3767, 5, 520, 23.4, '🤩', '☀️', '俱乐部', '第二次上拔仙台，这次带了羽绒服，明智。'],
  ['祥峪', 1600, 2, 210, 9.4, '😌', '🌤️', '家人', '路缓，适合慢慢走。'],
  ['紫阁峪', 1180, 2, 180, 7.6, '😄', '☀️', '独行', '人少，安静。'],
  ['黄峪寺', 1580, 3, 230, 9.2, '😌', '🌤️', '周末小队', '寺前的两棵银杏刚好。'],
  ['分水岭', 2100, 3, 300, 12.8, '😄', '🌧️', '老搭档', '半路下雨，借了护林站一把伞。'],
  ['五台山北台', 3061, 4, 440, 20.4, '😌', '☀️', '家人', '北台的风比想象中大，八月也冷。'],
  ['光雾山', 2350, 4, 380, 15.6, '🤩', '🌤️', '俱乐部', '红叶正好，一路都在拍照。'],
  ['净业寺', 1200, 2, 170, 6.8, '😄', '☀️', '独行', '沣峪口的清晨，上山的人不多。'],
  ['管坪村', 1450, 2, 190, 8.0, '😌', '☀️', '家人', '村口的柿子树红了。'],
  ['小峪', 1400, 2, 195, 8.6, '😄', '🌤️', '周末小队', '沿着溪走到尽头有一处小瀑布。'],
  // 2024
  ['华山', 2154, 4, 330, 22.3, '🤩', '☀️', '家人', '北峰看日出，值了。'],
  ['沣峪口 · 秦岭', 1250, 2, 240, 18.6, '😌', '☀️', '周末小队', '第一次进秦岭，溪水边歇了会儿脚。'],
  ['朱雀森林公园', 2887, 4, 360, 15.8, '😄', '🌤️', '老搭档', '桦树林里雾一阵一阵的。'],
  ['万花山', 1900, 3, 260, 11.2, '😌', '☀️', '家人', '路上遇见一群羊。'],
  ['太峪', 1320, 2, 185, 7.4, '😄', '🌤️', '独行', '走错一次岔口，多绕了半小时。'],
  ['王顺山', 2239, 3, 320, 13.6, '😌', '☀️', '周末小队', '石阶修得好，一路都是松树。'],
  ['牛背梁', 2802, 4, 430, 18.9, '🤩', '☁️', '俱乐部', '高山草甸上能看见羚牛脚印。'],
  ['太白山', 3767, 5, 500, 22.1, '😮‍💨', '❄️', '老搭档', '十月已经是雪线，走了一整天才到大爷海。'],
  ['翠华山', 2132, 3, 270, 11.8, '😄', '☀️', '家人', '冰洞太凉，待五分钟就出来了。'],
  // 2023
  ['南五台', 1688, 3, 250, 10.2, '😄', '☀️', '周末小队', '第一次和朋友一起爬山。'],
  ['子午峪', 1200, 2, 210, 8.8, '😌', '🌤️', '家人', '第一次走完全程没让人背。'],
  ['华山', 2154, 4, 400, 24.6, '😮‍💨', '🌧️', '独行', '雨天爬完，手脚并用了两段。'],
  ['太白山', 3767, 5, 540, 23.0, '🤩', '☀️', '俱乐部', '人生第一座三千米以上的山。'],
];

// 日期：从 2026-09-20 往回铺，覆盖 2023-04 起（与上面的顺序一一对应）
const DATES = [
  '2026-09-20 06:40', '2026-09-06 05:20', '2026-08-29 07:00', '2026-08-16 04:50',
  '2026-07-25 06:10', '2026-07-04 05:40', '2026-06-14 08:10', '2026-05-24 07:30',
  '2026-05-02 06:00', '2026-04-12 08:40', '2026-03-15 07:20',
  '2025-10-18 05:30', '2025-10-03 04:40', '2025-09-14 06:20', '2025-08-16 05:10',
  '2025-07-19 08:00', '2025-06-28 07:40', '2025-06-07 06:30', '2025-05-17 05:50',
  '2025-04-19 07:10', '2025-03-22 06:00', '2025-03-01 08:20', '2025-02-08 08:50',
  '2025-01-11 07:30',
  '2024-11-16 06:50', '2024-10-05 07:40', '2024-09-08 06:10', '2024-08-03 07:00',
  '2024-07-06 08:30', '2024-06-02 06:40', '2024-04-27 05:30', '2024-04-06 06:20',
  '2024-03-09 07:50',
  '2023-10-21 07:00', '2023-08-12 08:10', '2023-07-01 05:40', '2023-04-15 06:30',
];

const PLANS = [
  ['终南山 · 秦楚古道', 2604, 3, '', '', '+5',  '周六一早出发，走完古道从翠华山出。'],
  ['鳌山 · 太白穿越', 3475, 5, '', '', '+27', '等雪化了再去，这次想走完整条线。'],
  ['紫柏山', 2610, 3, '', '', '+42', '秋天去看云海。'],
  ['华山 · 西峰上北峰下', 2154, 4, '', '', '-2', '约了老搭档，索道来回省点力气。'],
];

function isoOf(s) { return new Date(s.replace(' ', 'T') + ':00').toISOString(); }
function buildSeed() {
  const records = RECORDS.map((r, i) => ({
    id: 'rec' + String(i + 1).padStart(3, '0'),
    name: r[0], elevation: r[1], difficulty: r[2], duration: r[3], distance: r[4],
    mood: r[5], weather: r[6], companions: r[7], notes: r[8],
    photos: [], createdAt: isoOf(DATES[i]), updatedAt: isoOf(DATES[i]),
  }));
  const now = new Date();
  const trips = PLANS.map((p, i) => {
    const d = new Date(now.getTime() + parseInt(p[5], 10) * 86400000);
    d.setHours(6, 30, 0, 0);
    return {
      id: 'plan' + String(i + 1).padStart(2, '0'),
      name: p[0], elevation: p[1], difficulty: p[2], duration: p[3], distance: p[4],
      notes: p[6], createdAt: d.toISOString(), updatedAt: d.toISOString(),
    };
  });
  return { records, trips, version: 1 };
}

// ── CDP ────────────────────────────────────────────────────────────────────
function getJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let b = ''; r.on('data', c => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  const webSocket = require(path.join(ROOT, 'node_modules', 'ws'));
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('没有可用的 page target');

  const ws = new webSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1024 * 1024 * 1024 });
  let id = 0; const pending = new Map(); const handlers = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const once = ev => new Promise(res => handlers.set(ev, res));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method && handlers.has(m.method)) { const r = handlers.get(m.method); handlers.delete(m.method); r(m.params); }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const evalJs = async (expr, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
    if (r.exceptionDetails) throw new Error('页内异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result && r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true, screenWidth: 390, screenHeight: 844 });

  // ── 预置：数据 / 同意留存 / 引导已关 / FPS 关 / 浅色 / 标题 / 免过期弹窗 ──
  const seed = buildSeed();
  const seedScript = `(function(){
    try{
      var d = new Date();
      var todayStr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      localStorage.setItem('hiking_records', ${JSON.stringify(JSON.stringify({ version: seed.version, records: seed.records }))});
      localStorage.setItem('planned_trips', ${JSON.stringify(JSON.stringify({ version: seed.version, trips: seed.trips }))});
      localStorage.setItem('hiking_legal_agree', ${JSON.stringify(JSON.stringify({ version: LEGAL_VERSION, at: '2026-09-24T02:00:00.000Z' }))});
      localStorage.setItem('hiking_app_title', ${JSON.stringify(JSON.stringify({ title: 'XiXiの徒步小记' }))});
      ['welcomeBanner','guideRecords','guidePlans','guideSettings'].forEach(function(k){
        localStorage.setItem('hiking_guide_seen_' + k, 'true');
      });
      localStorage.setItem('hiking_show_fps', '{"showFps":false}');
      localStorage.setItem('hiking_theme_mode', '{"mode":"light"}');
      localStorage.setItem('hiking_haptic', '{"enabled":false}');
      localStorage.setItem('hiking_yr_auto_' + d.getFullYear(), '1');
      // 关掉「计划过期」启动关怀弹窗（截的是干净页面，不是被弹窗压住的样子）
      // ★hiking_overdue_remind_date 走裸 localStorage.getItem → 存裸串
      // ★hiking_overdue_care_date 走 AppStore.getItem（内部 JSON.parse）→ 必须存 JSON 串
      localStorage.setItem('hiking_overdue_remind_date', todayStr);
      localStorage.setItem('hiking_overdue_care_date', JSON.stringify(todayStr));
      localStorage.removeItem('hiking_records_corrupt');
    }catch(e){}
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript });

  // ── 建 5 张「插画风」演示照片（画进 canvas → IndexedDB，供照片墙/灯箱真实渲染）──
  const PHOTO_BODY = `
    function scene(kind){
      var c = document.createElement('canvas'); c.width = 900; c.height = 1200;
      var x = c.getContext('2d');
      var SKY = [
        ['#2B3A3B','#6D5744','#D89A64'],
        ['#8FA48C','#4E6450','#243026'],
        ['#C9D5D8','#96A7AF','#5C6C74'],
        ['#3B2C42','#A05A3C','#E1A270'],
        ['#0F1B2C','#22334A','#3C4E63']
      ][kind];
      var g = x.createLinearGradient(0,0,0,1200);
      g.addColorStop(0,SKY[0]); g.addColorStop(.55,SKY[1]); g.addColorStop(1,SKY[2]);
      x.fillStyle = g; x.fillRect(0,0,900,1200);
      if(kind===0||kind===3){
        x.beginPath(); x.arc(kind===0?640:300, kind===0?560:520, 92, 0, 6.3);
        x.fillStyle = 'rgba(248,220,180,' + (kind===0?.85:.8) + ')'; x.fill();
      }
      if(kind===4){
        x.fillStyle = 'rgba(228,233,240,.9)';
        [[110,150,5],[300,96,3.5],[520,190,6],[720,120,3.5],[420,300,4],[680,360,3.5],[180,270,3.5]]
          .forEach(function(s){ x.beginPath(); x.arc(s[0],s[1],s[2],0,6.3); x.fill(); });
      }
      x.fillStyle = 'rgba(46,62,61,.75)';
      x.beginPath(); x.moveTo(0,760);
      [[210,600],[400,720],[600,560],[790,690],[900,620]].forEach(function(p){ x.lineTo(p[0],p[1]); });
      x.lineTo(900,1200); x.lineTo(0,1200); x.closePath(); x.fill();
      x.fillStyle = 'rgba(19,29,28,.94)';
      x.beginPath(); x.moveTo(0,980);
      [[240,860],[470,995],[700,845],[900,930]].forEach(function(p){ x.lineTo(p[0],p[1]); });
      x.lineTo(900,1200); x.lineTo(0,1200); x.closePath(); x.fill();
      if(kind===1){
        x.fillStyle='#1B271C';
        [[110,1020,70],[220,1080,96],[360,1010,80],[520,1090,104],[700,1010,72],[820,1080,92]].forEach(function(t){
          x.beginPath(); x.moveTo(t[0]-t[2]*.36,t[1]); x.lineTo(t[0],t[1]-t[2]); x.lineTo(t[0]+t[2]*.36,t[1]); x.closePath(); x.fill();
        });
      }
      return new Promise(function(r){ c.toBlob(function(b){ r(b); }, 'image/jpeg', .82); });
    }
    var target = records.filter(function(r){ return r.name === '太白山'; })[0] || records[0];
    var ids = [];
    for (var i = 0; i < 5; i++) {
      var pid = 'shotph' + i + '_' + Date.now();
      var blob = await scene(i);
      await photoPut(pid, blob, 900, 1200);
      ids.push(pid);
    }
    target.photos = ids;
    saveToStorage();
    window.__demoRecordId = target.id;
    return ids.length;
  `;

  // ── 分享卡：拦下 generateShareCard 的输出 ─────────────────────────────────
  const SHARE_JS = `(async function(){
    window.shareCardImage = function(dataUrl){ window.__shareCard = dataUrl; };
    window.XixiFileBridge = undefined;
    var rec = records.filter(function(r){ return r.name === '四姑娘山二峰'; })[0] || records[0];
    await generateShareCard(rec);
    return window.__shareCard || null;
  })()`;

  const SHOTS = [
    { name: 'overview',      file: 'shot-overview.png',        setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"overview\"]').click(); if(typeof updateStatistics==='function') updateStatistics(); if(typeof initHeatmap==='function') initHeatmap();" },
    { name: 'records-list',  file: 'shot-records-list.png',    setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"records\"]').click(); recordsViewMode='list'; if(typeof applyRecordsView==='function') applyRecordsView(); if(typeof renderTable==='function') renderTable();" },
    { name: 'records-album', file: 'shot-records-album.png',   setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"records\"]').click(); recordsViewMode='mountain'; if(typeof applyRecordsView==='function') applyRecordsView(); if(typeof renderMountainBook==='function') renderMountainBook();" },
    { name: 'record-detail', file: 'shot-record-detail.png',   setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"records\"]').click(); recordsViewMode='list'; if(typeof applyRecordsView==='function') applyRecordsView(); if(typeof renderTable==='function') renderTable(); try{ closeOpenModals(); }catch(e){} openRecordDetailModal(window.__demoRecordId,'view');" },
    { name: 'plan-calendar', file: 'shot-plan-calendar.png',   setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"plans\"]').click(); plansViewMode='calendar'; if(typeof applyPlansView==='function') applyPlansView(); if(typeof renderPlannedCalendar==='function') renderPlannedCalendar();" },
    { name: 'plan-list',     file: 'shot-plan-list.png',       setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"plans\"]').click(); plansViewMode='list'; if(typeof applyPlansView==='function') applyPlansView(); if(typeof renderPlannedTripsTable==='function') renderPlannedTripsTable();" },
    { name: 'search',        file: 'shot-search.png',          setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"records\"]').click(); recordsViewMode='list'; if(typeof applyRecordsView==='function') applyRecordsView(); if(typeof renderTable==='function') renderTable(); await new Promise(r=>setTimeout(r,700)); var i=document.getElementById('globalSearchInput'); i.value='雪'; i.dispatchEvent(new Event('input',{bubbles:true}));" },
    { name: 'settings',      file: 'shot-settings.png',        setup: "document.querySelector('#bottomTabBar .tab-btn[data-tab=\"settings\"]').click(); var d=document.getElementById('syncDemoBtn'); if(d) d.style.display='none';" },   // ★隐藏「网页预览示例」按钮 —— APK 里本来就不显示，官网截的是 APK 的样子
    // ★深色模式放最后（改完主题后面的图都会变深色）
    { name: 'overview-dark', file: 'shot-overview-dark.png',   setup: "themeMode='dark'; if(typeof applyThemeMode==='function') applyThemeMode(); document.querySelector('#bottomTabBar .tab-btn[data-tab=\"overview\"]').click(); if(typeof updateStatistics==='function') updateStatistics(); if(typeof initHeatmap==='function') initHeatmap();" },
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = [];

  // 启动 + 灌数据
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: BASE });
  await loaded;
  await new Promise(r => setTimeout(r, 2600));
  const curTab = await evalJs('(typeof currentTabId!=="undefined"?currentTabId:"?")');
  const photoCount = await evalJs('window.__injectPhotos = async function(){' + PHOTO_BODY + '}; window.__injectPhotos();', true);
  done.push('注入演示照片 ' + photoCount + ' 张 · 启动 tab=' + curTab);

  // ── 数据自检：确认页面读到的是注入的那份（不是动画中间态） ──────────────
  await new Promise(r => setTimeout(r, 2600));
  const audit = await evalJs(`(function(){
    var R = [];
    R.push('records.length=' + records.length);
    var sum = 0, mx = 0, dur = 0, dist = 0;
    records.forEach(function(r){ dist += Number(r.distance)||0; dur += Number(r.duration)||0; mx = Math.max(mx, Number(r.elevation)||0); });
    R.push('源数据 里程合计=' + dist.toFixed(2) + ' 用时=' + dur + 'min 最高=' + mx);
    R.push('页内 记录数=' + records.length + ' 计划数=' + plannedTrips.length);
    var cards = [].map.call(document.querySelectorAll('#tab-overview .glass-stat-card'), function(c){ return c.textContent.replace(/\\s+/g,' ').trim(); });
    R.push('统计卡: ' + cards.join(' | '));
    return R.join('\\n');
  })()`);
  done.push(audit);

  // ── --dump：把四页的真实可见文案整段导出（内容核对的事实来源，不截图） ──
  if (process.argv.indexOf('--dump') >= 0) {
    const outTxt = [];
    for (const t of ['overview', 'records', 'plans', 'settings']) {
      await evalJs(`(async function(){
        document.querySelector('#bottomTabBar .tab-btn[data-tab="${t}"]').click();
        await new Promise(r=>setTimeout(r,900));
        return 1; })()`, true);
      const txt = await evalJs(`document.getElementById('tab-${t}').innerText.replace(/\\n{2,}/g,'\\n')`);
      outTxt.push('\n══════════ ' + t + ' ══════════\n' + txt);
    }
    fs.writeFileSync(path.join(ROOT, 'tools', 'notes', 'app-tabs-text.txt'), outTxt.join('\n'), 'utf8');
    console.log(outTxt.join('\n'));
    ws.close(); process.exit(0);
  }

  const DISMISS = `(function(){
    try{ if (typeof closeOpenModals === 'function') closeOpenModals(); }catch(e){}
    // ★注意：不是所有弹层都叫 .confirm-modal —— 记录详情弹窗是 #record-detail-modal（无 confirm-modal 类），
    //   只按 .confirm-modal 清会漏掉它，导致后面几张图被上一张的弹窗压住
    document.querySelectorAll('.confirm-modal, .modal-backdrop-animate, .modal-backdrop, [id$="modal"], [id$="Modal"]')
      .forEach(function(m){ try{ m.remove(); }catch(e){} });
    document.body.style.overflow = '';
    return 1;
  })()`;
  const DIAG = `[].map.call(document.querySelectorAll('body > div, body > *'), function(e){
    var cs = getComputedStyle(e);
    if (cs.position === 'fixed' && cs.display !== 'none' && e.offsetHeight > 100) {
      return (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height);
    }
    return null;
  }).filter(Boolean)`;

  for (const s of SHOTS) {
    if (ONLY.length && ONLY.indexOf(s.name) < 0) continue;
    await evalJs(DISMISS);                      // ★拍之前先清场（启动期的关怀/提醒弹窗会压住页面）
    await new Promise(r => setTimeout(r, 350));
    const expr = s.setup
      ? '(async function(){ ' + s.setup + ' await new Promise(r=>setTimeout(r,700)); return 1; })()'
      : '(async function(){ await new Promise(r=>setTimeout(r,300)); return 1; })()';
    try { await evalJs(expr, true); } catch (e) { done.push('⚠ ' + s.name + ' setup 出错: ' + e.message); }
    await new Promise(r => setTimeout(r, 1100));
    done.push('   [' + s.name + '] 残留弹窗=' + JSON.stringify(await evalJs(DIAG)));
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 390, height: 844, scale: 1.5 }, fromSurface: true });
    fs.writeFileSync(path.join(OUT_DIR, s.file), Buffer.from(shot.data, 'base64'));
    done.push('✅ ' + s.file);
    // 关掉可能残留的弹窗，回到干净状态
    await evalJs('try{ closeOpenModals(); }catch(e){}; try{ document.querySelectorAll(".modal-backdrop").forEach(function(m){ m.remove(); }); }catch(e){}');
    await new Promise(r => setTimeout(r, 400));
  }

  // 分享卡（1080×1440，直接落盘）
  if (!ONLY.length || ONLY.indexOf('share') >= 0) {
    try {
      const dataUrl = await evalJs(SHARE_JS, true);
      if (dataUrl && dataUrl.indexOf('data:image/png;base64,') === 0) {
        fs.writeFileSync(path.join(OUT_DIR, 'shot-share-card.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
        done.push('✅ shot-share-card.png');
      } else { done.push('⚠ 分享卡未取到数据'); }
    } catch (e) { done.push('⚠ 分享卡失败: ' + e.message); }
  }

  console.log(done.join('\n'));
  console.log('输出目录: ' + path.relative(process.cwd(), OUT_DIR));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
