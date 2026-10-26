# -*- coding: utf-8 -*-
"""把 tools/notes/1.2.5.*-doc.txt 汇总成段落，插入「开发侧改动记录.md」（最新在上）。
每版只留：标题 + 最多 3 条要点（单条截断 120 字），保证可读不臃肿。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(ROOT, 'tools', 'notes')
TARGET = os.path.join(os.path.dirname(ROOT), '开发侧改动记录.md')

if not os.path.exists(TARGET):
    print('❌ 找不到 ' + TARGET)
    sys.exit(1)

# 收集 1.2.5.x 的 doc（按版本号数值排序）
vers = []
for fn in os.listdir(NOTES):
    m = re.match(r'^(1\.2\.5\.[\d.]+)-doc\.txt$', fn)
    if m:
        vers.append((m.group(1), os.path.join(NOTES, fn)))


def vkey(v):
    return [int(x) for x in v.split('.')]


vers.sort(key=lambda t: vkey(t[0]))

# 只补文档里还没有的版本
cur = io.open(TARGET, encoding='utf-8').read()
existing = set(re.findall(r'^## v([\d.]+)', cur, re.M))
todo = [(v, p) for v, p in vers if v not in existing]

if not todo:
    print('✓ 开发侧改动记录已是最新（无缺失版本）')
    sys.exit(0)

blocks = []
for v, p in reversed(todo):          # 最新在上
    txt = io.open(p, encoding='utf-8').read()
    lines = txt.split('\n')
    title = ''
    pts = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if s.startswith('###'):
            title = s.lstrip('#').strip()
            continue
        if s.startswith('>'):
            continue
        if s.startswith('-') or s.startswith('*'):
            one = re.sub(r'\*\*|`', '', s.lstrip('-* ').strip())
            one = one.split('——')[0].strip()
            if len(one) > 120:
                one = one[:117] + '…'
            if one and one not in pts:
                pts.append(one)
        if len(pts) >= 3:
            break
    if not title:
        title = 'v' + v
    body = '\n'.join('- ' + x for x in pts) if pts else '- （详见 tools/notes/%s-doc.txt）' % v
    blocks.append('## %s\n\n%s\n' % (title, body))

new_text = '\n'.join(blocks)

# 插到第一个「## v」之前
m = re.search(r'^## v', cur, re.M)
if not m:
    print('❌ 目标文件里找不到任何「## v」段落')
    sys.exit(1)
out = cur[:m.start()] + new_text + '\n---\n\n' + cur[m.start():]
io.open(TARGET, 'w', encoding='utf-8', newline='').write(out)
print('✅ 已补 %d 个版本：%s' % (len(todo), ', '.join(v for v, _ in reversed(todo))))
