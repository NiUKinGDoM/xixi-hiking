const out = { vw: window.innerWidth, rows: [] };
const vals = [30, 55, 59, 60, 90, 123, 260, 383, 455, 640, 750];
vals.forEach((dur, k) => {
  const stamp = '2026-09-0' + (k + 1) + 'T0' + (k + 1) + ':00:00.000Z';
  records = Array.from({ length: 10 }, (_, i) => ({
    id: 'v' + k + '-' + i, name: 'v' + k + '-' + i, date: '2026-09-0' + (k + 1),
    createdAt: stamp, updatedAt: stamp, duration: dur, distance: 8, elevation: 1000, difficulty: 3
  }));
  if (typeof updateStatistics === 'function') updateStatistics();
  const el = document.getElementById('avgDurationMini');
  const range = document.createRange();
  range.selectNodeContents(el);
  const need = Math.round(range.getBoundingClientRect().width * 10) / 10;
  out.rows.push({
    avgMin: dur, text: el.textContent, html: el.innerHTML,
    client: el.clientWidth, need: need, clipped: need > el.clientWidth + 0.5
  });
});
out.cardW = Math.round(document.querySelector('.ov-mini').getBoundingClientRect().width);
out.anyClipped = out.rows.some(r => r.clipped);
out.bad = out.rows.filter(r => r.clipped).map(r => r.text + '(' + r.need + '>' + r.client + ')').join(' , ') || 'none';
// 顺带确认主卡总用时格式未被改动
const td = document.getElementById('totalDuration');
out.totalDuration = { text: td.textContent, html: td.innerHTML };
// 截图用：隐藏「使用前请确认」条款弹窗（否则挡住统计卡）
const lm = document.getElementById('legalConsentModal');
if (lm) lm.style.display = 'none';
// 截图用：把最后一组数据重渲染成「平均 6.4h」（贴近用户实际看到的 6h+），并立刻结束所有动画
records = Array.from({ length: 10 }, (_, i) => ({
  id: 'shot-' + i, name: 'shot' + i, date: '2026-09-09',
  createdAt: '2026-09-09T09:00:00.000Z', updatedAt: '2026-09-09T09:00:00.000Z',
  duration: [385, 420, 300, 250, 390, 450, 240, 360, 480, 555][i],
  distance: 8.5, elevation: 1200 + i * 30, difficulty: 3
}));
if (typeof updateStatistics === 'function') updateStatistics();
try { document.getAnimations().forEach(a => { try { a.finish(); } catch (e) { } }); } catch (e) { }
// 截图用：滚到统计卡（否则矮卡被固定底栏盖住）
try { document.querySelector('.ov-mini-row').scrollIntoView({ block: 'center' }); } catch (e) { }
return out;
