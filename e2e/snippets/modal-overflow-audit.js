// e2e/snippets/modal-overflow-audit.js
// 矮屏下检查长内容弹窗是否溢出可视区 / 内容被截断。
// 用法：node e2e/inspect.js --file e2e/snippets/modal-overflow-audit.js --vw 375 --vh 667
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
  try { fn(); } catch (e) { out.push({ 标签: label, err: String(e).slice(0, 80) }); return; }
  const el = latest();
  if (!el) { out.push({ 标签: label, err: '未生成弹窗' }); return; }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const vh = window.innerHeight;
  out.push({
    标签: label,
    实高: el.offsetHeight,
    顶边距: Math.round(r.top),
    底边距: Math.round(vh - r.bottom),
    溢出屏幕: r.top < 0 || r.bottom > vh,
    视觉高: Math.round(r.height),
    内容高: el.scrollHeight,
    被截断: el.scrollHeight > el.clientHeight + 1,
    纵向: cs.overflowY,
    声明maxH: cs.maxHeight,
  });
};

probe('选择日期时间', () => openDateTimePicker('nope', ''));
probe('数据管理说明', () => showDataInfoModal());
probe('免责声明', () => showDisclaimerModal());
probe('隐私政策', () => showPrivacyPolicyModal());
probe('更新日志', () => showChangelogModal());
probe('绑定账号', () => openSyncBindModal());
probe('使用前请确认', () => { if (typeof showLegalConsentModal === 'function') showLegalConsentModal(); });

purge();
return { vw: window.innerWidth, vh: window.innerHeight, out };
