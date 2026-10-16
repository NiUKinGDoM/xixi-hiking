// e2e/snippets/modal-inner-audit.js
// 弹窗「内部度量」扫描：内边距 / 标题字号与间距 / 正文字号与间距 / 按钮间距与对齐。
// 用法：node e2e/inspect.js --file e2e/snippets/modal-inner-audit.js --vw 390 --vh 844
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
  try { fn(); } catch (e) { out.push({ 弹窗: label, err: String(e).slice(0, 70) }); return; }
  const el = latest();
  if (!el) { out.push({ 弹窗: label, err: '未生成' }); return; }
  const cs = getComputedStyle(el);
  const t = el.querySelector('.confirm-modal-title');
  const m = el.querySelector('.confirm-modal-message');
  const b = el.querySelector('.confirm-modal-buttons');
  const gt = (n, p) => (n ? getComputedStyle(n)[p] : null);
  out.push({
    弹窗: label,
    内边距: cs.padding,
    标题字号: gt(t, 'fontSize'),
    标题下距: gt(t, 'marginBottom'),
    标题高: t ? t.offsetHeight : null,
    标题图标: t ? t.querySelectorAll('.material-icons').length : null,
    正文字号: gt(m, 'fontSize'),
    正文上距: gt(m, 'marginTop'),
    正文下距: gt(m, 'marginBottom'),
    正文高: m ? m.offsetHeight : null,
    按钮间距: gt(b, 'gap'),
    按钮对齐: gt(b, 'justifyContent'),
    按钮高: b ? b.offsetHeight : null,
    按钮数: b ? b.children.length : 0,
    按钮外边距上: gt(b, 'marginTop'),
  });
};

probe('删除记录确认', () => showDeleteConfirmModal('nope', '测试记录'));
probe('确认完成', () => showConfirmCompleteModal('x', '测试计划'));
probe('删除计划确认', () => showDeletePlannedTripConfirmModal('x', '测试计划'));
probe('askConfirm', () => askConfirm({ title: '确认', message: '确定吗？' }));
probe('清理孤立照片', () => { if (typeof cleanupOrphanPhotos === 'function') cleanupOrphanPhotos(); });
probe('计划过期', () => showCompleteOrDelayModal('x', '测试计划'));
probe('完成/延期', () => showCompleteOrDelayModal('x', '测试计划'));
probe('选择难度', () => openDifficultyPicker('nope'));
probe('选择心情', () => openMoodWeatherPicker('mood', 'nope'));
probe('选择年月', () => openHmYmPicker());
probe('编辑标题', () => showEditTitleModal());
probe('数据管理说明', () => showDataInfoModal());
probe('免责声明', () => showDisclaimerModal());
probe('隐私政策', () => showPrivacyPolicyModal());
probe('更新日志', () => showChangelogModal());
probe('照片占用', () => openPhotoUsageDetailModal());
probe('发现新版本', () => showUpdateModal({ tag: 'v1.2.5.0', notes: '测试' }));
probe('网盘信息', () => showSyncInfoModal());
probe('同步状态', () => showSyncStatusModal());
probe('导出备份', () => showExportModal());
probe('导入', () => showImportModal());
probe('管理云端备份', () => showManageBackupsModal([]));
probe('选择备份文件', () => showRestoreFileModal([]));
probe('支持作者', () => showSupportModal());
probe('使用前请确认', () => showLegalConsentModal());

purge();
return { count: out.length, out };
