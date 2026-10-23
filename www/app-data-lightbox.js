// ============================================================================
// 灯箱（全屏查看 / 滑动 / 单独保存）与分享卡生成
// ★2026-10-22 从 app-data.js 按功能边界拆出（原 5464 行单文件 → 6 个文件）。
//   拆分为纯物理切分：所有函数/变量仍在全局作用域，加载顺序与拆分前一致，行为不变。
// ============================================================================

// ===== ★2026-08-20 灯箱（全屏查看 + 滑动 + 单独保存）=====
var photoLightboxEl = null;
function ensureLightbox() {
    if (photoLightboxEl) return photoLightboxEl;
    var div = document.createElement('div');
    div.id = 'photoLightbox';
    div.innerHTML =
        '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 16px;box-sizing:border-box;">' +
        // 标题栏（图片上方，跟随图片不贴屏幕顶；含页码）
        '<div style="position:relative;z-index:6;width:100%;max-width:560px;display:flex;justify-content:space-between;align-items:center;color:#fff;flex-shrink:0;">' +
        '<span id="lb-title" style="font-size:15px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
        '<span id="lb-index" style="color:rgba(255,255,255,0.55);font-size:12px;flex-shrink:0;"></span>' +
        '<button id="lb-close" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0;">✕</button>' +
        '</div>' +
        // 图片（占满标题栏与操作栏之间的全部剩余空间）
        // ★2026-10-17 用户反馈「看照片时太小」：原 `max-height:56%` 是相对容器（已扣 28px 内边距后的
        //   高度），390×844 屏上只有 ~441px；而扣掉标题栏/操作栏与两处 gap 后实际可用 ~680px
        //   ⇒ 白白浪费 239px。现改为 flex:1 1 auto + min-height:0 让它撑满剩余空间，
        //   max-height:100% 兜底、object-fit:contain 保证不变形、max-width:94% 保留左右呼吸。
        '<img id="lb-img" style="position:relative;z-index:1;max-width:94%;max-height:100%;flex:1 1 auto;min-height:0;object-fit:contain;transform-origin:center;will-change:transform;touch-action:pan-y;">' +
        // ★2026-09-01 缩放指示（放大时显示 ×N，还原隐藏）
        '<div id="lb-zoom-ind" style="position:absolute;top:64px;right:16px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px;display:none;z-index:5;"></div>' +
        // 底部操作栏（图片下方）
        '<div style="position:relative;z-index:6;display:flex;gap:16px;align-items:center;flex-shrink:0;">' +
        // ★2026-08-25 左右箭头改 material-icons + flex 居中（‹ › 字符不在圆正中）；保存/删除统一 padding 10px 28px
        '<button id="lb-prev" style="display:flex;align-items:center;justify-content:center;padding:0;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.22);color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;line-height:1;"><span class="material-icons" style="font-size:26px;">chevron_left</span></button>' +
        '<button id="lb-save" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:#fff;padding:10px 28px;border-radius:22px;font-size:14px;cursor:pointer;font-weight:600;backdrop-filter:blur(2px) saturate(150%);-webkit-backdrop-filter:blur(2px) saturate(150%);">保存</button>' +
        '<button id="lb-del" style="background:rgba(70,15,20,0.08);border:1px solid rgba(248,113,113,0.9);color:#fecaca;padding:10px 28px;border-radius:22px;font-size:14px;cursor:pointer;font-weight:600;backdrop-filter:blur(2px) saturate(150%);-webkit-backdrop-filter:blur(2px) saturate(150%);display:none;">删除</button>' +
        '<button id="lb-next" style="display:flex;align-items:center;justify-content:center;padding:0;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.22);color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;line-height:1;"><span class="material-icons" style="font-size:26px;">chevron_right</span></button>' +
        '</div>' +
        '</div>';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;background:rgba(0,0,0,0.93);display:none;';
    document.body.appendChild(div);
    div.querySelector('#lb-close').addEventListener('click', closePhotoLightbox);
    div.querySelector('#lb-prev').addEventListener('click', function () { lbStep(-1); });
    div.querySelector('#lb-next').addEventListener('click', function () { lbStep(1); });
    div.querySelector('#lb-save').addEventListener('click', lbPrimaryAction);
    div.querySelector('#lb-del').addEventListener('click', lbDeleteCurrent);
    div.addEventListener('click', function (e) {
        // 点最外层或内部空白区域（wrapper）关闭；按钮/图片不触发
        if (e.target === div || e.target === div.firstElementChild) closePhotoLightbox();
    });
    // ★2026-09-01 灯箱手势 v2：双指捏合缩放（1~3×）、放大后单指拖动、双击放大/还原、1× 时滑动翻页
    var lbPanStart = null;
    var lbPinchDist = 0, lbPinchScale0 = 1;
    var lbTapTimer = null;
    div.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            lbPanStart = null;
            lbPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            lbPinchScale0 = lbScale;
        } else if (e.touches.length === 1) {
            lbPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: lbPanX, py: lbPanY };
        }
    }, { passive: true });
    div.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            lbScale = Math.max(1, Math.min(3, lbPinchScale0 * (d / Math.max(1, lbPinchDist))));
            lbApplyTransform();
        } else if (e.touches.length === 1 && lbScale > 1 && lbPanStart) {
            e.preventDefault();
            var t = e.touches[0];
            lbPanX = lbPanStart.px + (t.clientX - lbPanStart.x);
            lbPanY = lbPanStart.py + (t.clientY - lbPanStart.y);
            lbApplyTransform();
        }
    }, { passive: false });
    div.addEventListener('touchend', function (e) {
        var t0 = e.changedTouches[0];
        var isTap = lbPanStart && Math.abs(t0.clientX - lbPanStart.x) < 20 && Math.abs(t0.clientY - lbPanStart.y) < 20;
        if (lbScale === 1) {
            // 1×：滑动翻页
            if (lbPanStart && Math.abs(t0.clientX - lbPanStart.x) > 50) {
                if (t0.clientX - lbPanStart.x < 0) lbStep(1); else lbStep(-1);
                lbPanStart = null;
                return;
            }
            // 双击放大
            if (isTap) {
                if (lbTapTimer) { clearTimeout(lbTapTimer); lbTapTimer = null; lbToggleZoom(); }
                else { lbTapTimer = setTimeout(function () { lbTapTimer = null; }, 300); }
            }
        } else {
            // 放大中：双击还原
            if (isTap && e.touches.length === 0) {
                if (lbTapTimer) { clearTimeout(lbTapTimer); lbTapTimer = null; lbToggleZoom(); }
                else { lbTapTimer = setTimeout(function () { lbTapTimer = null; }, 300); }
            }
        }
        if (e.touches.length === 0) lbPanStart = null;
    }, { passive: true });
    photoLightboxEl = div;
    return div;
}
// ★2026-09-01 灯箱缩放状态与变换应用
var lbScale = 1, lbPanX = 0, lbPanY = 0;
function lbApplyTransform() {
    var lb = photoLightboxEl;
    if (!lb) return;
    var img = lb.querySelector('#lb-img');
    if (!img) return;
    img.style.transform = 'translate(' + lbPanX + 'px,' + lbPanY + 'px) scale(' + lbScale + ')';
    if (lbScale === 1 && lbPanX === 0 && lbPanY === 0) {
        img.style.transition = 'transform 0.15s ease-out';
    } else {
        img.style.transition = 'none';
    }
    var zi = lb.querySelector('#lb-zoom-ind');
    if (zi) {
        zi.textContent = lbScale > 1 ? (Math.round(lbScale * 10) / 10) + '×' : '';
        zi.style.display = lbScale > 1 ? 'block' : 'none';
    }
}
function lbResetZoom() {
    lbScale = 1; lbPanX = 0; lbPanY = 0;
    lbApplyTransform();
}
function lbToggleZoom() {
    if (lbScale > 1) { lbScale = 1; lbPanX = 0; lbPanY = 0; }
    else { lbScale = 2.5; }
    lbApplyTransform();
}
function openPhotoLightbox(recordId, startPid, editing, ctxItems) {
    var rec = records.find(r => r.id === recordId);
    if (!rec) return;
    editing = !!editing;
    // ★2026-10-17 修复（用户反馈「山册里组合后打开照片，翻不到其他数据的几张」）：
    //   山册「照片回忆」条是按**山**汇总的（同一座山的多条记录都进同一条），
    //   而原实现只取「起始那一条记录」的 rec.photos ⇒ 照片条显示 8 张、点开却只能翻其中 2 张。
    //   现支持第 4 参 ctxItems = [{rid,pid},…]（照片条的完整顺序）：
    //     · _ids  = 全部 pid（翻页 / 预加载 用它，逻辑不变）
    //     · _rids = 与 _ids 平行，用于翻页时显示当前这张所属记录的名字
    //   编辑模式（记录详情页）仍走原逻辑（含未保存照片），不受影响。
    var ids, rids;
    if (!editing && ctxItems && ctxItems.length) {
        ids = ctxItems.map(function (it) { return it.pid; });
        rids = ctxItems.map(function (it) { return it.rid; });
    } else {
        ids = editing ? editingPhotoIds.slice() : (rec.photos || []).slice();
        rids = null;
    }
    if (!ids.length) return;
    var lb = ensureLightbox();
    lb._recordId = recordId;
    lb._ids = ids;
    lb._rids = rids;
    lb._idx = ids.indexOf(startPid);
    if (lb._idx < 0) lb._idx = 0;
    lb._editing = editing;
    var delBtn = lb.querySelector('#lb-del');
    if (delBtn) delBtn.style.display = editing ? 'inline-block' : 'none';
    // ★2026-08-25 编辑模式主按钮 = 「添加」（添加照片）；查看模式 = 「保存」（保存当前图片）
    var saveBtn = lb.querySelector('#lb-save');
    if (saveBtn) saveBtn.textContent = editing ? '添加' : '保存';
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lbLoadImg();
}
function lbStep(delta) {
    var lb = photoLightboxEl;
    if (!lb || !lb._ids || !lb._ids.length) return;
    lb._idx = (lb._idx + delta + lb._ids.length) % lb._ids.length;
    lbLoadImg();
}
// ★2026-08-27 灯箱照片内存缓存（pid → blob URL，打开期间复用，关闭时释放）
let lightboxImgCache = {};
// ★2026-08-27 预加载当前±1 张（翻页秒开）
function preloadLbNeighbors(lb) {
    if (!lb || !lb._ids || !lb._ids.length) return;
    [lb._idx - 1, lb._idx + 1].forEach(function (ni) {
        if (ni < 0 || ni >= lb._ids.length) return;
        var nid = lb._ids[ni];
        if (!nid || lightboxImgCache[nid]) return;
        photoGet(nid).then(function (p) {
            if (p && p.blob) lightboxImgCache[nid] = URL.createObjectURL(p.blob);
        }).catch(function () {});
    });
}
function lbLoadImg() {
    var lb = photoLightboxEl;
    if (!lb) return;
    var img = lb.querySelector('#lb-img');
    var title = lb.querySelector('#lb-title');
    var idxEl = lb.querySelector('#lb-index');
    // ★2026-10-17 跨记录翻页（山册照片条）时，标题显示「当前这张所属记录」，
    //   否则翻到别的记录的照片，标题还停在起始记录名 → 误导。
    var curRid = (lb._rids && lb._rids[lb._idx]) || lb._recordId;
    var rec = records.find(r => r.id === curRid);
    title.textContent = rec ? rec.name : '';
    idxEl.textContent = (lb._idx + 1) + ' / ' + lb._ids.length;
    var pid = lb._ids[lb._idx];
    lb._currentPid = pid;
    lbResetZoom(); // ★2026-09-01 切图重置缩放
    // ★2026-08-27 缓存命中直接显示（翻页/后退零等待）
    if (lightboxImgCache[pid]) {
        img.src = lightboxImgCache[pid];
        img.style.opacity = '1';
    } else {
        img.style.opacity = '0.3';
        photoGet(pid).then(function (p) {
            if (lb._currentPid !== pid) return;
            if (p && p.blob) {
                var url = URL.createObjectURL(p.blob);
                lightboxImgCache[pid] = url; // 进缓存，翻回不再重读
                img.src = url;
                img.style.opacity = '1';
            }
        }).catch(function () {});
    }
    preloadLbNeighbors(lb);
}
function closePhotoLightbox() {
    var lb = photoLightboxEl;
    if (!lb) return;
    lb.style.display = 'none';
    document.body.style.overflow = '';
    lb.querySelector('#lb-img').src = '';
    // ★2026-08-27 关闭时释放缓存（blob URL 全 revoke，避免内存堆积）
    Object.keys(lightboxImgCache).forEach(function (pid) {
        try { URL.revokeObjectURL(lightboxImgCache[pid]); } catch (e) { /* 忽略 */ }
    });
    lightboxImgCache = {};
}

// ★2026-08-27 渐进增强：返回键先关弹窗（原生回调 __handleSystemBack，返回 1=已处理 / 0=无弹窗）
// ★2026-08-27 修复：去掉 MutationObserver 异步缓存（弹窗刚开瞬间可能没更新）→ 每次实时查 DOM
// ★2026-08-27 修复2：查询范围扩到 .modal-backdrop-animate（所有弹窗外层都带，含导出 exportModal/导入 importMethodModal 这类裸 id 弹窗）
// ★2026-08-27 修复3：弹窗关闭统一直接 remove（用户要求取消淡出清理，与确认弹窗一致）
// 返回 1/0 数字（原生 evaluateJavascript 回调可靠判断）
window.__handleSystemBack = function () {
    try {
        var modals = document.querySelectorAll('.confirm-modal, .modal-backdrop-animate');
        if (modals.length) { modals[modals.length - 1].remove(); return 1; }
        var lb = document.getElementById('photoLightbox');
        if (lb && lb.style && lb.style.display !== 'none') { closePhotoLightbox(); return 1; }
    } catch (e) { /* 忽略 */ }
    return 0;
};
// ★2026-08-27 防误退提示：用 App 玻璃 toast（与下载更新同款 toast-glass 体系），时长 2000ms
window.__showBackHint = function () {
    showInfoMessage('再按一次退出徒步小记', 2000);
};
// ★2026-09-30 安装包完整性提示（原生 verifyAssetsIntegrity 发现资源哈希不符时调用）
//   背景：此前原生直接用 android.app.AlertDialog（系统灰底方块 + 系统字体），与全站玻璃语言割裂；
//   改为复用网页既有的 confirm-modal 体系 → 质感与所有弹窗 100% 一致（含深浅两模式）。
//   用 data-persist 标记为「安全提示常驻弹窗」：不参与 closeOpenModals 的批量清理，
//   避免启动时被同意留存弹窗 / 检查更新弹窗的 closeOpenModals() 顺手清掉。
window.__showTamperWarn = function (file) {
    try {
        closeOpenModals();
        var safe = escapeHtml(String(file == null ? '' : file));
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.id = 'tamperWarnModal';
        modal.setAttribute('data-persist', '1');
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-md">' +
                '<div class="confirm-modal-title">' +
                    '<span class="material-icons" style="color: #d97706;">shield_moon</span>' +
                    '资源校验提示' +
                '</div>' +
                '<div class="confirm-modal-message">' +
                    '检测到资源文件（' + safe + '）与官方版本不一致，安装包可能被修改。' +
                    '<br><br>为安全起见，请勿在此安装包中输入或导入重要数据，建议卸载后从官方渠道重新安装。' +
                '</div>' +
                '<div class="confirm-modal-buttons">' +
                    '<button class="check-go-btn ripple-effect" id="tamperWarnOk">知道了</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        var ok = document.getElementById('tamperWarnOk');
        if (ok) ok.addEventListener('click', function () {
            try { modal.remove(); } catch (e) { /* 忽略 */ }
        });
    } catch (e) { /* 提示失败不影响使用 */ }
};
// ★2026-08-25 灯箱主按钮统一入口：编辑模式=添加照片，查看模式=保存图片
function lbPrimaryAction() {
    var lb = photoLightboxEl;
    if (!lb) return;
    if (lb._editing) lbAddPhoto();
    else saveCurrentPhoto();
}
// ★2026-08-25 灯箱内添加照片（编辑模式，替代原编辑行「添加照片」按钮）：相册选图 → IndexedDB → 刷新照片区 + 灯箱跳到新照片
// ★2026-08-25 灯箱添加照片支持多选（相册多选，≤MAX_RECORD_PHOTOS 上限；添加后跳到最后一张）
function lbAddPhoto() {
    var lb = photoLightboxEl;
    if (!lb || !lb._editing) return;
    if (editingPhotoIds.length >= MAX_RECORD_PHOTOS) { showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片'); return; }
    if (!photosEnabled()) { showErrorMessage('照片存储不可用，请刷新重试'); return; }
    var remaining = MAX_RECORD_PHOTOS - editingPhotoIds.length;
    pickPhotos(false).then(function (arr) {
        if (arr.length > remaining) {
            showErrorMessage('最多添加 ' + MAX_RECORD_PHOTOS + ' 张照片，仅添加前 ' + remaining + ' 张');
            arr = arr.slice(0, remaining);
        }
        var tasks = arr.map(function (r) {
            var pid = generateId();
            return photoPut(pid, r.blob, r.w, r.h).then(function () { editingPhotoIds.push(pid); });
        });
        return Promise.all(tasks).then(function () {
            refreshPhotoStrip(lb._recordId);
            lb._ids = editingPhotoIds.slice();
            lb._idx = lb._ids.length - 1;
            lbLoadImg();
        });
    }).catch(function (e) {
        if (e && e.message !== 'cancel' && e.message !== 'no-file' && e.message !== 'image-load-fail') {
            showErrorMessage('添加照片失败，请重试');
        }
    });
}
// ★2026-08-25 灯箱删除当前照片（仅编辑模式）：从 editingPhotoIds 移除 + IndexedDB 删 + 刷新编辑行照片区
// ★2026-08-29 加删除确认（与删除记录同款 confirm-modal 设计语言，防误删不可恢复）
function lbDeleteCurrent() {
    var lb = photoLightboxEl;
    if (!lb || !lb._currentPid || !lb._editing) return;
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-sm">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #dc2626;">warning</span>
                删除照片
            </div>
            <div class="confirm-modal-message">
                确定要删除这张照片吗？删除后无法恢复。
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="lb-confirm-cancel">
                    取消
                </button>
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="lb-confirm-delete">
                    删除
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.zIndex = '300'; // ★2026-08-29 本弹窗=照片删除确认（confirm-modal 体系），内联 300 盖住灯箱 200（普通 confirm-modal 100 只在无灯箱时出现，互不干扰）
    const closeModal = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
    };
    document.getElementById('lb-confirm-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('lb-confirm-delete').addEventListener('click', () => {
        closeModal();
        var pid = lb._currentPid;
        var ei = editingPhotoIds.indexOf(pid);
        if (ei >= 0) editingPhotoIds.splice(ei, 1);
        photoDelete(pid).catch(function () {});
        lb._ids = lb._ids.filter(function (x) { return x !== pid; });
        refreshPhotoStrip(lb._recordId);
        if (!lb._ids.length) { closePhotoLightbox(); return; }
        if (lb._idx >= lb._ids.length) lb._idx = lb._ids.length - 1;
        lbLoadImg();
    });
}
// 保存当前照片：App 版走原生桥存相册（M6），网页版浏览器下载
function saveCurrentPhoto() {
    var lb = photoLightboxEl;
    if (!lb || !lb._currentPid) return;
    var pid = lb._currentPid;
    photoGet(pid).then(function (p) {
        if (!p || !p.blob) { showErrorMessage('照片读取失败'); return; }
        if (window.XixiFileBridge && typeof window.XixiFileBridge.saveImageToGallery === 'function') {
            blobToDataURL(p.blob).then(function (durl) {
                var base64 = durl.split(',')[1] || '';
                try {
                    var ok = window.XixiFileBridge.saveImageToGallery(base64, 'xixi-' + pid + '.jpg');
                    if (ok === true || ok === 'true' || ok === null) showSuccessMessage('已保存<b>缩略图</b>到相册');
                    else showErrorMessage(RemoteConfig.text('toast.saveFail', '保存失败'));
                } catch (e) { showErrorMessage(RemoteConfig.text('toast.saveFail', '保存失败')); }
            });
            return;
        }
        var url = URL.createObjectURL(p.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'xixi-' + pid + '.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
        showSuccessMessage('已开始下载<b>缩略图</b>（非原图）');
    }).catch(function () { showErrorMessage(RemoteConfig.text('toast.saveFail', '保存失败')); });
}

// ★2026-09-01 自定义日期时间选择弹窗（替换系统原生 picker，统一玻璃设计语言）
// 值格式保持 YYYY-MM-DDTHH:mm（与 formatDateTimeLocal 一致，保存逻辑 new Date(value) 兼容）
let dtpState = null; // { inputId, year, month(0-11), day, hour, minute }
function openDateTimePicker(inputId, currentValue) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        // 解析当前值（缺省今天此刻）
        const now = new Date();
        let y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), h = now.getHours(), mi = now.getMinutes();
        if (currentValue) {
            const m2 = String(currentValue).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);   // ★2026-09-22 兼容人话显示「2026-09-21 18:23」与 ISO
            if (m2) {
                y = parseInt(m2[1], 10); m = parseInt(m2[2], 10) - 1; d = parseInt(m2[3], 10);
                h = parseInt(m2[4], 10); mi = parseInt(m2[5], 10);
            }
        }
        dtpState = { inputId: inputId, year: y, month: m, day: d, hour: h, minute: mi };

        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        // ★2026-09-01 v3：时/分改步进器（- 数字 +），彻底告别 select 全屏原生列表；★09-01 弹窗缩小 360→320px
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">event</span>选择日期时间</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="dtp-nav" id="dtpNav"></div>' +
            '<div class="dtp-grid" id="dtpGrid"></div>' +
            '<div class="dtp-time-row">' +
            '<div class="dtp-stepper">' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpHourMinus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">remove</span></button>' +
            '<span class="dtp-num" id="dtpHourNum">00</span>' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpHourPlus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">add</span></button>' +
            '</div>' +
            '<span class="dtp-colon">:</span>' +
            '<div class="dtp-stepper">' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpMinuteMinus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">remove</span></button>' +
            '<span class="dtp-num" id="dtpMinuteNum">00</span>' +
            '<button type="button" class="ripple-effect icon-glass-btn" id="dtpMinutePlus" style="width:38px;height:38px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:18px;">add</span></button>' +
            '</div>' +
            '</div></div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="dtpCancel">取消</button>' +
            '<button class="glass-btn ripple-effect" id="dtpOk">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        document.getElementById('dtpCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('dtpOk').addEventListener('click', function () {
            try {
                const hh = String(dtpState.hour).padStart(2, '0');
                const mm = String(dtpState.minute).padStart(2, '0');
                const dd = String(dtpState.day).padStart(2, '0');
                const mo = String(dtpState.month + 1).padStart(2, '0');
                const input = document.getElementById(dtpState.inputId);
                                if (input) {
                    // ★2026-09-22 显示人话、真值存 data-iso（保存与再次解析都以 data-iso 为准）
                    var _iso = dtpState.year + '-' + mo + '-' + dd + 'T' + hh + ':' + mm;
                    input.value = _iso.replace('T', ' ');
                    input.setAttribute('data-iso', _iso);
                }
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        // ★v4 步进器：点按一次 + 长按 350ms 后连续加速（touchstart preventDefault 防与 mousedown 双触发）
        function bindStepperHold(btnId, stepFn) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            let holdTimer = null, fastTimer = null;
            function start(e) {
                try { e.preventDefault(); } catch (err) { /* 忽略 */ }
                stepFn();
                holdTimer = setTimeout(function () {
                    fastTimer = setInterval(stepFn, 90);
                }, 350);
            }
            function stop() {
                if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
                if (fastTimer) { clearInterval(fastTimer); fastTimer = null; }
            }
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('touchend', stop);
            btn.addEventListener('touchcancel', stop);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
        }
        bindStepperHold('dtpHourMinus', function () { dtpState.hour = (dtpState.hour + 23) % 24; renderDtpTime(); });
        bindStepperHold('dtpHourPlus', function () { dtpState.hour = (dtpState.hour + 1) % 24; renderDtpTime(); });
        bindStepperHold('dtpMinuteMinus', function () { dtpState.minute = (dtpState.minute + 59) % 60; renderDtpTime(); });
        bindStepperHold('dtpMinutePlus', function () { dtpState.minute = (dtpState.minute + 1) % 60; renderDtpTime(); });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
        renderDtpNav();
        renderDtpGrid();
        renderDtpTime();
    } catch (e) { /* 弹窗失败不影响编辑 */ }
}

// 月份导航（‹ 2026年9月 ›）
function renderDtpNav() {
    const nav = document.getElementById('dtpNav');
    if (!nav || !dtpState) return;
    nav.innerHTML =
        '<button type="button" class="ripple-effect icon-glass-btn" id="dtpPrev" style="width:36px;height:36px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:20px;">chevron_left</span></button>' +
        '<span style="font-size:17px;font-weight:900;flex:1;text-align:center;">' + dtpState.year + '年' + (dtpState.month + 1) + '月</span>' +
        '<button type="button" class="ripple-effect icon-glass-btn" id="dtpNext" style="width:36px;height:36px;padding:0;border-radius:12px;flex-shrink:0;"><span class="material-icons" style="font-size:20px;">chevron_right</span></button>';
    document.getElementById('dtpPrev').addEventListener('click', function () {
        dtpState.month--;
        if (dtpState.month < 0) { dtpState.month = 11; dtpState.year--; }
        const maxD = new Date(dtpState.year, dtpState.month + 1, 0).getDate();
        if (dtpState.day > maxD) dtpState.day = maxD;
        renderDtpNav(); renderDtpGrid();
    });
    document.getElementById('dtpNext').addEventListener('click', function () {
        dtpState.month++;
        if (dtpState.month > 11) { dtpState.month = 0; dtpState.year++; }
        const maxD = new Date(dtpState.year, dtpState.month + 1, 0).getDate();
        if (dtpState.day > maxD) dtpState.day = maxD;
        renderDtpNav(); renderDtpGrid();
    });
}

// ★2026-09-04 难度选择弹窗（替换原生 select，统一玻璃设计语言，与心情/天气/日期同款选中态）
// prefix 传 'edit-difficulty-' 或 'edit-planned-difficulty-'，由调用方拼接 id
function openDifficultyPicker(inputId) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        const input = document.getElementById(inputId);
        const current = input ? parseInt(input.value, 10) : 3;
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">signal_cellular_alt</span>选择难度</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="df-grid" id="dfGrid"></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="dfCancel">取消</button>' +
            '<button class="glass-btn ripple-effect" id="dfOk">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        let selected = current;
        const grid = document.getElementById('dfGrid');
        const DIFF_NAMES = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
        for (let d = 1; d <= 5; d++) {
            const cell = document.createElement('div');
            cell.className = 'df-opt' + (d === current ? ' selected' : '');
            cell.setAttribute('data-v', d);
            cell.style.setProperty('--df-color', getDifficultyColor(d));
            cell.innerHTML = '<span class="df-dot"></span>' + d + '级 <span class="df-name">' + DIFF_NAMES[d] + '</span>';
            cell.addEventListener('click', function () {
                selected = parseInt(this.getAttribute('data-v'), 10);
                grid.querySelectorAll('.df-opt').forEach(function (c) { c.classList.remove('selected'); });
                this.classList.add('selected');
            });
            grid.appendChild(cell);
        }
        document.getElementById('dfCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('dfOk').addEventListener('click', function () {
            try {
                const inp = document.getElementById(inputId);
                if (inp) {
                    inp.value = diffLabel(selected);   // ★2026-09-04 「N级 档名」文案（parseInt 兼容）
                    // ★2026-09-04 同步难度色变量（浅/深两套），框色即时跟随档位
                    inp.style.setProperty('--dfc-light', getDifficultyColor(selected));
                    inp.style.setProperty('--dfc-dark', getDifficultyColorDark(selected));
                }
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}

// ★2026-09-01 心情/天气选择弹窗（替换原生 select，统一玻璃设计语言，与日期选择器同款选中态）
const MOOD_OPTIONS = [['😄', '开心'], ['😌', '平静'], ['🤩', '兴奋'], ['😮‍💨', '疲惫']];
const WEATHER_OPTIONS = [['☀️', '晴'], ['🌤️', '多云'], ['☁️', '阴'], ['🌧️', '雨'], ['❄️', '雪']];
function openMoodWeatherPicker(type, recordId) {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals(); // 防重入
        const input = document.getElementById('edit-' + type + '-' + recordId);
        const current = input ? input.value : '';
        const opts = type === 'mood' ? MOOD_OPTIONS : WEATHER_OPTIONS;
        const title = type === 'mood' ? '选择心情' : '选择天气';
        const icon = type === 'mood' ? 'sentiment_satisfied' : 'wb_sunny';
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">' + icon + '</span>' + title + '</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="mwp-grid" id="mwpGrid"></div>' +
            '<div class="mwp-clear-wrap"><button type="button" class="mwp-clear-btn ripple-effect" id="mwpClear">清空</button></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="mwpCancel">取消</button>' +
            '<button class="glass-btn ripple-effect" id="mwpOk">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        let selected = current;
        const grid = document.getElementById('mwpGrid');
        opts.forEach(function (pair) {
            const cell = document.createElement('div');
            cell.className = 'mwp-opt' + (pair[0] === current ? ' selected' : '');
            cell.innerHTML = '<span class="mwp-emoji">' + pair[0] + '</span>' + pair[1];
            cell.addEventListener('click', function () {
                selected = pair[0];
                grid.querySelectorAll('.mwp-opt').forEach(function (c) { c.classList.remove('selected'); });
                cell.classList.add('selected');
            });
            grid.appendChild(cell);
        });
        document.getElementById('mwpClear').addEventListener('click', function () {
            selected = '';
            grid.querySelectorAll('.mwp-opt').forEach(function (c) { c.classList.remove('selected'); });
        });
        document.getElementById('mwpCancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('mwpOk').addEventListener('click', function () {
            try {
                const inp = document.getElementById('edit-' + type + '-' + recordId);
                if (inp) inp.value = selected;
                document.body.removeChild(modal);
            } catch (e) { /* 忽略 */ }
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    } catch (e) { /* 忽略 */ }
}

// 日期网格（周一开头，今天描边，选中靛蓝）
function renderDtpGrid() {
    const grid = document.getElementById('dtpGrid');
    if (!grid || !dtpState) return;
    const y = dtpState.year, m = dtpState.month;
    const firstDay = new Date(y, m, 1).getDay();
    const lead = (firstDay === 0 ? 6 : firstDay - 1); // 周一开始
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();
    let html = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="dtp-week">' + w + '</div>'; }).join('');
    for (let i = 0; i < lead; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDateStr = y + '-' + m + '-' + day;
        const cls = ['dtp-cell'];
        if (cellDateStr === todayStr) cls.push('today');
        if (day === dtpState.day) cls.push('selected');
        html += '<div class="' + cls.join(' ') + '" data-day="' + day + '">' + day + '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.dtp-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
            dtpState.day = parseInt(cell.getAttribute('data-day'), 10);
            grid.querySelectorAll('.dtp-cell.selected').forEach(function (c) { c.classList.remove('selected'); });
            cell.classList.add('selected');
        });
    });
}

// 时/分步进器数字显示（v3：不再用 select，避免原生全屏列表）
function renderDtpTime() {
    if (!dtpState) return;
    const hourNum = document.getElementById('dtpHourNum');
    const minNum = document.getElementById('dtpMinuteNum');
    if (hourNum) hourNum.textContent = String(dtpState.hour).padStart(2, '0');
    if (minNum) minNum.textContent = String(dtpState.minute).padStart(2, '0');
}

function saveRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    const nameInput = document.getElementById(`edit-name-${id}`);
    const difficultyInput = document.getElementById(`edit-difficulty-${id}`);
    const elevationInput = document.getElementById(`edit-elevation-${id}`);
    const createdAtInput = document.getElementById(`edit-created-at-${id}`);
    
    if (!nameInput.value.trim()) {
        nameInput.classList.add('border-red-500');
        return;
    }
    
    nameInput.classList.remove('border-red-500');   // ★2026-09-10 校验通过清红边（原来只加不删）
    record.name = nameInput.value.trim();
    record.difficulty = Math.min(5, Math.max(1, parseInt(difficultyInput.value, 10) || 3));   // ★2026-09-17 NaN 兜底（空值会存成 NaN → JSON 变 null → 下轮被误删）★2026-09-20 与计划路径统一补 1~5 钳制
    record.elevation = Math.max(0, parseInt(elevationInput.value) || 0); // ★2026-08-29 与新增记录一致：负数防护
    
    // 保存记录时间
    if (createdAtInput && createdAtInput.value) {
        record.createdAt = new Date(createdAtInput.dataset.iso || createdAtInput.value).toISOString();   // ★2026-09-22 优先用 data-iso（显示是人话）
    }
    
    // ★2026-08-20 照片：编辑结果写回记录
    record.photos = editingPhotoIds.slice();
    editingPhotoIds = [];
    
    // ★2026-08-21 v1.1.1.6 扩展信息：心情/天气/同行人（可选）
    const moodInput = document.getElementById(`edit-mood-${id}`);
    const weatherInput = document.getElementById(`edit-weather-${id}`);
    const companionsInput = document.getElementById(`edit-companions-${id}`);
    if (moodInput) record.mood = moodInput.value.trim() || '';   // ★五项优化⑤：与 weather 一致 trim（防意外空格）
    if (weatherInput) record.weather = weatherInput.value.trim();
    if (companionsInput) record.companions = companionsInput.value.trim();
    // ★2026-09-05 小日记（notes）：空则删键保持干净（老记录无 notes 不占存储）
    const notesInput = document.getElementById(`edit-notes-${id}`);
    if (notesInput) {
        const nn = notesInput.value.replace(/^\s+|\s+$/g, '');
        if (nn) record.notes = nn; else delete record.notes;
    }

    // ★2026-09-01 里程/用时（可选）：distance=km 数字（保留两位小数），duration=分钟（时/分双框换算）
    const distanceInput = document.getElementById(`edit-distance-${id}`);
    // ★2026-09-20 距离补下限/上限（此前只有 `|| 0` → 负数能进库；海拔/用时早已有防护）
    if (distanceInput) record.distance = Math.min(10000, Math.max(0, Math.round((parseFloat(distanceInput.value) || 0) * 100) / 100));
    const durationHInput = document.getElementById(`edit-duration-h-${id}`);
    const durationMInput = document.getElementById(`edit-duration-m-${id}`);
    if (durationHInput || durationMInput) {
        // ★2026-09-20 时长加上限：小时框 0~23（与 input max 一致）、总时长 ≤1440 分钟（24 小时）
        const hh = Math.min(23, Math.max(0, parseInt((durationHInput ? durationHInput.value : '0'), 10) || 0));
        const mm = Math.max(0, parseInt((durationMInput ? durationMInput.value : '0'), 10) || 0);
        record.duration = Math.min(1440, hh * 60 + mm);
    }

    // ★2026-08-26 最后修改时间：每次保存记录都更新（合并取新用，区分于徒步日期 createdAt）
    record.updatedAt = new Date().toISOString();
    
    editingId = null;
    updateStatistics();
    saveToStorage();
    thumbCacheClear(); // ★2026-08-27 照片可能增删：缩略图缓存全清，下次渲染重新读
    renderTable();
    // ★2026-09-04 弹窗内保存成功 → 关闭详情弹窗（表格已刷新）
    if (recordDetailModalEl) {
        closeRecordDetailModal();
    }
    triggerHaptic(15); // ★2026-08-27 渐进增强：保存成功轻震动反馈
    checkMilestones(); // ★2026-09-14 新增：保存后判定里程碑（达成弹一次，已达成不再弹）
    // ★★2026-10-19 用户要求：「记完第一条，不知道有啥用」→ 第一条记录保存后给**一次性**正反馈，
    //   告诉新手去概览看第一张热力图（此后永不再弹，靠 localStorage 标记）。
    //   注意：第一条记录必然同时解锁「第 1 座山」里程碑 → 庆祝卡会先弹，
    //   这里会在检测到 celebrateOverlay 时等待其关闭后再弹，避免两个弹窗叠加。
    try { showFirstRecordTip(); } catch (e) { /* 提示失败绝不影响保存 */ }
}

var FIRST_RECORD_TIP_KEY = 'hiking_first_record_tip_v1';
function showFirstRecordTip() {
    try {
        if (localStorage.getItem(FIRST_RECORD_TIP_KEY)) return;          // 已弹过，永不再弹
        if ((typeof records === 'undefined' ? 0 : (records || []).length) !== 1) return;  // 只在「第一条」时
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            // 里程碑庆祝卡仍在 → 等它关掉（最长约 16s，超时则放弃，下次保存再试）
            if (document.getElementById('celebrateOverlay')) {
                if (tries > 40) clearInterval(timer);
                return;
            }
            clearInterval(timer);
            if (localStorage.getItem(FIRST_RECORD_TIP_KEY)) return;
            localStorage.setItem(FIRST_RECORD_TIP_KEY, '1');
            renderFirstRecordTipCard();
        }, 400);
    } catch (e) { /* 静默 */ }
}

function renderFirstRecordTipCard() {
    try {
        if (document.getElementById('firstTipOverlay')) return;
        var ov = document.createElement('div');
        ov.id = 'firstTipOverlay';
        ov.className = 'confirm-modal modal-backdrop-animate';
        ov.innerHTML = '' +
            '<div class="confirm-modal-content modal-fade-scale mdl-md">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">auto_awesome</span>第一笔已记下</div>' +
            '<div class="confirm-modal-message">' +
            '概览页已经亮起第一格 —— 你的<b>热力图、总里程、徒步年资</b>都从这一笔开始算。<br>' +
            '以后每记一次，那里就多一格。' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button type="button" class="glass-btn ripple-effect" id="firstTipOk">知道了</button>' +
            '<button type="button" class="glass-btn ripple-effect corner-glow" id="firstTipGo">去概览看看</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
        var okBtn = document.getElementById('firstTipOk');
        if (okBtn) okBtn.addEventListener('click', close);
        var goBtn = document.getElementById('firstTipGo');
        if (goBtn) goBtn.addEventListener('click', function () {
            close();
            try { switchTab('overview'); } catch (e) { /* 跳转失败忽略 */ }
        });
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        triggerHaptic(12);
    } catch (e) { /* 静默 */ }
}

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    recordPage = 1; // ★2026-08-26 排序变化回到第一页
    updateSortIcons();
    renderTable();
}

function updateSortIcons() {
    const sortIcons = {
        name: document.getElementById('sort-icon-name'),
        difficulty: document.getElementById('sort-icon-difficulty'),
        elevation: document.getElementById('sort-icon-elevation'),
        createdAt: document.getElementById('sort-icon-created-at')
    };
    
    Object.keys(sortIcons).forEach(key => {
        if (sortIcons[key]) {
            sortIcons[key].classList.remove('active');
            if (currentSort.field === key) {
                sortIcons[key].classList.add('active');
                sortIcons[key].textContent = currentSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
            } else {
                sortIcons[key].textContent = 'unfold_more';
            }
        }
    });
}

// v1.4.12.9：顶栏标题恢复可编辑——点击标题/铅笔图标弹窗修改，保存到本地
function showEditTitleModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    const titleEl = document.getElementById('appTitle');
    const currentTitle = titleEl ? titleEl.textContent : 'XXの徒步小记';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-sm">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">edit</span>
                编辑标题
            </div>
            <input type="text" id="titleEditInput" class="edit-input" style="width: 100%; margin: 14px 0 4px;" maxlength="20" placeholder="输入新标题">
            <div class="confirm-modal-message" style="margin-top: 6px;">最多 20 个字符</div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="title-edit-cancel">取消</button>
                <button class="confirm-btn-delete ripple-effect" id="title-edit-save" style="background: #4f46e5; border-color: #4f46e5;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const input = document.getElementById('titleEditInput');
    input.value = currentTitle;
    // 2026-08-11 用户要求：点击可编辑栏不直接弹输入法——不自动聚焦，用户点输入框才弹键盘

    const closeModal = () => { document.body.removeChild(modal); };

    document.getElementById('title-edit-cancel').addEventListener('click', closeModal);
    document.getElementById('title-edit-save').addEventListener('click', () => {
        const newTitle = input.value.trim();
        if (!newTitle) { showErrorMessage('标题不能为空'); return; }
        saveAppTitle(newTitle);
        closeModal();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('title-edit-save').click();
        if (e.key === 'Escape') closeModal();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

async function saveAppTitle(title) {
    try {
        await AppStore.setItem(APP_TITLE_KEY, { title });
        const titleEl = document.getElementById('appTitle');
        if (titleEl) titleEl.textContent = title;
        showSuccessMessage('标题已更新');
    } catch (e) {
        console.error('保存标题失败:', e);
        showErrorMessage('保存失败，请重试');
    }
}

// v1.4.12.10：区块标题统一弹窗编辑（统计/记录/计划/设置），与顶栏标题同一套交互

/* 2026-08-11 数据管理说明弹窗（i 标识点击显示） */
function showDataInfoModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-lg doc-modal">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">info</span>
                数据管理说明
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;">   <!-- ★2026-09-06 内容与按钮间距拉开（原 2px 贴太近） -->
                <!-- ★2026-09-03 排版统一：大段文字改分组条目（小图标+标题+12px 说明，深浅色自适应 dmi-* 类） -->
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">inventory_2</span>
                    <div style="min-width:0;"><div class="dmi-title">完整备份 / 纯数据</div>
                    <div class="dmi-body">导出「完整备份」是压缩包（记录 + 计划 + 照片）；「纯数据」不含照片。数据只保存在本机，建议定期导出。</div></div>
                </div>
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">merge</span>
                    <div style="min-width:0;"><div class="dmi-title">恢复 / 合并规则</div>
                    <div class="dmi-body">同一条记录按最后修改时间取新：改过的字段更新、没改的保持；空字段自动用另一份补全；本地独有的记录合并保留。</div></div>
                </div>
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">cloud_done</span>
                    <div style="min-width:0;"><div class="dmi-title">自动同步</div>
                    <div class="dmi-body">开启后数据变更自动上传云端备份，本机数据多一层保险；云端备份会带上你的网盘配置（含加密密码），换机下载恢复一键配好。</div></div>
                </div>
                <!-- ★2026-09-06 由导出弹窗迁入（用户要求：说明统一收进数据管理 i）：本地自动备份说明 -->
                <div class="dmi-group">
                    <span class="material-icons dmi-ic">schedule</span>
                    <div style="min-width:0;"><div class="dmi-title">本地自动备份</div>
                    <div class="dmi-body">每满 7 天，App 会自动存一份纯数据备份到系统「下载」目录，无需手动操作（手机空间不足或网页版不自动备份）。</div></div>
                </div>
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="data-info-close">知道了</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('data-info-close');
    const closeModal = () => document.body.removeChild(modal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

// ★2026-09-08 隐私政策弹窗（关于卡「隐私政策」入口；README 隐私段整理成一屏，dmi-* 条目排版复用深浅自适应；含崩溃上报联网说明）
// ★2026-09-09 免责声明：记录工具定位 + 户外安全提示（不引导野山/风险自担）
function showDisclaimerModal() {
    closeOpenModals();
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-lg doc-modal">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">hiking</span>
                免责声明
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;">
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">hiking</span>
                        <div style="min-width:0;"><div class="dmi-title">一、服务性质：记录工具，不是领队</div>
                            <div class="dmi-body">本应用是一款个人徒步记录工具，用于记录行程、心情与照片。它<b>不提供</b>路线规划、导航、定位救援、天气预警、医疗建议或任何形式的户外安全指导，<b>不能替代</b>专业向导、领队、地图与救援服务——它不是领队，也不是救生员。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">fact_check</span>
                        <div style="min-width:0;"><div class="dmi-title">二、记录数据仅供参考</div>
                            <div class="dmi-body">记录中的海拔、距离、用时、难度、天气等均由你自行填写，本应用不做测量与校验，可能存在误差；里程碑、统计与山册展示均基于上述自填数据推算。<b>全部数据仅供个人回顾</b>，不构成专业测量结果，不可用于测绘、赛事认证、保险理赔或任何法律用途。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">signpost</span>
                        <div style="min-width:0;"><div class="dmi-title">三、请走正规路线</div>
                            <div class="dmi-body">本应用<b>不引导、也不建议</b>前往未开发的野山、自然保护区或禁止进入的区域。出行请选择正规开放路线，遵守当地法律法规及景区、保护区管理规定，服从现场管理与警示。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">wb_sunny</span>
                        <div style="min-width:0;"><div class="dmi-title">四、出发前做好准备</div>
                            <div class="dmi-body">请先查看天气预报与封山公告，结伴而行，带足饮水、照明与充电设备；不逞强、不夜行、不涉险，量力而行。<b>本应用不具备定位与求救功能</b>——遇险请立即拨打 110、119 或当地山地救援电话，不要依赖本应用中的记录或坐标。户外安全永远由你本人第一位负责。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">warning</span>
                        <div style="min-width:0;"><div class="dmi-title">五、风险自担</div>
                            <div class="dmi-body">户外活动存在固有且无法完全避免的风险。你应在出行前自行评估身体状况、路线难度、天气与装备情况，未成年人须由监护人陪同。<b>因你的出行行为或判断所产生的一切后果，由你自行承担。</b></div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">backup</span>
                        <div style="min-width:0;"><div class="dmi-title">六、数据安全与备份责任</div>
                            <div class="dmi-body">你的数据默认仅存于本机。卸载应用、清除数据、设备损坏或丢失均可能导致数据丢失；云备份依赖你自行配置的第三方网盘，其可用性、容量与数据完整性由该服务商负责。请定期导出备份并妥善保存——<b>开发者无法找回你未备份的数据</b>。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">cloud_off</span>
                        <div style="min-width:0;"><div class="dmi-title">七、第三方服务</div>
                            <div class="dmi-body">应用内的更新检查依赖 GitHub，云备份依赖你选择的 WebDAV 网盘。上述服务的可用性、内容变更、服务中断或数据处理行为不由开发者控制，开发者不就此承担赔偿责任。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">public</span>
                        <div style="min-width:0;"><div class="dmi-title">八、官方渠道与内容来源</div>
                            <div class="dmi-body">本应用的官方网站为 <a href="https://xixi-hiking-site.pages.dev" target="_blank" rel="noopener">xixi-hiking-site.pages.dev</a>（应用内「关于应用 → 官方网站」可一键打开），源码仓库为 GitHub 上的 xixi-hiking 项目。官网仅作介绍、截图与下载指引之用，<b>其页面内容可能滞后于实际版本</b>；功能、界面与更新内容<b>一律以你设备上实际运行的版本为准</b>。请通过上述官方渠道获取安装包，<b>从非官方渠道下载或他人二次打包的版本，开发者无法保证其安全性与完整性，由此产生的后果由获取者自行承担</b>。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">balance</span>
                        <div style="min-width:0;"><div class="dmi-title">九、责任限制</div>
                            <div class="dmi-body">在适用法律允许的最大范围内，开发者不对因使用或无法使用本应用所致的间接、附带或衍生损失（包括但不限于数据丢失、行程延误、人身或财产损害）承担赔偿责任。<b>本条不排除或限制依法不得排除、限制的责任</b>；如相关法律另有强制性规定，以该法律规定为准。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">copyright</span>
                        <div style="min-width:0;"><div class="dmi-title">十、知识产权</div>
                            <div class="dmi-body">本应用的界面设计、图标与程序代码归开发者所有；你在应用内创建的记录、备注与照片<b>归你本人所有</b>。请勿对本应用进行反向工程、二次打包或用于商业用途。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">gavel</span>
                        <div style="min-width:0;"><div class="dmi-title">十一、条款变更与适用法律</div>
                            <div class="dmi-body">本声明可能随版本更新调整，更新后在本页展示；若调整涉及你的重要权益，我们会在应用内<b>重新征求你的同意</b>。你继续使用本应用即视为接受更新后的条款，如不同意请停止使用并卸载。本声明适用<b>中华人民共和国法律</b>；因本声明或使用本应用发生争议的，双方应友好协商解决，协商不成的，可依法向有管辖权的人民法院提起诉讼。生效日期：2026-10-09。</div></div>
                    </div>
            </div>
            <div class="confirm-modal-buttons">
                <button id="disclaimer-close" class="ripple-effect confirm-btn-cancel">我知道了</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#disclaimer-close').addEventListener('click', function () { if (modal.parentNode) document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal && modal.parentNode) document.body.removeChild(modal); });
}

// ★2026-09-18 同意留存（隐私政策 / 免责声明）
//   立法本意：用户「明确同意」必须有痕迹 —— 显式勾选 + 本机记录（条款版本 + 时间戳）。
//   ★改动政策正文时必须同步 bump LEGAL_VERSION（与正文「生效日期」保持一致）→ 会自动重新征求同意。
const LEGAL_VERSION = '2026-10-09';
const LEGAL_AGREE_KEY = 'hiking_legal_agree';
let _legalPromptedThisSession = false;   // 启动时已主动弹过（同一会话不再打扰）
let _legalTabPrompted = false;           // 首次进设置页已弹过

function getLegalAgreement() {
    const rec = AppStore.getItem(LEGAL_AGREE_KEY);
    return (rec && typeof rec === 'object') ? rec : null;
}
// 已同意、且同意的是「当前版本」的条款
function hasAgreedLegal() {
    const rec = getLegalAgreement();
    return !!(rec && rec.at && rec.version === LEGAL_VERSION);
}
// 记录同意：写入条款版本 + 本地时间戳（ISO 8601，便于日后查证）
function saveLegalAgreement() {
    const rec = { version: LEGAL_VERSION, at: new Date().toISOString() };
    AppStore.setItem(LEGAL_AGREE_KEY, rec);
    return rec;
}
// 时间戳 → 本地可读时间（YYYY-MM-DD HH:mm）
function formatLegalStamp(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
}
// 征求同意（Promise<boolean>）。★防 Promise 永挂：弹窗被外部 closeOpenModals() 移除时也 resolve(false)
function showLegalConsentModal() {
    return new Promise(function (resolve) {
        if (document.getElementById('legalConsentModal')) { resolve(false); return; }
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.id = 'legalConsentModal';
        // ★2026-09-18 声明为常驻弹窗：查看条款时不会被条款弹窗内部的 closeOpenModals() 清掉
        modal.setAttribute('data-persist', '1');
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-lg doc-modal" style="max-height:86vh;">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">verified_user</span> 使用前请确认</div>' +
            '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;">' +
                '<div class="dmi-group">' +
                    '<span class="material-icons dmi-ic">shield</span>' +
                    '<div style="min-width:0;"><div class="dmi-title">关于你的数据</div>' +
                    '<div class="dmi-body">记录与照片只保存在本机；只有你主动配置网盘后，数据才会同步到<b>你自己的</b>账号。本应用没有开发者服务器，不收集、不上传任何使用数据。唯一的联网是启动时的「检查更新」——仅向 GitHub 查询版本号（该服务器位于中国境外），传输 IP 与浏览器标识，<b>不含你的记录与照片</b>，详见《隐私政策》第四条。</div></div>' +
                '</div>' +
                '<div class="dmi-group dmi-plain">' +
                    '<span class="material-icons dmi-ic">description</span>' +
                    '<div style="min-width:0;"><div class="dmi-title">请先阅读以下条款</div>' +
                    '<div class="dmi-body">' +
                        '<span class="legal-link" id="legalOpenPrivacy">《隐私政策》</span>：数据存在哪、联网做什么、你有哪些权利。<br>' +
                        '<span class="legal-link" id="legalOpenDisclaimer">《免责声明》</span>：它是记录工具不是领队，户外风险与备份责任由你自负。' +
                    '</div></div>' +
                '</div>' +
                '<label class="chk-row" style="margin-top:6px;">' +
                    '<input type="checkbox" id="legalAgreeChk">' +
                    '<span>我已阅读并同意<b>《隐私政策》</b>与<b>《免责声明》</b></span>' +
                '</label>' +
                '<div class="legal-stamp">勾选并同意后，会在本机记录同意时间与条款版本，便于日后查证。</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
                '<button class="confirm-btn-cancel ripple-effect" id="legalLater">暂不同意</button>' +
                '<button class="glass-btn ripple-effect" id="legalAgree">同意并继续</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);

        const chk = modal.querySelector('#legalAgreeChk');
        let done = false;
        const finish = function (v) {
            if (done) return;
            done = true;
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            resolve(v);
        };
        // 兜底：被外部 closeOpenModals() 移除时也 resolve（否则调用方 await 永挂）
        const obs = new MutationObserver(function () {
            if (done) return;
            if (!modal.parentNode) { obs.disconnect(); done = true; resolve(false); }
        });
        obs.observe(document.body, { childList: true });

        // 读条款：本弹窗带 data-persist，条款弹窗内部的 closeOpenModals() 会跳过它
        //   → 条款弹窗直接叠在上层，关闭后自然回到本弹窗（勾选状态原样保留，无需任何挂回逻辑）
        modal.querySelector('#legalOpenPrivacy').addEventListener('click', function () { showPrivacyPolicyModal(); });
        modal.querySelector('#legalOpenDisclaimer').addEventListener('click', function () { showDisclaimerModal(); });

        modal.querySelector('#legalAgree').addEventListener('click', function () {
            if (!chk.checked) {
                // 未勾选：高亮提示（不用 disabled 态，避免依赖缺失的禁用样式）
                chk.style.outline = '2px solid rgba(220, 38, 38, 0.5)';
                chk.style.outlineOffset = '2px';
                setTimeout(function () { chk.style.outline = ''; chk.style.outlineOffset = ''; }, 1200);
                if (typeof showToast === 'function') showToast('请先勾选「我已阅读并同意」', 'warn');
                return;
            }
            saveLegalAgreement();
            if (typeof showToast === 'function') showToast('已记录你的同意', 'success');
            finish(true);
        });
        modal.querySelector('#legalLater').addEventListener('click', function () { finish(false); });
        modal.addEventListener('click', function (e) { if (e.target === modal) finish(false); });
    });
}
// 按需征求：已同意直接返回；否则弹窗（每个入口每会话最多主动弹一次）
function maybePromptLegalConsent(fromTab) {
    if (hasAgreedLegal()) return Promise.resolve(true);
    if (fromTab) {
        if (_legalTabPrompted) return Promise.resolve(false);
        _legalTabPrompted = true;
    } else {
        if (_legalPromptedThisSession) return Promise.resolve(false);
        _legalPromptedThisSession = true;
    }
    return showLegalConsentModal();
}

function showPrivacyPolicyModal() {
    closeOpenModals();
    // ★2026-09-18 同意留存：已同意则展示「同意时间 + 条款版本」，让记录可见可查
    const _ag = getLegalAgreement();
    const AGREEMENT_STAMP = (_ag && _ag.at)
        ? '<div class="legal-stamp">你已于 ' + escapeHtml(formatLegalStamp(_ag.at)) + ' 同意本政策（条款版本 ' + escapeHtml(String(_ag.version || '-')) + '）</div>'
        : '';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-lg doc-modal">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #4f46e5;">security</span>
                隐私政策
            </div>
            <div class="confirm-modal-message" style="text-align:left;padding:0 2px;">
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">info</span>
                        <div style="min-width:0;"><div class="dmi-title">适用范围与生效</div>
                            <div class="dmi-body">本政策适用于「XiXiの徒步小记」Android 客户端与网页版（以下统称<b>本应用</b>）。本应用由<b>xixi</b>独立开发与维护（下称「开发者」或「我们」），属《中华人民共和国个人信息保护法》意义上的个人信息处理者，联系方式见第十一条。生效日期：2026-10-09；最近更新：2026-10-09。本政策随版本迭代更新；若变更涉及你的权利或个人信息处理方式的重大变化，我们会<b>更新条款版本号并在应用内重新征求你的同意</b>。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">storage</span>
                        <div style="min-width:0;"><div class="dmi-title">一、数据存储位置与期限</div>
                            <div class="dmi-body">本应用是<b>纯本地工具</b>：记录、计划、备注、照片全部保存在你的设备上（网页版为浏览器本地存储），本应用<b>不设账号体系</b>，不收集、不上传你的个人身份信息、行为数据、设备标识与位置信息，也未接入任何统计、广告或推送 SDK。存储期限由你决定——卸载应用或使用「抹掉所有足迹」即可清除本机全部数据。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">cloud_done</span>
                        <div style="min-width:0;"><div class="dmi-title">二、云备份（可选）</div>
                            <div class="dmi-body">仅当你主动在设置中配置 WebDAV 后，数据才会同步到<b>你本人的</b>网盘账号。服务器地址、账号与应用密码仅保存于本机，采用加密存储，任何界面均不明文展示；与网盘的通信全程 HTTPS，且在你的设备与网盘服务商之间直接进行——<b>本应用没有开发者服务器，数据不经过任何中转</b>。备份文件中可包含一份加密后的网盘配置（便于换机一键恢复），请妥善保管备份文件，避免提供或发送给他人。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">share</span>
                        <div style="min-width:0;"><div class="dmi-title">三、信息共享、转让与公开披露</div>
                            <div class="dmi-body">本应用<b>不会</b>向任何第三方出售、出租、共享、转让或公开披露你的数据，也不存在与「合作方共享数据」的情形。开发者不持有你的数据，因此任何第三方（含广告商、数据服务商）均无法通过本应用获取你的记录与照片。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">wifi</span>
                        <div style="min-width:0;"><div class="dmi-title">四、联网行为与第三方服务</div>
                            <div class="dmi-body">① <b>检查更新</b>：应用启动时会请求 GitHub Releases 接口查询最新版本号，仅产生常规网络请求信息（IP、User-Agent），<b>不含你的记录、照片或身份信息</b>；<b>GitHub 的服务器位于中国境外</b>，该请求可能构成个人信息的跨境传输——若你不希望发生该传输，可在完全离线（如飞行模式）下使用本应用，离线不影响记录、查看、导出等核心功能，仅无法获知是否有新版本。② <b>云备份</b>：依赖你自行选择的 WebDAV 服务商（如坚果云，服务器位于中国境内），其数据处理行为适用该服务商的条款与政策；③ <b>崩溃报告</b>：仅在已配置网盘的前提下，应用异常时上传一份不含记录与照片的诊断信息（版本号、错误内容、时间），用于定位问题；④ <b>官方网站</b>：应用内「关于应用 → 官方网站」入口会调用系统浏览器打开项目官网，仅发生常规网页访问，<b>不携带你的任何记录、照片或身份信息</b>。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">security</span>
                        <div style="min-width:0;"><div class="dmi-title">五、数据安全措施</div>
                            <div class="dmi-body">本应用采用以下措施保护你的数据：本地数据随应用沙箱隔离；网盘凭据加密存储；Android 包经过签名校验，防止被篡改或替换安装；不申请通讯录、短信、通话记录、精确位置等与功能无关的权限。同时请理解：<b>任何存储方式都无法保证绝对安全</b>，请定期导出备份并自行妥善保存。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">report_problem</span>
                        <div style="min-width:0;"><div class="dmi-title">六、个人信息安全事件的通知</div>
                            <div class="dmi-body">本应用的数据默认只存在于你自己的设备上，开发者并不持有你的记录与照片，因此不存在「服务端数据被批量获取」的情形。即便如此，一旦发现你的个人信息发生或可能发生<b>泄露、篡改或丢失</b>（例如网盘凭据在传输环节出现风险、安装包校验机制被绕过），我们会<b>立即采取补救措施</b>（如暂停相关功能、尽快发布修复版本），并通过应用内弹窗、更新日志与官网公告等可行方式<b>如实告知</b>：事件基本情况、可能造成的影响、我们已采取的措施，以及你可以采取的应对建议（如更换网盘应用密码）；同时依法向履行个人信息保护职责的部门报告。如你发现疑似安全问题，也可通过第十一条的联系方式主动告知我们。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">rule</span>
                        <div style="min-width:0;"><div class="dmi-title">七、你的权利</div>
                            <div class="dmi-body"><b>查阅与更正</b>：全部数据在应用内可见、可改；<b>导出与迁移</b>：随时「导出完整备份」带走记录与照片；<b>删除</b>：单条删除、批量删除、抹掉所有足迹（云端旧备份需你自行在网盘删除）；<b>撤回同意</b>：你可在「设置 → 云备份」解绑网盘账号，以撤回对云备份的授权；撤回不影响撤回前基于你的同意已进行的处理。上述权利<b>均无需向开发者申请</b>，你在应用内即可直接行使；如需协助，可通过第十一条的联系方式联系我们。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">child_care</span>
                        <div style="min-width:0;"><div class="dmi-title">八、未成年人保护</div>
                            <div class="dmi-body">本应用不面向 14 周岁以下儿童单独提供服务。未成年人应在监护人指导下使用；户外活动请务必由成年人陪同，并由监护人承担相应监护责任。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">key</span>
                        <div style="min-width:0;"><div class="dmi-title">九、权限清单与用途</div>
                            <div class="dmi-body"><b>通知</b>：计划与备份提醒；<b>精确闹钟</b>：计划当天早上提醒；<b>开机启动</b>：重启手机后恢复你的计划闹钟；<b>震动</b>：点按反馈；<b>安装应用</b>：协助安装已下载的新版本；<b>存储写入</b>（仅旧版安卓）：把备份写入「下载」目录；<b>照片选择</b>：为记录添加照片。以上权限均可拒绝，拒绝仅导致对应功能不可用，不影响其余功能。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">update</span>
                        <div style="min-width:0;"><div class="dmi-title">十、政策更新</div>
                            <div class="dmi-body">本政策随功能迭代更新，最新内容始终在本页展示。若更新涉及你的权利或个人信息处理方式的重大变化，我们会更新<b>条款版本号</b>，并在应用内<b>重新征求你的同意</b>——你需再次阅读并勾选同意后方可继续使用；不同意时可停止使用并卸载本应用。</div></div>
                    </div>
                    <div class="dmi-group">
                        <span class="material-icons dmi-ic">gavel</span>
                        <div style="min-width:0;"><div class="dmi-title">十一、适用法律与联系方式</div>
                            <div class="dmi-body">本应用的运营者为<b>xixi</b>（GitHub：NiUKinGDoM），系本政策项下的个人信息处理者。如对本政策有疑问、意见或投诉，或需行使查阅、更正、删除、撤回同意等权利，可通过「关于应用 → GitHub」提交 Issue、发邮件至 <a href="mailto:Xixihiking@foxmail.com">Xixihiking@foxmail.com</a>，或访问项目官网 <a href="https://xixi-hiking-site.pages.dev" target="_blank" rel="noopener">xixi-hiking-site.pages.dev</a>（应用内「关于应用 → 官方网站」可一键打开），我们将在合理期限内（一般不超过 15 个工作日）答复。本政策的订立、效力、解释与争议解决均适用<b>中华人民共和国法律</b>；因本政策发生争议的，双方应友好协商解决，协商不成的，可依法向有管辖权的人民法院提起诉讼。</div></div>
                    </div>
                ${AGREEMENT_STAMP}
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="privacy-close">我知道了</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('privacy-close');
    const closeModal = function () { if (modal.parentNode) document.body.removeChild(modal); };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
}

// ★2026-09-08 保存二维码（App 原生 MediaStore 桥优先存相册；网页版 a[download] 降级）
function saveSupportQr(src, label) {
    var isData = String(src || '').indexOf('data:') === 0;
    var fileName = 'xixi-support-' + (label === '微信收款' ? 'wechat' : 'alipay') + '.jpg';
    function hasBridge() {
        return !!(window.XixiFileBridge && typeof window.XixiFileBridge.saveQrToGallery === 'function');
    }
    function saveBase64(dataUrl) {
        var raw = String(dataUrl || '').replace(/^data:image\/[a-z+]+;base64,/, '');
        try {
            var ok = window.XixiFileBridge.saveQrToGallery(raw);
            if (ok === true || ok === 'true' || ok === null) showSuccessMessage('已保存到系统相册');
            else showErrorMessage('保存失败，可长按图片识别或截图保存');
        } catch (e) { showErrorMessage('保存失败，可长按图片识别或截图保存'); }
    }
    function isIOSWeb() {
        try {
            var ua = navigator.userAgent || '';
            var iOS = /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Macintosh') >= 0 && 'ontouchend' in document);
            var noDl = typeof document.createElement('a').download === 'undefined';
            return iOS || noDl;
        } catch (e) { return false; }
    }
    function webDownload(href) {
        // ★2026-09-10 iOS 网页适配：Safari 不支持 a[download] → 改为提示长按图片保存（存储到照片）
        if (isIOSWeb()) { if (typeof showInfoMessage === 'function') showInfoMessage('长按二维码图片即可保存到相册'); return; }
        try {
            var a = document.createElement('a');
            a.href = href; a.download = fileName;
            document.body.appendChild(a); a.click();
            setTimeout(function () { a.remove(); }, 300);
            showSuccessMessage('图片已开始下载，存好后去扫一扫识别');
        } catch (e2) { showErrorMessage('保存失败，请长按图片保存'); }
    }
    if (isData) { if (hasBridge()) saveBase64(src); else webDownload(src); return; }
    // 外置图片：App 内 fetch 读成 base64 走相册桥；失败降级提示长按保存
    if (hasBridge()) {
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
            return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
        }).then(function (dataUrl) { saveBase64(dataUrl); })
          .catch(function () { showErrorMessage('保存失败，可长按图片识别或截图保存'); });
    } else {
        webDownload(src);
    }
}

// ★2026-09-08 支持作者弹窗（设置-关于卡「支持作者」入口）：step1 渠道选择+推荐金额 → step2 收款码大图+保存相册
function showSupportModal() {
    closeOpenModals();
    var modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    var dark = document.body.classList.contains('dark-mode');
    var bodyTxt = dark ? '#cbd5e1' : '#334155';
    var subTxt = dark ? '#94a3b8' : '#64748b';
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
        '<div class="confirm-modal-title">支持作者</div>' +
        '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;">' +
        '<div style="font-size:13px;color:' + bodyTxt + ';line-height:1.7;">徒步小记是 XiXi 亲手做的小软件，完全免费、没有广告。如果你用得开心，欢迎请作者喝杯奶茶支持一下——纯自愿，不付费也拥有全部功能。</div>' +
        '</div>' +
        '<div class="confirm-modal-buttons" style="flex-wrap:nowrap;">' +
        '<button id="support-wx" class="ripple-effect" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 0;border-radius:12px;font-weight:700;font-size:15px;line-height:1.2;white-space:nowrap;color:#047857;background:rgba(7,193,96,0.14);border:1px solid rgba(7,193,96,0.5);"><span class="material-icons" style="font-size:15px;">chat</span>微信</button>' +
        '<button id="support-ali" class="ripple-effect" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 0;border-radius:12px;font-weight:700;font-size:15px;line-height:1.2;white-space:nowrap;color:#0057b8;background:rgba(22,119,255,0.14);border:1px solid rgba(22,119,255,0.5);"><span class="material-icons" style="font-size:15px;">account_balance_wallet</span>支付宝</button>' +
        '<button class="confirm-btn-cancel ripple-effect" id="support-close" style="flex:0 0 auto;min-width:0 !important;padding:10px 12px !important;white-space:nowrap;">关闭</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    function toStep2(kind) {
        var isWx = kind === 'wx';
        var b64 = isWx ? SUPPORT_QR_WECHAT : SUPPORT_QR_ALIPAY;
        var label = isWx ? '微信收款' : '支付宝收款';
        var box = modal.querySelector('.confirm-modal-content');
        if (!box) return;
        box.innerHTML = '<div class="confirm-modal-title">' + label + '</div>' +
            '<div class="confirm-modal-message" style="text-align:center;padding:0 2px;">' +
            '<div style="margin:8px auto 12px;width:min(70vw,254px);border-radius:12px;background:#fff;padding:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);">' +
            '<img src="' + b64 + '" alt="' + label + '" data-testid="support-qr-img" style="width:100%;display:block;border-radius:8px;background:#fff;"></div>' +
            '<div style="font-size:12px;color:' + subTxt + ';line-height:1.65;">保存二维码到相册后，打开' + (isWx ? '微信' : '支付宝') + '「扫一扫」点右上角相册图标选图即可识别付款</div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="support-back">返回</button>' +
            '<button class="glass-btn ripple-effect" id="support-save">保存二维码</button>' +
            '</div>';
        box.querySelector('#support-back').addEventListener('click', function () {
            if (modal.parentNode) document.body.removeChild(modal);
            showSupportModal();
        });
        box.querySelector('#support-save').addEventListener('click', function () { saveSupportQr(b64, label); });
    }
    modal.querySelector('#support-wx').addEventListener('click', function () { toStep2('wx'); });
    modal.querySelector('#support-ali').addEventListener('click', function () { toStep2('ali'); });
    modal.querySelector('#support-close').addEventListener('click', function () { if (modal.parentNode) document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal && modal.parentNode) document.body.removeChild(modal); });
}

function showDeleteConfirmModal(recordId, recordName) {
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = `
<div class="confirm-modal-content modal-fade-scale mdl-sm">
            <div class="confirm-modal-title">
                <span class="material-icons" style="color: #dc2626;">warning</span>
                确认删除
            </div>
            <div class="confirm-modal-message">
                确定要删除"${recordName}"这条记录吗？此操作无法撤销。
            </div>
            <div class="confirm-modal-buttons">
                <button class="confirm-btn-cancel ripple-effect" id="confirm-cancel">
                    取消
                </button>
                <button class="confirm-btn-delete check-go-btn ripple-effect" id="confirm-delete">
                    删除
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = document.getElementById('confirm-cancel');
    const deleteBtn = document.getElementById('confirm-delete');
    
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    deleteBtn.addEventListener('click', () => {
        closeModal();
        deleteRecord(recordId);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function deleteRecord(id) {
    // ★2026-08-20 级联删除照片
    const recToDelete = records.find(r => r.id === id);
    if (recToDelete && recToDelete.photos && recToDelete.photos.length) {
        photoDeleteMany(recToDelete.photos).catch(function () {});
    }
    thumbCacheClear(); // ★2026-08-27 照片删除：缩略图缓存全清
    // ★2026-09-29 五项优化⑤：数据落盘不再挂在 animationend 上。
    //   原实现把「内存过滤 + saveToStorage + renderTable」整段放在行退出动画的 animationend 回调里，
    //   一旦该事件因任何原因不触发（行元素被提前重建 / 系统「减少动态效果」把动画压成 0.01ms 的极端时序 /
    //   页面在动画期间被切走），记录就永远删不掉且**无任何报错**——用户只看到行还在。
    //   现改为：先落盘再播动画（与 deleteBatchSelected 的同步落盘保持一致），动画纯装饰。
    records = records.filter(r => r.id !== id);
    updateStatistics();
    saveToStorage();
    renderTable();
    const row = document.getElementById('row-' + id);
    if (row) {
        row.classList.add('row-exit');
        // 动画结束后若该行仍在（renderTable 通常已重建列表），自行移除，避免残影
        row.addEventListener('animationend', () => { if (row.parentNode) row.parentNode.removeChild(row); }, { once: true });
    }
}
function addNewRecord() {
    const newRecord = {
        id: generateId(),
        name: '',
        difficulty: 3,
        elevation: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()   // ★2026-08-26 最后修改时间（合并取新用）
    };
    
    records.unshift(newRecord);
    recordPage = 1; // ★2026-08-26 新增记录回到第一页（新记录在最前）
    editingId = newRecord.id;
    editingPhotoIds = [];
    // ★2026-09-04 阅读态 v2：新建后直接打开编辑弹窗（列表本身是瘦身只读态）
    updateStatistics();
    renderTable();
    openRecordDetailModal(newRecord.id, 'edit');
}

// 更新山脉数据的函数

// ★2026-08-27 统计防抖：记录数据指纹（长度+最后修改时间），没变就不重算/不重建图表（14 处调用防抖）
let statsFingerprint = '';
// ★2026-09-01 徒步年资：按最早记录日期显示"徒步第 N 天 · 从 X年X月X日 出发"（无记录隐藏）
function fillAboutSince() {
    var el = document.getElementById('aboutSinceLine');
    if (!el) return;
    var dates = [];
    (records || []).forEach(function (r) {
        if (r.createdAt) {
            var d = new Date(r.createdAt);
            if (!isNaN(d.getTime())) dates.push(d);
        }
    });
    if (!dates.length) { el.style.display = 'none'; return; }
    dates.sort(function (a, b) { return a - b; });
    var first = dates[0];
    var days = Math.max(1, Math.floor((Date.now() - first.getTime()) / 86400000) + 1);
    el.innerHTML = '<span class="material-icons" style="font-size:12px;vertical-align:-2px;color:#667eea;">hiking</span> <span>徒步第 ' + days + ' 天 · 从 ' + first.getFullYear() + '年' + (first.getMonth() + 1) + '月' + first.getDate() + '日 出发</span>';
    el.style.display = '';
}
// ★2026-09-14 新增「那年今日」：概览页展示往年同月同日的徒步记录（纯本地计算、零新依赖、两端通用）
// 匹配策略：月+日完全相同且年份早于今年；无则整卡不渲染（宁缺毋滥，避免误导）
var onThisDayFp = '';
function renderOnThisDay() {
    try {
        var card = document.getElementById('onThisDayCard');
        var body = document.getElementById('onThisDayBody');
        if (!card || !body) return;
        var now = new Date();
        var mm = now.getMonth() + 1, dd = now.getDate(), yy = now.getFullYear();
        var list = records || [];
        // 指纹：今天日期 + 记录数 + 最新修改时间（避免频繁重算与重渲染）
        var fp = yy + '-' + mm + '-' + dd + '_' + list.length + '_' + list.reduce(function (m, r) { var t = (r && (r.updatedAt || r.createdAt)) || ''; return t > m ? t : m; }, '');
        if (fp === onThisDayFp) return;
        onThisDayFp = fp;
        // ★2026-10-10 P0-1「时光机」：三层回退 —— ① 同月同日 ② 同月（往年）③ 整百/整年天（±1 天）
        //   原实现只匹配「同月同日」，一年仅一次机会 → 绝大多数日子整卡不显示（与「打开就能看到回忆」相悖）
        var __odTs = function (r0) { if (!r0 || !r0.createdAt) return 0; var t0 = new Date(r0.createdAt).getTime(); return isNaN(t0) ? 0 : t0; };
        var r = null, hintLabel = '';
        var byDay = list.filter(function (r0) {
            var t0 = __odTs(r0); if (!t0) return false;
            var d0 = new Date(t0);
            return (d0.getMonth() + 1) === mm && d0.getDate() === dd && d0.getFullYear() < yy;
        });
        if (byDay.length) {
            byDay.sort(function (a, b) { return __odTs(b) - __odTs(a); });
            r = byDay[0];
            hintLabel = (yy - new Date(__odTs(r)).getFullYear()) + ' 年前的今天';
        } else {
            var byMonth = list.filter(function (r0) {
                var t0 = __odTs(r0); if (!t0) return false;
                var d0 = new Date(t0);
                return (d0.getMonth() + 1) === mm && d0.getFullYear() < yy;
            });
            if (byMonth.length) {
                byMonth.sort(function (a, b) { return __odTs(b) - __odTs(a); });
                r = byMonth[0];
                hintLabel = (yy - new Date(__odTs(r)).getFullYear()) + ' 年前的 ' + mm + ' 月';
            } else {
                var __odMarks = [100, 200, 300, 365, 500, 730, 1000, 1460, 1825, 2555, 3650];
                for (var mi = 0; mi < __odMarks.length && !r; mi++) {
                    var tgt = __odMarks[mi];
                    var hitM = list.filter(function (r0) {
                        var t0 = __odTs(r0); if (!t0) return false;
                        return Math.abs(Math.floor((now.getTime() - t0) / 86400000) - tgt) <= 1;
                    });
                    if (hitM.length) {
                        hitM.sort(function (a, b) { return __odTs(b) - __odTs(a); });
                        r = hitM[0];
                        hintLabel = tgt + ' 天前';
                    }
                }
            }
        }
        if (!r) { card.style.display = 'none'; body.innerHTML = ''; return; }
        var dark = document.body.classList.contains('dark-mode');
        var sub = dark ? 'rgba(255,255,255,0.72)' : '#52606f';
        var strong = dark ? '#ffffff' : '#0f172a';
        var pid = (r.photos && r.photos.length) ? r.photos[0] : '';
        var thumb = '<div style="width:56px;height:56px;border-radius:12px;flex-shrink:0;overflow:hidden;background:' + (dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)') + ';display:flex;align-items:center;justify-content:center;">' + (pid ? '<img data-record="' + escapeHtml(r.id) + '" data-pid="' + escapeHtml(pid) + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<span class="material-icons" style="font-size:24px;color:' + sub + ';">landscape</span>') + '</div>';
        var meta = [];
        if (r.distance) meta.push(r.distance + ' km');
        if (r.difficulty) meta.push(r.difficulty + ' 级');
        if (r.mood) meta.push(escapeHtml(r.mood));
        if (r.weather) meta.push(escapeHtml(r.weather));
        body.innerHTML = '<div id="onThisDayRow" style="display:flex;align-items:center;gap:12px;cursor:pointer;">' + thumb + '<div style="flex:1;min-width:0;">' + '<div style="font-size:12px;color:' + sub + ';margin-bottom:2px;">' + hintLabel + '</div>' + '<div style="font-size:16px;font-weight:700;color:' + strong + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(r.name || '未命名') + '</div>' + (meta.length ? '<div style="font-size:12px;color:' + sub + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + meta.join(' · ') + '</div>' : '') + '</div>' + '<span class="material-icons" style="font-size:20px;color:' + sub + ';flex-shrink:0;">chevron_right</span>' + '</div>';
        card.style.display = 'block';
        var row = document.getElementById('onThisDayRow');
        if (row) row.addEventListener('click', function () { triggerHaptic(12); if (typeof openRecordDetailModal === 'function') openRecordDetailModal(r.id); });
        try { loadPhotoThumbs(r.id); } catch (eP) { /* 缩略图失败不影响文字 */ }
    } catch (e) { /* 那年今日失败绝不影响概览渲染 */ }
}

// ★2026-10-10 P0-2 备份健康提示（页内 · 一次性 · 覆盖「未绑网盘」的沉默风险）
//   与既有「系统通知版备份提醒」（app-sync.js：仅【已绑网盘】且 ≥7 天时触发、每天最多一次）**互补**：
//   本提示 ① 不依赖通知权限 ② 对未绑网盘的用户同样生效 ③ 点「知道了」永久不再提。
function renderBackupHint() {
    try {
        var el = document.getElementById('backupHintCard');
        if (!el) return;
        var txtEl = document.getElementById('backupHintText');
        // 已点过「知道了」→ 永久不再提
        try { if (AppStore.getItem('hiking_backup_hint_dismissed') === true) { el.style.display = 'none'; return; } } catch (e0) { }
        // 没有任何数据 → 不需要备份
        var hasData = (typeof records !== 'undefined' && records && records.length > 0) ||
            (typeof plannedTrips !== 'undefined' && plannedTrips && plannedTrips.length > 0);
        if (!hasData) { el.style.display = 'none'; return; }
        // 最近一次成功备份 = max(云端同步时间, 本地自动备份时间)
        var ts = 0;
        try {
            var st = AppStore.getItem('hiking_sync_status');
            if (st && st.lastSyncAt) { var a1 = new Date(st.lastSyncAt).getTime(); if (a1 > ts) ts = a1; }
        } catch (e1) { }
        try {
            var lb = AppStore.getItem('hiking_local_backup_at');
            if (typeof lb === 'number' && lb > ts) ts = lb;
        } catch (e2) { }
        var days = ts ? Math.floor((Date.now() - ts) / 86400000) : -1;
        if (ts && days < 30) { el.style.display = 'none'; return; }
        // ★2026-10-10 体验门槛：从未备份过时，要求「最早一条数据距今 ≥ 14 天」才提示
        //   —— 否则刚装好、刚记两条就跳出「还没备份过」太打扰（与「不要唠叨」冲突）
        if (!ts) {
            var __oldest = 0;
            var __all = (typeof records !== 'undefined' && records ? records : []).concat(
                (typeof plannedTrips !== 'undefined' && plannedTrips ? plannedTrips : []));
            for (var __i = 0; __i < __all.length; __i++) {
                var __t1 = Date.parse(__all[__i] && __all[__i].createdAt) || 0;
                if (__t1 && (!__oldest || __t1 < __oldest)) __oldest = __t1;
            }
            if (!__oldest || (Date.now() - __oldest) < 14 * 86400000) { el.style.display = 'none'; return; }
        }
        if (txtEl) {
            txtEl.textContent = ts
                ? ('数据已 ' + days + ' 天没备份了')
                : '还没备份过数据';
        }
        el.style.display = 'block';
        var go = document.getElementById('backupHintGo');
        if (go && !go.__bound) {
            go.__bound = true;
            go.addEventListener('click', function () {
                try { triggerHaptic(10); } catch (eH) { }
                try { var b = document.querySelector('.tab-btn[data-tab="settings"]'); if (b) b.click(); } catch (eS) { }
            });
        }
        var cl = document.getElementById('backupHintClose');
        if (cl && !cl.__bound) {
            cl.__bound = true;
            cl.addEventListener('click', function () {
                try { AppStore.setItem('hiking_backup_hint_dismissed', true); } catch (eD) { }
                el.style.display = 'none';
            });
        }
    } catch (e) { /* 提示失败绝不影响概览 */ }
}

function updateStatistics() {
    renderOnThisDay(); // ★2026-09-14「那年今日」：置于指纹快照判断之前，跨天/切页回来也能刷新
    renderBackupHint(); // ★2026-10-10 P0-2 备份健康提示（页内、一次性、覆盖未绑网盘）
    // ★2026-09-15 里程碑补领已移出此处：saveRecord() 内 updateStatistics() 先于 checkMilestones() 执行，
    //   静默补领会抢先标记新达成档位 → 庆祝卡永不弹（真 bug）。改由「启动 + 切到概览页」触发（见 app-init.js）
    renderMilestoneEntry(); // ★2026-09-15 入口计数跟随数据实时刷新（删/改记录后立即变化；纯展示无副作用）
    const fp = (records || []).length + '_' + (records || []).reduce(function (m, r) {
        const t = r.updatedAt || r.createdAt || '';
        return t > m ? t : m;
    }, '');
    if (fp === statsFingerprint && safeGetElementById('totalCount')) {
        return; // 数据没变：跳过重算与图表重建（消灭编辑保存时的统计卡顿）
    }
    statsFingerprint = fp;
    
    const totalCount = safeGetElementById('totalCount');
    const avgElevation = safeGetElementById('avgElevation');
    const maxElevation = safeGetElementById('maxElevation');
    // ★2026-09-03 A 布局：矮副卡新增 平均难度/平均用时（总爬升卡已随布局精简移除，累计爬升仍在热力图底部汇总）
    const avgDifficultyMini = safeGetElementById('avgDifficultyMini');
    const avgDurationMini = safeGetElementById('avgDurationMini');
    // ★2026-09-03 难度分布图卡已删除（用户：首页不需要）；相关元素/渲染逻辑全部移除
    
    // 辅助函数：更新数字并添加动画（用 WAAPI 取消旧动画，避免强制同步布局重排）
    // ★2026-08-25 卡片渐入由 .stat-card CSS 行级 stagger 负责，数字动画不再单独 delay
    const updateWithAnimation = (element, newValue) => {
        if (!element) return;
        const oldValue = element.textContent;
        if (oldValue !== newValue) {
            element.classList.remove('number-scroll');
            if (typeof element.getAnimations === 'function') {
                const anims = element.getAnimations();
                if (anims.length) {
                    anims.forEach(a => a.cancel());
                } else {
                    void element.offsetWidth; // 无动画时的重放兜底（仅数字变化时，极低频）
                }
            } else {
                void element.offsetWidth;
            }
            element.classList.add('number-scroll');
            element.textContent = newValue;
        }
    };
    
    // ★2026-09-06 单位全部独立小字（.stat-unit 与「次」同规格）：JS 只写数字本体；空态难度隐藏「级」单位
    if (records.length === 0) {
        if (totalCount) totalCount.textContent = '0';
        if (avgElevation) avgElevation.textContent = '0';
        if (maxElevation) maxElevation.textContent = '0';
        if (avgDifficultyMini) { avgDifficultyMini.textContent = '—'; }
        var dU0 = safeGetElementById('avgDifficultyMiniU'); if (dU0) dU0.style.display = 'none';
        if (avgDurationMini) avgDurationMini.innerHTML = '—';
        if (totalDistance) totalDistance.textContent = '0';
        if (totalDuration) totalDuration.innerHTML = '0<span class="stat-unit">h</span>';
        return;
    }
    

    const total = records.length;
    // ★2026-09-05 P0-1 大数量优化：原 6 次独立 reduce 全量遍历（万条 70ms）→ 单次 forEach 累加（~15ms）
    let accEl = 0, accMaxEl = 0, accDiff = 0, accKm = 0, accMin = 0;
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        accEl += Number(rec.elevation) || 0;
        const el = Number(rec.elevation) || 0;
        if (el > accMaxEl) accMaxEl = el;
        accDiff += Number(rec.difficulty) || 0;
        accKm += Number(rec.distance) || 0;
        accMin += Number(rec.duration) || 0;
    }
    const totalElevation = accEl;
    const averageElevation = Math.round(totalElevation / total);
    const highestElevation = accMaxEl;
    const totalDifficulty = accDiff;
    const averageDifficulty = (totalDifficulty / total).toFixed(1);
    const totalKm = accKm;
    const totalMin = accMin;
    
    // ★2026-09-06 单位小字化：数字本体更新（单位静态在 HTML .stat-unit）；时长渲染 h/m 单位也小字
    var durationHTML = function (min) {
        var mm = Math.round(Number(min) || 0);
        if (!mm || mm <= 0) return '0<span class="stat-unit">h</span>';
        var hh = Math.floor(mm / 60), rr = mm % 60;
        if (hh && rr) return hh + '<span class="stat-unit">h</span>&nbsp;' + rr + '<span class="stat-unit">m</span>';
        if (hh) return hh + '<span class="stat-unit">h</span>';
        return rr + '<span class="stat-unit">m</span>';
    };
    updateWithAnimation(totalCount, total.toString());
    updateWithAnimation(avgElevation, averageElevation);
    updateWithAnimation(maxElevation, highestElevation);
    var dU1 = safeGetElementById('avgDifficultyMiniU'); if (dU1) dU1.style.display = '';
    // ★2026-09-03 A 布局：矮副卡 平均难度/平均用时（原总爬升卡精简移除，累计爬升回到热力图底部汇总行）
    updateWithAnimation(avgDifficultyMini, averageDifficulty);
    const avgMin = total ? Math.round(totalMin / total) : 0;
    // ★2026-10-12 矮卡「平均用时」改用小时小数短格式（6.4h / 48m）——原 durationHTML 里的 &nbsp; 在中文全角字体
    //   （SimSun/Noto CJK）下宽达 17.4px，而三列矮卡在 390px 屏上只剩 58px 可用宽 → 被 text-overflow 截成「6h···」。
    //   短格式最宽约 40px（12.5h），320~412px 全档位均不截断。总用时主卡格式不变（宽度充裕，保留 h/m 精确值）。
    if (avgDurationMini) {
        if (!avgMin) {
            avgDurationMini.innerHTML = '—';
        } else if (avgMin >= 60) {
            avgDurationMini.innerHTML = (avgMin / 60).toFixed(1) + '<span class="stat-unit">h</span>';
        } else {
            avgDurationMini.innerHTML = avgMin + '<span class="stat-unit">m</span>';
        }
    }
    // ★2026-08-25 总里程/总用时（卡片渐入由 .stat-card 行级 stagger 控制）
    updateWithAnimation(totalDistance, totalKm ? totalKm.toFixed(2) : '0'); // ★2026-09-01 里程两位小数
    if (totalDuration) totalDuration.innerHTML = durationHTML(totalMin);
    renderHeatmap(); // v1.0.7.7 切到概览刷新热力图
}
