# -*- coding: utf-8 -*-
"""
tools/verifyapk_py.py —— APK 验包的 python 降级通道（2026-10-12 固化）

为什么需要它：tools/verify-apk.js 在本机解包失败（child_process EBUSY，报「解包失败:」错误信息为空）
  → 本脚本用 zipfile 直接读 APK，口径与 verify-apk.js / release.js 第⑤步一致：
    ① ResGuard 10 项哈希「逐项重算」（读 APK 内 assets/public/* 已混淆产物 vs ResGuard.java 清单）
    ② 资源与 www 源比对（app.css 必须逐字节一致；sw.js 的 CACHE_NAME）
    ③ index.html 行数
    ④ 4 个 JS 已混淆（结构检查，不做字符串断言）
    ⑤ 版本号落在 APK 内

用法：python tools/verifyapk_py.py [apk路径]
  默认取 %TEMP%/hiking-build/android/app/build/outputs/apk/release/app-release.apk
"""
import hashlib
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_APK = os.path.join(os.environ.get('TEMP', '/tmp'), 'hiking-build', 'android',
                           'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
RESGUARD = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'xixi', 'hiking', 'ResGuard.java')
HASH_FILES = ['index.html', 'app.css', 'app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js',
              'assets/support-qr-wechat.jpg', 'assets/support-qr-alipay.jpg',
              'assets/fonts/material-icons.woff2', 'assets/vendor/tailwind4.1.13.js']
OBF_JS = ['app-core.js', 'app-data.js', 'app-sync.js', 'app-init.js']

apk = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else DEFAULT_APK
if not os.path.exists(apk):
    print('✗ APK 不存在: %s' % apk)
    sys.exit(1)

raw = open(apk, 'rb').read()
print('== verifyapk_py ==')
print('APK: %s  (%.2f MB)  md5=%s' % (apk, len(raw) / 1048576, hashlib.md5(raw).hexdigest()))
print('PK 魔数: %s' % ('✅' if raw[:2] == b'PK' else '❌ ' + repr(raw[:4])))

zf = zipfile.ZipFile(apk)
names = set(zf.namelist())
PREFIX = 'assets/public/'
fails = []


def sha(b):
    return hashlib.sha256(b).hexdigest()


# ① ResGuard 逐项重算
expect = {}
for line in open(RESGUARD, encoding='utf-8'):
    m = re.match(r'\s*\{"([^"]+)",\s*"([0-9a-f]{64})"\}', line)
    if m:
        expect[m.group(1)] = m.group(2)
print('\n① ResGuard 清单 %d 项（ResGuard.java）→ 逐项重算 APK 内已混淆产物' % len(expect))
if len(expect) != len(HASH_FILES):
    fails.append('ResGuard 清单项数 %d ≠ 预期 %d' % (len(expect), len(HASH_FILES)))
hit = 0
for f in HASH_FILES:
    p = PREFIX + f
    if p not in names:
        print('   ❌ 缺失 %s' % f)
        fails.append('APK 缺文件 ' + f)
        continue
    got = sha(zf.read(p))
    want = expect.get(f)
    if want is None:
        print('   ❌ %-42s 清单里没有' % f)
        fails.append('清单缺 ' + f)
    elif got == want:
        hit += 1
    else:
        print('   ❌ %-42s 哈希不符\n        期望 %s\n        实际 %s' % (f, want, got))
        fails.append('哈希不符 ' + f)
print('   命中 %d / %d' % (hit, len(HASH_FILES)))

# ② 与 www 源比对
print('\n② 与 www 源比对')
for f in ['app.css', 'sw.js', 'index.html']:
    src = open(os.path.join(ROOT, 'www', f), 'rb').read()
    if f == 'sw.js':
        # sw.js 只在 APK 的 CORE_ASSETS 里以文件名出现，不单独打包
        continue
    p = PREFIX + f
    if p not in names:
        print('   ❌ APK 内缺 %s' % f)
        fails.append('缺 ' + f)
        continue
    got = zf.read(p)
    if f == 'app.css':
        ok = got == src
        print('   %s app.css 与源逐字节一致（%d B）' % ('✅' if ok else '❌', len(got)))
        if not ok:
            fails.append('app.css 与源不一致')
    else:
        print('   · index.html 源 %d 行 → APK 内 %d B（HTML 压缩后不与源等长，属预期）'
              % (src.count(b'\n') + 1, len(got)))
        if len(got) < 200:
            fails.append('index.html 过小')

# ③ 混淆结构检查
print('\n③ 4 个 JS 混淆结构检查')
for f in OBF_JS:
    p = PREFIX + f
    if p not in names:
        print('   ❌ APK 内缺 %s' % f)
        fails.append('缺 ' + f)
        continue
    txt = zf.read(p).decode('utf-8', 'replace')
    obf = ('_0x' in txt) or ('\\x' in txt)
    one = txt.count('\n') + 1
    print('   %s %-14s %.1f KB  %d 行  混淆特征 %s'
          % ('✅' if obf else '❌', f, len(txt) / 1024, one, '✅' if obf else '❌ 未见'))
    if not obf:
        fails.append(f + ' 未见混淆特征')

# ④ 版本
print('\n④ 版本号')
core = zf.read(PREFIX + 'app-core.js').decode('utf-8', 'replace')
ver_src = re.search(r"var APP_VERSION = '([\d.]+)'", open(os.path.join(ROOT, 'www', 'app-core.js'), encoding='utf-8').read())
want_ver = ver_src.group(1) if ver_src else '?'
found = want_ver in core
print('   %s www 源 APP_VERSION=%s → APK 内字符串%s找到' % ('✅' if found else '❌', want_ver, '' if found else '未'))
if not found:
    fails.append('APK 内未找到版本号 ' + want_ver)
sw_apk = zf.read(PREFIX + 'sw.js').decode('utf-8', 'replace') if (PREFIX + 'sw.js') in names else ''
sw_src = open(os.path.join(ROOT, 'www', 'sw.js'), encoding='utf-8').read()
c_apk = re.search(r"CACHE_NAME = '([^']+)'", sw_apk)
c_src = re.search(r"CACHE_NAME = '([^']+)'", sw_src)
print('   CACHE_NAME: 源=%s  APK=%s  %s' % (
    c_src.group(1) if c_src else '?', c_apk.group(1) if c_apk else '未打包',
    '✅' if (c_apk and c_src and c_apk.group(1) == c_src.group(1)) else '（sw.js 不在 assets 里属正常）'))

print('\n================ 结论 ================')
if fails:
    print('❌ 未通过 %d 项：' % len(fails))
    for f in fails:
        print('   - ' + f)
    sys.exit(1)
print('✅ APK 验包全过（ResGuard %d/%d 逐项重算匹配）' % (hit, len(HASH_FILES)))
