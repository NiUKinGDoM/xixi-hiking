// e2e/snippets/narrow-modal-audit.js
// 窄屏 + 弹窗组合检查：在各窄屏档位下打开代表性弹窗，量宽度/是否溢出/内部是否被压。
// 用法：node e2e/inspect.js --file e2e/snippets/narrow-modal-audit.js --vw 320 --vh 640
const vw = window.innerWidth;
const vh = window.innerHeight;
const out = [];

const latest = () => {
  const a = document.querySelectorAll('.confirm-modal-content');
  return a[a.length - 1];
};
const purge = () => {
  if (typeof closeOpenModals === 'function') { try { closeOpenModals(true); } catch (e) {} }
  document.querySelectorAll('.confirm-modal, .record-detail-modal, #legalConsentModal').forEach((e) => e.remove());
};

const probe = (label, fn) => {
  purge();
  try { fn(); } catch (e) { out.push({ 弹窗: label, err: String(e).slice(0, 60) }); return; }
  const el = latest();
  if (!el) { out.push({ 弹窗: label, err: '未生成' }); return; }
  const t = el.querySelector('.confirm-modal-title');
  const b = el.querySelector('.confirm-modal-buttons');
  out.push({
    弹窗: label,
    宽: el.offsetWidth,
    高: el.offsetHeight,
    越界: el.offsetWidth > vw - 8,
    标题宽: t ? t.offsetWidth : null,
    标题折行: t ? Math.round(t.clientHeight / (parseFloat(getComputedStyle(t).lineHeight) || 24)) > 1 : null,
    按钮行宽: b ? b.offsetWidth : null,
    按钮溢出: b ? b.scrollWidth > b.clientWidth + 1 : null,
  });
};

probe('删除记录确认', () => showDeleteConfirmModal('nope', '测试记录'));
probe('隐私政策', () => showPrivacyPolicyModal());
probe('数据管理说明', () => showDataInfoModal());
probe('照片占用', () => openPhotoUsageDetailModal());
probe('发现新版本', () => showUpdateModal({ tag: 'v1.2.5.0', notes: '测试' }));
probe('支持作者', () => showSupportModal());
probe('选择日期时间', () => openDateTimePicker('nope', ''));
probe('绑定账号', () => openSyncBindModal());
probe('更新日志', () => showChangelogModal());

purge();
return { 视口: vw + 'x' + vh, count: out.length, out };
