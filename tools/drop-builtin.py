# -*- coding: utf-8 -*-
"""删指定版本 BUILTIN 条目（builtin.js 遇「已存在」会静默跳过）
用法：python tools/drop-builtin.py 1.2.5.4
"""
import io
import os
import re
import sys

if len(sys.argv) < 2:
    print('用法: python tools/drop-builtin.py <版本号>')
    sys.exit(1)

VER = sys.argv[1].lstrip('v')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'www', 'app-core.js')

with io.open(p, encoding='utf-8') as f:
    src = f.read()

before = len(src)
pattern = re.compile(r"^\s*'" + re.escape('v' + VER) + r"':\s*'.*?',\s*?\r?\n", re.S | re.M)
new, n = pattern.subn('', src, count=1)
if n != 1:
    print('❌ 未找到 v%s 条目（替换 %d 处）' % (VER, n))
    sys.exit(1)
if len(new) >= before:
    print('❌ 删除后体积未减少，异常')
    sys.exit(1)

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(new)

print('✅ 已删除 v%s 条目：%d → %d 字节' % (VER, before, len(new)))
