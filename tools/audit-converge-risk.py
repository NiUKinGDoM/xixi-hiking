# -*- coding: utf-8 -*-
"""收敛前安全审计（只看不改）：
① 每个顶层变量是否被**其他文件直接赋值**（records = xxx 这种）→ 若有，包 IIFE 会导致数据分裂
② 是否存在隐式全局赋值（行首 name = ... 但没有 var/let/const 声明）
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

src = {}
for f in JS_FILES:
    src[f] = io.open(os.path.join(WWW, f), encoding='utf-8').read()
html = io.open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()

decl_re = re.compile(r'^(?:var|let|const)\s+([A-Za-z_$][\w$]*)')

top_vars = defaultdict(list)   # file -> [name]
for f, s in src.items():
    for ln in s.split('\n'):
        m = decl_re.match(ln)
        if m:
            top_vars[f].append(m.group(1))

var_owner = {}
for f, names in top_vars.items():
    for n in names:
        var_owner.setdefault(n, []).append(f)

# 找「跨文件直接赋值」：在其他文件里出现 ^name = 或 ; name = 或 { name =
def cross_assignments(name, own):
    pat = re.compile(r'(?:^|[;{}\n])\s*' + re.escape(name) + r'\s*=(?!=)')
    hits = {}
    for f, s in src.items():
        if f == own:
            continue
        c = len(pat.findall(s))
        if c:
            hits[f] = c
    return hits

# 隐式全局赋值：行首 name = ... 但该 name 不是本文件声明的
implicit = defaultdict(list)
for f, s in src.items():
    for ln in s.split('\n'):
        m = re.match(r'^([A-Za-z_$][\w$]*)\s*=(?!=)', ln)
        if m:
            n = m.group(1)
            if n not in top_vars[f]:
                implicit[f].append((n, ln.strip()[:60]))

print('== 收敛安全审计 ==')
print('顶层变量总数: %d（去重后 %d）' % (sum(len(v) for v in top_vars.values()), len(var_owner)))

print('\n① 被其他文件直接赋值的变量（★这些包 IIFE 会数据分裂）:')
risky = []
for n, owners in var_owner.items():
    if len(owners) > 1:
        print('  ⚠ %-28s 多文件声明: %s' % (n, ','.join(owners)))
        risky.append(n)
        continue
    hits = cross_assignments(n, owners[0])
    if hits:
        print('  ⚠ %-28s 声明于 %-24s 但被 %s 赋值' % (n, owners[0], ', '.join('%s×%d' % (k, v) for k, v in hits.items())))
        risky.append(n)

if not risky:
    print('  （无）')
print('  → 共 %d 个高危变量' % len(risky))

print('\n② 隐式全局赋值（行首 name = 但本文件未声明）:')
found = False
for f, items in implicit.items():
    if items:
        found = True
        print('  %s: %d 处' % (f, len(items)))
        for n, t in items[:5]:
            print('     · %-24s %s' % (n, t))
if not found:
    print('  （无）')

# 结论
print('\n== 结论 ==')
print('高危变量 %d 个 ⇒ 这些必须保持全局（不能进 IIFE）' % len(risky))
priv_ok = [f for f in JS_FILES if not any(n in risky for n in top_vars[f])]
print('无高危变量的文件（可整体包 IIFE）: %s' % (','.join(priv_ok) if priv_ok else '（无）'))
