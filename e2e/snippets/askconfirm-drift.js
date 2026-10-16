// e2e/snippets/askconfirm-drift.js
// 验证 askConfirm（以及走基类的弹窗）宽度是否随内容漂移。
const out = [];
const latest = () => {
  const all = document.querySelectorAll('.confirm-modal-content');
  return all[all.length - 1];
};
const purge = () => {
  if (typeof closeOpenModals === 'function') { try { closeOpenModals(true); } catch (e) {} }
  document.querySelectorAll('.confirm-modal, .record-detail-modal, #legalConsentModal').forEach((e) => e.remove());
};
const probe = (label, fn) => {
  purge();
  try { fn(); } catch (e) { out.push({ label, err: String(e).slice(0, 70) }); return; }
  const el = latest();
  if (!el) { out.push({ label, err: '无弹窗' }); return; }
  const r = el.getBoundingClientRect();
  const parent = el.parentElement;
  out.push({
    label,
    w: Math.round(r.width * 10) / 10,
    父class: parent ? parent.className : '',
    父display: parent ? getComputedStyle(parent).display : '',
    el宽度声明: getComputedStyle(el).width,
  });
};

probe('askConfirm 极短("确定吗？")', () => askConfirm({ title: '确认', message: '确定吗？' }));
probe('askConfirm 中等', () => askConfirm({ title: '确认', message: '确定要执行这个操作吗？' }));
probe('askConfirm 很长', () => askConfirm({ title: '删除这条记录', message: '确定要删除「2026-10-16 秦岭徒步」这条记录吗？照片将一并删除，此操作无法撤销。' }));

purge();
return { scale: window.innerWidth / document.documentElement.clientWidth, innerW: window.innerWidth, docClientW: document.documentElement.clientWidth, out };
