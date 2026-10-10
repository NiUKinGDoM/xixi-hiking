#!/usr/bin/env node
/**
 * tools/legalgen.js —— 官网政策页生成器（★2026-10-10 新增）
 *
 * 解决什么问题：
 *   《隐私政策》与《免责声明》的正文有**两份拷贝** —— App 内 `www/app-data.js`
 *   （`showPrivacyPolicyModal` / `showDisclaimerModal`）与官网 `site/privacy.html` /
 *   `site/terms.html`。靠人记得同步 → 2026-10-09 改 App 内时漏了官网，官网比 App 内
 *   旧了 **17 天**，页头却自称「本页与 App 内展示的内容一致」（静默漂移，无人察觉）。
 *
 * 现在的结构 —— **App 内是唯一源，官网两页是产物**：
 *   www/app-data.js  ──解析 dmi-group──▶  site/privacy.html / site/terms.html
 *
 *   · 为什么不反过来让官网当源：App 内正文被 `LEGAL_VERSION` 与「重新征求同意」
 *     机制绑定，它才是真正的权威；官网只是展示副本，让它跟随 App 才对。
 *   · 本工具**不修改 App 代码**（一行都不碰）→ 风险极低，官网改坏了重新生成即可。
 *
 * 用法：
 *   node tools/legalgen.js             # 生成/更新官网两页
 *   node tools/legalgen.js --check     # 只比对不写（门禁用；不一致退出码 1）
 *   node tools/legalgen.js --dry-run   # 打印将写入的内容，不改文件
 *
 * ★实现约束：**不 spawn 任何子进程**（本机 node spawn 会集体 EBUSY）。
 *   纯 fs 实现；并导出函数供 test.js `require`（避免各写一套解析逻辑而漂移）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DATA = path.join(ROOT, 'www', 'app-data.js');
const SITE = path.join(ROOT, 'site');

// ---------- 解析 App 内的政策正文 ----------
// 结构（`dmi-group` 块）：
//   <span class="material-icons dmi-ic">storage</span>
//   <div style="min-width:0;"><div class="dmi-title">一、数据存储位置与期限</div>
//       <div class="dmi-body">本应用是<b>纯本地工具</b>：…</div></div>
const GROUP_RE = /<span class="material-icons dmi-ic">([\w-]+)<\/span>\s*<div style="min-width:0;"><div class="dmi-title">([\s\S]*?)<\/div>\s*<div class="dmi-body">([\s\S]*?)<\/div><\/div>/g;

function parseSections(src) {
  const out = [];
  let m;
  GROUP_RE.lastIndex = 0;
  while ((m = GROUP_RE.exec(src)) !== null) {
    out.push({ icon: m[1], title: m[2].trim(), body: m[3].trim() });
  }
  return out;
}

/** 从源码里解析两套政策；返回 { legalVersion, privacy:{sections,effective,updated}, terms:{...} } */
function parseApp() {
  const src = fs.readFileSync(APP_DATA, 'utf8');
  const di = src.indexOf('function showDisclaimerModal(');
  const pi = src.indexOf('function showPrivacyPolicyModal(');
  if (di < 0) throw new Error('app-data.js 里找不到 showDisclaimerModal（结构变了？请同步更新本工具）');
  if (pi < 0 || pi < di) throw new Error('app-data.js 里找不到 showPrivacyPolicyModal（结构变了？请同步更新本工具）');
  const termsSrc = src.slice(di, pi);
  const privSrc = src.slice(pi);

  const privacy = { sections: parseSections(privSrc) };
  const terms = { sections: parseSections(termsSrc) };

  const lv = (src.match(/const LEGAL_VERSION = '([^']+)'/) || [])[1] || '';
  // 生效日期优先取正文里写的（与 LEGAL_VERSION 应当一致，test.js 另有断言）
  const eff = (privSrc.match(/生效日期：(\d{4}-\d{2}-\d{2})/) || [])[1];
  const upd = (privSrc.match(/最近更新：(\d{4}-\d{2}-\d{2})/) || [])[1];
  privacy.effective = eff || lv;
  privacy.updated = upd || eff || lv;
  const teff = (termsSrc.match(/生效日期：(\d{4}-\d{2}-\d{2})/) || [])[1];
  terms.effective = teff || lv;

  return { legalVersion: lv, privacy, terms };
}

// ---------- 生成官网 HTML 片段 ----------
function buildMeta(kind, d) {
  const p = '      <p class="doc-meta">适用版本：Android 客户端与网页版 &nbsp;·&nbsp; 生效日期：';
  if (kind === 'privacy') {
    return p + d.effective + ' &nbsp;·&nbsp; 最近更新：' + d.updated +
      '<br>本页与 App 内「设置 → 关于应用 → 隐私政策」展示的内容一致。</p>';
  }
  return p + d.effective +
    '<br>本页与 App 内「设置 → 关于应用 → 免责声明」展示的内容一致。</p>';
}

function buildArticle(kind, sections) {
  const back = kind === 'privacy'
    ? '      <p class="back"><a href="index.html">← 返回首页</a>　·　<a href="terms.html">阅读《免责声明》</a></p>'
    : '      <p class="back"><a href="index.html">← 返回首页</a>　·　<a href="privacy.html">阅读《隐私政策》</a></p>';
  const body = sections
    .map((s) => '      <h2>' + s.title + '</h2>\n      <p>' + normalizeBody(s.body) + '</p>')
    .join('\n\n');
  return '<article>\n' + body + '\n\n' + back + '\n    </article>';
}

/**
 * 官网化变换（**只此一条**，保持「官网正文 == App 内正文」这个可验证的强不变量）：
 *   App 内是 WebView，外链必须带 target="_blank" 否则会把整个 App 导航走；
 *   官网是同站页面，不需要 —— 去掉即可（不影响正文文字）。
 * 除本条外**不做任何排版变换**：破折号、空格、标点一律以 App 内为准，
 * 少一层变换就少一个 bug 来源，守卫也能用最简单的「整篇相等」比较。
 */
function normalizeBody(body) {
  return body.replace(/ target="_blank" rel="noopener"/g, '');
}

/** 把生成内容注入现有页面（只动 doc-meta 行与 <article> 块，head/nav/footer 一字不改） */
function inject(html, metaLine, articleBlock) {
  let out = html;
  if (!/<p class="doc-meta">[\s\S]*?<\/p>/.test(out)) throw new Error('页面里找不到 <p class="doc-meta">');
  if (!/<article>[\s\S]*?<\/article>/.test(out)) throw new Error('页面里找不到 <article>');
  out = out.replace(/<p class="doc-meta">[\s\S]*?<\/p>/, metaLine.trim());
  out = out.replace(/<article>[\s\S]*?<\/article>/, articleBlock);
  return out;
}

/** 计算两页的期望内容；返回 [{kind, file, want, have, sections}] */
function plan() {
  const parsed = parseApp();
  const pages = [
    { kind: 'privacy', file: path.join(SITE, 'privacy.html'), d: parsed.privacy },
    { kind: 'terms', file: path.join(SITE, 'terms.html'), d: parsed.terms },
  ];
  return pages.map((pg) => {
    const have = fs.readFileSync(pg.file, 'utf8');
    const want = inject(have, buildMeta(pg.kind, pg.d), buildArticle(pg.kind, pg.d.sections));
    return {
      kind: pg.kind, file: pg.file, want, have,
      sections: pg.d.sections, effective: pg.d.effective, updated: pg.d.updated,
    };
  });
}

/** 逐节定位差异（只比 <article> 内部的条款），返回人类可读的差异描述数组 */
function diffSections(page) {
  const grab = (t) => {
    const a = t.indexOf('<article>');
    const b = t.indexOf('</article>');
    const inner = (a >= 0 && b > a) ? t.slice(a + 9, b) : '';
    return inner.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  };
  const A = grab(page.want), B = grab(page.have);
  const out = [];
  if (A.length !== B.length) out.push('条款块数：应为 ' + A.length + '，实际 ' + B.length);
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    if (A[i] !== B[i]) {
      const title = ((A[i] || B[i]) || '').match(/<h2>([^<]*)<\/h2>/);
      out.push('第 ' + (i + 1) + ' 块不一致' + (title ? '（' + title[1] + '）' : ''));
    }
  }
  if (!/doc-meta/.test(page.want) || !/doc-meta/.test(page.have)) out.push('页头信息行缺失');
  const wm = (page.want.match(/<p class="doc-meta">[\s\S]*?<\/p>/) || [])[0];
  const hm = (page.have.match(/<p class="doc-meta">[\s\S]*?<\/p>/) || [])[0];
  if (wm !== hm) out.push('页头信息行（生效日期/最近更新）不一致');
  return out;
}

function check() {
  const pages = plan();
  const result = { ok: true, pages: [] };
  for (const pg of pages) {
    const same = pg.want === pg.have;
    const diffs = same ? [] : diffSections(pg);
    result.pages.push({ kind: pg.kind, same, diffs, count: pg.sections.length, effective: pg.effective });
    if (!same) result.ok = false;
  }
  return result;
}

function generate({ dry = false } = {}) {
  const pages = plan();
  const written = [];
  for (const pg of pages) {
    const same = pg.want === pg.have;
    if (same) continue;
    if (!dry) fs.writeFileSync(pg.file, pg.want, 'utf8');
    written.push({ kind: pg.kind, file: pg.file, diffs: diffSections(pg) });
  }
  return { pages, written };
}

// ---------- CLI ----------
function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isDry = args.includes('--dry-run');

  const parsed = parseApp();
  console.log('== legalgen ==  官网政策页生成器');
  console.log('   源: www/app-data.js   LEGAL_VERSION=' + parsed.legalVersion);
  console.log('   隐私 ' + parsed.privacy.sections.length + ' 块（生效 ' + parsed.privacy.effective +
    ' / 更新 ' + parsed.privacy.updated + '）；免责 ' + parsed.terms.sections.length +
    ' 块（生效 ' + parsed.terms.effective + '）');

  // sanity：块数应 ≥ 2，且标题非空
  const bad = [];
  [['privacy', parsed.privacy], ['terms', parsed.terms]].forEach(([k, d]) => {
    if (d.sections.length < 2) bad.push(k + ' 解析到的块数过少(' + d.sections.length + ')');
    if (d.sections.some((s) => !s.title || !s.body)) bad.push(k + ' 有标题或正文为空的块');
  });
  if (bad.length) {
    console.error('\n✗ 解析异常：' + bad.join('；'));
    process.exit(1);
  }

  if (isCheck) {
    const r = check();
    if (r.ok) {
      console.log('\n✅ 官网两页与 App 内正文完全一致（隐私 ' + r.pages[0].count +
        ' 块 / 免责 ' + r.pages[1].count + ' 块 · 生效 ' + r.pages[0].effective + '）');
      process.exit(0);
    }
    console.error('\n❌ 官网政策与 App 内正文不一致（App 内是源，官网是产物）：');
    r.pages.forEach((p) => {
      if (p.same) return;
      console.error('   site/' + p.kind + '.html:');
      p.diffs.slice(0, 8).forEach((d) => console.error('     · ' + d));
    });
    console.error('   → 运行 `node tools/legalgen.js` 重新生成（别手改官网政策页）');
    process.exit(1);
  }

  const { written } = generate({ dry: isDry });
  if (!written.length) {
    console.log('\nℹ 官网两页已与 App 内一致，无需改动');
    process.exit(0);
  }
  written.forEach((w) => {
    console.log((isDry ? '\n[DRY] 将更新 site/' : '\n✅ 已更新 site/') + w.kind + '.html');
    w.diffs.slice(0, 8).forEach((d) => console.log('   · ' + d));
  });
  if (isDry) console.log('\n[DRY-RUN] 未写入任何文件');
}

module.exports = { parseApp, plan, check, generate, diffSections, inject, buildMeta, buildArticle };

if (require.main === module) main();
