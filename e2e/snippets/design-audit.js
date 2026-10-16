// e2e/snippets/design-audit.js
// 设计统一性审计：圆角 / 玻璃配方 / 字号 / 过渡与动画的取值分布。
// 用法：node e2e/inspect.js --file e2e/snippets/design-audit.js --vw 390 --vh 844
const counter = (arr) => {
  const m = {};
  arr.forEach((x) => { m[x] = (m[x] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const pick = (el, p) => getComputedStyle(el)[p];

const all = [...document.querySelectorAll('body *')].filter((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && pick(el, 'visibility') !== 'hidden';
});

// ① 圆角：按「元素角色」分类统计
const byRole = { 按钮: [], 卡片: [], 输入: [], 弹窗: [], 其他: [] };
all.forEach((el) => {
  const br = pick(el, 'borderRadius');
  if (!br || br === '0px') return;
  const cls = (el.className || '').toString();
  if (el.tagName === 'BUTTON' || /btn|button/.test(cls)) byRole.按钮.push(br);
  else if (/card|panel|modal-content/.test(cls)) byRole.卡片.push(br);
  else if (/input|field|textarea/.test(cls) || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') byRole.输入.push(br);
  else if (/confirm-modal-content/.test(cls)) byRole.弹窗.push(br);
  else byRole.其他.push(br);
});

// ② 玻璃配方：backdrop-filter 取值分布
const glass = [];
all.forEach((el) => {
  const bf = pick(el, 'backdropFilter') || pick(el, 'webkitBackdropFilter');
  if (bf && bf !== 'none') glass.push(bf);
});

// ③ 字号分布
const fonts = all.map((el) => pick(el, 'fontSize'));

// ④ 过渡 / 动画（性能相关）
const trans = [];
const anims = [];
all.forEach((el) => {
  const t = pick(el, 'transitionProperty');
  if (t && t !== 'none' && t !== 'all') trans.push(t);
  const a = pick(el, 'animationName');
  if (a && a !== 'none') anims.push(a);
});
const heavy = all.filter((el) => {
  const bf = pick(el, 'backdropFilter');
  return bf && bf !== 'none';
}).length;

return {
  可见元素: all.length,
  圆角分布: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, counter(v).slice(0, 6)])),
  玻璃配方: counter(glass).slice(0, 8),
  用了毛玻璃的元素数: heavy,
  字号分布: counter(fonts).slice(0, 12),
  过渡属性: counter(trans).slice(0, 8),
  动画名: counter(anims).slice(0, 12),
};
