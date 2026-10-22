// ============================================================================
// 徒步足迹热力图（年月选择 / 日历式月视图 / 渲染缓存）
// ★2026-10-22 从 app-data.js 按功能边界拆出（原 5464 行单文件 → 6 个文件）。
//   拆分为纯物理切分：所有函数/变量仍在全局作用域，加载顺序与拆分前一致，行为不变。
// ============================================================================

// ===== 徒步足迹热力图（v1.0.7.7：红色渐变 + 年月可选 + 日历式月视图） =====
// ★2026-09-03 难度分布卡已删除 → ensureOverviewLayout 整段移除（原负责把热力图卡插到难度分布卡前）
let hmYear = 0, hmMonth = 0;
// ★2026-08-11 热力图事件只绑定一次（initHeatmap 会被多次调用：初始化 + 底栏刷新重置）
let hmBound = false;
function updateHmYmBtn() {
    const t = document.getElementById('hmYmText');
    if (t) t.textContent = (hmYear ? hmYear : '—') + '年' + (hmMonth ? hmMonth : '—') + '月';
}
function bindHeatmapEvents() {
    const ymBtn = document.getElementById('hmYmBtn');
    if (!ymBtn || hmBound) return;
    hmBound = true;
    ymBtn.addEventListener('click', function () { openHmYmPicker(); });
}
// ★2026-09-03 年月单框弹窗：年份 chips（有记录年份）+ 月份 12 格（有足迹月可点），选中整格靛蓝实心白字（同 App 单选态）
function openHmYmPicker() {
    try {
        if (typeof closeOpenModals === 'function') closeOpenModals();
        const now = new Date();
        const years = getRecordYears();
        const yearList = years.length ? years : [now.getFullYear()];
        const nowY = now.getFullYear();
        let y = (hmYear && yearList.indexOf(hmYear) >= 0) ? hmYear : (yearList.indexOf(nowY) >= 0 ? nowY : yearList[0]);
        const nowM = now.getMonth() + 1;
        const ms0 = getRecordMonths(y);
        let m = (hmMonth && ms0.indexOf(hmMonth) >= 0) ? hmMonth : (ms0.length ? (ms0.indexOf(nowM) >= 0 ? nowM : ms0[ms0.length - 1]) : nowM);
        const modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML =
'<div class="confirm-modal-content modal-fade-scale mdl-sm">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#4f46e5;">calendar_view_month</span>选择年月</div>' +
            '<div class="confirm-modal-message" style="text-align:left;">' +
            '<div class="hmyp-yrs" id="hmypYrs"></div>' +
            '<div class="hmyp-months" id="hmypMonths"></div>' +
            '</div>' +
            '<div class="confirm-modal-buttons">' +
            '<button class="confirm-btn-cancel ripple-effect" id="hmyp-cancel" type="button">取消</button>' +
            '<button class="glass-btn ripple-effect" id="hmyp-ok" type="button">确定</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        const yrsEl = modal.querySelector('#hmypYrs');
        const mosEl = modal.querySelector('#hmypMonths');
        function renderYrs() {
            yrsEl.innerHTML = yearList.map(function (yy) {
                return '<span class="hmyp-yr' + (yy === y ? ' sel' : '') + '" data-y="' + yy + '" role="button">' + yy + '年</span>';
            }).join('');
        }
        function renderMos() {
            const avail = getRecordMonths(y);
            const usable = avail.length ? avail : [now.getMonth() + 1];
            let cells = '';
            for (let i = 1; i <= 12; i++) {
                const on = usable.indexOf(i) >= 0;
                cells += '<span class="hmyp-m' + (i === m && on ? ' sel' : '') + (on ? '' : ' no') + '" data-m="' + i + '" role="button">' + i + '月</span>';
            }
            mosEl.innerHTML = cells;
        }
        renderYrs();
        renderMos();
        yrsEl.addEventListener('click', function (e) {
            const chip = e.target.closest ? e.target.closest('.hmyp-yr') : null;
            if (!chip) return;
            y = parseInt(chip.getAttribute('data-y'), 10);
            const avail = getRecordMonths(y);
            const usable = avail.length ? avail : [now.getMonth() + 1];
            if (usable.indexOf(m) < 0) m = usable[usable.length - 1];
            renderYrs();
            renderMos();
        });
        mosEl.addEventListener('click', function (e) {
            const cell = e.target.closest ? e.target.closest('.hmyp-m') : null;
            if (!cell || cell.classList.contains('no')) return;
            m = parseInt(cell.getAttribute('data-m'), 10);
            renderMos();
        });
        function closeMdl() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
        modal.querySelector('#hmyp-cancel').addEventListener('click', closeMdl);
        modal.querySelector('#hmyp-ok').addEventListener('click', function () {
            hmYear = y;
            hmMonth = m;
            updateHmYmBtn();
            closeMdl();
            renderHeatmap();
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) closeMdl(); });
    } catch (e) { /* 静默 */ }
}

function initHeatmap() {
    // ★2026-09-03 难度分布卡删除后无需布局重排（原 ensureOverviewLayout 已移除）
    const ymBtn = document.getElementById('hmYmBtn');
    if (!ymBtn) return;
    const now = new Date();
    const years = getRecordYears();
    const yearList = years.length ? years : [now.getFullYear()];
    const nowY = now.getFullYear();
    hmYear = yearList.indexOf(nowY) >= 0 ? nowY : yearList[0];
    const ms = getRecordMonths(hmYear);
    const nowM = now.getMonth() + 1;
    hmMonth = ms.length ? (ms.indexOf(nowM) >= 0 ? nowM : ms[ms.length - 1]) : nowM;
    updateHmYmBtn();
    bindHeatmapEvents();
    renderHeatmap();
}

function getRecordYears() {
    const years = [];
    const seen = {};
    records.forEach(function (r) {
        if (!r.createdAt) return;
        const d = new Date(r.createdAt);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        if (!seen[y]) { seen[y] = 1; years.push(y); }
    });
    return years.sort(function (a, b) { return b - a; });
}

function getRecordMonths(year) {
    const months = [];
    const seen = {};
    records.forEach(function (r) {
        if (!r.createdAt) return;
        const d = new Date(r.createdAt);
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() !== year) return;
        const m = d.getMonth() + 1;
        if (!seen[m]) { seen[m] = 1; months.push(m); }
    });
    return months.sort(function (a, b) { return a - b; });
}

// ★2026-08-27 热力图渲染缓存：key = 年月+数据指纹（记录变才重建，重复进入秒开）
let heatmapCache = {};
// ★2026-09-05 P0-4 月度聚合桶：单次全量遍历把「每天次数 + 当月爬升」按年月分桶，任意月 O(1) 读取（切月/汇总不再全量扫 records）
let hmMonthAgg = null;   // { fp, buckets: { 'y_m': { days:{}, n, climb } } }
function renderHeatmap() {
    const cal = document.getElementById('hmCalendar');
    const sumEl = document.getElementById('hmSummary');
    if (!cal) return;
    if (!hmYear || !hmMonth) { initHeatmap(); return; }
    const year = hmYear, month = hmMonth;
    const dataFp = (records || []).length + '_' + (records || []).reduce(function (m, r) {
        const t = r.updatedAt || r.createdAt || '';
        return t > m ? t : m;
    }, '');
    // ★2026-09-05 P0-4：月桶懒构建（指纹与 html 缓存 key 一致；无记录增删改则复用）
    let agg = null;
    if (hmMonthAgg && hmMonthAgg.fp === dataFp) { agg = hmMonthAgg; }
    else {
        agg = { fp: dataFp, buckets: {} };
        records.forEach(function (r) {
            if (!r.createdAt) return;
            const d = new Date(r.createdAt);
            if (isNaN(d.getTime())) return;
            const bk = d.getFullYear() + '_' + (d.getMonth() + 1);
            const b = agg.buckets[bk] || (agg.buckets[bk] = { days: {}, n: 0, climb: 0 });
            b.days[d.getDate()] = (b.days[d.getDate()] || 0) + 1;
            b.n++;
            b.climb += Number(r.elevation) || 0;
        });
        hmMonthAgg = agg;
    }
    const bucket = agg.buckets[year + '_' + month] || { days: {}, n: 0, climb: 0 };
    const cacheKey = year + '_' + month + '_' + dataFp;
    let html = heatmapCache[cacheKey];
    if (html === undefined) {
        const dayCount = bucket.days;
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
        html = '';
        for (let i = 0; i < firstWeekday; i++) html += '<div class="hm-day empty"></div>';
        let maxDay = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const c = dayCount[day] || 0;
            if (c > maxDay) maxDay = c;
            const lv = c > 0 ? 'hm-red' : '';
            html += '<div class="hm-day ' + lv + '" data-day="' + day + '" data-count="' + c + '">' + day + '</div>';
        }
        heatmapCache[cacheKey] = html;
        // 缓存防膨胀：超过 30 条清掉（数据指纹变化后旧 key 自然失效）
        if (Object.keys(heatmapCache).length > 30) heatmapCache = {};
    }
    cal.innerHTML = html;
    const total = bucket.n;
    if (sumEl) {
        // ★2026-09-05 P0-4：爬升直接读桶（原来每次渲染全量扫 records）
        const climbThis = bucket.climb;
        // ★2026-09-04 底部前缀：所选即本月 → 写「本月徒步 …」；历史月写「X年X月徒步 …」防歧义（用户要求加「本月」）
        const _nowD = new Date();
        const _mLabel = (year === _nowD.getFullYear() && month === _nowD.getMonth() + 1) ? '本月' : (year + '年' + month + '月');
        sumEl.textContent = _mLabel + '徒步 ' + total + ' 次' + (climbThis ? ' · 累计爬升 ' + Math.round(climbThis) + 'm' : '');
    }
    cal.querySelectorAll('.hm-day:not(.empty)').forEach(function (el) {
        el.addEventListener('click', function () {
            showHeatmapDayDetail(year, month, parseInt(el.getAttribute('data-day'), 10));
        });
    });
}

function showHeatmapDayDetail(year, month, day) {
    const dayRecords = records.filter(function (r) {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
    });
    if (dayRecords.length === 0) return;
    closeOpenModals(); // ★2026-08-29 防重入
    const modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    // ★2026-08-23 热力图弹窗 v2：关闭/分享按钮玻璃配方 + meta 间距加宽 + 图片分享同行 + 去分割线
    let items = dayRecords.map(function (r) {
        // ★2026-08-26 热力图弹窗分组：①名称·海拔 ②难度·里程 ③用时 ④心情·天气·同行 ⑤图片
        // （难度里程拆开与用时分行，防一行过长换行错位/间距不均）
        const MOOD_TEXT = { '😄': '开心', '😌': '平静', '🤩': '兴奋', '😮‍💨': '疲惫' };
        const WEATHER_TEXT = { '☀️': '晴', '🌤️': '多云', '☁️': '阴', '🌧️': '雨', '❄️': '雪' };
        // ★2026-09-03 五项优化⑤：同行必为用户输入 → escapeHtml；心情/天气旧数据可能存过文本 → 兜底分支也转义（emoji 原样安全）
        const moodTxt = r.mood ? '<span class="hm-meta-item"><span class="hm-meta-label">心情：</span><span class="hm-meta-value">' + escapeHtml(MOOD_TEXT[r.mood] || r.mood) + '</span></span>' : '';
        const weatherTxt = r.weather ? '<span class="hm-meta-item"><span class="hm-meta-label">天气：</span><span class="hm-meta-value">' + escapeHtml(WEATHER_TEXT[r.weather] || r.weather) + '</span></span>' : '';
        const companionTxt = r.companions ? '<span class="hm-meta-item"><span class="hm-meta-label">同行：</span><span class="hm-meta-value">' + escapeHtml(r.companions) + '</span></span>' : '';
        const metaRow = (moodTxt || weatherTxt || companionTxt)
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + moodTxt + weatherTxt + companionTxt + '</div>'
            : '';
        // 难度/里程 一行（行2）
        const diffTxt = r.difficulty ? '<span class="hm-meta-item"><span class="hm-meta-label">难度：</span><span class="hm-meta-value">' + r.difficulty + '级</span></span>' : '';
        const distTxt = r.distance ? '<span class="hm-meta-item"><span class="hm-meta-label">里程：</span><span class="hm-meta-value">' + r.distance + 'km</span></span>' : '';
        const statRow = (diffTxt || distTxt)
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + diffTxt + distTxt + '</div>'
            : '';
        // 用时单独一行（行3）
        const durTxt = r.duration ? '<span class="hm-meta-item"><span class="hm-meta-label">用时：</span><span class="hm-meta-value">' + formatDuration(r.duration) + '</span></span>' : '';
        const durRow = durTxt
            ? '<div style="margin-top:3px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' + durTxt + '</div>'
            : '';
        // ★v5 图片缩略图：显示全部照片（有几张显示几张，按序横排换行）
        const photoIds = (r.photos && r.photos.length) ? r.photos : [];
        const picBox = photoIds.length
            ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' + photoIds.map(function (pid) {
                return '<span class="hm-day-photo" data-pid="' + pid + '" style="display:inline-block;width:56px;height:56px;border-radius:8px;background:#e2e8f0;cursor:pointer;overflow:hidden;" data-lightbox="' + r.id + '"><span style="font-size:20px;line-height:56px;">📷</span></span>';
              }).join('') + '</div>'
            : '';
        return '<div style="padding:10px 0;font-size:14px;">' +
            '<div class="hm-meta-item" style="font-size:17px;font-weight:700;">🏔️ ' + escapeHtml(r.name) + (r.elevation ? ' · ' + r.elevation + 'm' : '') + '</div>' +
            statRow +
            durRow +
            metaRow +
            picBox +
            '</div>';
    }).join('');
modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale mdl-md">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color: #4f46e5;">local_fire_department</span>' + year + '年' + month + '月' + day + '日</div>' +
        '<div class="confirm-modal-message" style="text-align:left;">' + items + '</div>' +
        '<div class="confirm-modal-buttons"><button class="ripple-effect hm-share-btn glass-btn" id="hm-share" data-share="' + dayRecords[0].id + '">分享</button><button class="confirm-btn-cancel ripple-effect" id="hm-close">关闭</button></div></div>';
    document.body.appendChild(modal);
    // 异步加载照片缩略图
    modal.querySelectorAll('.hm-day-photo').forEach(function (box) {
        (function (b) {
            const pid = b.getAttribute('data-pid');
            const recordId = b.getAttribute('data-lightbox');
            photoGet(pid).then(function (p) {
                if (!p || !p.blob) return;
                return blobToDataURL(p.blob).then(function (durl) {
                    b.innerHTML = '<img src="' + durl + '" style="width:100%;height:100%;object-fit:cover;" alt="照片">';
                    b.addEventListener('click', function (ev) {
                        ev.stopPropagation();
                        if (typeof openPhotoLightbox === 'function') openPhotoLightbox(recordId, pid);
                    });
                });
            }).catch(function () { /* 加载失败保留占位 */ });
        })(box);
    });
    // 分享按钮
    modal.querySelectorAll('.hm-share-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const r = records.find(function (x) { return x.id === btn.getAttribute('data-share'); });
            if (r) { document.body.removeChild(modal); generateShareCard(r); }
        });
    });
    document.getElementById('hm-close').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
}
