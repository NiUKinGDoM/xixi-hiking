# 代码地图（自动生成 · 勿手改）

> 由 `node tools/map.js` 生成于 2026/10/26 14:11:22
> **用途**：改 `www/` 前先查这里定位，别在 6700 行里瞎翻。
> **过期判据**：下方「文件行数」与实际不符 = 地图过期 → 重跑本工具。

## 文件行数

| 文件 | 行数 | 顶层函数数 |
|---|---|---|
| `www/index.html` | 755 | 0 |
| `www/app.css` | 2408 | 0 |
| `www/app-modal.css` | 2586 | 0 |
| `www/app-form.css` | 1324 | 0 |
| `www/app-core.js` | 1867 | 79 |
| `www/app-data.js` | 423 | 16 |
| `www/app-data-detail.js` | 572 | 28 |
| `www/app-data-lightbox.js` | 1683 | 55 |
| `www/app-data-heatmap.js` | 305 | 8 |
| `www/app-data-plans.js` | 1629 | 59 |
| `www/app-data-plan-detail.js` | 911 | 43 |
| `www/app-sync.js` | 2826 | 109 |
| `www/app-init.js` | 975 | 12 |
| `www/sw.js` | 121 | 0 |

## www/index.html（755 行）

### CSS / script 分区

| 行 | 类型 | 名称 |
|---|---|---|
| 14 | script 段 | <script defer src="assets/vendor/tailwind4.1.13.js"></script> |
| 16 | style 段 | <style> |
| 19 | style 结束 | — |
| 24 | script 段 | <script> |
| 38 | script 段 | <script> |
| 724 | script 段 | <script src="app-core.js"></script> |
| 725 | script 段 | <script src="app-data.js"></script> |
| 726 | script 段 | <script src="app-data-detail.js"></script> |
| 727 | script 段 | <script src="app-data-lightbox.js"></script> |
| 728 | script 段 | <script src="app-data-heatmap.js"></script> |
| 729 | script 段 | <script src="app-data-plans.js"></script> |
| 730 | script 段 | <script src="app-data-plan-detail.js"></script> |
| 731 | script 段 | <script src="app-sync.js"></script> |
| 732 | script 段 | <script src="app-init.js"></script> |

## www/app.css（2408 行）

### 样式分区（改样式先跳到这里）

| 行 | 类型 | 名称 |
|---|---|---|
| 24 | CSS 分区 | 2026-08-27 滚动丝滑：touch 惯性滚动 + 防下拉弹性露白底 |
| 27 | CSS 分区 | 2026-09-03 iOS 网页适配：横竖屏旋转/缩放时禁止浏览器自动放大文字（排版不变形） |
| 39 | CSS 分区 | 2026-08-30 去网页感：全局禁长按选择/长按菜单（输入框编辑区在 body 层不受影响，另行放行） |
| 45 | CSS 分区 | 2026-08-30 输入框/文本域/编辑区放行选择（输入文字不受影响，长按选择仅限这些元素） |
| 52 | CSS 分区 | 全局过渡变量 |
| 56 | CSS 分区 | 液态玻璃透明度（固定默认值，不可调） |
| 61 | CSS 分区 | 白色模式文字覆盖 |
| 70 | CSS 分区 | 浅色模式彩色文字加深 |
| 75 | CSS 分区 | 2026-08-26 补 teal/rose（总里程/总用时，原缺定义 → 无颜色无光晕） |
| 78 | CSS 分区 | 照片计数（1/9）深浅自适应：浅色深灰 / 深色浅白（原内联白字浅色模式下不可见） |
| 93 | CSS 分区 | 深色模式样式 |
| 109 | CSS 分区 | 深色模式恢复彩色文字 |
| 114 | CSS 分区 | 2026-08-26 深色 teal/rose（与上面四色同体系） |
| 122 | CSS 分区 | 白色面板 → 玻璃面板 |
| 405 | CSS 分区 | 2026-09-22 玻璃化：原深灰实底 → 轻白雾 + 玻璃配方（与浅色同语言） |
| 430 | CSS 分区 | 确认弹窗暗色文字适配（标题/消息原本是深色，暗色背景下不可见） |
| 450 | CSS 分区 | 2026-08-23 热力图弹窗分享按钮：统一玻璃配方（原紫色渐变已弃） |
| 473 | CSS 分区 | 2026-08-23 热力图弹窗 meta 项（心情/天气/同行）：标签式 + 浅色深字可读 |
| 482 | CSS 分区 | 2026-08-25 热力图弹窗 meta 标签/内容：★标签 #1f2937、内容 #374151（浅一档形成区别） |
| 497 | CSS 分区 | 2026-08-25 记录行照片按钮（新版玻璃配方图标按钮，替代旧 glass-btn 26×26） |
| 503 | CSS 分区 | 2026-08-27 性能优化：去掉 backdrop-filter（图标按钮小而多，blur 无视觉意义） |
| 521 | CSS 分区 | 深色模式下的输入框聚焦效果 |
| 526 | CSS 分区 | 深色模式下的模态框背景优化 |
| 623 | CSS 分区 | 图标动画 |
| 638 | CSS 分区 | 帧率显示（顶栏右侧，v1.4.10.2 美化：胶囊形 + 深色适配） |
| 675 | CSS 分区 | 标题动画 |
| 678 | CSS 分区 | 顶栏标题 = 全 App 最大标题（不受移动端 h1 覆盖） |
| 689 | CSS 分区 | v1.4.12.9：顶栏标题可编辑——铅笔图标提示（浅色深灰/暗色浅灰，hover 变主色） |
| 690 | CSS 分区 | v1.0.7.7 徒步足迹热力图：红色渐变 + 日历式月视图 |
| 691 | CSS 分区 | 2026-09-03 年月单框（替代两个下拉 select）+ 选择弹窗（年份 chips + 月份 12 格） |
| 692 | CSS 分区 | 2026-09-04 .hm-ym-btn 死 CSS 已删（年月框改 glass-btn 同款） |
| 724 | CSS 分区 | 2026-09-03 选中=玻璃配方（同 hcm-item.sel 定稿：半透明靛蓝透底+细描边+blur，禁纯色实底） |
| 741 | CSS 分区 | 2026-09-16 修复：原无下间距 → 月份网格与取消/确定贴在一起 |
| 810 | CSS 分区 | v1.1.2.10 红格子玻璃化：半透明红玻璃 + 红细描边 + 深红字 |
| 822 | CSS 分区 | 底部留出悬浮底栏的高度；min-height:100vh 含 padding，内容不足一屏时页面恰好一屏不滚动 |
| 824 | CSS 分区 | 2026-08-27 五项优化：键盘弹出时列表平滑让位（与搜索框 bottom 0.25s 过渡同步，消除瞬跳） |
| 832 | CSS 分区 | 底部悬浮液态玻璃导航栏 |
| 877 | CSS 分区 | 内容不贴屏幕边（折叠屏展开后屏幕变宽，贴边会显得局促） |
| 882 | CSS 分区 | 2026-08-25 iPad/大屏适配（仅 ≥1024px 生效，手机布局零影响）：内容限宽居中 + 底栏不拉伸 |
| 887 | CSS 分区 | 2026-09-03 iOS/桌面网页适配：搜索条不再贴满全屏宽度，与内容同宽居中 |
| 891 | CSS 分区 | 悬浮固定：始终位于屏幕下方，不随内容滚动 |
| 893 | CSS 分区 | 2026-08-14 iPhone 适配：底部安全区（home 指示条）避开 |
| 903 | CSS 分区 | 2026-08-23 v10 用户定稿：干净透明玻璃（无弧带/无色散）+ 浮动 + 玻璃边 |
| 904 | CSS 分区 | 2026-08-26 浅色模式可见性微调：白背景上 0.08 几乎不可见 → 0.2（一点点，不厚重） |
| 909 | CSS 分区 | 2026-08-25 底栏底部阴影删除（用户要求）：去掉外投影，仅留底部内描边 |
| 942 | CSS 分区 | 文字强制横向显示，绝不竖排 |
| 959 | CSS 分区 | 底栏图标点击弹跳动画 |
| 970 | CSS 分区 | 2026-08-19 v1.1.0.3 底栏拖动果冻质感：拖动中按钮弹性形变 + 相邻粘连拉扯 + 松手确认弹跳 |
| 993 | CSS 分区 | 2026-08-23 v13 激活按钮：浅色下可见的靛蓝框 + 微亮背景（按到哪框到哪） |
| 1000 | CSS 分区 | v10 深色干净透明玻璃 |
| 1003 | CSS 分区 | 2026-08-25 底栏底部阴影删除（与浅色一致） |
| 1016 | CSS 分区 | 设置页 - 关于卡片 |
| 1081 | CSS 分区 | 图标：display:block 消除 inline 基线下沉缝隙；vertical-align 兜底防继承别的对齐 |
| 1090 | CSS 分区 | 2026-09-01 徒步年资行 |
| 1112 | CSS 分区 | 设置页 - 分组卡片（v1.4.10.1 设置页优化） |
| 1124 | CSS 分区 | 卡片内开关行间距（v1.4.10.3 优化：避免开关行挤在一起） |
| 1159 | CSS 分区 | 2026-08-12 同步状态 i 标识：同步中旋转动画 |
| 1168 | CSS 分区 | 2026-08-12 同步状态弹窗行样式 |
| 1190 | CSS 分区 | 设置页 - 杂项开关列表 |
| 1226 | CSS 分区 | 液态玻璃开关 |
| 1301 | CSS 分区 | 设置页 - 数据同步（WebDAV） |
| 1302 | CSS 分区 | 2026-09-03 P1 同步健康行：玻璃格 + 状态圆点（绿/黄/红/灰），点击弹原状态弹窗 |
| 1303 | CSS 分区 | 2026-09-03 数据管理说明弹窗分组条目（i 标识弹窗排版统一：图标+标题+小字，深浅自适应） |
| 1345 | CSS 分区 | 2026-09-23 政策正文内联系方式链接（此前无规则 → 浏览器默认蓝，深色下几乎不可读） |
| 1398 | CSS 分区 | 2026-09-18 同步状态两行四维（网盘数据/图片 · 徒步计划/徒步记录） |
| 1425 | CSS 分区 | 2026-09-17 入口改造：账号卡圆点 + 绑定弹窗内「选网盘」卡片 / 步骤条 / 提示 |
| 1512 | CSS 分区 | 2026-09-17 备份含配置：导出弹窗勾选行 + 导入询问弹窗提示条 |
| 1541 | CSS 分区 | ① 数字框右侧的原生上下箭头（桌面 hover / 聚焦时出现） |
| 1548 | CSS 分区 | ② 密码框的原生「显示密码」小眼睛（Edge ::-ms-reveal / 旧 IE ::-ms-clear） |
| 1701 | CSS 分区 | 2026-08-12 清理：.sync-status 状态行样式已删（改为自动同步 i 标识） |
| 1703 | CSS 分区 | 下载恢复 - 备份文件选择列表 |
| 1756 | CSS 分区 | v1.1.2.7 列表箭头深浅适配 |
| 1763 | CSS 分区 | 列表滚动条 |
| 1772 | CSS 分区 | 液态玻璃面板 |
| 1774 | CSS 分区 | 2026-09-02 灵动：玻璃卡片降透明（0.10→0.05）让背景流光透上来；深色模式不变量仍走 var |
| 1780 | CSS 分区 | 2026-08-10 清理：删除被覆盖的旧 transition（死代码） |
| 1784 | CSS 分区 | 导入/导出弹窗 - 液态玻璃样式（亮暗自适应） |
| 1787 | CSS 分区 | 弹窗取消按钮 - 跟随 App 主题的液态玻璃 |
| 1789 | CSS 分区 | 2026-08-20 v1.1.0.3 玻璃弹窗文字深浅自适应（修复浅色模式下白色文字看不见） |
| 1797 | CSS 分区 | 深色模式玻璃面板 |
| 1810 | CSS 分区 | 2026-09-04 首次引导横幅深色适配（文案用亮灰系，不吃 glass-panel 白字默认） |
| 1843 | CSS 分区 | 2026-08-12 记录/计划页"总计"徽标：样式同柱状图右上角，颜色深浅色自适应（浅色深灰/暗色白） |
| 1852 | CSS 分区 | 玻璃统计卡片 |
| 1854 | CSS 分区 | 2026-09-02 灵动：统计卡降透明（0.10→0.05）同 glass-panel 让光斑透上来 |
| 1866 | CSS 分区 | 2026-09-02 已删：玻璃卡片点击光划过扫描光效（用户要求移除） |
| 1874 | CSS 分区 | 玻璃卡片彩色左边框 |
| 1887 | CSS 分区 | 2026-09-03 A 布局：统计矮副卡（平均海拔/平均难度/平均用时）——主卡同款玻璃 + 左侧色条点缀 |
| 1914 | CSS 分区 | 2026-09-15 里程碑入口卡：与矮副卡同款 fadeInUp 渐入，delay 接力排在它们之后 |
| 1955 | CSS 分区 | 2026-09-06 概览统计单位统一样式（与「次」一致：小号/半透/基线对齐，主卡副卡通用） |
| 1963 | CSS 分区 | 顶栏固定样式 - 液态玻璃，延伸到状态栏顶部 |
| 1964 | CSS 分区 | 顶栏降低：更紧凑和谐 |
| 1989 | CSS 分区 | 2026-08-27 底栏上方（底栏 bottom 14px + 高 ~66px）+ 40px 间距（用户要求再高一点） |
| 2000 | CSS 分区 | 2026-08-27 bottom 也过渡：键盘收起后平滑滑回默认位置（而非跳变） |
| 2012 | CSS 分区 | 2026-08-27 更窄：320 → 260px |
| 2054 | CSS 分区 | 深色模式：与 dark-mode glass-panel 同款（深蓝玻璃） |
| 2068 | CSS 分区 | 底部保留悬浮底栏空间，滚动到底不被遮挡 |
| 2152 | CSS 分区 | 标题图标比文字稍大 |
| 2157 | CSS 分区 | 表格布局 |
| 2161 | CSS 分区 | 2026-09-04 阅读态 v2：宽屏给个舒适最小宽，避免极窄内容时表太贴边 |
| 2168 | CSS 分区 | 表格单元格垂直对齐 |
| 2176 | CSS 分区 | 操作列居中 |
| 2242 | CSS 分区 | 2026-09-01 自定义日期时间选择弹窗（替换系统原生 picker，统一玻璃设计语言） |
| 2289 | CSS 分区 | 2026-09-05 优化②：.dtp-cell.other 死 CSS 已删（日期弹窗不再渲染 other 月格） |
| 2291 | CSS 分区 | 2026-09-03 选中改玻璃（用户统一要求；小格沿用无 blur 性能约定）：半透明靛蓝透底+细描边，字转靛蓝 |
| 2311 | CSS 分区 | 2026-09-16：与下方取消/确定拉开（4→12） |
| 2314 | CSS 分区 | v3 时/分步进器（- 数字 +）：替代 select，避免原生全屏列表 |
| 2340 | CSS 分区 | 2026-09-01 心情/天气选择弹窗（替换原生 select，统一玻璃设计语言，与日期选择器同款选中态） |
| 2373 | CSS 分区 | 2026-09-03 选中改玻璃（同 dtp-cell）：半透明靛蓝透底+细描边，字转靛蓝 |
| 2386 | CSS 分区 | 2026-09-16 修复：下方间距原为 0 →「清空」与「取消/确定」贴在一起（真机上看着像重合） |

## www/app-modal.css（2586 行）

### 样式分区（改样式先跳到这里）

| 行 | 类型 | 名称 |
|---|---|---|
| 7 | CSS 分区 | 2026-09-04 难度选择弹窗（替换原生 select）：色点 + 档名卡，选中靛蓝玻璃同心情/天气 |
| 12 | CSS 分区 | 2026-09-16 五项优化：与下方取消/确定拉开（6→12，同心情/天气弹窗） |
| 94 | CSS 分区 | 移动端输入框优化 |
| 126 | CSS 分区 | 确保输入框在iframe中也能正常工作（.input-with-search 已随行内编辑废弃删除） |
| 133 | CSS 分区 | 2026-08-27 五项优化：placeholder 与全 App 输入框统一（原 #999 + 4 个旧前缀冗余块） |
| 186 | CSS 分区 | 图标美化 |
| 192 | CSS 分区 | 标题山峰图标动画 |
| 242 | CSS 分区 | 详情弹窗阅读态深色适配（内容用内联色，此处按 class 覆盖） |
| 251 | CSS 分区 | 2026-09-06 小日记（记录弹窗 view 卡）：浅色加深一档、深色模式提亮（图标/标签/正文全套） |
| 256 | CSS 分区 | 2026-09-04 照片标签下注「最多 24 张」小字（浅色深一档可读，dark 提亮同 lab） |
| 264 | CSS 分区 | 2026-09-05 P1-⑦ 计划过期红标（列表行名称旁） |
| 284 | CSS 分区 | 2026-09-07 计划状态徽章扩展：今天（靛蓝，与日历今天强调同系）/ 明天（天蓝）——与过期红标同配方 |
| 427 | CSS 分区 | 清掉 message 内部最后一段的下距，避免与按钮组上距叠加成 32px |
| 470 | CSS 分区 | 空状态动画 |
| 484 | CSS 分区 | 模态框按钮动画 |
| 501 | CSS 分区 | 统计卡片动画 |
| 540 | CSS 分区 | 表格行动画 |
| 547 | CSS 分区 | 2026-09-01 记录列表按年份分组标题行 v2（图标+年份+次数+分隔线，深浅色自适应） |
| 609 | CSS 分区 | 按钮点击动画 |
| 649 | CSS 分区 | 全局动效设计 |
| 651 | CSS 分区 | 1. 按钮涟漪效果 |
| 660 | CSS 分区 | 点击效果已移除：无缩放、无波纹，保持静态 |
| 671 | CSS 分区 | 2. 图标脉动动画增强（周期放慢降低 GPU 占用） |
| 708 | CSS 分区 | 4. 表格行高级动画 |
| 717 | CSS 分区 | 5. 模态框高级动画 |
| 740 | CSS 分区 | 2026-08-27 弹窗淡出关闭已取消（用户要求直接关），modal-closing CSS 一并删除 |
| 742 | CSS 分区 | 提示类弹窗（保存路径/成功/失败）淡入淡出动画 |
| 747 | CSS 分区 | transform 始终只含 translateX(-50%)，与内联定位一致，杜绝二次偏移 |
| 751 | CSS 分区 | toast 玻璃浅色（不透明度过高，液态玻璃质感） |
| 758 | CSS 分区 | 2026-08-26 限宽收窄到原 75%（min(69vw,360px)）：长文案两行，更紧凑好看 |
| 768 | CSS 分区 | 2026-08-23 v16 toast 严格统一：纯透明玻璃 + 彩色细边 + 主题字色 |
| 818 | CSS 分区 | 6. 输入框聚焦动画 |
| 897 | CSS 分区 | 10. 微交互动画 |
| 899 | CSS 分区 | 2026-09-04 视图说明小标题 + 切换按钮文字 |
| 958 | CSS 分区 | 玻璃按钮 |
| 1024 | CSS 分区 | 四角微光（柔和，不刺眼）：高亮均匀分布在按钮四角 |
| 1046 | CSS 分区 | 11. 数字滚动动画 |
| 1063 | CSS 分区 | 12. 难度徽章动画 |
| 1066 | CSS 分区 | 16. 空状态动画增强 |
| 1093 | CSS 分区 | 21. 进度条动画 |
| 1157 | CSS 分区 | Firefox：同款细玻璃滚动条 |
| 1165 | CSS 分区 | 2026-09-03 小弹窗内滚动容器：同玻璃滑块色，收窄 6px 更精致（thumb/track 继承全局玻璃） |
| 1175 | CSS 分区 | 25. 页面过渡动画 |
| 1206 | CSS 分区 | 30. 脉冲波纹动画 |
| 1232 | CSS 分区 | 统计卡片彩色左边框恢复（在统一边框之上） |
| 1235 | CSS 分区 | 2026-08-25 总里程/总用时卡片 accent（与上面四色同体系） |
| 1238 | CSS 分区 | 徒步/计划表格（阅读态 v2） |
| 1275 | CSS 分区 | 全局字重微调（稍微粗一点点） |
| 1314 | CSS 分区 | 2026-09-02 v3 明显+广+流动：52→70vw，透明度 0.20→0.30 |
| 1321 | CSS 分区 | 2026-09-02 v3 右下淡粉继续加大：58→76vw，透明度 0.16→0.26 |
| 1328 | CSS 分区 | 2026-09-02 v3 中上青：38→54vw，透明度 0.13→0.22 |
| 1343 | CSS 分区 | 2026-09-02 v3 三点折返轨迹（0/50/100% 不同方位+缩放起伏）+ 速度加快，走起来是蜿蜒流动 |
| 1359 | CSS 分区 | 2026-09-02 年度回顾全屏页（玻璃质感，独立页面 feel） |
| 1434 | CSS 分区 | 2026-09-03 深色弹窗下头部文字转浅（卡片换深玻璃 0.32 后深字不可见） |
| 1446 | CSS 分区 | 2026-09-03 P3 定稿（用户示例版）：6 指标 3 列网格 + 文本面板（无月度柱状） |
| 1487 | CSS 分区 | 对比版：去年划线值 + 今年值 + 增幅 同一行（示例版式） |
| 1526 | CSS 分区 | 文本面板（今年=年度之最 / 对比=一年小结） |
| 1593 | CSS 分区 | 2026-09-03 P3 点亮态改玻璃质感（同 check-go-btn 配方：透底+实描边+主色字，非纯色实底） |
| 1609 | CSS 分区 | 2026-09-03 P0 定稿：行内复制条已移除（复制改走「＋添加」弹窗）；仅保留填充高亮 |
| 1610 | CSS 分区 | 复制填充后：编辑行输入框常驻靛蓝描边 + 浅底（保存/取消/翻页重渲染后自然消失） |
| 1621 | CSS 分区 | 2026-09-03 「＋添加」下拉条内嵌展开形态：收起只一条栏，点开展开（直接新建置顶 + 最近记录），选即执行 |
| 1714 | CSS 分区 | 2026-09-03 v3：「直接新建」独立整行（靛蓝玻璃行卡，不藏进下拉） |
| 1818 | CSS 分区 | 2026-09-03 防弹窗宽度抖动：滚动槽常驻，滚动条出现/消失不影响弹窗宽度 |
| 1820 | CSS 分区 | 2026-09-03 iOS 适配：弹窗内滚动到边界不连带页面滚动 |
| 1843 | CSS 分区 | 2026-09-03 选中改玻璃质感（同「和去年比」点亮配方：靛蓝透底+实描边+主色字，非纯色实底） |
| 1850 | CSS 分区 | 2026-09-03 v3：单选指示圆点（未选空心灰圈 / 选中靛蓝实心+内白环，非按钮形态） |
| 1936 | CSS 分区 | 「用这条填充」按钮禁用态（同 dtp/mwp 主按钮视觉体系） |
| 2024 | CSS 分区 | 2026-09-03 .mb-card.open 只做高亮态，布局由 .mb-drawer 承担（卡头留在原列） |
| 2078 | CSS 分区 | 2026-09-03 集章序号圆章（C+B 方案）：按首登先后 01/02/03…，像册子盖满章 |
| 2118 | CSS 分区 | 2026-09-03 次数点阵已按用户要求删除：卡上只留 圆章 + 山名 |
| 2144 | CSS 分区 | 2026-09-03 P0 山册照片回忆：抽屉里横排滑动这座山的全部照片，点照片进灯箱 |
| 2183 | CSS 分区 | 2026-09-03 照片横排带横向滚动条：收 4px 超细玻璃条（滑块继承全局玻璃灰蓝 + 透明轨道） |
| 2226 | CSS 分区 | 2026-09-03 记录行（时间+↗）与照片角标已按用户要求删除：日期只在照片带标题「N 张 · MM-DD」汇总 |
| 2254 | CSS 分区 | 添加按钮 |
| 2256 | CSS 分区 | 2026-09-10 补 border-red-500：原 Tailwind 类从未编译 → 标题为空时输入框无红边反馈 |
| 2262 | CSS 分区 | 山册「连接器」弹窗（2026-10-10 深色适配 + 选择框更明显） |
| 2319 | CSS 分区 | 深色模式：连接器弹窗文字/列表/输入框提亮 |
| 2342 | CSS 分区 | 山册抽屉「连接到另一座山」按钮深色提亮 |
| 2344 | CSS 分区 | 三按钮（取消/断开/保存）窄屏换行 |

## www/app-form.css（1324 行）

### 样式分区（改样式先跳到这里）

| 行 | 类型 | 名称 |
|---|---|---|
| 1119 | CSS 分区 | ≤300px 真·超窄屏（折叠屏外屏实测 260~300px）—— 其余规则都只在这里生效 |
| 1127 | CSS 分区 | 矮卡 1 列（超窄屏下列宽不足以放 4 字标签） |
| 1134 | CSS 分区 | 同步状态文案允许折行，不再截断 |
| 1170 | CSS 分区 | 「已绑定」卡内的横向行（文字 + 网盘信息/解绑）允许换行（260px 下按钮落到第二行） |
| 1182 | CSS 分区 | 概览 4 主卡：标签 13→12px、图标 24→18px（实测仅 ≤260px 时「总记录数」折行） |

## www/app-core.js（1867 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 174 | 187 | 14 | `changelogPalette()` |
| 188 | 224 | 37 | `renderChangelogBody()` |
| 225 | 275 | 51 | `showChangelogModal()` |
| 276 | 289 | 14 | `push()` |
| 290 | 323 | 34 | `persistCrashEntry()` |
| 324 | 329 | 6 | `exportDiagnostics()` |
| 330 | 428 | 99 | `save()` |
| 429 | 435 | 7 | `encPwd()` |
| 436 | 464 | 29 | `decPwd()` |
| 465 | 488 | 24 | `cleanupResources()` |
| 489 | 509 | 21 | `cleanupEventListeners()` |
| 510 | 521 | 12 | `notifyGlobalError()` |
| 522 | 548 | 27 | `jsErrorToChinese()` |
| 549 | 579 | 31 | `extractErrMsg()` |
| 580 | 615 | 36 | `logSilentAppError()` |
| 616 | 646 | 31 | `updateFPS()` |
| 647 | 656 | 10 | `startFPSMonitor()` |
| 657 | 664 | 8 | `stopFPSMonitor()` |
| 665 | 686 | 22 | `applyFpsPreference()` |
| 687 | 834 | 148 | `applySchemaMigrations()` |
| 835 | 835 | 1 | `getPageSize()` |
| 836 | 838 | 3 | `getSyncMaxFiles()` |
| 839 | 850 | 12 | `getPhotoOpts()` |
| 851 | 902 | 52 | `renderRemoteNotice()` |
| 903 | 988 | 86 | `renderDebugCard()` |
| 989 | 1033 | 45 | `applyRemoteTexts()` |
| 1034 | 1034 | 1 | `hideUnsupportedSettings()` |
| 1035 | 1071 | 37 | `hideById()` |
| 1072 | 1075 | 4 | `safeGetElementById()` |
| 1076 | 1085 | 10 | `safeSetElementContent()` |
| 1086 | 1098 | 13 | `safeSetElementStyle()` |
| 1099 | 1107 | 9 | `generateShareCard()` |
| 1108 | 1134 | 27 | `drawShareRow()` |
| 1135 | 1135 | 1 | `moodText()` |
| 1136 | 1240 | 105 | `weatherText()` |
| 1241 | 1244 | 4 | `isIOSWebview()` |
| 1245 | 1277 | 33 | `shareCardImage()` |
| 1278 | 1289 | 12 | `generateId()` |
| 1290 | 1311 | 22 | `photoDBOpen()` |
| 1312 | 1323 | 12 | `photoDBTx()` |
| 1324 | 1328 | 5 | `photoPut()` |
| 1329 | 1331 | 3 | `photoGet()` |
| 1332 | 1334 | 3 | `photoDelete()` |
| 1335 | 1337 | 3 | `photoGetAll()` |
| 1338 | 1343 | 6 | `photoDeleteMany()` |
| 1344 | 1356 | 13 | `photoCollectOrphans()` |
| 1357 | 1368 | 12 | `photoCountOrphans()` |
| 1369 | 1375 | 7 | `photoGetUsage()` |
| 1376 | 1383 | 8 | `photosEnabled()` |
| 1384 | 1388 | 5 | `photoSizeParts()` |
| 1389 | 1392 | 4 | `photoSizeText()` |
| 1393 | 1396 | 4 | `photoOverLimit()` |
| 1397 | 1474 | 78 | `openPhotoUsageDetailModal()` |
| 1475 | 1496 | 22 | `bindPhotoUsageRow()` |
| 1497 | 1508 | 12 | `refreshPhotoUsage()` |
| 1509 | 1544 | 36 | `confirmDeleteOrphanPhotos()` |
| 1545 | 1557 | 13 | `ensurePhotoInput()` |
| 1558 | 1573 | 16 | `pickPhoto()` |
| 1574 | 1600 | 27 | `pickPhotos()` |
| 1601 | 1630 | 30 | `compressImage()` |
| 1631 | 1638 | 8 | `blobToDataURL()` |
| 1639 | 1657 | 19 | `dataURLToBlob()` |
| 1658 | 1685 | 28 | `_createToast()` |
| 1686 | 1694 | 9 | `dismiss()` |
| 1695 | 1695 | 1 | `showErrorMessage()` |
| 1696 | 1696 | 1 | `showInfoMessage()` |
| 1697 | 1704 | 8 | `showSuccessMessage()` |
| 1705 | 1718 | 14 | `showSystemNotification()` |
| 1719 | 1726 | 8 | `isDarkModeActive()` |
| 1727 | 1759 | 33 | `applyThemeMode()` |
| 1760 | 1774 | 15 | `setThemeMode()` |
| 1775 | 1784 | 10 | `saveThemeMode()` |
| 1785 | 1787 | 3 | `initSystemThemeListener()` |
| 1788 | 1813 | 26 | `handler()` |
| 1814 | 1818 | 5 | `getDifficultyColor()` |
| 1819 | 1824 | 6 | `getDifficultyColorDark()` |
| 1825 | 1832 | 8 | `formatDuration()` |
| 1833 | 1850 | 18 | `formatDateTime()` |
| 1851 | 1867 | 17 | `formatDateTimeLocal()` |

## www/app-data.js（423 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 7 | 10 | 4 | `lowerText()` |
| 11 | 16 | 6 | `yearKeyOf()` |
| 17 | 63 | 47 | `getSortedRecords()` |
| 64 | 73 | 10 | `clearGlobalSearchQuery()` |
| 74 | 79 | 6 | `initGlobalSearch()` |
| 80 | 87 | 8 | `setBarVisible()` |
| 88 | 92 | 5 | `isSearchUnavailableView()` |
| 93 | 129 | 37 | `pokeSearchBar()` |
| 130 | 172 | 43 | `syncSearchAndRefresh()` |
| 173 | 175 | 3 | `stopSearchPoll()` |
| 176 | 197 | 22 | `startSearchPoll()` |
| 198 | 201 | 4 | `applySearchOffset()` |
| 202 | 223 | 22 | `clearSearchOffset()` |
| 224 | 237 | 14 | `ensureFocusedInputVisible()` |
| 238 | 297 | 60 | `applyKeyboardOffset()` |
| 298 | 423 | 126 | `renderTable()` |

## www/app-data-detail.js（572 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 15 | 24 | 10 | `closeRecordDetailModal()` |
| 25 | 28 | 4 | `rdDifficultyColor()` |
| 29 | 32 | 4 | `rdDifficultyColorDeep()` |
| 33 | 38 | 6 | `diffLabel()` |
| 39 | 77 | 39 | `recordViewBodyHTML()` |
| 78 | 125 | 48 | `recordEditBodyHTML()` |
| 126 | 168 | 43 | `openRecordDetailModal()` |
| 169 | 203 | 35 | `bindRecordDetailEvents()` |
| 204 | 226 | 23 | `bindEditBody()` |
| 227 | 309 | 83 | `attachEventListeners()` |
| 310 | 316 | 7 | `toggleBatchMode()` |
| 317 | 324 | 8 | `toggleBatchSelect()` |
| 325 | 334 | 10 | `updateBatchBar()` |
| 335 | 341 | 7 | `exitBatchMode()` |
| 342 | 377 | 36 | `deleteBatchSelected()` |
| 378 | 383 | 6 | `togglePlannedBatchMode()` |
| 384 | 390 | 7 | `togglePlannedBatchSelect()` |
| 391 | 400 | 10 | `updatePlannedBatchBar()` |
| 401 | 406 | 6 | `exitPlannedBatchMode()` |
| 407 | 433 | 27 | `deletePlannedBatchSelected()` |
| 434 | 441 | 8 | `startEdit()` |
| 442 | 469 | 28 | `cancelEdit()` |
| 470 | 500 | 31 | `photoThumbsHTML()` |
| 501 | 512 | 12 | `thumbCachePut()` |
| 513 | 519 | 7 | `thumbCacheClear()` |
| 520 | 539 | 20 | `loadPhotoThumbs()` |
| 540 | 561 | 22 | `addPhotosToEdit()` |
| 562 | 572 | 11 | `refreshPhotoStrip()` |

## www/app-data-lightbox.js（1683 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 9 | 115 | 107 | `ensureLightbox()` |
| 116 | 132 | 17 | `lbApplyTransform()` |
| 133 | 136 | 4 | `lbResetZoom()` |
| 137 | 141 | 5 | `lbToggleZoom()` |
| 142 | 177 | 36 | `openPhotoLightbox()` |
| 178 | 186 | 9 | `lbStep()` |
| 187 | 197 | 11 | `preloadLbNeighbors()` |
| 198 | 230 | 33 | `lbLoadImg()` |
| 231 | 296 | 66 | `closePhotoLightbox()` |
| 297 | 304 | 8 | `lbPrimaryAction()` |
| 305 | 333 | 29 | `lbAddPhoto()` |
| 334 | 360 | 27 | `lbDeleteCurrent()` |
| 361 | 379 | 19 | `closeModal()` |
| 380 | 410 | 31 | `saveCurrentPhoto()` |
| 411 | 504 | 94 | `openDateTimePicker()` |
| 505 | 529 | 25 | `renderDtpNav()` |
| 530 | 583 | 54 | `openDifficultyPicker()` |
| 584 | 635 | 52 | `openMoodWeatherPicker()` |
| 636 | 664 | 29 | `renderDtpGrid()` |
| 665 | 672 | 8 | `renderDtpTime()` |
| 673 | 749 | 77 | `saveRecord()` |
| 750 | 769 | 20 | `showFirstRecordTip()` |
| 770 | 800 | 31 | `renderFirstRecordTipCard()` |
| 801 | 812 | 12 | `handleSort()` |
| 813 | 834 | 22 | `updateSortIcons()` |
| 835 | 859 | 25 | `showEditTitleModal()` |
| 860 | 875 | 16 | `closeModal()` |
| 876 | 890 | 15 | `saveAppTitle()` |
| 891 | 931 | 41 | `showDataInfoModal()` |
| 932 | 938 | 7 | `closeModal()` |
| 939 | 1022 | 84 | `showDisclaimerModal()` |
| 1023 | 1027 | 5 | `getLegalAgreement()` |
| 1028 | 1032 | 5 | `hasAgreedLegal()` |
| 1033 | 1038 | 6 | `saveLegalAgreement()` |
| 1039 | 1047 | 9 | `formatLegalStamp()` |
| 1048 | 1123 | 76 | `showLegalConsentModal()` |
| 1124 | 1135 | 12 | `maybePromptLegalConsent()` |
| 1136 | 1220 | 85 | `showPrivacyPolicyModal()` |
| 1221 | 1226 | 6 | `closeModal()` |
| 1227 | 1229 | 3 | `saveSupportQr()` |
| 1230 | 1232 | 3 | `hasBridge()` |
| 1233 | 1240 | 8 | `saveBase64()` |
| 1241 | 1248 | 8 | `isIOSWeb()` |
| 1249 | 1272 | 24 | `webDownload()` |
| 1273 | 1290 | 18 | `showSupportModal()` |
| 1291 | 1318 | 28 | `toStep2()` |
| 1319 | 1347 | 29 | `showDeleteConfirmModal()` |
| 1348 | 1365 | 18 | `closeModal()` |
| 1366 | 1388 | 23 | `deleteRecord()` |
| 1389 | 1413 | 25 | `addNewRecord()` |
| 1414 | 1433 | 20 | `fillAboutSince()` |
| 1434 | 1510 | 77 | `renderOnThisDay()` |
| 1511 | 1570 | 60 | `renderBackupHint()` |
| 1571 | 1595 | 25 | `updateStatistics()` |
| 1596 | 1683 | 88 | `updateWithAnimation()` |

## www/app-data-heatmap.js（305 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 27 | 30 | 4 | `updateHmYmBtn()` |
| 31 | 37 | 7 | `bindHeatmapEvents()` |
| 38 | 110 | 73 | `openHmYmPicker()` |
| 111 | 127 | 17 | `initHeatmap()` |
| 128 | 140 | 13 | `getRecordYears()` |
| 141 | 158 | 18 | `getRecordMonths()` |
| 159 | 222 | 64 | `renderHeatmap()` |
| 223 | 305 | 83 | `showHeatmapDayDetail()` |

## www/app-data-plans.js（1629 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 9 | 66 | 58 | `getSortedPlannedTrips()` |
| 67 | 93 | 27 | `applyPlansView()` |
| 94 | 115 | 22 | `togglePlansView()` |
| 116 | 121 | 6 | `calendarPrevMonth()` |
| 122 | 128 | 7 | `calendarNextMonth()` |
| 129 | 138 | 10 | `fmtPlanDateKey()` |
| 139 | 227 | 89 | `renderPlannedCalendar()` |
| 228 | 240 | 13 | `planDayDiff()` |
| 241 | 246 | 6 | `planIsDueOrOverdue()` |
| 247 | 258 | 12 | `planRelBadgeHtml()` |
| 259 | 328 | 70 | `renderCalMonthDetail()` |
| 329 | 407 | 79 | `renderCalDayDetail()` |
| 408 | 414 | 7 | `yrSetCompare()` |
| 415 | 452 | 38 | `initYearReview()` |
| 453 | 470 | 18 | `openYearReview()` |
| 471 | 476 | 6 | `closeYearReview()` |
| 477 | 479 | 3 | `yearRecordsOf()` |
| 480 | 536 | 57 | `calcYearStats()` |
| 537 | 540 | 4 | `yrBig()` |
| 541 | 544 | 4 | `yrCard()` |
| 545 | 564 | 20 | `yrChgTxt()` |
| 565 | 568 | 4 | `yrCmpVal()` |
| 569 | 577 | 9 | `yrDurParts()` |
| 578 | 589 | 12 | `yrGridSingle()` |
| 590 | 603 | 14 | `yrGridCompare()` |
| 604 | 608 | 5 | `yrTabHtml()` |
| 609 | 613 | 5 | `yrSummaryText()` |
| 614 | 668 | 55 | `pick()` |
| 669 | 681 | 13 | `renderYearCompare()` |
| 682 | 698 | 17 | `renderYearReview()` |
| 699 | 708 | 10 | `fmtYMD()` |
| 709 | 767 | 59 | `initRecordsView()` |
| 768 | 812 | 45 | `applyRecordsView()` |
| 813 | 815 | 3 | `mtnMerges()` |
| 816 | 823 | 8 | `mtnKeyOf()` |
| 824 | 830 | 7 | `mtnLabelOf()` |
| 831 | 840 | 10 | `mtnAllKeys()` |
| 841 | 859 | 19 | `mtnMergeRowHtml()` |
| 860 | 938 | 79 | `openMtnMergeDialog()` |
| 939 | 948 | 10 | `syncMtnDrawerTitles()` |
| 949 | 976 | 28 | `renderMountainBook()` |
| 977 | 1013 | 37 | `firstAt()` |
| 1014 | 1014 | 1 | `renderMountainCard()` |
| 1015 | 1015 | 1 | `statCell()` |
| 1016 | 1106 | 91 | `cmpSet()` |
| 1107 | 1126 | 20 | `confirmWipeAllData()` |
| 1127 | 1145 | 19 | `wipeConfirmSecond()` |
| 1146 | 1182 | 37 | `wipeAllDataExecute()` |
| 1183 | 1192 | 10 | `historyCopySources()` |
| 1193 | 1280 | 88 | `handleAddRecordFlow()` |
| 1281 | 1298 | 18 | `addRecordFromHistory()` |
| 1299 | 1300 | 2 | `applyCopyFillToForm()` |
| 1301 | 1324 | 24 | `setVal()` |
| 1325 | 1336 | 12 | `markCopyFilled()` |
| 1337 | 1372 | 36 | `maybeShowOverdueCare()` |
| 1373 | 1411 | 39 | `checkPlannedTripReminders()` |
| 1412 | 1430 | 19 | `syncPlanAlarmsBridge()` |
| 1431 | 1565 | 135 | `renderPlannedTripsTable()` |
| 1566 | 1629 | 64 | `attachPlannedTripsEventListeners()` |

## www/app-data-plan-detail.js（911 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 9 | 16 | 8 | `closePlannedDetailModal()` |
| 17 | 37 | 21 | `plannedViewBodyHTML()` |
| 38 | 56 | 19 | `plannedEditBodyHTML()` |
| 57 | 86 | 30 | `openPlannedDetailModal()` |
| 87 | 102 | 16 | `bindPlannedDetailEvents()` |
| 103 | 110 | 8 | `bindPlannedEditForm()` |
| 111 | 121 | 11 | `cancelPlannedEdit()` |
| 122 | 164 | 43 | `savePlannedTrip()` |
| 165 | 185 | 21 | `addNewPlannedTrip()` |
| 186 | 211 | 26 | `showCompleteOrDelayModal()` |
| 212 | 240 | 29 | `showConfirmCompleteModal()` |
| 241 | 258 | 18 | `closeModal()` |
| 259 | 296 | 38 | `markPlannedComplete()` |
| 297 | 315 | 19 | `spawnConfetti()` |
| 316 | 324 | 9 | `normalizePeakName()` |
| 325 | 356 | 32 | `milestoneProgress()` |
| 357 | 360 | 4 | `msReadIds()` |
| 361 | 363 | 3 | `msWriteIds()` |
| 364 | 364 | 1 | `msGetCelebrated()` |
| 365 | 365 | 1 | `msSetCelebrated()` |
| 366 | 366 | 1 | `msGetSeen()` |
| 367 | 368 | 2 | `msSetSeen()` |
| 369 | 380 | 12 | `getMilestoneDone()` |
| 381 | 388 | 8 | `normWeather()` |
| 389 | 438 | 50 | `milestoneStats()` |
| 439 | 471 | 33 | `checkMilestones()` |
| 472 | 477 | 6 | `showNextMilestoneCelebration()` |
| 478 | 518 | 41 | `showMilestoneCelebration()` |
| 519 | 533 | 15 | `renderMilestoneEntry()` |
| 534 | 543 | 10 | `initMilestoneEntry()` |
| 544 | 617 | 74 | `showMilestoneList()` |
| 618 | 653 | 36 | `showMilestoneSummary()` |
| 654 | 690 | 37 | `showPlanCompleteCelebration()` |
| 691 | 719 | 29 | `showDeletePlannedTripConfirmModal()` |
| 720 | 737 | 18 | `closeModal()` |
| 738 | 743 | 6 | `deletePlannedTrip()` |
| 744 | 756 | 13 | `handlePlannedTripSort()` |
| 757 | 773 | 17 | `updatePlannedSortIcons()` |
| 774 | 810 | 37 | `savePlannedTripsToStorage()` |
| 811 | 839 | 29 | `loadPlannedTripsFromStorage()` |
| 840 | 867 | 28 | `normalizeRecordFields()` |
| 868 | 901 | 34 | `saveToStorage()` |
| 902 | 911 | 10 | `maybeAutoUploadAfterChange()` |

## www/app-sync.js（2826 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 1 | 13 | 13 | `utf8ToBase64()` |
| 14 | 23 | 10 | `base64ToUtf8()` |
| 24 | 25 | 2 | `buildSyncFileName()` |
| 26 | 31 | 6 | `p()` |
| 32 | 45 | 14 | `buildSyncFileUrl()` |
| 46 | 55 | 10 | `loadSyncFilesIndex()` |
| 56 | 59 | 4 | `saveSyncFilesIndex()` |
| 60 | 65 | 6 | `getLatestSyncFileName()` |
| 66 | 82 | 17 | `recordSyncFile()` |
| 83 | 89 | 7 | `formatSyncFileLabel()` |
| 90 | 108 | 19 | `removeSyncFileFromIndex()` |
| 109 | 147 | 39 | `ensureSyncParentDirs()` |
| 148 | 197 | 50 | `loadSyncState()` |
| 198 | 247 | 50 | `refreshNotifyPermRow()` |
| 248 | 274 | 27 | `refreshSettingsUI()` |
| 275 | 286 | 12 | `scheduleSyncStatusRefresh()` |
| 287 | 296 | 10 | `versionGreater()` |
| 297 | 302 | 6 | `parseTagVersion()` |
| 303 | 303 | 1 | `esc()` |
| 304 | 314 | 11 | `escapeHtml()` |
| 315 | 344 | 30 | `fetchLatestRelease()` |
| 345 | 358 | 14 | `fetchLatestReleaseGuarded()` |
| 359 | 402 | 44 | `checkForUpdate()` |
| 403 | 438 | 36 | `autoCheckUpdateOnLaunch()` |
| 439 | 461 | 23 | `buildCrashReport()` |
| 462 | 499 | 38 | `maybeUploadCrashReport()` |
| 500 | 502 | 3 | `hasLocalApkFor()` |
| 503 | 505 | 3 | `rememberLocalApkTag()` |
| 506 | 509 | 4 | `clearLocalApkTag()` |
| 510 | 517 | 8 | `installLocalUpdate()` |
| 518 | 561 | 44 | `showUpdateModal()` |
| 562 | 629 | 68 | `startUpdate()` |
| 630 | 638 | 9 | `showLoadingToast()` |
| 639 | 643 | 5 | `hideLoadingToast()` |
| 644 | 656 | 13 | `updateLoadingToast()` |
| 657 | 679 | 23 | `renderSyncForm()` |
| 680 | 684 | 5 | `syncProviderOf()` |
| 685 | 699 | 15 | `renderSyncAccountCard()` |
| 700 | 715 | 16 | `syncBindUserSync()` |
| 716 | 737 | 22 | `pickSyncProvider()` |
| 738 | 743 | 6 | `closeSyncBindModal()` |
| 744 | 813 | 70 | `openSyncBindModal()` |
| 814 | 836 | 23 | `submitSyncBind()` |
| 837 | 848 | 12 | `showSyncInfoModal()` |
| 849 | 875 | 27 | `row()` |
| 876 | 896 | 21 | `unbindSyncAccount()` |
| 897 | 920 | 24 | `saveSyncConfigFromForm()` |
| 921 | 957 | 37 | `friendlySyncError()` |
| 958 | 1039 | 82 | `webdavRequest()` |
| 1040 | 1117 | 78 | `uploadSyncBackup()` |
| 1118 | 1159 | 42 | `downloadSyncBackup()` |
| 1160 | 1213 | 54 | `listSyncFilesFromCloud()` |
| 1214 | 1265 | 52 | `showRestoreFileModal()` |
| 1266 | 1313 | 48 | `doRestoreFromCloud()` |
| 1314 | 1401 | 88 | `mergeSyncBackup()` |
| 1402 | 1413 | 12 | `notifySyncFailure()` |
| 1414 | 1431 | 18 | `buildSyncConfigForBackup()` |
| 1432 | 1447 | 16 | `buildFullBackupPayload()` |
| 1448 | 1461 | 14 | `crc32()` |
| 1462 | 1497 | 36 | `zipStorePack()` |
| 1498 | 1502 | 5 | `app()` |
| 1503 | 1532 | 30 | `zipStoreUnpack()` |
| 1533 | 1538 | 6 | `bytesToDataURL()` |
| 1539 | 1548 | 10 | `uint8ToBase64()` |
| 1549 | 1555 | 7 | `buildBackupHTMLString()` |
| 1556 | 1556 | 1 | `pad2h()` |
| 1557 | 1557 | 1 | `diffDots()` |
| 1558 | 1558 | 1 | `fmtDtCN()` |
| 1559 | 1636 | 78 | `dayMarkCN()` |
| 1637 | 1657 | 21 | `buildFullBackupHTML()` |
| 1658 | 1665 | 8 | `blobToUint8()` |
| 1666 | 1705 | 40 | `buildFullBackupZip()` |
| 1706 | 1714 | 9 | `extractBackupData()` |
| 1715 | 1741 | 27 | `parseSyncFileBody()` |
| 1742 | 1759 | 18 | `restorePhotosFromPayload()` |
| 1760 | 1760 | 1 | `formatSyncTime()` |
| 1761 | 1765 | 5 | `p()` |
| 1766 | 1775 | 10 | `setSyncStatus()` |
| 1776 | 1806 | 31 | `updateSyncHealthRow()` |
| 1807 | 1834 | 28 | `setSyncBusy()` |
| 1835 | 1847 | 13 | `syncRelTime()` |
| 1848 | 1894 | 47 | `showSyncStatusModal()` |
| 1895 | 1901 | 7 | `closeModal()` |
| 1902 | 1941 | 40 | `renderSyncDimStatus()` |
| 1942 | 1976 | 35 | `autoCheckSyncConnection()` |
| 1977 | 2067 | 91 | `setupSyncEventListeners()` |
| 2068 | 2102 | 35 | `manageCloudBackups()` |
| 2103 | 2117 | 15 | `showSyncDemoModal()` |
| 2118 | 2232 | 115 | `closeOpenModals()` |
| 2233 | 2281 | 49 | `askConfirm()` |
| 2282 | 2359 | 78 | `showManageBackupsModal()` |
| 2360 | 2385 | 26 | `bindAutoCheckOnSettingsTab()` |
| 2386 | 2389 | 4 | `exportRecords()` |
| 2390 | 2444 | 55 | `showExportModal()` |
| 2445 | 2457 | 13 | `closeModal()` |
| 2458 | 2469 | 12 | `readBackupSyncOpts()` |
| 2470 | 2492 | 23 | `syncPwdToggle()` |
| 2493 | 2514 | 22 | `autoLocalBackupIfDue()` |
| 2515 | 2564 | 50 | `performBackupExport()` |
| 2565 | 2568 | 4 | `isFieldEmpty()` |
| 2569 | 2590 | 22 | `mergeRecordsWith()` |
| 2591 | 2613 | 23 | `showImportModal()` |
| 2614 | 2637 | 24 | `fadeOutModal()` |
| 2638 | 2684 | 47 | `importBackup()` |
| 2685 | 2708 | 24 | `importZipBackup()` |
| 2709 | 2746 | 38 | `importFullBackupPayload()` |
| 2747 | 2763 | 17 | `applySyncConfigFromBackup()` |
| 2764 | 2812 | 49 | `askRestoreSyncConfig()` |
| 2813 | 2826 | 14 | `importFullBackupPayloadWithConfigAsk()` |

## www/app-init.js（975 行）

### 顶层函数

| 起 | 止 | 行数 | 函数 |
|---|---|---|---|
| 7 | 7 | 1 | `resetGuideSeen()` |
| 8 | 21 | 14 | `loadGuideSeenState()` |
| 22 | 28 | 7 | `currentGuideCardId()` |
| 29 | 39 | 11 | `showTabGuides()` |
| 40 | 45 | 6 | `dismissGuide()` |
| 46 | 88 | 43 | `bindTabGuides()` |
| 89 | 415 | 327 | `init()` |
| 416 | 430 | 15 | `triggerHaptic()` |
| 431 | 436 | 6 | `setupEventListeners()` |
| 437 | 659 | 223 | `hapticClickHandler()` |
| 660 | 862 | 203 | `switchTab()` |
| 863 | 975 | 113 | `setTabDragVisual()` |

## www/sw.js（121 行）

---

> 只有**顶层**函数（缩进 ≤ 4）。要找嵌套/局部函数，用编辑器全文搜索更快。
> 行号基于生成时的版本；改动代码后重跑本工具即可刷新。