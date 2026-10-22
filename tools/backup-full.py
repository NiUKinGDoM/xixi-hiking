# -*- coding: utf-8 -*-
"""完整备份：www + android 源码 + tools + e2e 脚本 + 根配置
   输出到项目根，命名带版本与日期。"""
import os, zipfile, datetime

ROOT = r'C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04'
APP = os.path.join(ROOT, 'hiking-app3')
VER = 'v1.2.5.2'
DATE = datetime.datetime.now().strftime('%Y%m%d')
OUT = os.path.join(ROOT, 'XiXiの徒步小记-完整备份-%s-%s.zip' % (DATE, VER))

INCLUDES = [
    ('hiking-app3/www', None),                      # 全部 www
    ('hiking-app3/android/app/src/main', None),     # manifest + java + res
    ('hiking-app3/android/app/build.gradle', 'file'),
    ('hiking-app3/build.gradle', 'file'),
    ('hiking-app3/settings.gradle', 'file'),
    ('hiking-app3/capacitor.config.json', 'file'),
    ('hiking-app3/package.json', 'file'),
    ('hiking-app3/tools', 'nodeps'),                # 工具与 notes（不含 node_modules）
    ('hiking-app3/e2e', 'nodeps'),                  # 脚本 + 视觉基线
    ('PROJECT_STATUS.md', 'file'),
]

SKIP_DIRS = {'node_modules', '.gradle', 'build', '.git'}
count = 0
total = 0

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel, mode in INCLUDES:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            print('  ⚠ 跳过（不存在）:', rel)
            continue
        if mode == 'file':
            z.write(src, rel)
            total += os.path.getsize(src); count += 1
            continue
        for dirpath, dirnames, filenames in os.walk(src):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                fp = os.path.join(dirpath, fn)
                arc = os.path.relpath(fp, ROOT)
                try:
                    z.write(fp, arc)
                    total += os.path.getsize(fp); count += 1
                except Exception as e:
                    print('  ⚠ 失败:', arc, e)

size_mb = os.path.getsize(OUT) / 1024 / 1024
print('✅ 备份完成: %s' % OUT)
print('   文件 %d 个 / 原始 %.1f MB / 压缩后 %.1f MB' % (count, total / 1024 / 1024, size_mb))
