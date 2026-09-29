#!/usr/bin/env node
/**
 * tools/sitechangelog.js — 官网「更新日志」段自动同步（★2026-09-29 新增）
 *
 * 为什么需要它（用户 2026-09-29 原话）：
 *   「以后每次同步 app 和 github 以后，把官网也同步了，下载和更新日志那里。」
 *   —— 官网 `site/index.html` 的「09 更新日志」段原来是**手写的最近两版**，
 *      发版时极易忘记改，导致官网长期显示旧版本日志（用户一眼就看出没更新）。
 *
 * 数据来源：`www/app-core.js` 的 `BUILTIN_CHANGELOG` —— 它就是 App 内更新弹窗
 *   显示的内容（用户视角文案、禁开发侧词、由 tools/builtin.js 注入时硬拦校验），
 *   是**唯一权威的用户可见更新日志**。官网直接复用它，就不再需要人工誊抄。
 *
 * 渲染规则（BUILTIN markdown 风味 → 官网 HTML）：
 *   【分类】            → 独立分类标签行（不加 <li>，作为该版块的小标题）
 *   - **标题** —— 说明  → <li><b>标题</b> —— 说明</li>
 *   纯段落（无 - 前缀） → <li>整段</li>
 *   「Made by XiXi 💛」 → **丢弃**（官网页面自己已有署名，不必逐版重复）
 *
 * 用法：
 *   node tools/sitechangelog.js                # 取最近 2 版（与官网文案「最近两版」一致）
 *   node tools/sitechangelog.js --count 3      # 取最近 3 版
 *   node tools/sitechangelog.js --dry-run      # 只打印将写入的 HTML，不改文件
 *   node tools/sitechangelog.js --check        # 只校验「线上段 == 应渲染段」，不一致退出码 1
 *
 * 已并入 tools/ship.js publish 流程（发版自动执行）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'www', 'app-core.js');
const SITE = path.join(ROOT, 'site', 'features.html');   // ★2026-09-30 官网精简后「09 更新日志」节搬到 features.html

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const CHECK = args.includes('--check');
const ci = args.indexOf('--count');
const COUNT = ci >= 0 && args[ci + 1] ? Math.max(1, parseInt(args[ci + 1], 10)) : 2;

// ---------- 1) 从 app-core.js 抽出 BUILTIN_CHANGELOG 对象字面量 ----------
const core = fs.readFileSync(CORE, 'utf8');
const objStart = core.indexOf('var BUILTIN_CHANGELOG = {');
if (objStart < 0) { console.error('✗ app-core.js 里找不到 var BUILTIN_CHANGELOG'); process.exit(1); }
const objEnd = core.indexOf('\n};', objStart);
if (objEnd < 0) { console.error('✗ BUILTIN_CHANGELOG 对象未正常闭合'); process.exit(1); }
const objSrc = core.slice(objStart + 'var BUILTIN_CHANGELOG = '.length, objEnd + 2);

// 用 Function 求值拿到对象（纯数据字面量，无副作用；不 require 整个 app-core 以免执行浏览器代码）
let BUILTIN;
try {
  BUILTIN = new Function('return ' + objSrc)();
} catch (e) {
  console.error('✗ BUILTIN_CHANGELOG 求值失败: ' + e.message);
  process.exit(1);
}

// ---------- 2) 版本排序（四段数字，非字典序） ----------
const verKey = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => {
  const x = verKey(a), y = verKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
};
const versions = Object.keys(BUILTIN).sort(cmp).reverse().slice(0, COUNT);

// ---------- 3) 日期：优先取 git tag 的提交日期，取不到用当天 ----------
function tagDate(tag) {
  try {
    const r = spawnSync('git', ['log', '-1', '--format=%cs', tag], { cwd: ROOT, encoding: 'utf8' });
    const s = (r.stdout || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch (e) { /* 忽略，走当天 */ }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ---------- 4) 渲染一个版本块 ----------
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// **粗体** → <b>；其余保持纯文本
function inline(s) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
function renderVersion(tag, dcls) {
  const raw = String(BUILTIN[tag] || '').replace(/\r\n/g, '\n');
  const date = tagDate(tag);
  const items = [];
  for (const line0 of raw.split('\n')) {
    const line = line0.trim();
    if (!line) continue;
    if (/^Made by XiXi/i.test(line)) continue;              // 署名不入官网
    const sec = line.match(/^【(.+?)】\s*$/);                // 【分类】独占一行
    if (sec) { items.push({ t: 'sec', v: sec[1] }); continue; }
    const li = line.match(/^-\s+(.*)$/);                     // - **标题** —— 说明
    if (li) { items.push({ t: 'li', v: li[1] }); continue; }
    // 【分类】后直接跟说明（无 - 前缀，如 v1.2.3.1「【优化】…一句话」）
    const secInline = line.match(/^【(.+?)】(.*)$/);
    if (secInline) {
      items.push({ t: 'sec', v: secInline[1] });
      if (secInline[2].trim()) items.push({ t: 'li', v: secInline[2].trim() });
      continue;
    }
    items.push({ t: 'li', v: line });
  }
  const lis = items.filter((x) => x.t === 'li');
  const inner = lis.length
    ? lis.map((x) => '          <li>' + inline(x.v) + '</li>').join('\n')
    : '          <li>' + inline(raw.split('\n').filter(Boolean)[0] || '') + '</li>';
  return [
    '      <div class="rel-item reveal ' + dcls + '">',
    '        <div class="rel-ver">' + tag + '<span>' + date + '</span></div>',
    '        <ul>',
    inner,
    '        </ul>',
    '      </div>',
  ].join('\n');
}

const blocks = versions.map((v, i) => renderVersion(v, 'd' + (i + 1))).join('\n');
const newList = '<div class="rel-list">\n' + blocks + '\n    </div>';

// ---------- 5) 注入 site/index.html ----------
let site = fs.readFileSync(SITE, 'utf8');
const E = site.includes('\r\n') ? '\r\n' : '\n';
const SEC_MARK = '<!-- ══════════ 09 更新日志 ══════════ -->';
const secAt = site.indexOf(SEC_MARK);
if (secAt < 0) { console.error('✗ site/index.html 找不到「09 更新日志」注释锚点'); process.exit(1); }
const listAt = site.indexOf('<div class="rel-list">', secAt);
const listEndMark = '</div>\n\n    <div class="rel-more reveal';
const listEnd = site.indexOf(listEndMark, listAt);
if (listAt < 0 || listEnd < 0) {
  console.error('✗ 定位不到 .rel-list 块的起止（结构变了？请同步更新本工具）');
  process.exit(1);
}
const curList = site.slice(listAt, listEnd + '</div>'.length);
const curNorm = curList.split('\r\n').join('\n');
const newNorm = newList.split('\r\n').join('\n');

if (CHECK) {
  // ★check 模式：只比对，不写。不一致时打印 diff 摘要并以 1 退出（供 ship publish 门禁）
  //   ★结果行必须含 `N 通过 / M 失败`（checkall.js 的 parseResult 只认这个格式）
  if (curNorm === newNorm) {
    console.log('✅ 官网更新日志段与 BUILTIN 最近 ' + COUNT + ' 版一致（' + versions.join(' / ') + '）');
    console.log('\n✅ 全过 —— 1 通过 / 0 失败（共 1 项）');
    process.exit(0);
  }
  console.log('❌ 官网更新日志段落后于 App 内置日志！');
  console.log('   官网当前首个版本: ' + ((curList.match(/rel-ver">([^<]+)</) || [])[1] || '?'));
  console.log('   应为最新版本: ' + versions[0]);
  console.log('   → 运行 node tools/sitechangelog.js 修复');
  console.log('\n❌ 有失败 —— 0 通过 / 1 失败（共 1 项）');
  process.exit(1);
}

if (curNorm === newNorm) {
  console.log('ℹ 官网更新日志段已是最新（' + versions.join(' / ') + '），无需改动');
  process.exit(0);
}
if (DRY) {
  console.log('[DRY] 将把 site/index.html 的 .rel-list 段替换为：\n');
  console.log(newList);
  process.exit(0);
}

// 写前备份 + 回读校验（铁律：写文件必须回读）
const bak = SITE + '.siteclbak';
fs.copyFileSync(SITE, bak);
const patched = site.slice(0, listAt) + newList.split('\n').join(E) + site.slice(listEnd + '</div>'.length);
fs.writeFileSync(SITE, patched, 'utf8');
const back = fs.readFileSync(SITE, 'utf8');
const okWrite = back.includes('<div class="rel-ver">' + versions[0] + '<span>');
console.log((okWrite ? '✅' : '✗') + ' site/index.html 更新日志段已同步 → ' + versions.join(' / '));
console.log('   首页版本: ' + versions[0]);
// ★2026-09-29 修复：写前备份原先从不清理，会残留 site/index.html.siteclbak
//   并随 ghsync 同步进仓库（污染工作区、每次 push 多一个未跟踪文件）。
//   现在：回读校验**通过即删除**；**失败则保留**（供人工对比排查）。
if (okWrite) {
    try { fs.unlinkSync(bak); console.log('   （写前备份已清理）'); }
    catch (e) { /* 清理失败不影响主流程 */ }
} else {
    console.log('   ⚠ 回读校验未通过 → 写前备份保留在 ' + bak + '，请人工核对');
}
process.exit(okWrite ? 0 : 1);
