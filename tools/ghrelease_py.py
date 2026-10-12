# -*- coding: utf-8 -*-
"""
tools/ghrelease_py.py —— Release 发布的 python 降级通道（2026-10-12 固化）

为什么需要它：本机 node 的 https 连不上 api.github.com
  （hosts 有「活动行」127.0.0.1 api.github.com；node 又不读 https_proxy）
  → tools/ghrelease.js 在本机必失败。本脚本用 urllib 直连（实测可通），
  行为与 ghrelease.js 对齐，且同样是幂等的：
    ① 按 tag 取 Release，存在则复用 / 不存在则新建
    ② PATCH 正文（幂等更新）
    ③ 删掉同名旧 asset（避免 422）
    ④ 裸二进制上传 APK
    ⑤ 下载回验（size + md5 + PK 魔数）

用法：
  python tools/ghrelease_py.py <tag> <apk路径> <release文案文件> [--keep-apk]
  例：python tools/ghrelease_py.py v1.2.4.0 "$TEMP/hiking-build/android/app/build/outputs/apk/release/app-release.apk" tools/notes/1.2.4.0-release.md

token 读取顺序：环境变量 GH_TOKEN → 运行 tools/ghtoken.py 取输出。
asset 命名：xixi-hiking-<tag>.apk（与 v1.2.3.8/9/10 保持一致的小写写法）
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = 'NiUKinGDoM/xixi-hiking'
API = 'https://api.github.com'


def die(msg):
    print('✗ ' + msg)
    sys.exit(1)


def token_of():
    t = (os.environ.get('GH_TOKEN') or '').strip()
    if t.startswith('ghp_'):
        return t
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        out = subprocess.run([sys.executable, os.path.join(here, 'ghtoken.py')],
                             capture_output=True, text=True, timeout=30)
        t = (out.stdout or '').strip().split('\n')[0].strip()
    except Exception as e:
        die('取 token 失败: %s' % e)
    if not t.startswith('ghp_'):
        die('token 格式异常（取到 %d 字符）' % len(t))
    return t


def call(method, url, tok, body=None, ctype='application/json', raw_bytes=None, timeout=120):
    data = raw_bytes if raw_bytes is not None else (json.dumps(body).encode('utf-8') if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + tok)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'xixi-hiking-release')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    if data is not None:
        req.add_header('Content-Type', ctype)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', 'replace')[:400]
        return e.code, txt
    except Exception as e:
        return None, str(e)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep = '--keep-apk' in sys.argv
    if len(args) < 3:
        die('用法: python tools/ghrelease_py.py <tag> <apk路径> <release文案文件>')
    tag, apk, body_file = args[0], args[1], args[2]
    if not os.path.exists(apk):
        die('APK 不存在: ' + apk)
    if not os.path.exists(body_file):
        die('文案文件不存在: ' + body_file)

    raw = open(apk, 'rb').read()
    size = len(raw)
    md5 = hashlib.md5(raw).hexdigest()
    if raw[:2] != b'PK':
        die('APK 魔数不是 PK（拿到 %r）' % raw[:4])
    body = open(body_file, encoding='utf-8').read().strip()
    asset_name = 'xixi-hiking-%s.apk' % tag
    tok = token_of()

    print('== ghrelease_py ==')
    print('tag=%s  apk=%s' % (tag, apk))
    print('asset=%s  %.2f MB  md5=%s' % (asset_name, size / 1048576, md5))

    # ① 取 / 建 Release
    st, rel = call('GET', '%s/repos/%s/releases/tags/%s' % (API, REPO, tag), tok)
    if st == 200 and isinstance(rel, dict):
        rid = rel['id']
        print('① Release 已存在（id=%s）→ 复用' % rid)
        st2, _ = call('PATCH', '%s/repos/%s/releases/%s' % (API, REPO, rid), tok,
                      body={'body': body, 'name': tag, 'draft': False, 'prerelease': False})
        print('② 正文已更新: %s' % ('ok' if st2 == 200 else '失败 %s' % st2))
        if st2 != 200:
            die('PATCH 失败')
    elif st == 404:
        st2, rel2 = call('POST', '%s/repos/%s/releases' % (API, REPO), tok,
                         body={'tag_name': tag, 'name': tag, 'body': body,
                               'draft': False, 'prerelease': False})
        if st2 != 201 or not isinstance(rel2, dict):
            die('建 Release 失败: %s %s' % (st2, rel2))
        rid = rel2['id']
        print('① Release 已新建（id=%s）' % rid)
    else:
        die('取 Release 失败: %s %s' % (st, rel))

    # ③ 删同名旧 asset
    st, assets = call('GET', '%s/repos/%s/releases/%s/assets?per_page=100' % (API, REPO, rid), tok)
    if st == 200 and isinstance(assets, list):
        for a in assets:
            if a.get('name') == asset_name:
                sd, _ = call('DELETE', '%s/repos/%s/releases/assets/%s' % (API, REPO, a['id']), tok)
                print('③ 旧同名 asset 已删（id=%s）: %s' % (a['id'], sd))

    # ④ 上传
    up = '%s/repos/%s/releases/%s/assets?name=%s' % (
        'https://uploads.github.com', REPO, rid, urllib.parse.quote(asset_name))
    st, asset = call('POST', up, tok, raw_bytes=raw,
                     ctype='application/vnd.android.package-archive', timeout=300)
    if st not in (200, 201) or not isinstance(asset, dict):
        die('上传失败: %s %s' % (st, asset))
    print('④ 上传成功: asset id=%s  远端 size=%s  digest=%s' % (
        asset.get('id'), asset.get('size'), asset.get('digest')))
    if asset.get('size') != size:
        die('远端 size 与本地不一致: %s / %s' % (asset.get('size'), size))

    # ⑤ 下载回验
    dl = asset.get('browser_download_url')
    req = urllib.request.Request(dl, headers={'User-Agent': 'xixi-hiking-verify'})
    with urllib.request.urlopen(req, timeout=300) as r:
        back = r.read()
    ok_size = len(back) == size
    ok_md5 = hashlib.md5(back).hexdigest() == md5
    ok_pk = back[:2] == b'PK'
    print('⑤ 下载回验: size %s（%d）  md5 %s  PK头 %s' % (
        '✅' if ok_size else '❌', len(back),
        '✅' if ok_md5 else '❌', '✅' if ok_pk else '❌'))
    if not (ok_size and ok_md5 and ok_pk):
        die('回验未通过')
    print('✅ Release 发布完成: %s' % (asset.get('browser_download_url')))
    if not keep and apk.lower().startswith(os.environ.get('TEMP', '').lower()):
        try:
            os.remove(apk)
            print('   已清理临时 APK')
        except Exception as e:
            print('   （APK 清理跳过: %s）' % e)


main()
