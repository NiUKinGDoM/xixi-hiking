# -*- coding: utf-8 -*-
"""
bump-version.py - 版本号递增工具（遵守用户规则：patch 最多到 10，之后进位 minor）
用法：python bump-version.py  （在 hiking-app3/android/ 目录下执行）
规则：1.2.9 -> 1.2.10 -> 1.3.0 -> 1.3.1 ... -> 1.3.10 -> 1.4.0
"""
import io
import os
import re
import sys

base = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(base, 'app', 'build.gradle')

with io.open(p, 'rb') as f:
    data = f.read()

m = re.search(rb'versionCode\s+(\d+)', data)
if not m:
    print('!! 未找到 versionCode')
    sys.exit(1)
vc = int(m.group(1))

m = re.search(rb'versionName\s+"([^"]+)"', data)
if not m:
    print('!! 未找到 versionName')
    sys.exit(1)
vn = m.group(1).decode()

major, minor, patch = map(int, vn.split('.'))

# 进位规则：patch >= 10 -> minor+1, patch=0
if patch >= 10:
    minor += 1
    patch = 0
else:
    patch += 1

new_vn = '%d.%d.%d' % (major, minor, patch)

data = re.sub(rb'versionCode\s+\d+', ('versionCode %d' % (vc + 1)).encode(), data, 1)
data = re.sub(rb'versionName\s+"[^"]+"', ('versionName "%s"' % new_vn).encode(), data, 1)

with io.open(p, 'wb') as f:
    f.write(data)

print('[bump-version] versionCode: %d -> %d' % (vc, vc + 1))
print('[bump-version] versionName: %s -> %s' % (vn, new_vn))
