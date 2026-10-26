# -*- coding: utf-8 -*-
"""统计每个文件的顶层变量被其他文件引用的次数 → 决定 IIFE 里哪些变量必须导出。"""
import io
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')
JS_FILES = ['app-core.js', 'app-data.js', 'app-data-detail.js', 'app-data-lightbox.js',
            'app-data-heatmap.js', 'app-data-plans.js', 'app-data-plan-detail.js',
            'app-init.js', 'app-sync.js']
TARGETS = [f for f in JS_FILES if f != 'app-core.js']   # app-core 不包 IIFE

src = {f: io.open(os.path.join(WWW, f), encoding='utf-8').read() for f in JS_FILES}
html = io.open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()

decl_re = re.compile(r'^(?:var|let|const)\s+([A-Za-z_$][\w$]*)')
fn_re = re.compile(r'^(?:function\s+([A-Za-z_$][\w$]*)\s*\()')

total_exp = 0
for f in TARGETS:
    names = []
    for ln in src[f].split('\n'):
        m = decl_re.match(ln)
        if m:
            names.append(m.group(1))
    if not names:
        print('%-26s 无顶层变量' % f)
        continue
    must, priv = [], []
    for n in names:
        pat = re.compile(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])')
        cnt = 0
        for g in JS_FILES:
            if g == f:
                continue
            cnt += len(pat.findall(src[g]))
        cnt += len(pat.findall(html))
        (must if cnt else priv).append((n, cnt))
    total_exp += len(must)
    print('%-26s 变量 %2d | 须导出 %2d | 可私有 %2d' % (f, len(names), len(must), len(priv)))
    if must:
        print('     须导出: ' + ', '.join('%s(%d)' % (n, c) for n, c in must))
    if priv:
        print('     可私有: ' + ', '.join(n for n, _ in priv))

print('\n→ 8 个文件共需导出 %d 个变量' % total_exp)
