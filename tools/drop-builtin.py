# -*- coding: utf-8 -*-
"""删指定版本 BUILTIN 条目（builtin.js 遇「已存在」会静默跳过）
用法：python tools/drop-builtin.py 1.2.5.5.2
"""
import io
import os
import re
import sys

if len(sys.argv) < 2:
    print('用法: python tools/drop-builtin.py <版本号> [...]')
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'www', 'app-core.js')
src = io.open(p, encoding='utf-8').read()

for arg in sys.argv[1:]:
    VER = arg.lstrip('v')
    before = len(src)
    pattern = re.compile(r"^\s*'" + re.escape('v' + VER) + r"':\s*'.*?',\s*?\r?\n", re.S | re.M)
    src, n = pattern.subn('', src, count=1)
    if n != 1:
        print('❌ 未找到 v%s 条目（替换 %d 处）' % (VER, n))
        sys.exit(1)
    if len(src) >= before:
        print('❌ 删除后体积未减少，异常')
        sys.exit(1)
    print('✅ 已删除 v%s 条目（%d → %d 字节）' % (VER, before, len(src)))

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('完成')
