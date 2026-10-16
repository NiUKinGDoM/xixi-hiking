// e2e/snippets/mountainbook-audit.js
// 山册抽屉统计（.mb-stat 6 项）在各宽度下的表现：每项宽度 / 值是否折行 / 是否溢出。
// 用法：node e2e/inspect.js --file e2e/snippets/mountainbook-audit.js --vw 320 --vh 700
const vw = window.innerWidth;
const out = [];

// 1) 切到记录 tab
try {
  const tab = document.querySelector('[data-tab="records"], .tab-btn[data-tab="records"]');
  if (tab) tab.click();
} catch (e) {}

// 2) 渲染山册（用当前数据；无数据则用注入的假数据兜底）
let wrap = document.getElementById('mountainBookView');
if (!wrap) return { 视口: vw, err: '未找到 #mountainBookView' };

try { if (typeof renderMountainBook === 'function') renderMountainBook(); } catch (e) {}

// 3) 找到或造一个 .mb-stat（保证测的是"最坏情况"的长值「一起走过」）
let stat = wrap.querySelector('.mb-stat');
if (!stat) {
  const host = wrap.querySelector('.mb-drawer') || wrap;
  host.innerHTML =
    '<div class="mb-stat">' +
    ['1 次|累计', '12.4km|总里程', '6h 23m|总用时', '2860m|最高海拔', '中等|平均难度', '老王/小李/张三|一起走过']
      .map((s) => {
        const p = s.split('|');
        return '<div><div class="sv">' + p[0] + '</div><div class="sl">' + p[1] + '</div></div>';
      }).join('') +
    '</div>';
  stat = wrap.querySelector('.mb-stat');
}
// 抽屉若隐藏则临时显示，保证能量到尺寸
let drawer = stat.closest('.mb-drawer');
let drawerWasHidden = false;
if (drawer && getComputedStyle(drawer).display === 'none') {
  drawer.style.display = 'block';
  drawerWasHidden = true;
}
if (getComputedStyle(wrap).display === 'none') wrap.style.display = 'block';

const cells = [...stat.querySelectorAll(':scope > div')];
const rowW = stat.getBoundingClientRect().width;
cells.forEach((c, i) => {
  const sv = c.querySelector('.sv');
  const sl = c.querySelector('.sl');
  const lh = sv ? parseFloat(getComputedStyle(sv).lineHeight) || parseFloat(getComputedStyle(sv).fontSize) * 1.2 : 0;
  out.push({
    序号: i + 1,
    值: (sv ? sv.textContent : '').slice(0, 12),
    标签: sl ? sl.textContent : '',
    格宽: Math.round(c.getBoundingClientRect().width * 10) / 10,
    值宽: sv ? Math.round(sv.getBoundingClientRect().width * 10) / 10 : null,
    值高: sv ? sv.clientHeight : null,
    值行数: sv && lh ? Math.max(1, Math.round(sv.clientHeight / lh)) : null,
    值溢出: sv ? sv.scrollWidth > sv.clientWidth + 1 : null,
  });
});

const cs = getComputedStyle(stat);
const result = {
  视口: vw,
  抽屉容器宽: Math.round(rowW * 10) / 10,
  统计区display: cs.display,
  统计区列: cs.gridTemplateColumns,
  项数: cells.length,
  最长值行数: Math.max(...out.map((o) => o.值行数 || 1)),
  有溢出: out.some((o) => o.值溢出),
  明细: out,
};
if (drawerWasHidden && drawer) drawer.style.display = '';
return result;
