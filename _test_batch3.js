const { JSDOM } = require('C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const fs = require('fs');
const html = fs.readFileSync('www/index.html', 'utf-8');
const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
// 合并 4 个 JS 一次 eval（同一词法环境，模拟真实 script 顺序加载）
const all = ['app-core.js','app-data.js','app-sync.js','app-init.js'].map(f => fs.readFileSync('www/' + f, 'utf-8')).join('\n;\n');
try { w.eval(all); } catch (e) { console.log('加载异常:', e.message.slice(0, 150)); }
const bar = d.getElementById('batchBar');
const modeBtn = d.getElementById('batchModeBtn');
console.log('初始 batchBar display:', bar.style.display);
if (modeBtn) { modeBtn.click(); console.log('点击批量管理后 display:', bar.style.display); }
console.log('batchDeleteBtn 文本:', d.getElementById('batchDeleteBtn') ? d.getElementById('batchDeleteBtn').textContent.trim() : '缺失');
console.log('batchCancelBtn 文本:', d.getElementById('batchCancelBtn') ? d.getElementById('batchCancelBtn').textContent.trim() : '缺失');
// 计划页
const pMode = d.getElementById('plannedBatchModeBtn');
if (pMode) { pMode.click(); console.log('计划页点击后 plannedBatchBar display:', d.getElementById('plannedBatchBar') ? d.getElementById('plannedBatchBar').style.display : 'N/A'); }
// ★2026-09-29：本文件是「临时探针」性质（打印观察值），**不是自动断言套件**。
//   它跑完后 jsdom 的定时器会让进程挂住不退出 → 此前靠外层 SIGTERM 结束（退出码 1，
//   容易被误读成「测试失败」）。这里显式退出，保证退出码 0。
console.log('plannedBatchDeleteBtn 文本:', d.getElementById('plannedBatchDeleteBtn') ? d.getElementById('plannedBatchDeleteBtn').textContent.trim() : '缺失');
process.exit(0);
