// e2e/snippets/modal-size-audit.js
// 逐个打开代表性弹窗，量测真实渲染尺寸。
// ★量测用 offsetWidth（不受 modal-fade-scale 入场动画 transform 影响）。
// 用法：node e2e/inspect.js --file e2e/snippets/modal-size-audit.js --vw 390 --vh 844
const out = [];

const latest = () => {
  const all = document.querySelectorAll('.confirm-modal-content');
  return all[all.length - 1];
};
const purge = () => {
  if (typeof closeOpenModals === 'function') { try { closeOpenModals(true); } catch (e) {} }
  document.querySelectorAll('.confirm-modal, .record-detail-modal, #legalConsentModal').forEach((e) => e.remove());
};

const measure = (label, fn) => {
  purge();
  try { fn(); } catch (e) { out.push({ label, err: String(e).slice(0, 90) }); return; }
  const el = latest();
  if (!el) { out.push({ label, err: '未生成弹窗' }); return; }
  const cs = getComputedStyle(el);
  out.push({
    标签: label,
    实宽: el.offsetWidth,
    实高: el.offsetHeight,
    声明宽: cs.width,
    声明maxW: cs.maxWidth,
    内边距: cs.padding,
    圆角: cs.borderRadius,
    纵向: cs.overflowY,
    父display: el.parentElement ? getComputedStyle(el.parentElement).display : '',
  });
};

// —— 极简确认 / 短提示 ——
measure('删除记录确认', () => showDeleteConfirmModal('nope', '测试记录'));
measure('确认完成', () => { if (typeof showConfirmCompleteModal === 'function') showConfirmCompleteModal('x', '测试计划'); });
measure('删除计划确认', () => { if (typeof showDeletePlannedTripConfirmModal === 'function') showDeletePlannedTripConfirmModal('x', '测试计划'); });
measure('askConfirm·短文案', () => askConfirm({ title: '确认', message: '确定吗？' }));
measure('askConfirm·长文案', () => askConfirm({ title: '删除记录', message: '确定要删除「2026-10-16 秦岭徒步」这条记录吗？照片将一并删除，此操作无法撤销。' }));

// —— 选择器 ——
measure('选择难度', () => openDifficultyPicker('nope'));
measure('选择日期时间', () => openDateTimePicker('nope', ''));
measure('选择心情', () => openMoodWeatherPicker('mood', 'nope'));
measure('选择年月', () => openHmYmPicker());

// —— 表单 / 输入 ——
measure('编辑标题', () => showEditTitleModal());
measure('绑定账号', () => openSyncBindModal());

// —— 说明 / 政策 / 长文 ——
measure('数据管理说明', () => showDataInfoModal());
measure('免责声明', () => showDisclaimerModal());
measure('隐私政策', () => showPrivacyPolicyModal());
measure('更新日志', () => showChangelogModal());
measure('照片占用', () => openPhotoUsageDetailModal());
measure('发现新版本', () => showUpdateModal({ tag: 'v1.2.4.1', notes: '测试' }));
measure('网盘信息', () => showSyncInfoModal());

// —— 备份 / 云盘 ——
measure('导出备份', () => showExportModal());
measure('导入', () => showImportModal());
measure('选择备份文件', () => showRestoreFileModal([]));
measure('管理云端备份', () => showManageBackupsModal([]));

// —— 大卡片 / 其他 ——
measure('支持作者', () => showSupportModal());

purge();
return { vw: window.innerWidth, vh: window.innerHeight, count: out.length, out };
