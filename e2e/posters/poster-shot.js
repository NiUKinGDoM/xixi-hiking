// 海报渲染：打开 posters/*.html → 高清 PNG（1080×1920 @2x = 2160×3840）
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIR = path.resolve(__dirname);
const OUT = path.resolve(DIR, 'out');
const targets = [
  { html: 'poster1.html', out: 'poster1-brand.png' },
  { html: 'poster2.html', out: 'poster2-features.png' }
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  for (const t of targets) {
    const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(DIR, t.html).replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, t.out) });
    console.log('OK', t.out, Math.round(fs.statSync(path.join(OUT, t.out)).size / 1024) + 'KB');
    await page.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
