
// ===== 全局错误保护（防止移动端 WebView 闪退） =====
window.addEventListener('error', function(e) {
    console.error('[GlobalError]', e.message, 'at', e.filename, ':', e.lineno);
    // 阻止错误传播导致 WebView 崩溃
    e.preventDefault();
    return true;
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('[UnhandledRejection]', e.reason);
    // 阻止未处理的 Promise 拒绝导致 WebView 崩溃
    e.preventDefault();
    return true;
});

// ★2026-08-27 网页版离线可用：注册 Service Worker（network-first，断网也能打开 App；App 内 WebView 跳过）
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !window.XixiFileBridge) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 注册失败静默（如 file:// 环境） */ });
    });
}

// ★2026-08-27 关于页：查看更新日志（★2026-08-31 纯本地内置，无需联网；不再联网拉取）
// 发布新版本时记得把 Release body 摘要追加到最前面（保持最新在前）
var BUILTIN_CHANGELOG = {
    'v1.1.7.10': '## v1.1.7.10 更新内容\n\n**心情/天气选择统一玻璃弹窗**\n- 编辑心情/天气由原生下拉改为 App 同款玻璃弹窗（与日期选择器同一设计语言）\n- 心情 4 项、天气 5 项网格点选，当前值自动预选高亮\n- 支持清空、取消、确定，选择后回填\n\nMade by XiXi 💛',
    'v1.1.7.9': '## v1.1.7.9 更新内容\n\n**编辑行优化**\n- 日期时间选择弹窗缩小，更紧凑\n- 里程支持小数点后两位（如 12.34 km）\n- 用时改为「时/分」双框输入，直观又顺手\n- 心情/天气/同行人尺寸微调，与用时框同一行紧凑排列\n\nMade by XiXi 💛',
    'v1.1.7.8': '## v1.1.7.8 更新内容\n\n**自定义日期时间选择器**\n- 编辑日期时间改用 App 同款玻璃弹窗（替换系统原生选择器，设计语言统一）\n- 日历网格选日期：今天靛蓝描边、选中高亮，左右切换月份\n- 时/分步进器：点按调整，长按连续跳动（调分钟不用点几十下）\n- 日期字体不再加粗，与其他输入框统一\n\nMade by XiXi 💛',
    'v1.1.7.7': '## v1.1.7.7 更新内容\n\n**通知升级（能上通知栏的都上）**\n- 备份提醒改通知栏：超过 7 天没同步，启动时通知提醒，点通知直达设置页\n- 自动同步成功/失败、更新下载完成都上通知栏，不用盯着界面也能知道结果\n\n**计划提醒修复**\n- 手机重启后计划提醒自动恢复（原来重启会丢失，要重开 App 才重建）\n\n**设计统一**\n- 编辑行取消按钮浅色模式下可见（原来白边隐形）\n- 编辑行日期/时间框样式统一\n- 里程框后加 km、用时框后加 h\n- 设置页新增「通知权限未开启 → 点击去开启」引导\n\nMade by XiXi 💛',
    'v1.1.7.6': '## v1.1.7.6 更新内容\n\n**记录/计划页面设计统一**\n- 计划页列表视图加年份分组（图标+年份+全年次数），与记录页一致；日历视图保持清爽\n- 记录页行内删除按钮、编辑行保存/取消按钮全部统一为玻璃按钮（保存/完成=浅红玻璃，取消/删除=灰蓝玻璃），与计划页、弹窗完全同款\n- 编辑行保存/取消按钮大小、字重统一，不再一大一小\n- 计划页标题图标色统一为蓝色（与概览/记录/设置一致）\n\n**代码清理**\n- 清理历史遗留死 CSS（老式红/绿/灰按钮样式全部移除）\n\nMade by XiXi 💛',
    'v1.1.7.5': '## v1.1.7.5 更新内容\n\n**记录列表按年份分组**\n- 列表按年份分组显示（图标+年份+全年次数+分割线），翻回忆一目了然\n\n**灯箱照片双指缩放**\n- 双指捏合放大（最高 3 倍）、放大后单指拖动、双击放大/还原\n- 放大时操作按钮不被遮挡，切图自动恢复原大小\n\n**徒步年资**\n- 关于页显示「徒步第 N 天 · 从 X年X月X日 出发」（按最早记录自动计算）\n\nMade by XiXi 💛',
    'v1.1.7.4': '## v1.1.7.4 更新内容\n\n**设置页优化**\n- 关于应用卡片样式与其他设置分组完全一致（去掉内层嵌套卡片）\n- 设置分组边框浅色下改为可见灰蓝色\n\n**更新日志本地化**\n- 查看更新日志改为纯本地内置，断网也能看\n\nMade by XiXi 💛',
    'v1.1.7.3': '## v1.1.7.3 更新内容\n\n**庆祝卡片**\n- 计划完成自动弹出庆祝卡片（彩屑 400 粒满屏爆撒 + 玻璃卡片与热力图弹窗同款参数）\n- 点「继续补全」继续补照片心情，不打断流程\n\nMade by XiXi 💛',
    'v1.1.7.2': '## v1.1.7.2 更新内容\n\n**计划日历升级**\n- 切月后下方直接列出整月全部计划，按日期分组、每条标注日期（如「9月15日 周二」）\n- 点日期格子聚焦该日（2px 粗框框选），「整月」按钮一键返回\n- 二次点击计划页 tab：日历自动回到今天\n- 日期条深浅色统一玻璃配方\n\nMade by XiXi 💛',
    'v1.1.7.1': '## v1.1.7.1 更新内容\n\n**计划日历视图**\n- 计划列表/日历双视图切换（默认日历）\n- 日历下隐藏添加/批量按钮，切换按钮固定最右\n- 日历模式搜索直接定位到匹配计划的日期并标记\n\n**计划完成补记录**\n- 确认完成后自动进入记录编辑，名称/难度/海拔已预填\n\nMade by XiXi 💛',
    'v1.1.7.0': '## v1.1.7.0 更新内容\n\n**计划提醒升级**\n- 不打开 App 也能收到计划提醒（计划当天早上 8 点自动提醒，点击直达计划页）\n- 通知简化：去掉「完成」按钮，点击通知直接进计划页\n\nMade by XiXi',
    'v1.1.6.10': '## v1.1.6.10 更新内容\n\n**通知交互升级**\n- 修复关闭通知权限后提醒彻底消失（权限被拒自动降级 App 内提示）\n- 计划提醒通知可一键「✓ 完成」（通知消失 + 计划自动标记完成）\n- 点击通知直达计划页\n\nMade by XiXi',
    'v1.1.6.9': '## v1.1.6.9 更新内容\n\n**架构与体验升级**\n- 代码结构优化：主逻辑拆分为 4 个独立模块，加载更快\n- 计划提醒接入系统通知栏（不再只弹窗提示）\n- 全局禁止长按复制文字和长按图片菜单\n- 修复通知权限被拒时提醒静默丢失的问题\n\nMade by XiXi',
    'v1.1.6.8': '## v1.1.6.8 更新内容\n\n**灯箱优化**\n- 修复灯箱删除照片时确认弹窗被挡住的问题\n- 灯箱删除键样式统一为浅红玻璃设计\n\nMade by XiXi',
    'v1.1.6.7': '## v1.1.6.7 更新内容\n\n**弹窗与安全优化**\n- 修复下载按钮弹窗连点叠加、关闭失灵\n- 全部弹窗加防重入，不再出现多个弹窗叠加\n- 删除照片增加确认提示，防误删\n- 编辑海拔输入负数自动归零\n- 分享卡里程显示统一为一位小数\n\nMade by XiXi',
    'v1.1.6.6': '## v1.1.6.6 更新内容\n\n**弹窗修复**\n- 修复导出/管理弹窗连点叠加、关闭按钮失灵的问题\n- 管理云端备份时按钮显示读取状态，防止重复点击\n\nMade by XiXi',
    'v1.1.6.5': '## v1.1.6.5 更新内容\n\n**五项优化**\n- 启动瘦身：删除启动时多余的重复渲染\n- 安全加固：记录/计划名等注入面全部转义\n- 系统开启减少动态效果时动画自动降级\n\nMade by XiXi',
    'v1.1.6.4': '## v1.1.6.4 更新内容\n\n**搜索修复**\n- 彻底修复搜索不实时出结果（轮询检测输入内容）\n\nMade by XiXi',
    'v1.1.6.3': '## v1.1.6.3 更新内容\n\n**搜索修复**\n- 修复打开软件后第一次搜索不实时出结果的问题\n\nMade by XiXi',
    'v1.1.6.2': '## v1.1.6.2 更新内容\n\n**计划页搜索优化**\n- 搜索框提示文字按页切换（搜索记录/搜索计划）\n- 切到记录/计划页自动显示搜索框\n- 搜索时显示匹配数量\n\nMade by XiXi',
    'v1.1.6.1': '## v1.1.6.1 更新内容\n\n**优化**\n- 编辑输入框浅色模式加浅色边（与底栏同款）\n- 修复点搜索框时的跳变和页面被抬高\n\nMade by XiXi',
    'v1.1.6.0': '## v1.1.6.0 更新内容\n\n**优化与修复**\n- 修复编辑记录时输入框被键盘盖住（自动滚动到键盘上方）\n- 输入框 placeholder 统一、清理死代码、性能微优化\n\nMade by XiXi',
    'v1.1.5.10': '## v1.1.5.10 更新内容\n\n**搜索修复**\n- 修复中文输入法搜索失效（拼音中间态不再误搜，中文上屏即出结果）\n- 搜索结果列表避让输入法，结果直接可见\n\nMade by XiXi',
    'v1.1.5.9': '## v1.1.5.9 更新内容\n\n**修复**\n- 修复输入法弹出时搜索框被顶出屏幕的问题（物理像素换算）\n\nMade by XiXi',
    'v1.1.5.8': '## v1.1.5.8 更新内容\n\n**输入法优化**\n- 输入法改为覆盖式弹出，软件不再被整体抬高\n- 搜索框跟随键盘精确上移（原生监听键盘高度）\n\nMade by XiXi',
    'v1.1.5.7': '## v1.1.5.7 更新内容\n\n**修复**\n- 修复上个版本导致页面无法操作的严重问题（更新日志换行转义错误）\n\nMade by XiXi',

    'v1.1.5.6': '## v1.1.5.6 更新内容\n\n**优化**\n- 搜索框滑到列表底部不再自动隐藏（移除底部避让逻辑）\n\nMade by XiXi',
    'v1.1.5.5': '## v1.1.5.5 更新内容\n\n**搜索优化**\n- 修复搜索功能报错（变量作用域问题）\n- 搜索框任意方向轻滑即显示，1 秒不碰自动消失\n- 滑到列表底部自动让位（不挡切换页码）\n- 输入法弹出时搜索框跟随键盘上方，关闭自动回位\n\nMade by XiXi',
    'v1.1.5.4': '## v1.1.5.4 更新内容\n\n**新功能**\n- 记录/计划搜索：列表往下滚动时顶部滑出搜索框，按名称实时过滤（找到去年去过的那座山）\n\n**性能**\n- 列表照片缩略图缓存：编辑/翻页秒显不闪烁\n- 统计数字滚动动画防抖：数值没变不再重复播放\n\nMade by XiXi',
    'v1.1.5.3': '## v1.1.5.3 更新内容\n\n**修复**\n- 导出诊断数据功能修复（此前点击报错）\n\n**体验**\n- 错误提示全部中文化：网络/同步/代码错误都显示具体原因（不再英文报错）\n- 离线优化：断网启动跳过自动同步、断网点检查更新直接提示\n- 关于页去掉 Made by XiXi 后的爱心\n\nMade by XiXi',
    'v1.1.5.2': '## v1.1.5.2 更新内容\n\n**优化**\n- 弹窗关闭取消淡出动画，全部直接关闭（与确认弹窗一致，更干脆）\n\nMade by XiXi 💛',
    'v1.1.5.1': '## v1.1.5.1 更新内容\n\n**修复**\n- 导入/导出弹窗按返回键可直接关闭（此前只有确认弹窗/灯箱支持）\n\nMade by XiXi 💛',
    'v1.1.5.0': '## v1.1.5.0 更新内容\n\n**修复**\n- 返回键关弹窗修复（实时检测，弹窗打开时按返回直接关闭）\n- 防误退提示改用 App 玻璃样式（与下载更新提示一致）\n\n**体验**\n- 批量模式切换到其他页面自动退出\n- 关于页新增 GitHub 图标（点击外部浏览器打开源码仓库）\n\nMade by XiXi 💛',
    'v1.1.4.10': '## v1.1.4.10 更新内容\n\n**修复**\n- 返回键防误退改用系统标准通道（OnBackPressedCallback），确保生效\n- 应用图标恢复原图（修复 walk 字样丢失）\n\n**确认生效（v1.1.4.9 起）**\n- 批量删除、性能优化、深色防闪白、导航栏跟随主题、轻震动、滚动丝滑\n- 关于页更新日志（内置）、检查更新简化、下载进度百分比\n\nMade by XiXi 💛',
    'v1.1.4.9': '## v1.1.4.9 更新内容\n\n**批量删除**\n- 记录页 / 计划页新增「批量管理」：勾选多条一键删除（确认弹窗，照片一并清理）\n\n**性能优化**\n- 统计图表防抖：数据没变不再重复重建图表\n- 启动加载并行：启动更快\n- 列表行入场动画只播首次，编辑/刷新不再整页闪\n- 灯箱照片预加载+缓存：翻页秒开\n- 热力图渲染缓存：切 tab 秒进\n- backdrop-filter 瘦身：滚动更流畅\n\n**体验（原生）**\n- 返回键防误退 + 有弹窗先关弹窗\n- 深色模式防闪白（启动屏 + WebView 双层）\n- 导航栏跟随主题、轻震动反馈、滚动丝滑\n\n**应用图标**\n- 自适应图标：圆角/圆形/方形系统自动适配（原 logo 不变）\n\n**其他**\n- 关于页：查看更新日志（内置离线可看）\n- 检查更新简化：直接检查\n- 更新下载进度简洁百分比\n- 网页版离线缓存\n\nMade by XiXi 💛',
    'v1.1.4.8': '## v1.1.4.8 更新内容\n\n**批量删除**\n- 记录页 / 计划页新增「批量管理」：勾选多条一键删除（确认弹窗，照片一并清理）\n\n**性能优化**\n- 统计图表防抖：数据没变不再重复重建图表\n- 启动加载并行：启动更快\n- 列表行入场动画只播首次，编辑/刷新不再整页闪\n- 灯箱照片预加载+缓存：翻页秒开\n- 热力图渲染缓存：切 tab 秒进\n- backdrop-filter 瘦身：滚动更流畅\n\n**网页版**\n- 新增离线缓存（Service Worker）：断网也能打开 App\n\nMade by XiXi 💛',
    'v1.1.4.7': '## v1.1.4.7 更新内容\n\n**更新下载进度修复**\n- 修复下载百分比不显示的问题（镜像不返回文件大小时，显示已下载大小兜底）\n\n**WebDAV 弹窗**\n- 同步状态/进度文字字号调小一档\n\nMade by XiXi 💛',
    'v1.1.4.6': '## v1.1.4.6 更新内容\n\n**底栏**\n- 记录/计划页非第一页时，点击底栏当前 tab 刷新自动回到第一页\n- 浅色模式下底栏可见性微调\n\nMade by XiXi 💛',
    'v1.1.4.5': '## v1.1.4.5 更新内容\n\n**列表分页**\n- 记录/计划列表每页 10 条 + 底部翻页控件\n\n**同步进度**\n- WebDAV 上传/下载阶段进度提示\n\n**更新下载**\n- 更新 APK 下载实时百分比\n\n**其他**\n- 诊断报告增加 WebDAV 状态、最近同步时间\n- 清理调试日志\n- 深浅色切换 0.3s 平滑过渡\n\nMade by XiXi 💛'
};
function showChangelogModal() {
    closeOpenModals(); // ★2026-08-29 防重入
    var modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width:340px;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color:#667eea;">history_edu</span>更新日志 · v' + APP_VERSION + '</div>' +
        '<div class="confirm-modal-message" style="text-align:left;font-size:13px;line-height:1.7;max-height:300px;overflow-y:auto;white-space:pre-wrap;" id="changelogBody">正在加载…</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="changelogClose">关闭</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('changelogClose').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    var el = document.getElementById('changelogBody');
    // ★2026-08-31 纯本地内置（不联网）：有则显示，无则提示
    var localBody = BUILTIN_CHANGELOG['v' + APP_VERSION];
    if (localBody) {
        if (el) el.textContent = localBody;
    } else {
        if (el) el.textContent = '该版本暂无内置更新说明';
    }
}

// ★2026-08-21 v1.1.1.6 错误日志收集（最近 100 条，内存缓存，设置页可导出诊断）
window.__diagLogs = [];
(function () {
    function push(level, args) {
        try {
            var parts = Array.prototype.slice.call(args).map(function (a) {
                if (typeof a === 'string') return a;
                try { return JSON.stringify(a); } catch (e) { return String(a); }
            });
            window.__diagLogs.push(new Date().toLocaleString() + ' [' + level + '] ' + parts.join(' '));
            if (window.__diagLogs.length > 100) window.__diagLogs.shift();
        } catch (e) { /* 日志收集失败不影响业务 */ }
    }
    var oe = console.error, ow = console.warn;
    console.error = function () { push('ERROR', arguments); return oe.apply(console, arguments); };
    console.warn = function () { push('WARN', arguments); return ow.apply(console, arguments); };
    window.addEventListener('error', function (e) {
        push('ERROR', [e && e.message, e && e.filename + ':' + e.lineno]);
    });
    window.addEventListener('unhandledrejection', function (e) {
        push('ERROR', ['unhandledrejection', e && e.reason && e.reason.message]);
    });
})();
// ★2026-08-21 导出诊断信息（版本/数据量/错误日志 → txt）
function exportDiagnostics() {
    var base = '=== XiXiの徒步小记 诊断信息 ===\n'
        + '版本: ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?') + '\n'
        + '导出时间: ' + new Date().toLocaleString() + '\n'
        + '记录数: ' + (typeof records !== 'undefined' ? records.length : '?')
        + ' | 计划数: ' + (typeof plannedTrips !== 'undefined' ? plannedTrips.length : '?') + '\n';
    function save(text) {
        var full = base + '--- 错误日志（最近 ' + (window.__diagLogs || []).length + ' 条）---\n' + ((window.__diagLogs || []).join('\n') || '无');
        try {
            if (window.XixiFileBridge && typeof window.XixiFileBridge.saveBase64 === 'function') {
                // ★2026-08-21 v1.1.1.9 加成功/失败提示（原来静默导出，用户以为没反应）
                var ok = window.XixiFileBridge.saveBase64(utf8ToBase64(full), 'xixi_diagnostics.txt');
                if (ok === true || ok === 'true' || ok === null) showSuccessMessage('诊断信息已导出（下载目录 xixi_diagnostics.txt）');
                else showErrorMessage('导出诊断失败');
            } else {
                var blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                if (isIOSWebview()) {
                    window.open(url, '_blank');
                    showSuccessMessage('诊断已生成，已打开预览（长按/分享可存储）');
                } else {
                    var a = document.createElement('a');
                    a.href = url; a.download = 'xixi_diagnostics.txt';
                    document.body.appendChild(a); a.click();
                    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
                }
                showSuccessMessage('诊断信息已开始下载');
            }
        } catch (e) { showErrorMessage('导出诊断失败'); }
    }
    // ★2026-08-26 诊断增强：WebDAV 配置状态（脱敏主机）+ 最近同步时间 + 照片数（并行收集）
    var syncLine = 'WebDAV: 未配置';
    var syncTimeLine = '';
    try {
        if (syncConfig && syncConfig.server) {
            var srv = syncConfig.server;
            if (!/^https?:\/\//i.test(srv)) srv = 'https://' + srv;
            try { srv = new URL(srv).host; } catch (e) { /* 保留原样 */ }
            syncLine = 'WebDAV: 已配置（' + srv + '）';
        }
    } catch (e) { /* 配置读取失败忽略 */ }
    Promise.all([
        // ★2026-08-27 修复：AppStore.getItem 是同步方法（返回 null 非 Promise），不能直接 .catch —— 包 Promise.resolve
        Promise.resolve().then(function () { try { return AppStore.getItem(SYNC_STATUS_KEY); } catch (e) { return null; } }),
        photoGetUsage().catch(function () { return null; })
    ]).then(function (res) {
        var st = res[0], u = res[1];
        if (st && st.lastSyncAt) syncTimeLine = '最近同步: ' + st.lastSyncAt + (st.type ? '（' + st.type + '）' : '');
        base += syncLine + '\n'
            + (syncTimeLine ? syncTimeLine + '\n' : '')
            + '照片数: ' + (u ? u.count : '?') + (u && u.bytes ? '（占用 ' + Math.ceil(u.bytes / 1024) + ' KB）' : '') + '\n\n';
        save(base);
    }).catch(function () { save(base); });
}

// Polyfill for requestIdleCallback
if (typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = function(callback) {
        const start = Date.now();
        return setTimeout(function() {
            callback({
                didTimeout: false,
                timeRemaining: function() {
                    return Math.max(0, 50 - (Date.now() - start));
                }
            });
        }, 1);
    };
}

// 全局变量
let records = [];
let editingId = null;
// ★2026-08-20 编辑中的照片临时 ID 列表（保存时写回记录，取消时回收孤儿）
let editingPhotoIds = [];
// ★2026-08-20 v1.1.0.3 默认排序：记录时间，从近到远（用户要求"默认以记录时间为主"）
let currentSort = { field: 'createdAt', direction: 'desc' };
let isDarkMode = false;
let isInitialized = false;
let cleanupFunctions = [];
// ★2026-08-26 记录列表分页（每页 10 条）
let recordPage = 1;
let plannedPage = 1; // 计划列表分页（同每页 10 条）
const RECORD_PAGE_SIZE = 10;
let currentPageRecords = [];
let currentPagePlannedTrips = [];
// ★2026-08-27 记录/计划搜索（方案A：滚动显示搜索框，按名称实时过滤）
let searchQuery = '';
// ★2026-08-27 当前激活 tab（全局提升：搜索过滤/搜索框显示需要；原声明在 init 内部导致 ReferenceError）
var currentTabId = 'overview';
// ★2026-08-27 列表行入场动画只播首次（刷新/编辑/翻页不再整页重播动画，消灭闪烁感）
let recordsRowsAnimated = false;
let plannedRowsAnimated = false;
// ★2026-08-27 记录批量删除状态
let batchMode = false;
const batchSelected = new Set();
// ★2026-08-27 计划批量删除状态（与记录页一致）
let plannedBatchMode = false;
const plannedBatchSelected = new Set();
// ===== WebDAV 数据同步 =====
const SYNC_CONFIG_KEY = 'hiking_sync_config';

// ★2026-08-25 密码混淆（防明文躺本地存储；简单异或+base64，非强加密但比明文强）
function encPwd(str) {
    if (!str) return '';
    var key = 'xixi';
    var out = '';
    for (var i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return 'xk1:' + btoa(unescape(encodeURIComponent(out)));
}
function decPwd(str) {
    if (!str) return '';
    if (str.indexOf('xk1:') === 0) {
        try {
            var raw = decodeURIComponent(escape(atob(str.slice(4))));
            var key = 'xixi', out = '';
            for (var i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            return out;
        } catch (e) { return ''; }
    }
    return str;   // 老明文兼容
}
const SYNC_AUTO_KEY = 'hiking_sync_auto';
const SYNC_STATUS_KEY = 'hiking_sync_status';
const SYNC_FILES_KEY = 'hiking_sync_files'; // 本地维护的备份文件索引
const SYNC_FILE_PREFIX = 'xixi_hiking_backup_'; // 备份文件名前缀（后面带时间戳，每次备份独立文件）
const SYNC_FILE_EXT = '.zip'; // ★2026-08-25 备份改 zip 压缩包（照片二进制；老 .html 备份仍可下载导入）
const SYNC_MAX_FILES = 20; // 本地索引最多保留 20 条
let syncConfig = { server: '', username: '', password: '' };
let syncAuto = false;
let syncInProgress = false;

// 液态玻璃光粒子生成器
// FPS 监控相关变量
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsRAF = null;

// 页面卸载时清理资源
function cleanupResources() {
    try {
        // 停止FPS监控
        stopFPSMonitor();
        
        if (window.currentEventListeners) {
            window.currentEventListeners.forEach(({ element, event, handler }) => {
                if (element && element.removeEventListener) {
                    element.removeEventListener(event, handler);
                }
            });
            window.currentEventListeners = [];
        }
        
        cleanupFunctions.forEach(fn => {
            try { fn(); } catch (e) { console.warn('Cleanup function error:', e); }
        });
        cleanupFunctions = [];
        
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

function cleanupEventListeners() {
    if (window.currentEventListeners) {
        window.currentEventListeners.forEach(({ element, event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        window.currentEventListeners = [];
    }
}

// 页面卸载时执行清理
window.addEventListener('beforeunload', cleanupResources);
window.addEventListener('pagehide', cleanupResources);

// ★2026-08-21 v1.1.1.9 全局错误降噪：错误全量进 __diagLogs，toast 限频（30 秒最多 1 次），
// 避免任何小异常（单张图片加载失败/单次网络超时）都弹「刷新页面」轰炸用户
var _lastGlobalErrToast = 0;
function notifyGlobalError(msg) {
    try {
        var now = Date.now();
        if (now - _lastGlobalErrToast > 30000) {
            _lastGlobalErrToast = now;
            showErrorMessage(msg);
        }
    } catch (e) { /* 提示失败静默 */ }
}

// ★2026-08-27 提取简短可读的错误原因（用户要求：别只弹「应用发生错误」，要让用户知道发生了什么）
// ★2026-08-27 JS 运行时错误中文化：常见模式映射中文，避免用户看到英文报错
function jsErrorToChinese(msg) {
    var s = String(msg || '');
    var m;
    m = s.match(/cannot read propert\w* of (null|undefined)\s*\(reading '([^']+)'\)/i);
    if (m) return '读取' + (m[1] === 'null' ? '空数据' : '未定义数据') + '（' + m[2] + '）出错，请刷新重试';
    m = s.match(/cannot read propert\w* '([^']+)' of (null|undefined)/i);
    if (m) return '读取' + (m[2] === 'null' ? '空数据' : '未定义数据') + '（' + m[1] + '）出错，请刷新重试';
    m = s.match(/cannot set propert\w* of (null|undefined)/i);
    if (m) return '写入' + (m[1] === 'null' ? '空数据' : '未定义数据') + '出错，请刷新重试';
    m = s.match(/(\w+) is not a function/i);
    if (m) return m[1] + ' 调用方式有误（不是可用方法），请刷新重试';
    if (/cannot destructure/i.test(s)) return '数据解构失败，请刷新重试';
    m = s.match(/(\w+) is not defined/i);
    if (m) return m[1] + ' 未定义，请刷新重试';
    m = s.match(/(\w+) is undefined/i);
    if (m) return m[1] + ' 未定义，请刷新重试';
    m = s.match(/(null|undefined) is not an object/i);
    if (m) return (m[1] === 'null' ? '数据为空' : '数据未定义') + '导致错误，请刷新重试';
    if (/invalid date/i.test(s)) return '日期格式无效，请检查输入';
    if (/unexpected token/i.test(s)) return '脚本语法错误，请刷新重试';
    if (/maximum call stack/i.test(s)) return '程序运行过深，请刷新重试';
    if (/out of memory/i.test(s)) return '内存不足，请关闭其他应用后重试';
    if (/is not iterable/i.test(s)) return '数据类型错误（不可遍历），请刷新重试';
    if (/not a valid/i.test(s)) return '数据格式无效，请检查输入';
    return '';
}

function extractErrMsg(err) {
    try {
        if (!err) return '未知错误';
        var msg = (err && err.message) ? err.message : String(err);
        msg = String(msg).replace(/\s+/g, ' ').trim();
        if (!msg) return '未知错误';
        var low = msg.toLowerCase();
        // 网络类错误（fetch/网络/超时/域名/连接/SSL）走友好中文化翻译
        if (low.indexOf('failed to fetch') >= 0 || low.indexOf('network') >= 0
            || low.indexOf('timeout') >= 0 || low.indexOf('timed out') >= 0
            || low.indexOf('host') >= 0 || low.indexOf('connect') >= 0
            || low.indexOf('ssl') >= 0 || low.indexOf('net::') >= 0
            || low.indexOf('enotfound') >= 0 || low.indexOf('econnrefused') >= 0
            || low.indexOf('unreachable') >= 0) {
            return friendlySyncError(msg);
        }
        // 其他 JS 运行时错误：优先翻译成中文，翻译不了再截断直显
        var zh = jsErrorToChinese(msg);
        if (zh) return zh;
        if (msg.length > 46) msg = msg.slice(0, 46) + '…';
        return msg;
    } catch (e) { return '未知错误'; }
}

// 全局错误处理
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    // 显示具体错误原因（用户要求：简短写出来让人知道发生了什么）
    notifyGlobalError('出错了：' + extractErrMsg(event.error));
    return false;
});

// 未处理的Promise错误处理
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    // 显示具体错误原因（网络类会被翻译成中文）
    notifyGlobalError('出错了：' + extractErrMsg(event.reason));
    event.preventDefault();
});

// FPS 监控函数（优化版：降低采样开销）
function updateFPS() {
    fpsFrameCount++;
    const currentTime = performance.now();
    const elapsed = currentTime - fpsLastTime;
    
    // 每1秒更新一次FPS显示（v1.4.10.2 修复计时漂移；2026-08-10 改1s更灵敏）
    if (elapsed >= 1000) {
        const fps = Math.round((fpsFrameCount * 1000) / elapsed);
        const fpsValueElement = document.getElementById('fpsValue');
        if (fpsValueElement && fpsValueElement.textContent !== String(fps)) {
            fpsValueElement.textContent = fps;
            
            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) {
                let bgColor = 'rgba(34, 197, 94, 0.35)';
                if (fps < 55) bgColor = fps >= 30 ? 'rgba(251, 146, 60, 0.35)' : 'rgba(239, 68, 68, 0.35)';
                if (fpsDisplay.style.backgroundColor !== bgColor) {
                    fpsDisplay.style.backgroundColor = bgColor;
                }
            }
        }
        
        // ★重置放在条件外（关键修复）：无论值是否变化都要重置计时，否则 elapsed 不断累积 → FPS 越算越假
        fpsFrameCount = 0;
        fpsLastTime = currentTime;
    }
    
    fpsRAF = requestAnimationFrame(updateFPS);
}

// 启动FPS监控
function startFPSMonitor() {
    if (fpsRAF) {
        cancelAnimationFrame(fpsRAF);
    }
    fpsFrameCount = 0;
    fpsLastTime = performance.now();
    fpsRAF = requestAnimationFrame(updateFPS);
}

// 停止FPS监控
function stopFPSMonitor() {
    if (fpsRAF) {
        cancelAnimationFrame(fpsRAF);
        fpsRAF = null;
    }
}

// 应用帧率显示偏好（开关状态 → 顶栏显示 + 监控启停）
function applyFpsPreference() {
    const fpsDisplay = document.getElementById('fpsDisplay');
    if (fpsDisplay) {
        fpsDisplay.style.display = showFps ? 'flex' : 'none';
    }
    const fpsToggle = document.getElementById('fpsToggle');
    if (fpsToggle) {
        fpsToggle.checked = showFps;
    }
    if (showFps) {
        startFPSMonitor();
    } else {
        stopFPSMonitor();
    }
}

const STORAGE_KEY = 'hiking_records';
// ★当前应用版本（2026-08-11：应用内检查更新用；bump 版本时必须同步）
var APP_VERSION = '1.1.7.10';
// ★2026-08-25 分享卡背景外置 share-bg.jpg（原 base64 内置 276KB → 移除，HTML 瘦身）
// ★2026-08-21 去灵光化：本地存储封装（替代原灵光平台 window.lingguang.storage，功能等价）
var AppStore = {
    setItem: function (key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('[Store] setItem failed:', key, e && e.message); }
    },
    getItem: function (key) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { console.warn('[Store] getItem failed:', key, e && e.message); return null; }
    },
    removeItem: function (key) {
        try { localStorage.removeItem(key); } catch (e) { console.warn('[Store] removeItem failed:', key, e && e.message); }
    }
};
// 更新下载镜像源（国内加速；原生下载失败自动兜底官方直链，改这里一处即可换源）
var UPDATE_MIRROR_PREFIX = 'https://ghfast.top/';
const PLANNED_TRIPS_KEY = 'planned_trips';
const SHOW_FPS_KEY = 'hiking_show_fps';
let showFps = true;
const HAPTIC_KEY = 'hiking_haptic'; // ★2026-08-21 v1.1.1.1 震动反馈开关
let hapticEnabled = true; // 默认开（用户指定）
// ★主题三态（v1.4.10.2）：'auto' 跟随系统 / 'light' 白天 / 'dark' 夜间
// 旧版只有 isDarkMode 布尔（兼容读取）；新版统一存 themeMode
const DARK_MODE_KEY = 'hiking_dark_mode';   // 兼容旧数据（布尔）
const THEME_MODE_KEY = 'hiking_theme_mode'; // 新数据（'auto'|'light'|'dark'）
let themeMode = 'auto';
const APP_TITLE_KEY = 'hiking_app_title';
const STATS_TITLE_KEY = 'hiking_stats_title';
const RECORDS_TITLE_KEY = 'hiking_records_title';
const PLANNED_TITLE_KEY = 'hiking_planned_title';
const SETTINGS_TITLE_KEY = 'hiking_settings_title';
const HEATMAP_TITLE_KEY = 'hiking_heatmap_title';

// 计划徒步行相关变量
let plannedTrips = [];
let plannedEditingId = null;
let plannedCurrentSort = { field: null, direction: 'asc' };

// DOM操作辅助函数（性能优化：去除try-catch，getElementById在浏览器永不抛异常）
function safeGetElementById(id) {
    return document.getElementById(id);
}

function safeSetElementContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.replaceChildren();
        element.insertAdjacentHTML('beforeend', content);
        return true;
    }
    return false;
}

function safeSetElementStyle(elementId, styleProperty, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style[styleProperty] = value;
        return true;
    }
    return false;
}

// 测试搜索功能

// ★2026-08-21 v1.1.1.6 分享卡生成：canvas 绘制 → 保存 PNG（App 原生桥 / 网页下载）
// ★2026-08-21 v1.1.1.7 分享卡生成（动漫清新风，无照片）：天空渐变 + 云朵太阳小山装饰
async function generateShareCard(record) {
    if (!record) return;
    try { showLoadingToast('正在生成分享卡…'); } catch (e) { /* 无 loading 也不影响 */ }
    var W = 1080, H = 1440;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var FONT_ART = '"KaiTi","STKaiti","楷体","SimSun",serif';
    // ★2026-08-24 v1.1.2.11 分段绘制：标题加粗（海拔/心情/天气/同行等），内容普通，整行居中
    function drawShareRow(ctx, cx, y, size, pairs) {
        var prevAlign = ctx.textAlign;
        ctx.textAlign = 'left';   // ★修复：必须左对齐逐段推进（继承 center 会导致每段以 x 为中心绘制 → 重叠）
        var segs = [];
        for (var i = 0; i < pairs.length; i++) {
            if (i > 0) segs.push({ t: '    ', b: false, gap: 2 });
            segs.push({ t: pairs[i].label, b: true, gap: 4 });   // 标题后加缓冲防合成粗体测量误差
            segs.push({ t: pairs[i].value, b: false, gap: 0 });
        }
        var widths = segs.map(function (sg) {
            ctx.font = (sg.b ? 'bold ' : '') + size + 'px ' + FONT_ART;
            return ctx.measureText(sg.t).width;
        });
        var totalW = 0;
        widths.forEach(function (w, i) { totalW += w + (segs[i].gap || 0); });
        var x = cx - totalW / 2;
        segs.forEach(function (sg, i) {
            ctx.font = (sg.b ? 'bold ' : '') + size + 'px ' + FONT_ART;
            ctx.fillText(sg.t, x, y);
            x += widths[i] + (sg.gap || 0);
        });
        ctx.textAlign = prevAlign;
    }
    var FONT_UI = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
    // 心情/天气表情 → 文字映射（老数据为文字时原样显示）
    var MOOD_TXT = { '😄': '开心', '😌': '平静', '🤩': '兴奋', '😮‍💨': '疲惫' };
    var WEATHER_TXT = { '☀️': '晴', '🌤️': '多云', '☁️': '阴', '🌧️': '雨', '❄️': '雪' };
    function moodText(m) { return MOOD_TXT[m] || (m || ''); }
    function weatherText(m) { return WEATHER_TXT[m] || (m || ''); }
    // 背景庆祝图
    var img = await new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { resolve(null); };
        im.src = "share-bg.jpg";   // ★2026-08-25 外部资源（HTML 瘦身 276KB）
    });
    if (img) ctx.drawImage(img, 0, 0, W, H);
    else { ctx.fillStyle = '#8fa3d8'; ctx.fillRect(0, 0, W, H); }
    // 白色遮罩：38% 高度起线性渐变到 100%（越往下越白，无分界）
    var startY = Math.floor(H * 0.38);
    for (var my = startY; my < H; my++) {
        var t = (my - startY) / (H - startY);
        ctx.fillStyle = 'rgba(255,255,255,' + (t).toFixed(3) + ')';
        ctx.fillRect(0, my, W, 1);
    }
    ctx.textBaseline = 'middle';
    // 标题（左上角，白色）
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.font = '38px ' + FONT_UI;
    var appTitleEl = document.getElementById('appTitle');
    var appTitle = (appTitleEl && appTitleEl.textContent && appTitleEl.textContent.trim()) || 'XiXiの徒步小记';
    ctx.fillText(appTitle, 64, 72);
    ctx.shadowBlur = 0;
    // 数据区（v1.1.2.2 整体下沉：从底部品牌反向布局，最后一行与 Made by XiXi 间隔一个字）
    ctx.textAlign = 'center';
    var date = new Date(record.createdAt);
    var dateStr = date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日';
    var name = record.name || '未命名';
    var nameSize = name.length <= 4 ? 104 : (name.length <= 6 ? 88 : 72);
    var meta = [];
    if (record.mood) meta.push({ label: '心情 ', value: moodText(record.mood) });
    if (record.weather) meta.push({ label: '天气 ', value: weatherText(record.weather) });
    if (record.companions) meta.push({ label: '同行 ', value: record.companions });
    // 从底部向上排：品牌 y 固定，最后一行数据在其上方留三字间距（v1.1.2.3 40px→120px）
    var brandY = H - 70;
    var gap = 120;
    var yEnd = brandY - gap;                                  // 最后一行 baseline
    var row1Y, lineY, nameY, dateY;
    if (meta.length) {
        row1Y = yEnd - 72;                                    // meta 行上方 = 海拔/里程/用时行
        lineY = row1Y - 78;                                   // 分隔线
    } else {
        row1Y = yEnd;
        lineY = row1Y - 78;
    }
    nameY = lineY - 70;                                       // 山名
    dateY = nameY - Math.round(nameSize * 1.15);              // 日期
    // 兜底：若内容过多导致日期溢出顶部（< 遮罩区），整体上移保护（正常数据不会触发）
    if (dateY < Math.floor(H * 0.4)) { dateY = Math.floor(H * 0.4); nameY = dateY + Math.round(nameSize * 1.15); lineY = nameY + 70; row1Y = lineY + 78; yEnd = row1Y + (meta.length ? 72 : 0); }
    // 日期
    ctx.fillStyle = 'rgba(62,72,118,0.95)';
    ctx.font = '44px ' + FONT_ART;
    ctx.fillText(dateStr, W / 2, dateY);
    // 山名（自适应字号，单次 fillText 防错位）
    ctx.font = nameSize + 'px ' + FONT_ART;
    ctx.fillStyle = 'rgba(40,48,82,1)';
    ctx.fillText(name, W / 2, nameY);
    // 分隔线
    ctx.strokeStyle = 'rgba(84,104,186,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - 200, lineY); ctx.lineTo(W / 2 - 36, lineY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 36, lineY); ctx.lineTo(W / 2 + 200, lineY); ctx.stroke();
    ctx.fillStyle = 'rgba(84,104,186,0.9)';
    ctx.beginPath(); ctx.moveTo(W / 2, lineY - 9); ctx.lineTo(W / 2 + 9, lineY); ctx.lineTo(W / 2, lineY + 9); ctx.lineTo(W / 2 - 9, lineY); ctx.fill();
    // 数据行1：海拔 + 里程用时（★2026-08-25 去掉难度，用户要求分享卡不显示难度；有值才加；项多时字号 42 防溢出，项少时放大）
    ctx.fillStyle = 'rgba(40,48,82,1)';
    var row1Pairs = [
        { label: '海拔 ', value: (record.elevation || 0) + ' m' }
    ];
    if (record.distance) row1Pairs.push({ label: '里程 ', value: (Number(record.distance) || 0).toFixed(2) + ' km' }); // ★2026-09-01 里程两位小数
    if (record.duration) row1Pairs.push({ label: '用时 ', value: formatDuration(record.duration) });
    // ★2026-08-25 自适应：仅海拔一条 64px，2 条 50px，3+ 条 42px
    var row1Size = row1Pairs.length >= 4 ? 42 : (row1Pairs.length === 1 ? 64 : 50);
    drawShareRow(ctx, W / 2, row1Y, row1Size, row1Pairs);
    // 数据行2：心情/天气/同行（标题加粗，无值整行跳过，自动上移）
    if (meta.length) {
        drawShareRow(ctx, W / 2, yEnd, 44, meta);
    }
    // 底部品牌
    ctx.fillStyle = 'rgba(62,72,118,0.9)';
    ctx.font = '34px ' + FONT_UI;
    ctx.fillText('Made by XiXi', W / 2, brandY);
    // 输出
    var dataUrl = canvas.toDataURL('image/png');
    var fileName = 'XiXi分享-' + (record.name || '徒步') + '-' + date.getFullYear() + (date.getMonth() + 1) + date.getDate() + '.png';
    try { hideLoadingToast(); } catch (e) { /* 忽略 */ }
    try {
        if (window.XixiFileBridge && typeof window.XixiFileBridge.saveBase64 === 'function') {
            var ok = window.XixiFileBridge.saveBase64(dataUrl.split(',')[1] || '', fileName);
            if (ok === true || ok === 'true' || ok === null) showSuccessMessage('分享卡已保存');
            else showErrorMessage('分享卡保存失败');
        } else {
            // ★2026-08-25 iOS 网页端修复：Safari 不支持 a.download + dataURL（点击无反应）→ 系统分享面板 / 新窗口降级
            shareCardImage(dataUrl, fileName);
        }
    } catch (e) {
        showErrorMessage('分享卡生成失败');
    }
}
// ★2026-08-25 iOS 网页端检测（Safari/PWA：a.download 无效需降级）
function isIOSWebview() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) && !window.MSStream;
}
// ★2026-08-25 iOS 网页端分享卡导出（降级链：系统分享 → a.download → 新窗口长按保存）
function shareCardImage(dataUrl, fileName) {
    // 1. 系统分享面板（iOS/Android 移动端最优：可存相册/发微信）
    if (navigator.share && typeof navigator.canShare === 'function') {
        try {
            var bin = atob(dataUrl.split(',')[1] || '');
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            var file = new File([new Blob([arr], { type: 'image/png' })], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: fileName })
                    .then(function () { showSuccessMessage('分享卡已生成'); })
                    .catch(function () { /* 用户取消，忽略 */ });
                return;
            }
        } catch (e) { /* File 构造不支持（旧 iOS）→ 继续降级 */ }
    }
    // 2. 标准下载（Android Chrome / 桌面正常）
    try {
        var a = document.createElement('a');
        a.href = dataUrl; a.download = fileName;
        document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); }, 500);
        showSuccessMessage('分享卡已开始下载');
    } catch (e) {
        // 3. iOS 兜底：新窗口打开图片，长按保存
        window.open(dataUrl, '_blank');
        showSuccessMessage('图片已打开，长按可保存');
    }
}
// 圆角矩形辅助
// ★2026-08-27 五项优化：roundRect 死代码已删（分享卡重构后零调用）

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ===== ★2026-08-20 v1.1.0.3 照片存储层（IndexedDB 大仓库：记录存 localStorage，照片二进制存这里）=====
var photoDB = {
    db: null,
    ready: false,
    failed: false,
    dbName: 'xixi_photos',
    store: 'photos'
};
function photoDBOpen() {
    return new Promise(function (resolve, reject) {
        if (photoDB.failed) { reject(new Error('idb-failed')); return; }
        if (photoDB.db) { resolve(photoDB.db); return; }
        try {
            if (!window.indexedDB) { photoDB.failed = true; reject(new Error('no-idb')); return; }
            var req = indexedDB.open(photoDB.dbName, 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(photoDB.store)) {
                    db.createObjectStore(photoDB.store, { keyPath: 'id' });
                }
            };
            req.onsuccess = function (e) {
                photoDB.db = e.target.result;
                photoDB.ready = true;
                resolve(photoDB.db);
            };
            req.onerror = function () { photoDB.failed = true; reject(new Error('idb-open-error')); };
        } catch (e) { photoDB.failed = true; reject(e); }
    });
}
function photoDBTx(mode, fn) {
    return photoDBOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(photoDB.store, mode);
            var store = tx.objectStore(photoDB.store);
            var r = fn(store);
            tx.oncomplete = function () { resolve(r && r.result !== undefined ? r.result : r); };
            tx.onerror = function () { reject(tx.error || new Error('tx-error')); };
            tx.onabort = function () { reject(new Error('tx-abort')); };
        });
    });
}
function photoPut(id, blob, w, h) {
    return photoDBTx('readwrite', function (store) {
        return store.put({ id: id, blob: blob, w: w || 0, h: h || 0, created: Date.now() });
    });
}
function photoGet(id) {
    return photoDBTx('readonly', function (store) { return store.get(id); });
}
function photoDelete(id) {
    return photoDBTx('readwrite', function (store) { return store.delete(id); });
}
function photoGetAll() {
    return photoDBTx('readonly', function (store) { return store.getAll(); });
}
function photoDeleteMany(ids) {
    return photoDBTx('readwrite', function (store) {
        ids.forEach(function (id) { store.delete(id); });
    });
}
// 孤儿回收：删除不属于任何记录的照片（防"删记录但照片残留"）
function photoCollectOrphans() {
    var used = {};
    (records || []).forEach(function (r) {
        (r.photos || []).forEach(function (p) { used[p] = true; });
    });
    return photoGetAll().then(function (all) {
        var orphans = (all || []).filter(function (p) { return !used[p.id]; });
        if (orphans.length) {
            return photoDeleteMany(orphans.map(function (p) { return p.id; }));
        }
    }).catch(function () {});
}
// 容量统计：返回 { count, bytes }
function photoGetUsage() {
    return photoGetAll().then(function (all) {
        var total = (all || []).reduce(function (s, p) { return s + (p.blob ? p.blob.size : 0); }, 0);
        return { count: (all || []).length, bytes: total };
    }).catch(function () { return { count: 0, bytes: 0 }; });
}
// 照片功能是否可用（IndexedDB 打开失败 → 隐藏照片功能，不影响记录）
function photosEnabled() {
    return !photoDB.failed;
}
// ★2026-08-21 v1.1.1.5 照片占用统计（设置页显示）
function refreshPhotoUsage() {
    var el = document.getElementById('photoUsageDesc');
    if (!el) return;
    photoGetUsage().then(function (u) {
        if (!u || !u.count) { el.textContent = '暂无照片'; return; }
        var txt = '照片 ' + u.count + ' 张 · ' + (u.bytes >= 1048576 ? (u.bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(u.bytes / 1024) + ' KB');
        el.textContent = txt;
    }).catch(function () { el.textContent = '统计失败'; });
}

// ===== ★2026-08-20 取图 + 压缩管线（相机/相册 → canvas 压缩 1280px/JPEG0.7）=====
var photoInputEl = null;
function ensurePhotoInput(capture) {
    if (!photoInputEl) {
        photoInputEl = document.createElement('input');
        photoInputEl.type = 'file';
        photoInputEl.accept = 'image/*';
        photoInputEl.style.display = 'none';
        document.body.appendChild(photoInputEl);
    }
    if (capture) photoInputEl.setAttribute('capture', 'environment');
    else photoInputEl.removeAttribute('capture');
    return photoInputEl;
}
// 打开相机(capture=true)或相册(false)，resolve 压缩后 {blob,w,h,name}（单选）
function pickPhoto(capture) {
    return new Promise(function (resolve, reject) {
        var input = ensurePhotoInput(capture);
        input.multiple = false;   // ★2026-08-25 单选（与多选 pickPhotos 区分，防残留）
        input.value = '';
        input.onchange = function () {
            var file = input.files && input.files[0];
            if (!file) { reject(new Error('no-file')); return; }
            compressImage(file).then(resolve, reject);
        };
        input.oncancel = function () { reject(new Error('cancel')); };
        try { input.click(); } catch (e) { reject(e); }
    });
}
// ★2026-08-25 多选照片（相册）：input 加 multiple，resolve 压缩后数组 [{blob,w,h,name}]
function pickPhotos(capture) {
    return new Promise(function (resolve, reject) {
        var input = ensurePhotoInput(capture);
        input.multiple = true;
        input.value = '';
        input.onchange = function () {
            var files = input.files ? Array.prototype.slice.call(input.files) : [];
            if (!files.length) { reject(new Error('no-file')); return; }
            Promise.all(files.map(function (f) { return compressImage(f); })).then(resolve, reject);
        };
        input.oncancel = function () { reject(new Error('cancel')); };
        try { input.click(); } catch (e) { reject(e); }
    });
}
function compressImage(file, maxSide) {
    maxSide = maxSide || 1280;
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // 透明背景转白
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(function (blob) {
                    if (!blob) { reject(new Error('compress-fail')); return; }
                    resolve({ blob: blob, w: w, h: h, name: file.name || ('photo-' + Date.now() + '.jpg') });
                }, 'image/jpeg', 0.7);
            };
            img.onerror = function () { reject(new Error('image-load-fail')); };
            img.src = e.target.result;
        };
        reader.onerror = function () { reject(new Error('read-fail')); };
        reader.readAsDataURL(file);
    });
}
function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}
function dataURLToBlob(dataURL) {
    var parts = dataURL.split(',');
    var mime = (parts[0].match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

// 错误消息显示函数（★2026-08-25 支持 duration 参数：默认 1000ms，计划提醒用 3000ms）
function showErrorMessage(message, duration) {
    // 移除已存在的错误消息
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    // 内联定位（left 50% + transform translateX(-50%)），避免 Tailwind translate 属性与动画 transform 叠加导致二次偏移
    errorDiv.className = 'error-message toast-pop toast-glass error fixed z-[300] max-w-[90vw] text-sm px-5 py-3';
    errorDiv.style.left = '50%';
    errorDiv.style.bottom = '140px';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-icons">error</span>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // 自动淡出移除错误消息
    setTimeout(() => {
        if (document.body.contains(errorDiv)) {
            errorDiv.classList.add('toast-fade-out');
            setTimeout(() => {
                if (errorDiv.parentNode) errorDiv.remove();
            }, 300);
        }
    }, duration || 1000);
    
    // 点击关闭
    errorDiv.addEventListener('click', () => {
        errorDiv.classList.add('toast-fade-out');
        setTimeout(() => {
            if (errorDiv.parentNode) errorDiv.remove();
        }, 300);
    });
}

// 成功消息显示函数（★2026-08-25 支持 duration 参数：默认 1000ms，计划提醒用 3000ms）
function showSuccessMessage(message, duration) {
    // 移除已存在的成功消息
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    
    const successDiv = document.createElement('div');
    // 内联定位（left 50% + transform translateX(-50%)），避免 Tailwind translate 属性与动画 transform 叠加导致二次偏移
    successDiv.className = 'success-message toast-pop toast-glass success fixed z-[300] max-w-[90vw] text-sm px-5 py-3';
    successDiv.style.left = '50%';
    successDiv.style.bottom = '140px';
    successDiv.style.transform = 'translateX(-50%)';
    successDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-icons">check_circle</span>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(successDiv);
    
    // 自动淡出移除成功消息
    setTimeout(() => {
        if (document.body.contains(successDiv)) {
            successDiv.classList.add('toast-fade-out');
            setTimeout(() => {
                if (successDiv.parentNode) successDiv.remove();
            }, 300);
        }
    }, duration || 1000);
    
    // 点击关闭
    successDiv.addEventListener('click', () => {
        successDiv.classList.add('toast-fade-out');
        setTimeout(() => {
            if (successDiv.parentNode) successDiv.remove();
        }, 300);
    });
}

// ★2026-08-30 系统通知（计划提醒等）：App 原生环境走通知栏（小米灵动岛由系统自动适配），网页版降级 toast
// JS 桥：window.XixiFileBridge.showNotification(title, body, navigate) → boolean
// navigate：点通知本体回 App 的跳转目标（'plans' 计划页 / 'settings' 设置页），缺省 'plans'
// ★2026-08-30 五项优化：桥发送失败（如通知权限被拒）→ 降级 App 内 toast，提醒不丢失
// ★2026-08-30 通知交互：点通知本体 → 回 App 跳计划页（原生 navigate=plans → JS consumeNotifyAction）
// ★2026-09-01 通知分级：备份提醒/自动同步/更新下载等后台事件也走通知栏，navigate 按场景传
function showSystemNotification(title, body, navigate) {
    try {
        if (window.XixiFileBridge && typeof window.XixiFileBridge.showNotification === 'function') {
            var sent = window.XixiFileBridge.showNotification(title, body, navigate || 'plans');
            if (sent) return true;
        }
    } catch (e) { /* 桥异常降级 */ }
    showSuccessMessage((title || '') + (body ? '：' + body : ''), 2500);
    return false;
}

// ===== 主题三态逻辑（v1.4.10.2）：auto 跟随系统 / light / dark =====

// 当前是否应启用深色模式（根据 themeMode + 系统偏好）
function isDarkModeActive() {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    // auto：跟随系统
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 应用主题（同步开关状态 + body class + 图标）
function applyThemeMode() {
    const dark = isDarkModeActive();
    isDarkMode = dark;
    document.body.classList.toggle('dark-mode', dark);
    // 状态栏图标颜色跟随主题：浅色→深色图标（白底时间可见），深色→白色图标
    try {
        if (window.XixiFileBridge && typeof XixiFileBridge.setStatusBarStyle === 'function') {
            XixiFileBridge.setStatusBarStyle(dark);
        }
    } catch (e) { console.warn('setStatusBarStyle failed:', e); }
    // 同步设置页开关状态（不触发展开动画）
    const followToggle = document.getElementById('themeFollowToggle');
    if (followToggle) followToggle.checked = themeMode === 'auto';
    const darkToggle = document.getElementById('themeDarkToggle');
    if (darkToggle) darkToggle.checked = themeMode === 'dark';
    // v1.4.10.10 修复"切换后自动刷新闪一下"：不再调 updateStatistics()
    // 原因：updateStatistics 重建难度柱状图 DOM（柱子重新生长动画）→ 视觉像页面刷新+闪动；
    // 图表颜色是内联 getDifficultyColor() 生成、与主题无关（darkModeGradients 与亮色一致），切主题无需重绘
    // ★2026-08-31 计划日历例外：inline 颜色随主题生成（蓝点/选中态/明细条），切主题需重绘刷新
    try {
        if (typeof plansViewMode !== 'undefined' && plansViewMode === 'calendar' && typeof renderPlannedCalendar === 'function') {
            renderPlannedCalendar();
        }
    } catch (e) { /* 日历重绘失败忽略 */ }
}

// 设置主题模式并保存（follow: 是否跟随系统）
function setThemeMode(mode) {
    if (mode !== 'auto' && mode !== 'light' && mode !== 'dark') mode = 'auto';
    themeMode = mode;
    document.body.classList.add('theme-transitioning');
    applyThemeMode();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('theme-transitioning');
            }, 400);
        });
    });
    saveThemeMode();
}

function saveThemeMode() {
    try {
        AppStore.setItem(THEME_MODE_KEY, { mode: themeMode });
        AppStore.setItem(DARK_MODE_KEY, { isDarkMode: isDarkMode }); // 兼容旧读取
    } catch (error) {
        console.error('保存主题模式失败:', error);
    }
}

// 系统深色模式变化监听（跟随系统模式时自动切换）
function initSystemThemeListener() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function () {
        if (themeMode === 'auto') {
            // 跟随系统变化：加 theme-transitioning 保护（禁用 backdrop-filter，避免白块闪现）
            document.body.classList.add('theme-transitioning');
            applyThemeMode();
            setTimeout(function () {
                document.body.classList.remove('theme-transitioning');
            }, 500);
        }
    };
    if (mq.addEventListener) {
        mq.addEventListener('change', handler);
    } else if (mq.addListener) {
        mq.addListener(handler); // 旧 WebView 兼容
    }
}

// 区块标题保存函数
async function saveStatsTitleToStorage(title) {
    try {
        await AppStore.setItem(STATS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存统计概览标题失败:', error);
    }
}

async function saveRecordsTitleToStorage(title) {
    try {
        await AppStore.setItem(RECORDS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存徒步记录标题失败:', error);
    }
}

async function savePlannedTitleToStorage(title) {
    try {
        await AppStore.setItem(PLANNED_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存计划徒步行标题失败:', error);
    }
}

async function saveSettingsTitleToStorage(title) {
    try {
        await AppStore.setItem(SETTINGS_TITLE_KEY, { title });
    } catch (error) {
        console.error('保存设置页标题失败:', error);
    }
}

// 徒步足迹标题保存（v1.0.7.10）
async function saveHeatmapTitleToStorage(title) {
    try {
        await AppStore.setItem(HEATMAP_TITLE_KEY, { title });
        showSuccessMessage('标题已更新');
    } catch (e) {
        console.error('保存热力图标题失败:', e);
        showErrorMessage('保存失败，请重试');
    }
}

// v1.0.7.11 下拉框宽度自适应文字（canvas 精确测量最长选项 + 箭头/padding 余量）
function fitSelectWidth(sel) {
    if (!sel) return;
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        const cs = getComputedStyle(sel);
        ctx.font = (cs.fontWeight || '400') + ' ' + (cs.fontSize || '13px') + ' ' + (cs.fontFamily || 'sans-serif');
        let maxW = 0;
        Array.from(sel.options).forEach(function (opt) {
            const w = ctx.measureText(opt.textContent || '').width;
            if (w > maxW) maxW = w;
        });
        // v1.0.8.2 修复：box-sizing:border-box 下 44px 余量被 padding 吃掉 → 按 padding+箭头动态算
        const pl = parseFloat(cs.paddingLeft) || 12;
        const pr = parseFloat(cs.paddingRight) || 14;
        const arrow = 22;
        let extra = arrow;
        if (cs.boxSizing === 'border-box') extra += pl + pr;
        sel.style.width = Math.ceil(maxW) + extra + 'px';
    } catch (e) { console.warn('fitSelectWidth failed:', e); }
}

function fitEditSelects() {
    document.querySelectorAll('select[id^="edit-difficulty-"], select[id^="edit-planned-difficulty-"]').forEach(function (sel) {
        fitSelectWidth(sel);
    });
}// 区块标题加载函数

function getDifficultyColor(difficulty) {
    const colors = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#dc2626'];
    return colors[difficulty - 1] || '#10b981';
}
// ★2026-08-25 难度徽章玻璃质感：hex → rgba 半透明背景 / 同色系细边框
function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '');
    return 'rgba(' + parseInt(h.substring(0, 2), 16) + ',' + parseInt(h.substring(2, 4), 16) + ',' + parseInt(h.substring(4, 6), 16) + ',' + alpha + ')';
}
function getDifficultyGlass(difficulty) {
    return hexToRgba(getDifficultyColor(difficulty), 0.30);
}
function getDifficultyBorder(difficulty) {
    return hexToRgba(getDifficultyColor(difficulty), 0.55);
}

function getDifficultyText(difficulty) {
    return `${difficulty}级`;
}

// 格式化日期时间
// ★2026-08-25 用时格式化：分钟 → '2h30m' / '45m'
function formatDuration(minutes) {
    var m = parseInt(minutes, 10) || 0;
    if (m <= 0) return '';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? h + 'h' + r + 'm' : h + 'h';
}
function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
        return '-';
    }
}

// 格式化日期时间为输入框格式（YYYY-MM-DDTHH:mm，与自定义日期时间选择器兼容）
function formatDateTimeLocal(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

