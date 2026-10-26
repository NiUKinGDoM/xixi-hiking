# -*- coding: utf-8 -*-
"""分析全局函数收敛可行性：
1) 提取每个 www/*.js 的**顶层**函数声明（顶格 function / 顶格 var = function）
2) 对每个函数名，统计在「其他 JS 文件」「index.html 内联」「e2e」「tools」中的引用
3) 输出：可私有化（仅本文件自用） vs 必须导出（跨文件/外部引用）

只统计，不改任何文件。
"""
import io
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')

JS_FILES = ['app-core.js', 'app-data.js', 'app-data-detail.js', 'app-data-lightbox.js',
            'app-data-heatmap.js', 'app-data-plans.js', 'app-data-plan-detail.js',
            'app-init.js', 'app-sync.js']

# ---- 1. 提取顶层函数 ----
top_fn = defaultdict(list)          # file -> [(name, kind)]
fn_re = re.compile(r'^(?:function\s+([A-Za-z_$][\w$]*)\s*\()|^(?:var\s+([A-Za-z_$][\w$]*)\s*=\s*function)')
for f in JS_FILES:
    p = os.path.join(WWW, f)
    if not os.path.exists(p):
        print('❌ 缺文件 ' + f)
        sys.exit(1)
    for ln in io.open(p, encoding='utf-8'):
        m = fn_re.match(ln)
        if m:
            top_fn[f].append(m.group(1) or m.group(2))

all_names = {}
for f, names in top_fn.items():
    for n in names:
        all_names.setdefault(n, []).append(f)

# ---- 2. 收集外部引用源 ----
sources = {}
for f in JS_FILES:
    sources[('js', f)] = io.open(os.path.join(WWW, f), encoding='utf-8').read()
sources[('html', 'index.html')] = io.open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()

extra_dirs = [os.path.join(ROOT, 'e2e'), os.path.join(ROOT, 'tools'), ROOT]
extra_text = ''
for d in extra_dirs:
    for fn in os.listdir(d):
        if fn.endswith('.js') and fn != 'stresscheck.js':
            try:
                extra_text += io.open(os.path.join(d, fn), encoding='utf-8').read() + '\n'
            except Exception:
                pass
sources[('ext', 'e2e+tools+root')] = extra_text

# ---- 3. 判定每个函数的引用情况 ----
def refs_outside(name, own_file):
    """返回 (跨JS文件引用数, 外部引用数)"""
    pat = re.compile(r'(?<![\w$.])' + re.escape(name) + r'\s*\(')
    cross = 0
    for f in JS_FILES:
        if f == own_file:
            continue
        cross += len(pat.findall(sources[('js', f)]))
    # html 内联（onclick 等）+ e2e/tools
    ext = len(pat.findall(sources[('html', 'index.html')])) + len(pat.findall(sources[('ext', 'e2e+tools+root')]))
    # 「被当作值传递」（不带括号）也算引用：addEventListener('click', foo)
    val_pat = re.compile(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$(])')
    for f in JS_FILES:
        if f == own_file:
            continue
        cross += len(val_pat.findall(sources[('js', f)]))
    ext += len(val_pat.findall(sources[('ext', 'e2e+tools+root')]))
    return cross, ext

privatable = defaultdict(list)
must_export = defaultdict(list)

for f, names in top_fn.items():
    for n in names:
        # 同名在多个文件定义 → 必须保留全局（否则后者覆盖前者的语义会变）
        if len(all_names[n]) > 1:
            must_export[f].append((n, 'duplicate-def'))
            continue
        cross, ext = refs_outside(n, f)
        if cross == 0 and ext == 0:
            privatable[f].append(n)
        else:
            must_export[f].append((n, 'cross=%d ext=%d' % (cross, ext)))

total = sum(len(v) for v in top_fn.values())
priv_total = sum(len(v) for v in privatable.values())
exp_total = sum(len(v) for v in must_export.values())

print('== 全局函数收敛可行性分析 ==')
print('顶层函数总数: %d' % total)
print('  可私有化（仅本文件自用）: %d  (%.0f%%)' % (priv_total, 100.0 * priv_total / total))
print('  必须导出（跨文件/外部）  : %d  (%.0f%%)' % (exp_total, 100.0 * exp_total / total))
print('')
for f in JS_FILES:
    print('%-26s 顶层 %3d | 可私有 %3d | 须导出 %3d' % (
        f, len(top_fn[f]), len(privatable[f]), len(must_export[f])))

print('')
print('== 重复定义（同名多文件，收敛风险最高）==')
dups = {n: fs for n, fs in all_names.items() if len(fs) > 1}
if dups:
    for n, fs in list(dups.items())[:20]:
        print('  %-28s %s' % (n, ' , '.join(fs)))
    print('  合计 %d 个重名' % len(dups))
else:
    print('  无')

# 输出可私有清单供后续使用
out = os.path.join(ROOT, 'tools', 'notes', 'converge-plan.txt')
with io.open(out, 'w', encoding='utf-8') as fh:
    for f in JS_FILES:
        fh.write('### %s\n可私有(%d): %s\n须导出(%d): %s\n\n' % (
            f, len(privatable[f]), ','.join(privatable[f]),
            len(must_export[f]), ','.join(n for n, _ in must_export[f])))
print('\n清单已写入 tools/notes/converge-plan.txt')
