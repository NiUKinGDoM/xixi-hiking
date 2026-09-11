
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
    'v1.2.0.3': '【修复】\n- 计划页搜索框修好了：以前计划条数少的时候它一直不出现，等于搜不了；现在切到计划页（日历、列表都一样）就能看到，记录页同理\n- 修了一个会让震动整体失灵的问题：切到别的 App 或锁屏再回来，震动、添加记录、导入导出这些按钮会一起没反应，只有重开 App 才恢复——已定位根因并修正\n- 震动反馈范围补全：日历热力图格子、顶栏标题、视图说明这些以前点了不震的地方，现在都有反馈\n- 导出的备份里版本号写死成旧值，现已跟随实际版本\n\nMade by XiXi 💛',
    'v1.2.0.2': '【新增】\n- 离线自足：图标字体与样式全部改为本地内置，没有网络时图标和界面也完全正常（山上没信号也不怕）\n\n【修复】\n- 「进行中」提示（下载版本 / 打包备份 / 生成分享卡）原来底色透明、还可能被弹窗盖住，现已修正\n- 若干提示颜色回归语义：「网页版无需更新」「当前环境不支持更新」等改为中性灰蓝色\n- 记录标题为空时输入框的红框提示原来不生效，已修复\n\n【优化】\n- 概览统计的数字与单位对齐更整齐，提示文字左右留白恢复正常\n- 打开更快：图标与样式不再依赖外部网络\n\nMade by XiXi 💛',
    'v1.2.0.1': '【新增】\n- 收款码独立成资源文件，离线也能查看和保存，安装包更轻巧\n\n【修复】\n- iOS 网页版点「保存二维码」会提示长按图片保存到相册（之前苹果手机上点了没反应）\n\n【优化】\n- 关于页「支持作者」的收款码展示更稳，网页版缓存版本更新\n\nMade by XiXi 💛',
    'v1.2.0.0': '【修复】\n- 导出诊断恢复精简内容：只保留版本与运行状态（错误日志、崩溃记录、同步信息），不再附带徒步记录明细——诊断文件里不含你的日记内容，更安心\n\nMade by XiXi 💛',
    'v1.1.10.10': '【新增】\n- 回忆册日记排版：完整备份里的「回忆册.html」改成日记样式——日期大字、山名、难度五档圆点、心情天气同行、小日记全文、照片墙，用浏览器 Ctrl+P 存成 PDF，更像一本徒步日记\n- 导出诊断包含全部记录明细：每条记录完整列出（含小日记、心情、天气、同行人），核对与存档都方便\n\n【优化】\n- 关于页按钮重新排两行（隐私政策·免责声明 / 支持作者·更新日志），更整齐\n\nMade by XiXi 💛',
    'v1.1.10.9': '【新增】\n- 免责声明：设置—关于应用可查看——本应用只是徒步记录工具，不引导、不建议前往未开发的野山，出行请走正规路线、量力而行、风险自担\n\n【优化】\n- 关于页按钮排成两行（隐私政策 / 更新日志、免责声明 / 支持作者），更整齐\n\nMade by XiXi 💛',
    'v1.1.10.8': '【新增】\n- 安装包安全加固：官方安装包加签名校验与代码混淆，被改动或重打包的安装包会被拦截并提示，用得更安心\n\n【优化】\n- 关闭系统自动备份：记录与照片不再被系统备份带走（App 内导出 / 坚果云备份不受影响）\n\nMade by XiXi 💛',
    'v1.1.10.7': '【新增】\n- 支持作者：设置—关于应用里点「支持作者」，可以请 XiXi 喝杯奶茶（微信 / 支付宝，纯自愿，不付费也有全部功能）\n\nMade by XiXi 💛',
    'v1.1.10.6': '【新增】\n- 隐私政策页：设置—关于应用里可查看「隐私与数据说明」——数据存在哪、云备份怎么用、各项权限用来干什么、崩溃报告是怎么回事，都讲得明明白白\n- 崩溃自动上报：App 运行异常时，会自动把崩溃报告（只有版本号和错误信息，不含你的记录与照片）经你配置的坚果云上传一次，一天最多一次\n- 崩溃日志本地持久保存：重启 App 也不会丢，可随诊断信息一起导出\n\n【修复】\n- 「查看更新日志」按钮精简为「更新日志」\n\nMade by XiXi 💛',
    'v1.1.10.5': '【修复】\n- 中性信息提示（灰蓝）原来只有一行字，没有底色和边框，现在补上玻璃底色和描边，和绿色成功/红色错误提示长成一个家族\n\nMade by XiXi 💛',
    'v1.1.10.4': '【新增】\n- 计划条新增三种状态小徽章：「已过期 N 天」（红）、「今天」（靛蓝）、「明天」（天蓝）\n- 日历视图（整月明细 + 单日明细）和计划列表都会显示，计划名过长时徽章不会被挤掉\n\nMade by XiXi 💛',
    'v1.1.10.3': '【新增】\n- 更新包下载一次就够：下载完退出安装界面后，再检查到同一版本，弹窗会提示「安装包已下载好」，点一下直接安装，不用重新下载；万一安装包被系统清理了会自动重新下载\n- 中性信息提示（灰蓝）——玩笑小话不再借用绿色成功提示，颜色各司其职\n- 版本号/正文/顶部「新版本」徽章颜色改为内联写死，安卓上不会再出现颜色没生效的情况\n\n【修复】\n- 弹窗按钮与提示样式意外丢失的问题，顺带清理 3 处历史样式残留\n\n【优化】\n- 记录/计划行的入场动画延迟封顶 0.3 秒，几百条记录首屏不再拖沓\n- 照片占用弹窗打开更快（读库次数减半）\n\nMade by XiXi 💛',
    'v1.1.10.2': '## v1.1.10.2 更新内容\n\n**照片占用看得明白**\n- 详情弹窗重新排版：大数字统计卡 + 绿色容量条（快满/超 300 MB 自动变红提醒），一眼知道照片占了多大地方\n- 去掉多余的「最占空间记录」榜单，弹窗干净利落\n\n**照片缓存随时可优化**\n- 弹窗底部新增「优化」按钮：只清理「不属于任何记录的缓存照片」，你记录里存的照片一张不动\n- 有缓存时先弹确认（显示几张、能省多少空间）再删；没缓存时会跟你开个小玩笑，点多少次都放心\n\n**细节顺手修**\n- 手机上点照片占用偶尔没反应 → 加了兼容加固\n- 行内旧的重复清理按钮移除，清理入口统一收进弹窗\n\nMade by XiXi 💛',
    'v1.1.10.1': '## v1.1.10.1 更新内容\n\n**照片心里有数**\n- 设置里「照片占用」点开能看到：一共占了多少空间、接近 300 MB 会提醒\n- 超过 300 MB 会提示你照片太多了，建议去记录里删掉几张\n- 超过后主按钮变「去清理」，一键扫掉游离的孤立照片\n\n**更新日志更好看**\n- 弹窗标题去掉版本号，只写「更新日志」\n- 一次展示最近三个版本：本次 / 上次 / 上上次，逐条分行，只看本次带标签\n\nMade by XiXi 💛',
    'v1.1.10.0': '## v1.1.10.0 更新内容\n\n**桌面上更好认**\n- App 图标图案整体放大了一圈，桌面上一眼就能找到\n\nMade by XiXi 💛',
    'v1.1.9.10': '## v1.1.9.10 更新内容\n\n**更顺手**\n- 所有弹窗定了条规矩：只有点「保存」才算保存——取消、叉号、点空白关闭都只是放弃本次改动，不会偷偷存下半成品\n\n**看得更舒服**\n- 概览统计的单位统一变小（次 / km / m / 级 / h / min），数字大单位小，一眼分清\n- 关于页的主 logo 放大了一圈，更醒目\n\nMade by XiXi 💛',
    'v1.1.9.9': '## v1.1.9.9 更新内容\n\n**小细节更清楚**\n- 概览「总记录数」加上单位（次）、「平均难度」加上单位（级），一眼看懂\n- 记录弹窗里的「小日记」文字颜色加深，深浅色模式下都更清晰\n- 「数据管理」说明弹窗的内容和按钮拉开距离，不再挤在一起\n\n**引导更顺手**\n- 四张引导卡各自独立：每页右上 ✕ 只关当前页那张，其它页的不受影响\n- 引导按钮统一大小，整齐一排（主按钮实底、次按钮描边区分）\n\nMade by XiXi 💛',
    'v1.1.9.8': '## v1.1.9.8 更新内容\n\n**更顺手**\n- 记录弹窗里的「小日记」输入框和用时/里程框，深色模式下显示修正，不再白一块黑一块\n- 新手引导更懂事了：每页讲每页的事，点引导上的按钮就带你去对应的地方，不会突然消失；想关就点右上 ✕，关一次就不再打扰\n\n**计划更省心**\n- 过期计划提醒简化为两个选择：「去处理」或「忽略」，不再一键顺延，日期还是自己定靠谱\n\n**界面清爽**\n- 导出备份弹窗去掉了自动备份说明，统一收进「数据管理」旁的 i 图标里看\n- 更新日志排版修正，逐条分行显示清楚\n\nMade by XiXi 💛',
    'v1.1.9.7': '## v1.1.9.7 更新内容\n\n**记录更贴心**\n- 记录详情弹窗新增「小日记」：每次徒步随手写几行见闻\n- 搜索连小日记、心情、天气、同行人一起搜，只记得片段也能找到\n\n**计划有人提醒**\n- 过期没去的计划会标「已过期 N 天」，打开 App 可一键顺延一周\n\n**数据安心**\n- 设置新增「抹掉所有足迹」：一键清空记录/照片/计划，双重确认防手滑（云端备份不受影响）\n\n**其它**\n- 新手引导改为「哪一页讲哪件事」的分页提示（随 1.1.9.8）\n- 视图说明小灰字点一下收起、回忆册可打印成 PDF、手动备份按钮改自动备份说明\n\nMade by XiXi 💛',
    'v1.1.9.6': '## v1.1.9.6 更新内容\n\n**更快更稳**\n- 大数量优化：统计和山册改单遍计算，记录再多也不卡（万条记录统计约 0.02 秒）\n- 热力图月度数据预聚合，翻月/切日期秒开\n\n**数据更放心**\n- 数据加载带版本迁移机制，以后升级数据结构自动平滑过渡\n- 设置里「照片占用」新增孤立照片扫描，一键清理不再占空间\n- 本地每周自动备份：App 启动检查，满 7 天自动存一份到系统下载目录，坚果云之外多一层保险\n\n**新朋友更友好**\n- 首次引导升级三步卡：写记录 → 看山册 → 列计划，一步步带你看懂\n- 零记录时可点「先看看示例」，一键载入几条真实感足迹先逛起来\n\n**细节打磨**\n- 清理废弃样式与代码、修复深色模式引导卡文字、备份失败会自动重试\n\nMade by XiXi 💛',
    'v1.1.9.5': '## v1.1.9.5 更新内容\n\n**更统一的按钮**\n- 徒步足迹的「年月」和「回顾」按钮统一成同款玻璃按钮，与「日历/列表」切换钮一套框\n- 清理了配套的废弃样式\n\n**热力图一眼看懂**\n- 热力图下方汇总加上前缀：看本月显示「本月徒步 N 次 · 累计爬升 Xm」，翻历史月份自动变成「X年X月徒步 …」，不会指错月\n\nMade by XiXi 💛',
    'v1.1.9.4': '## v1.1.9.4 更新内容\n\n**按钮与弹窗更顺手**\n- 徒步足迹的「回顾」按钮带上了文字，不再是个谜之图标\n- 有「取消」按钮的弹窗，右上角的 ✕ 都去掉了：编辑时按底部取消即可，不怕误触\n- 编辑弹窗「照片」下面注明上限：最多 24 张\n\n**计划完成更顺**\n- 勾「完成」先弹祝贺卡，点「继续补全」才进入编辑——不再两个弹窗叠一起\n\nMade by XiXi 💛',
    'v1.1.9.3': '## v1.1.9.3 更新内容\n\n**视图说明更清爽**\n- 记录/计划各视图上方的小灰字说明去掉了小图标，改成居中纯文字，一眼看清当前是什么视图\n\n**批量管理更顺手**\n- 多选框从名称前面挪到操作列，不再挡着看山名\n- 勾选框重绘成玻璃质感：浅红玻璃底 + 红勾，和删除按钮一套设计语言\n\n**稳定性与内部**\n- 清理 12 个废弃函数、删除冗余代码\n- 加固 3 处用户文字回显的转义处理\n- 自动测试扩充到 115 项，本轮功能全部纳入回归\n\nMade by XiXi 💛',
    'v1.1.9.2': '## v1.1.9.2 更新内容\n\n**记录弹窗更顺眼**\n- 修复：打开记录详情照片不显示的问题，照片墙改横向滑动，想看哪张划到哪张\n- 浅色模式下难度徽章、心情、天气、日期全部加深加大，一眼看清\n\n**编辑弹窗排版重排**\n- 记录编辑：名称 → 海拔+难度（对半）→ 心情+天气+同行人 → 用时+里程 → 日期时间，层次清清楚楚\n- 难度框直接显示「5级 困难」档名，不再是个光秃秃数字（保存/复制都兼容）\n- 计划编辑：海拔+难度移到日期时间前面，同款档名样式\n\n**新朋友也能一眼看懂**\n- 记录页「列表/山册」、计划页「日历/列表」的切换按钮带上了文字说明，不再是个谜之图标\n- 每个视图上方加了一行小标题：现在看的是什么、能干什么\n\n**其它**\n- 桌面「记一笔」快捷方式更稳，不再偶尔点了没反应\n\nMade by XiXi 💛',
    'v1.1.9.1': '## v1.1.9.1 更新内容\n\n**像翻日记一样看记录**\n- 记录页与计划页列表瘦身：一行只看名称，点开弹居中详情卡片\n- 详情卡片里照片墙 / 指标 / 难度心情天气一目了然，想改才点「编辑」\n- 编辑也在弹窗里完成，不再钻进表格\n\n**细节与修复**\n- 单条记录照片上限放宽到 24 张（自动分批压缩不卡）\n- 新用户首开引导：一句话欢迎 + 直达记录第一座山\n- 列表时间列加大字号，深浅模式文字全部提亮\n- 桌面长按 App 图标可直达「记一笔」\n- 稳定性修复\n\nMade by XiXi 💛',
    'v1.1.8.10': '## v1.1.8.10 更新内容\n\n**我的山册 · 像本册子了**\n- 山册改双列名册，一屏能看更多座山\n- 每座山盖一枚圆章序号 01 / 02 / 03……按你第一次登山的先后自动编号\n- 卡片右缘+下缘一条海拔书脊色带：低山青绿、高山靛紫，翻册子像翻一摞书\n- 长山名自动两行完整显示，不再截成「祥峪森…」\n\n**概览页更纯粹**\n- 统计大卡收身、矮卡放大，层级更协调\n- 删掉首页「难度分布」柱状图：首页留给统计与足迹回忆\n\nMade by XiXi 💛',
    'v1.1.8.9': '## v1.1.8.9 更新内容\n\n**添加记录更顺手**\n- 「＋添加」改下拉式：新建空白与从历史复制分两条路\n- 顶部独立「新建空白记录」一行直达；下拉展开选最近记录，点底部「填充」才带出（防止误建）\n\n**可读性整体提升**\n- 所有弹窗的说明文字/去年对比值/日期等小字统一加深（浅色/深色模式都调过）\n- 弹窗内虚线与分割线加深，不再若隐若现\n- 年月/日期/心情选择器选中态全部改玻璃质感，告别纯色块\n\nMade by XiXi 💛',
    'v1.1.8.8': '## v1.1.8.8 更新内容\n\n**概览页更聚焦**\n- 统计卡主次分离：只留 4 张主卡（次数/总里程/总用时/最高海拔）大字展示，平均海拔/平均难度/平均用时收成一行矮副卡\n- 「徒步足迹」热力图挪到难度分布上方，打开概览先看回忆再看数据\n- 年度回顾入口收进热力图卡右上角\n\n**徒步足迹 · 更好用**\n- 年月选择器合并成一个框：点开弹窗选年月，只有去过徒步的月份能选\n- 底部汇总精简为「徒步 N 次 · 累计爬升 Xm」，不再重复日期\n\n**界面细节**\n- 设置页数据管理说明重新排版，删掉多余说明文字\n- 滚动条统一玻璃质感（含照片横排条）\n- 细节与稳定性优化\n\nMade by XiXi 💛',
    'v1.1.8.7': '## v1.1.8.7 更新内容\n\n**我的山册 · 照片回忆**\n- 展开一座山，顶部横排展示这座山去过的照片，点开看大图（左右滑可存）\n- 山册收起时只留一排山名，展开才显示照片与统计，界面更清爽\n\n**云端备份 · 同步更安心**\n- 「自动同步」开关下面新增健康状态行：绿=刚同步过、黄=快一周没备份、红=很久没备份，一眼就知道该不该上传\n- 没配置云端时，点这行直接跳去配置服务器\n\n**界面统一**\n- 页面与弹窗滚动条统一玻璃质感\n- 细节与稳定性优化\n\nMade by XiXi 💛',
    'v1.1.8.6': '## v1.1.8.6 更新内容\n\n**年度回顾小结更活泼**\n- 「和去年比」的一句话小结文案全换新：按趋势（更勤快/放缓/持平/有起有伏）配活泼开场与收尾，每次打开随机一句\n- 例：「出发的瘾，好像又大了一点…继续保持，下一座山头在等你！」数据依旧是真实统计，只说人话\n\n**数据安全加固**\n- 年度回顾「年度之最」/山册「一起走过」/热力图详情等处用户填写文本（山名/同行人等）统一转义，含特殊字符也不会破坏界面\n\nMade by XiXi 💛',
    'v1.1.8.5': '## v1.1.8.5 更新内容\n\n**添加更快：从历史记录复制**\n- 点「＋」先弹「添加徒步记录」选择卡：从最近记录里挑一条，或直接新建空白\n- 挑一条 → 山名/难度/海拔/心情/天气/同行/里程/用时全部带出并高亮，日期自动是今天、照片不复制，改下日期就能保存\n- 编辑旧记录不再出现复制条，界面干净\n\n**年度回顾·和去年比**\n- 弹窗顶部只留标题与年份切换，关闭移到右下角单手就能关\n- 新增「和去年比」开关：点亮后 6 项指标显示去年划线值 + 增减幅度，并生成一句话「一年小结」（次数/里程/新解锁山/最活跃月份/常去山对比）\n\n**我的山册跳转修复**\n- 山册点 ↗ 直达记录：照片正常显示、定位准确（排序/搜索后也不会跳错页），并自动滚动到那条\n\n**iOS 网页适配**\n- iPhone/iPad 浏览器打开体验优化：字体不自动放大、搜索条限宽、底部避开手势条、弹窗滚动不带走页面\n\nMade by XiXi 💛',
    'v1.1.8.3': '## v1.1.8.3 更新内容\n\n**细节打磨**\n- 概览统计卡片去掉「一道光划过」效果\n- 设置页分组边框调浅（更轻盈）\n\nMade by XiXi 💛',
    'v1.1.8.2': '## v1.1.8.2 更新内容\n\n**背景流光增强**\n- 光斑更明显、范围更大、流速更快\n- 流动轨迹改蜿蜒折返（不再是直线来回晃）\n\nMade by XiXi 💛',
    'v1.1.8.1': '## v1.1.8.1 更新内容\n\n**液态玻璃更灵动**\n- 全 App 玻璃按钮/卡片/格子统一「轻沉回弹」按压手感\n- 页面背景加极淡流动光斑（所有页面共享，深色模式自动换暗色系）\n- 搜索框自动避让底部分页键（翻页不再被挡住）\n\nMade by XiXi 💛',
    'v1.1.8.0': '## v1.1.8.0 更新内容\n\n**五项优化**\n- 弹窗底部按钮统一尺寸（取消/删除/确定按钮全部统一，与日期/心情选择器一致）\n- 心情保存 trim 统一（防意外空格）\n\nMade by XiXi 💛',
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
    // ★2026-09-06 标题去掉版本号；内容显示最近三个版本（本次/上次/上上次），本地内置不联网
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" style="max-width:360px;">' +
        '<div class="confirm-modal-title"><span class="material-icons" style="color:#667eea;">history_edu</span>更新日志</div>' +
        '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;max-height:420px;overflow-y:auto;" id="changelogBody">正在加载…</div>' +
        '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="changelogClose">关闭</button></div></div>';
    document.body.appendChild(modal);
    document.getElementById('changelogClose').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    var el = document.getElementById('changelogBody');
    try {
        var keys = [];
        for (var k in BUILTIN_CHANGELOG) { if (BUILTIN_CHANGELOG.hasOwnProperty(k)) keys.push(k); }
        var cur = 'v' + APP_VERSION;
        var start = keys.indexOf(cur);
        if (start < 0) start = 0;
        var parts = [];
        for (var i = start; i < keys.length && parts.length < 3; i++) {
            var kk = keys[i], body = BUILTIN_CHANGELOG[kk];
            if (!body) continue;
            parts.push({ ver: kk.replace('v', ''), isCur: kk === cur, body: body });
        }
        // ★2026-09-06 徽章只给「本次更新」；上次/上上次只显示版本号+内容（排版更素净）
        // ★2026-09-07 颜色全部内联（同照片弹窗：动态弹窗依赖 #id CSS 在个别真机失效 → IS_DARK 分支直接内联，零 CSS 依赖）
        var IS_DARK = typeof document.body !== 'undefined' && document.body.classList && document.body.classList.contains('dark-mode');
        var CL = {
            v: IS_DARK ? '#f1f5f9' : '#1f2937',
            b: IS_DARK ? '#cbd5e1' : '#334155',
            tagTx: IS_DARK ? '#a5b4fc' : '#4f46e5',
            tagBg: IS_DARK ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.12)',
            tagBd: IS_DARK ? 'rgba(129,140,248,0.55)' : 'rgba(99,102,241,0.35)'
        };
        var html = '';
        for (var j = 0; j < parts.length; j++) {
            var pt = parts[j];
            var escB = String(pt.body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<span style="font-size:14px;font-weight:800;color:' + CL.v + ';">' + pt.ver + '</span>' +
                (j === 0 ? '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;color:' + CL.tagTx + ';background:' + CL.tagBg + ';border:1px solid ' + CL.tagBd + ';">本次更新</span>' : '') + '</div>' +
                '<div style="font-size:13px;line-height:1.75;color:' + CL.b + ';white-space:pre-wrap;word-break:break-word;">' + escB + '</div>' +
                (j < parts.length - 1 ? '<div style="height:1px;background:rgba(148,163,184,0.25);margin:14px 0;"></div>' : '');
        }
        if (el) el.innerHTML = html ? html : '<div style="color:#94a3b8;">暂无内置更新说明</div>';
    } catch (e2) {
        if (el) el.textContent = '更新日志加载失败';
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
    var CRASH_Q_KEY = 'hiking_crash_queue';
    function persistCrashEntry(msg) {
        try {
            if (!msg) return;
            var q = [];
            var raw = null;
            try { raw = window.localStorage.getItem(CRASH_Q_KEY); } catch (e) { raw = null; }
            if (raw) { try { q = JSON.parse(raw) || []; } catch (e2) { q = []; } }
            if (!Array.isArray(q)) q = [];
            var last = q[q.length - 1];
            if (last && last.msg === msg && (Date.now() - (last.ts || 0)) < 60000) return;
            q.push({ ts: Date.now(), t: new Date().toLocaleString(), msg: String(msg).slice(0, 500) });
            if (q.length > 20) q.shift();
            try { window.localStorage.setItem(CRASH_Q_KEY, JSON.stringify(q)); } catch (e3) { /* 忽略 */ }
        } catch (e4) { /* 忽略 */ }
    }
    window.__getCrashQueue = function () {
        try {
            var raw = window.localStorage.getItem(CRASH_Q_KEY);
            return raw ? (JSON.parse(raw) || []) : [];
        } catch (e) { return []; }
    };
    window.__clearCrashQueue = function () {
        try { window.localStorage.removeItem(CRASH_Q_KEY); } catch (e) { /* 忽略 */ }
    };
    window.addEventListener('error', function (e) {
        push('ERROR', [e && e.message, e && e.filename + ':' + e.lineno]);
        persistCrashEntry((e && e.message ? e.message : 'unknown error') + ' @ ' + (e && e.filename ? e.filename : '?') + ':' + (e && e.lineno != null ? e.lineno : '?'));
    });
    window.addEventListener('unhandledrejection', function (e) {
        push('ERROR', ['unhandledrejection', e && e.reason && e.reason.message]);
        persistCrashEntry('unhandledrejection: ' + (e && e.reason && e.reason.message ? e.reason.message : 'unknown'));
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
        var crashQ = (typeof window.__getCrashQueue === 'function') ? window.__getCrashQueue() : [];
        var full = base + '--- 错误日志（最近 ' + (window.__diagLogs || []).length + ' 条）---' + String.fromCharCode(10) + ((window.__diagLogs || []).join(String.fromCharCode(10)) || '无')
            + '\n\n--- 崩溃记录（持久，' + crashQ.length + ' 条，重启不丢）---\n' + (crashQ.length ? crashQ.map(function (c) { return c.t + ' ' + c.msg; }).join('\n') : '无');
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

// 页面卸载时执行清理（★2026-09-11 修复：只保留 beforeunload）
// 原先同时绑了 pagehide，但移动端「切后台 / 锁屏」也会触发 pagehide，而它并不代表页面被卸载——
// 一次 pagehide 会把全部 29 条全局事件监听一次性清空（震动反馈、添加记录、导入导出、主题/FPS/震动开关…），
// 回到 App 时页面并未重载，于是所有点击反馈与按钮全部失灵，重开 App 才恢复
// （用户报「震动偶发性地全都没有震动」，根因即此）。真正的离开由 beforeunload 承担。
window.addEventListener('beforeunload', cleanupResources);

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
// ★2026-09-05 P0-2 数据 schema 迁移框架：记录/计划容器（{records}/{trips}）保存时写入 version；
//   老数据（无 version 字段）视为 v0。未来结构性变更：DATA_SCHEMA_VERSION+1，并在对应迁移链数组尾追加迁移函数（接收数组返回升级后数组）。
const DATA_SCHEMA_VERSION = 1;
const RECORD_SCHEMA_MIGRATIONS = [];   // 下标 = 旧版本号；当前 v0→v1 无处理（预留）
const TRIP_SCHEMA_MIGRATIONS = [];
function applySchemaMigrations(list, migrations) {
    if (!Array.isArray(list)) return list;
    var out = list;
    for (var v = 0; v < migrations.length; v++) {
        try { out = migrations[v](out); } catch (e) { console.warn('schema migration v' + v + ' failed:', e && e.message); }
    }
    return out;
}
// ★当前应用版本（2026-08-11：应用内检查更新用；bump 版本时必须同步）
var APP_VERSION = '1.2.0.3';
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
// ★2026-09-05 P0-3 孤立照片只读扫描（区别于 photoCollectOrphans 的删除版）：返回 {count, bytes}
function photoCountOrphans() {
    var used = {};
    (records || []).forEach(function (r) {
        (r.photos || []).forEach(function (ph) { used[ph] = true; });
    });
    return photoGetAll().then(function (all) {
        var orphans = (all || []).filter(function (p) { return !used[p.id]; });
        var bytes = orphans.reduce(function (sb, p) { return sb + (p.blob ? p.blob.size : 0); }, 0);
        return { count: orphans.length, bytes: bytes };
    }).catch(function () { return { count: 0, bytes: 0 }; });
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
// ★2026-09-07 P0 照片库总占用上限：建议值 300MB，超过后照片占用详情弹窗出现浅红警示（TOP 排行已按用户要求移除）
var PHOTO_LIMIT_BYTES = 300 * 1048576;

// 字节 → {v:'382', u:'MB'} / {v:'840', u:'KB'}
function photoSizeParts(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes >= 1048576) return { v: (bytes / 1048576).toFixed(1), u: 'MB' };
    return { v: String(Math.ceil(bytes / 1024)), u: 'KB' };
}
function photoSizeText(bytes) {
    var p2 = photoSizeParts(bytes);
    return p2.v + ' ' + p2.u;
}
function photoOverLimit(bytes) { return (Number(bytes) || 0) > PHOTO_LIMIT_BYTES; }

// 打开「照片占用」详情弹窗（confirm-modal 体系）：统计卡+容量条+超限警示+优化按钮（样式全内联）
// ★2026-09-07 按用户确认的 demo 形态实现：底部一条红玻璃主钮——常态「知道了」/ 超限变「去清理」；排行第一行恒红描边；文案语气对齐 demo
function openPhotoUsageDetailModal() {
    try {
    if (document.getElementById('puModal')) return;   // 幂等：委托+行绑定双通道下防弹窗开两份
    var modal = document.createElement('div');
    modal.className = 'confirm-modal modal-backdrop-animate';
    modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale" id="puModal" style="max-width:392px;padding:18px 16px 14px;">' +
        '<div class="confirm-modal-title" style="font-size:16px;"><span class="material-icons" style="color:#667eea;">photo_library</span>照片占用</div>' +
        '<div class="confirm-modal-message" style="text-align:left;padding:0 2px;margin-bottom:2px;">' +
        '<div style="max-height:54vh;overflow-y:auto;padding-right:4px;" id="puScroll">' +
        '<div style="font-size:12px;color:#64748b;padding:16px 2px;text-align:center;">统计中…</div></div></div>' +
        '<div class="confirm-modal-buttons" style="margin-top:14px;">' +
        '<button class="confirm-btn-cancel ripple-effect" type="button" id="puClose" style="flex:1;padding:10px 0;border-radius:10px;font-size:13.5px;">知道了</button>' +
        '<button class="check-go-btn ripple-effect" type="button" id="puOpt" style="flex:1;padding:7px 0;border-radius:10px;font-size:13px;font-weight:600;margin-left:8px;">优化</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });

    var scrollEl = document.getElementById('puScroll');
    // ★2026-09-07 双钮：puClose=知道了(灰蓝关闭) 直接绑；puOpt=优化/去清理(红) 动作由 then 内统一 onclick（预绑会导致双移除）
    var closeBtn = document.getElementById('puClose');
    var optBtn = document.getElementById('puOpt');
    if (closeBtn) closeBtn.addEventListener('click', function () { document.body.removeChild(modal); });

    // ★2026-09-07 仔细复查优化：只读一次照片库（原 getAll+countOrphans 双全量读；孤立数弹窗已不展示 → 去掉冗余二次读）
    photoGetAll().catch(function () { return []; })
        .then(function (res) {
            var all = res || [];
            var total = (all || []).reduce(function (ss, p) { return ss + (p && p.blob ? p.blob.size : 0); }, 0);
            var count = (all || []).length;
            var over = photoOverLimit(total);
            var sp = photoSizeParts(total);
            // ★2026-09-07 样式全部 JS 内联（CSS 层选择器在个别真机不生效 → 内联 100% 可靠）；dark 由 JS 分支色板决定
            var IS_DARK = typeof document.body !== 'undefined' && document.body.classList && document.body.classList.contains('dark-mode');
            var P = {
                cardBg: IS_DARK ? 'rgba(51,65,85,0.55)' : 'rgba(148,163,184,0.12)',
                cardBd: IS_DARK ? 'rgba(148,163,184,0.20)' : 'rgba(100,116,139,0.22)',
                num: IS_DARK ? '#f1f5f9' : '#1f2937',
                sub: IS_DARK ? '#8b9ab0' : '#64748b',
                track: IS_DARK ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.18)',
                warnTx: IS_DARK ? '#fca5a5' : '#b91c1c',
                warnBg: IS_DARK ? 'rgba(220,38,38,0.16)' : 'rgba(220,38,38,0.08)',
                warnBd: IS_DARK ? 'rgba(248,113,113,0.45)' : 'rgba(220,38,38,0.35)'
            };
            var h = '';
            // ① 统计卡（玻璃卡片：数字大单位小；样式内联；弹窗已加大）
            h += '<div class="pu-card" style="background:' + P.cardBg + ';border:1px solid ' + P.cardBd + ';border-radius:16px;padding:14px 16px;margin-bottom:12px;">' +
                '<div style="display:flex;align-items:baseline;gap:10px;">' +
                '<span class="pu-num" style="font-size:28px;font-weight:800;color:' + P.num + ';line-height:1.1;">' + sp.v + '<small style="font-size:14px;font-weight:600;opacity:0.75;"> ' + sp.u + '</small></span>' +
                '<span class="pu-sub" style="font-size:12px;color:' + P.sub + ';margin-left:auto;">共 ' + count + ' 张</span></div>' +
                '<div class="pu-meter" style="height:7px;border-radius:99px;background:' + P.track + ';margin-top:12px;overflow:hidden;"><i style="display:block;height:100%;border-radius:99px;background:' + (over ? 'linear-gradient(90deg,#f87171,#dc2626)' : 'linear-gradient(90deg,#34d399,#10b981)') + ';width:' + Math.min(100, Math.round(total / PHOTO_LIMIT_BYTES * 100)) + '%;"></i></div></div>';
            // ② 超限警示（浅红，语义同删除/过期；仅超限显示）
            h += '<div class="pu-warn" style="display:' + (over ? 'flex' : 'none') + ';align-items:flex-start;gap:8px;background:' + P.warnBg + ';border:1px solid ' + P.warnBd + ';border-radius:12px;padding:8px 11px;font-size:12px;line-height:1.6;color:' + P.warnTx + ';"><span class="material-icons" style="font-size:15px;flex-shrink:0;margin-top:1px;">warning_amber</span>' +
                '<span>照片已占 <b style="color:inherit;">' + photoSizeText(total) + '</b>，超过建议的 300 MB —— 删几张，或点「优化」清理没用的缓存照片。</span></div>';
            // ★2026-09-07 TOP10 与长说明已移除：弹窗只保留统计卡+容量条+超限警示
            if (scrollEl) scrollEl.innerHTML = h;
            // ③ 红玻璃主钮（安全操作说明：只删不属于任何记录的孤立照片=没用的缓存，绝不动记录里的照片）：
            //    常态「优化」/ 超限「去清理」，动作一致 → 关弹窗走孤立清理（有则确认弹窗，无则提示没有可清理的）
            if (optBtn) {
                optBtn.textContent = (over ? '去清理' : '优化');   // ★2026-09-07 纯文字无图标，框体紧凑
                optBtn.onclick = function () {
                    document.body.removeChild(modal);
                    setTimeout(function () { try { confirmDeleteOrphanPhotos(); } catch (eX) { /* 忽略 */ } }, 60);
                };
            }

        })
        .catch(function () {
            if (scrollEl) scrollEl.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:14px 2px;text-align:center;">照片统计不可用（浏览器未支持本地照片库）</div>';
        });
    } catch (eF) {
        try { showErrorMessage('照片占用打开失败'); } catch (eG) { /* 忽略 */ }
        try { if (modal && modal.parentNode) document.body.removeChild(modal); } catch (eH) { /* 忽略 */ }
    }
}

// 绑定设置页「照片占用」行 → 打开详情（行内清理钮点击不冒泡）
function bindPhotoUsageRow() {
    var row = document.getElementById('photoUsageRow');
    if (row && !row._puBound) {
        row._puBound = true;
        row.addEventListener('click', function (e) {
            openPhotoUsageDetailModal();
        });
    }
    // ★2026-09-07 安卓真机排障加固：document 委托兜底（防个别浏览器绑定时机异常导致整行无响应）
    if (!bindPhotoUsageRow._docBound) {
        bindPhotoUsageRow._docBound = true;
        document.addEventListener('click', function (ev) {
            if (!ev.target || !ev.target.closest) return;
            var row2 = ev.target.closest('#photoUsageRow');
            if (!row2) return;
            openPhotoUsageDetailModal();
        });
    }
}

// ★2026-08-21 v1.1.1.5 照片占用统计（设置页显示）
// ★2026-09-07 行内「清理孤立照片」快捷钮已删（与弹窗「优化」重复）：desc 保留「含孤立 N 张」提示，清理入口统一进详情弹窗
function refreshPhotoUsage() {
    var el = document.getElementById('photoUsageDesc');
    if (!el) return;
    Promise.all([photoGetUsage(), photoCountOrphans()]).then(function (res) {
        var u = res[0], o = res[1] || { count: 0 };
        if (!u || !u.count) { el.textContent = '暂无照片'; return; }
        var txt = '照片 ' + u.count + ' 张 · ' + (u.bytes >= 1048576 ? (u.bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(u.bytes / 1024) + ' KB');
        if (o.count) txt += '（含孤立 ' + o.count + ' 张，点开可优化）';
        el.textContent = txt;
    }).catch(function () { el.textContent = '统计失败'; });
}
// ★2026-09-05 P0-3 清理孤立照片：先确认（显示数量与释放空间）再删
function confirmDeleteOrphanPhotos() {
    photoCountOrphans().then(function (o) {
        if (!o || !o.count) {
            // ★2026-09-07 用户定制：没缓存可清时 toast 说俏皮话（随机轮换，点多少次都有新鲜感）
            var cleanMsgs = [
                '别点啦，这里没有缓存要清～',
                '这儿干净得很，一张多余的缓存照片都没有',
                '没有缓存，非要再点一下才放心吗？',
                '好吧，那你点吧……真没有，改天再来看看',
                '帮你查过啦：缓存照片 0 张，干干净净'
            ];
            try { showInfoMessage(cleanMsgs[Math.floor(Math.random() * cleanMsgs.length)]); } catch (e) {}   // ★2026-09-07 中性 toast（非成败，用灰蓝信息色）
            return;
        }
        var sizeTxt = o.bytes >= 1048576 ? (o.bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(o.bytes / 1024) + ' KB';
        var modal = document.createElement('div');
        modal.className = 'confirm-modal modal-backdrop-animate';
        modal.innerHTML = '<div class="confirm-modal-content modal-fade-scale">' +
            '<div class="confirm-modal-title"><span class="material-icons" style="color:#dc2626;">cleaning_services</span>清理孤立照片</div>' +
            '<div class="confirm-modal-message">发现 ' + o.count + ' 张<b>没用的缓存照片</b>（已不属于任何记录，约 ' + sizeTxt + '）。<br>记录里保存的照片不受影响。删除后释放空间，此操作不可撤销。</div>' +
            '<div class="confirm-modal-buttons"><button class="confirm-btn-cancel ripple-effect" id="orphan-cancel">取消</button>' +
            '<button class="check-go-btn ripple-effect" id="orphan-delete">清理</button></div></div>';
        document.body.appendChild(modal);
        document.getElementById('orphan-cancel').addEventListener('click', function () { document.body.removeChild(modal); });
        document.getElementById('orphan-delete').addEventListener('click', function () {
            document.body.removeChild(modal);
            photoCollectOrphans().then(function () {
                try { refreshPhotoUsage(); showSuccessMessage('已清理 ' + o.count + ' 张孤立照片'); triggerHaptic(20); } catch (e) {}
            });
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    });
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
// ★2026-09-04 上限放宽到 24 张后：分批压缩（每批 3 张串行推进），防一次 24 张 canvas 并发解码卡顿/内存峰值
function pickPhotos(capture) {
    return new Promise(function (resolve, reject) {
        var input = ensurePhotoInput(capture);
        input.multiple = true;
        input.value = '';
        input.onchange = function () {
            var files = input.files ? Array.prototype.slice.call(input.files) : [];
            if (!files.length) { reject(new Error('no-file')); return; }
            var out = [];
            var idx = 0;
            var BATCH = 3;
            function runBatch() {
                var batch = files.slice(idx, idx + BATCH);
                idx += BATCH;
                if (!batch.length) { resolve(out); return; }
                Promise.all(batch.map(function (f) { return compressImage(f); }))
                    .then(function (rs) {
                        out = out.concat(rs);
                        runBatch();
                    }, reject);
            }
            runBatch();
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
    errorDiv.className = 'error-message toast-pop toast-glass error text-sm';
    errorDiv.style.padding = '12px 20px';   // ★2026-09-10 内联硬锁：原 Tailwind px-5 从未编译（实测横向内边距=0，文字贴边）
    errorDiv.style.position = 'fixed';   // ★2026-09-10 内联硬锁：position 不依赖 Tailwind 类（曾误删 fixed 类致 toast 跑到文档末尾看不见）
    errorDiv.style.left = '50%';
    errorDiv.style.bottom = '140px';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.zIndex = '300';   // ★2026-09-10 内联层级：原 Tailwind z-[300] 未编译（计算值为 auto），弹窗遮罩 260 会盖住 toast
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

// ★2026-09-07 中性信息消息（俏皮提示/非成败的说明用；设计统一①：绿=成功 红=错误 灰蓝=中性信息）
function showInfoMessage(message, duration) {
    const existingInfo = document.querySelector('.info-message');
    if (existingInfo) existingInfo.remove();
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info-message toast-pop toast-glass info text-sm';
    infoDiv.style.padding = '12px 20px';   // ★2026-09-10 内联硬锁：原 Tailwind px-5 从未编译（实测横向内边距=0，文字贴边）
    infoDiv.style.position = 'fixed';   // ★2026-09-10 内联硬锁：position 不依赖 Tailwind 类（曾误删 fixed 类致 toast 跑到文档末尾看不见）
    infoDiv.style.left = '50%';
    infoDiv.style.bottom = '140px';
    infoDiv.style.transform = 'translateX(-50%)';
    infoDiv.style.zIndex = '300';   // ★2026-09-10 内联层级：原 Tailwind z-[300] 未编译（计算值为 auto），弹窗遮罩 260 会盖住 toast
    infoDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-icons">info</span>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    document.body.appendChild(infoDiv);
    setTimeout(() => {
        if (document.body.contains(infoDiv)) {
            infoDiv.classList.add('toast-fade-out');
            setTimeout(() => { if (infoDiv.parentNode) infoDiv.remove(); }, 300);
        }
    }, duration || 1400);
    infoDiv.addEventListener('click', () => {
        infoDiv.classList.add('toast-fade-out');
        setTimeout(() => { if (infoDiv.parentNode) infoDiv.remove(); }, 300);
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
    successDiv.className = 'success-message toast-pop toast-glass success text-sm';
    successDiv.style.padding = '12px 20px';   // ★2026-09-10 内联硬锁：原 Tailwind px-5 从未编译（实测横向内边距=0，文字贴边）
    successDiv.style.position = 'fixed';   // ★2026-09-10 内联硬锁：position 不依赖 Tailwind 类（曾误删 fixed 类致 toast 跑到文档末尾看不见）
    successDiv.style.left = '50%';
    successDiv.style.bottom = '140px';
    successDiv.style.transform = 'translateX(-50%)';
    successDiv.style.zIndex = '300';   // ★2026-09-10 内联层级：原 Tailwind z-[300] 未编译（计算值为 auto），弹窗遮罩 260 会盖住 toast
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




// 徒步足迹标题保存（v1.0.7.10）

// ★2026-09-04 fitSelectWidth/fitEditSelects 已删除：难度选择改玻璃弹窗后全 App 无 select，原自适应宽度逻辑成死代码

function getDifficultyColor(difficulty) {
    const colors = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#dc2626'];
    return colors[difficulty - 1] || '#10b981';
}
// ★2026-09-04 深色模式难度字色：同档位的 400 级亮色（深底上保持辨识度，配 .difficulty-color input 用）
function getDifficultyColorDark(difficulty) {
    const colors = ['#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f87171'];
    return colors[difficulty - 1] || '#34d399';
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
