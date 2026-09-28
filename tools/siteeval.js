/* 在已打开的页面里跑一段 JS 并打印结果（CDP）
 * 用法: node tools/_eval.js <url> "<js-expression>" [width]
 * 需先在同一 shell 会话内启动 chrome --remote-debugging-port=9333
 */
const http = require('http');
const path = require('path');
const PORT = 9333;

function getJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let b = ''; r.on('data', c => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  const URL_ = process.argv[2];
  const EXPR = process.argv[3];
  const WIDTH = parseInt(process.argv[4] || '1440', 10);
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  let id = 0; const pending = new Map(); const handlers = new Map();
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const once = ev => new Promise(res => handlers.set(ev, res));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method && handlers.has(m.method)) { const r = handlers.get(m.method); handlers.delete(m.method); r(m.params); }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: URL_ });
  await loaded;
  await new Promise(r => setTimeout(r, 2400));
  const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result && r.result.value !== undefined ? r.result.value : r, null, 1));
  ws.close(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
