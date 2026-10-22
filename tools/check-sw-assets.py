# -*- coding: utf-8 -*-
"""校验 sw.js 的 CORE_ASSETS 每个资源在 www/ 下真实存在（任一 404 都是离线白屏隐患）"""
import re, os

src = open('www/sw.js', encoding='utf-8').read()
m = re.search(r'CORE_ASSETS = \[(.*?)\];', src, re.S)
items = re.findall(r"'([^']+)'", m.group(1))

miss = []
for it in items:
    rel = it.lstrip('./')
    if rel in ('', 'index.html'):
        rel = 'index.html'
    full = os.path.join('www', rel)
    if not os.path.exists(full):
        miss.append(it + '  →  期望 ' + full)

print('CORE_ASSETS 共 %d 项' % len(items))
if miss:
    print('❌ 缺失 %d 项：' % len(miss))
    for x in miss:
        print('   ', x)
else:
    print('✅ 全部存在')
