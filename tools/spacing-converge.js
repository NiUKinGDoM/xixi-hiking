#!/usr/bin/env node
// 间距收敛（方案 B）：只把「差一点」的 7/9/11/13/14 归到刻度，@media 内的值一律不动。
// 用法：node tools/spacing-converge.js            # dry-run，只打印
//       node tools/spacing-converge.js --apply    # 真正写盘
const fs = require('fs'), path = require('path');
const FILES = ['app.css', 'app-modal.css', 'app-form.css'];
const MAP = { '7': '8', '9': '8', '11': '12', '13': '12', '14': '16' };
const DRY = !process.argv.includes('--apply');
let total = 0; const samples = [];
for (const f of FILES) {
  const p = path.join(__dirname, '..', 'www', f);
  const out = [];
  let depth = 0, md = -1;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (/@media/.test(line)) md = depth;
    const lineDepth = depth;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    const inMedia = md >= 0 && lineDepth > md;
    let nl = line;
    if (!inMedia) {
      nl = line.replace(/^(\s*)(padding|margin|gap)(-[a-z]+)?:\s*([^;]+);/, (m, ind, prop, suf, val) => {
        let ch = false;
        const nv = val.replace(/(\d+(?:\.\d+)?)px/g, (mm, n) => {
          if (MAP[n]) { ch = true; total++; return MAP[n] + 'px'; }
          return mm;
        });
        if (ch && samples.length < 10) samples.push(`${f}  ${prop}${suf || ''}: ${val.trim()}  →  ${nv.trim()}`);
        return `${ind}${prop}${suf || ''}: ${nv};`;
      });
    }
    out.push(nl);
  }
  if (md >= 0 && depth <= md) md = -1;
  if (!DRY) fs.writeFileSync(p, out.join('\n'));
}
console.log(`${DRY ? '[DRY-RUN] 将改' : '[已写盘] 共改'} ${total} 处`);
samples.forEach(s => console.log('  ' + s));
