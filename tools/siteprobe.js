/* 多宽度真实视口探针：横溢 / 元素尺寸 / 计算样式
 * 用法: node tools/_probe.js <url> "<js表达式>" "360,390,414,768,1024,1440"
 * 表达式在「每档宽度生效后」求值，this 为 undefined，可用 document。
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
  const WIDTHS = (process.argv[4] || '1440').split(',').map(s => parseInt(s, 10));
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  let id = 0; const pending = new Map(); const handlers = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const once = ev => new Promise(res => handlers.set(ev, res));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method && handlers.has(m.method)) { const r = handlers.get(m.method); handlers.delete(m.method); r(m.params); }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 844, deviceScaleFactor: 1, mobile: true });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: URL_ });
  await loaded;
  await new Promise(r => setTimeout(r, 2200));

  const out = [];
  for (const w of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: true });
    await new Promise(r => setTimeout(r, 500));
    const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    out.push('── width ' + w + ' ──\n' + (r.result && r.result.value));
  }
  console.log(out.join('\n'));
  ws.close(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
