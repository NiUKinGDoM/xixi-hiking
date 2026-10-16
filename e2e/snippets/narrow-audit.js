// e2e/snippets/narrow-audit.js
// 窄屏适配扫描 v2：横向溢出 / 关键容器宽度 / 中文标签是否折行。
// 用法：node e2e/inspect.js --file e2e/snippets/narrow-audit.js --vw 320 --vh 700
const de = document.documentElement;
const vw = window.innerWidth;

const q = (s) => document.querySelector(s);
const rw = (el) => (el ? Math.round(el.getBoundingClientRect().width * 10) / 10 : null);

// 折行检测：期望单行的元素，用「clientHeight / 行高」估算行数
const labelInfo = (sel) => {
  const el = q(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  const fs = parseFloat(cs.fontSize);
  const unit = (isFinite(lh) && lh > 0) ? lh : fs * 1.2;
  return {
    宽: Math.round(el.clientWidth * 10) / 10,
    行数: Math.max(1, Math.round(el.clientHeight / unit)),
    字号: fs,
    文字: (el.textContent || '').trim().slice(0, 10),
  };
};

// 被挤压的叶子元素（含 ≥3 汉字、宽 <46px）
const squeezed = [];
document.querySelectorAll('body *').forEach((el) => {
  if (el.children.length) return;
  if (el.closest('.material-icons') || el.closest('.material-symbols-rounded') || el.closest('svg')) return;
  const t = (el.textContent || '').trim();
  if (!t) return;
  if (((t.match(/[\u4e00-\u9fa5]/g) || []).length) < 3) return;
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.width < 46) squeezed.push({ 文字: t.slice(0, 14), 宽: Math.round(r.width * 10) / 10 });
});

const tb = q('.bottom-tabbar');
const tbR = tb ? tb.getBoundingClientRect() : null;
const mini = q('.ov-mini-row');

return {
  视口: vw,
  整页横向溢出: Math.max(0, de.scrollWidth - de.clientWidth),
  底栏: rw(tb),
  底栏右边界: tbR ? Math.round(tbR.right * 10) / 10 : null,
  底栏越界: tbR ? tbR.right > vw + 0.5 : null,
  矮卡列数: mini ? getComputedStyle(mini).gridTemplateColumns.split(' ').length : null,
  矮卡方向: q('.ov-mini') ? getComputedStyle(q('.ov-mini')).flexDirection : null,
  矮卡标签: [
    labelInfo('.ov-mini-row > .ov-mini:nth-child(1) .ov-lab'),
    labelInfo('.ov-mini-row > .ov-mini:nth-child(2) .ov-lab'),
    labelInfo('.ov-mini-row > .ov-mini:nth-child(3) .ov-lab'),
  ],
  主卡标签: labelInfo('.ov-main-grid .stat-card p:first-of-type'),
  被挤压总数: squeezed.length,
  被挤压样例: squeezed.slice(0, 6),
};
