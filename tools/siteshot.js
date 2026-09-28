/* 官网整页截图（CDP / captureBeyondViewport）
 * 用法: node tools/_shot.js <url> <out.png> [width] [scale] [forceReveal]
 * 依赖: 需先手动起 Chrome:  chrome --headless=new --remote-debugging-port=9333 about:blank
 * 说明: 不 spawn 子进程（本机 spawn 会 EBUSY）→ 只走 HTTP + WebSocket 连接。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const URL_ = process.argv[2];
const OUT = process.argv[3];
const WIDTH = parseInt(process.argv[4] || '1440', 10);
const SCALE = parseFloat(process.argv[5] || '1');
const FORCE = process.argv[6] !== '0';
const PORT = 9333;

function getJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let b = '';
      r.on('data', c => (b += c));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  const targets = await getJSON('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }

  const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const once = ev => new Promise(res => handlers.set(ev, res));

  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method && handlers.has(m.method)) {
      const r = handlers.get(m.method); handlers.delete(m.method); r(m.params);
    }
  });

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: URL_ });
  await loaded;
  await new Promise(r => setTimeout(r, 2600));   // 等字体/动画

  if (FORCE) {
    // 先整页滚一遍：触发 loading="lazy" 图片真正解码，否则 captureBeyondViewport 会拍出空白块
    await send('Runtime.evaluate', {
      expression: `(async()=>{
        // ★先把懒加载关掉：否则滚一遍未必触发全部加载，后面的 img.decode() 会永久等待
        //   （decode() 对「尚未开始加载」的图不 resolve 也不 reject → awaitPromise 直接挂死）
        document.querySelectorAll('img[loading]').forEach(i=>{ i.loading='eager'; });
        const H=document.documentElement.scrollHeight;
        for(let y=0;y<H;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,45));}
        window.scrollTo(0,0);await new Promise(r=>setTimeout(r,300));
        // ★兜底超时：任何一张图卡住也不能把整条命令拖死
        await Promise.race([
          Promise.all([...document.images].map(i=>i.decode?i.decode().catch(()=>0):0)),
          new Promise(r=>setTimeout(r,4000))
        ]);
        window.scrollTo(0,0);
        return document.images.length;})()`,
      awaitPromise: true
    });
    await send('Runtime.evaluate', {
      expression: `(()=>{document.querySelector('.hero')&&document.querySelector('.hero').classList.add('hero-ready');
        document.querySelectorAll('.reveal').forEach(e=>e.classList.add('on'));
        var t=document.getElementById('typedQuery'); if(t) t.textContent='贡嘎';
        document.querySelectorAll('#resList li').forEach(l=>l.classList.add('on'));
        return 1;})()`
    });
    await new Promise(r => setTimeout(r, 700));
  }

  const m = await send('Page.getLayoutMetrics');
  const cs = m.cssContentSize || m.contentSize;
  const Y = parseInt(process.argv[7] || '0', 10);
  const H = parseInt(process.argv[8] || '0', 10);
  const total = Math.min(cs.height, 30000);
  const full = { x: 0, y: Y, width: cs.width, height: H > 0 ? Math.min(H, total - Y) : (total - Y), scale: SCALE };
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: full, fromSurface: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify(full));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
