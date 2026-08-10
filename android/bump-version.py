# -*- coding: utf-8 -*-
"""
bump-version.py - 版本号递增工具（2026-08-11 新规则：与 versionCode 对齐）
用法：python bump-version.py  （在 hiking-app3/android/ 目录下执行）

★新版本号规则（用户 2026-08-10 确认，2026-08-11 工具化）：
  versionName = 按 versionCode 数出的 1.x.x.x
  - 从 1.0.0.0 起算第 1 个版本；每段 0~10 共 11 个值；满 10 进位（第三段+1、第四段归零）
  - 公式：索引 = vc_new - 1
        第四段 = 索引 % 11
        第三段 = (索引 // 11) % 11
        第二段 = (索引 // 121) % 11
  - 对照：vc84=1.0.7.6、85=1.0.7.7、88=1.0.7.10、89=1.0.8.0、121=1.0.10.10、122=1.1.0.0
  每次生成版本号前必须先验证公式结果。
"""
import io
import os
import re
import sys

base = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(base, 'app', 'build.gradle')
html_p = os.path.join(base, '..', 'www', 'index.html')

with io.open(p, 'rb') as f:
    data = f.read()

m = re.search(rb'versionCode\s+(\d+)', data)
if not m:
    print('!! 未找到 versionCode')
    sys.exit(1)
vc = int(m.group(1))

# ★新规则：vc+1 后按公式算出四段版本号
vc_new = vc + 1
idx = vc_new - 1
seg4 = idx % 11
seg3 = (idx // 11) % 11
seg2 = (idx // 121) % 11
seg1 = 1 + idx // 1331  # 第一段：第二段满 10 进位（vc1332 起为 2.0.0.0）
new_vn = '%d.%d.%d.%d' % (seg1, seg2, seg3, seg4)

# 读取旧 versionName（仅用于日志显示）
m_old = re.search(rb'versionName\s+"([^"]+)"', data)
old_vn = m_old.group(1).decode() if m_old else '?'

# 写 build.gradle（无 BOM，避免 Gradle 解析报错）
data = re.sub(rb'versionCode\s+\d+', ('versionCode %d' % vc_new).encode(), data, count=1)
data = re.sub(rb'versionName\s+"[^"]+"', ('versionName "%s"' % new_vn).encode(), data, count=1)
with io.open(p, 'wb') as f:
    f.write(data)

# 同步 index.html：版本显示 + version 字段
if os.path.exists(html_p):
    with io.open(html_p, 'r', encoding='utf-8') as f:
        h = f.read()
    h2 = re.sub(r'版本 [\d.]+', '版本 %s' % new_vn, h, count=1)
    h2 = re.sub(r"version:\s*'[\d.]+'", "version: '%s'" % new_vn, h2, count=1)
    if h2 != h:
        with io.open(html_p, 'w', encoding='utf-8', newline='') as f:
            f.write(h2)
        print('[bump-version] index.html 已同步版本号')
    else:
        print('[bump-version] index.html 无变化（可能未找到版本字段）')

print('[bump-version] versionCode: %d -> %d' % (vc, vc_new))
print('[bump-version] versionName: %s -> %s' % (old_vn, new_vn))
