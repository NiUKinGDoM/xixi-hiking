# -*- coding: utf-8 -*-
"""
tools/cfstat_py.py —— Cloudflare Analytics Engine 下载统计查询（2026-10-13 建）

为什么需要它：项目里原本只有 GitHub 凭据（`tools/ghtoken.py`），而「同一 IP 只算一次」
  的独立人数只能从 CF 侧读，必须要有 CF **只读** token。

★凭据存放：**Windows 凭据管理器**（与 GitHub token 同一套路）
  target = `cloudflare:xixi-analytics`，Account ID 存在 UserName 字段
  —— **token 绝不写进任何文件、绝不进仓库**。

用法：
  python tools/cfstat_py.py --save <token> <account_id>   # 一次性存入凭据管理器
  python tools/cfstat_py.py --show                        # 只看凭据是否已存（不打印 token）
  python tools/cfstat_py.py                               # 查下载统计（六段汇总）
  python tools/cfstat_py.py --sql "SELECT ..."            # 跑自定义 SQL
  python tools/cfstat_py.py --json                        # 输出原始 JSON

★注意：CF 的 SQL 解析器**不认中文标识符**（别名一律英文）；`count(DISTINCT x)` 若不支持，
  本脚本会自动降级为 `uniq(x)`。
"""
import ctypes
import ctypes.wintypes as wt
import json
import os
import sys
import urllib.error
import urllib.request

TARGET = 'cloudflare:xixi-analytics'
# ★2026-10-13 换到新数据集：旧的 xixi_hiking_dl 装的是「IP+UA」旧口径的测试数据，
#   已弃用（Analytics Engine 不支持 SQL 清空，只能换名重来）。可用 CF_DATASET 临时覆盖。
DATASET = os.environ.get('CF_DATASET', 'xixi_hiking_dl_v2')


class CREDENTIAL(ctypes.Structure):
    _fields_ = [
        ('Flags', wt.DWORD), ('Type', wt.DWORD),
        ('TargetName', ctypes.c_wchar_p), ('Comment', ctypes.c_wchar_p),
        ('LastWritten', wt.FILETIME), ('CredentialBlobSize', wt.DWORD),
        ('CredentialBlob', ctypes.POINTER(ctypes.c_ubyte)),
        ('Persist', wt.DWORD), ('AttributeCount', wt.DWORD),
        ('Attributes', ctypes.c_void_p),
        ('TargetAlias', ctypes.c_wchar_p), ('UserName', ctypes.c_wchar_p),
    ]


def cred_save(target, username, secret):
    adv = ctypes.windll.advapi32
    blob = secret.encode('utf-16-le')
    buf = (ctypes.c_ubyte * len(blob)).from_buffer_copy(blob)
    c = CREDENTIAL()
    c.Flags = 0
    c.Type = 1                      # CRED_TYPE_GENERIC
    c.TargetName = target
    c.Comment = 'xixi-hiking CF analytics read-only'
    c.CredentialBlobSize = len(blob)
    c.CredentialBlob = ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte))
    c.Persist = 2                   # CRED_PERSIST_LOCAL_MACHINE
    c.AttributeCount = 0
    c.Attributes = None
    c.TargetAlias = None
    c.UserName = username
    adv.CredWriteW.argtypes = [ctypes.POINTER(CREDENTIAL), wt.DWORD]
    adv.CredWriteW.restype = wt.BOOL
    return bool(adv.CredWriteW(ctypes.byref(c), 0))


def cred_read(target):
    adv = ctypes.windll.advapi32
    adv.CredReadW.argtypes = [wt.LPCWSTR, wt.DWORD, wt.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
    adv.CredReadW.restype = wt.BOOL
    p = ctypes.POINTER(CREDENTIAL)()
    if not adv.CredReadW(target, 1, 0, ctypes.byref(p)):
        return None, None
    c = p.contents
    tok = ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize).decode('utf-16-le') if c.CredentialBlobSize else ''
    acct = c.UserName or ''
    ctypes.windll.advapi32.CredFree(p)
    return tok, acct


def run_sql(query, tok, acct):
    url = 'https://api.cloudflare.com/client/v4/accounts/%s/analytics_engine/sql' % acct
    req = urllib.request.Request(url, data=query.encode('utf-8'), method='POST')
    req.add_header('Authorization', 'Bearer ' + tok)
    req.add_header('User-Agent', 'xixi-cfstat')
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        return None, (e.read().decode('utf-8', 'replace') or '')[:400]
    except Exception as e:
        return None, str(e)


def q(query, tok, acct):
    """跑 SQL；若因 count(DISTINCT ...) 不支持而失败，自动降级为 uniq()"""
    res, err = run_sql(query, tok, acct)
    if err and 'DISTINCT' in err.upper():
        res, err = run_sql(query.replace('count(DISTINCT index1)', 'uniq(index1)'), tok, acct)
    return res, err


def table(res, title, cols):
    print('\n── %s ──' % title)
    if res is None:
        print('   ✗ 查询失败')
        return
    rows = res.get('data') or []
    if not rows:
        print('   （暂无数据）')
        return
    widths = []
    for i, c in enumerate(cols):
        w = max(len(c[0]), max(len(str(r.get(c[0], ''))) for r in rows))
        widths.append(min(w, 26))
    print('   ' + '  '.join(c[0].ljust(widths[i]) for i, c in enumerate(cols)))
    print('   ' + '  '.join('-' * widths[i] for i in range(len(cols))))
    for r in rows:
        print('   ' + '  '.join(str(r.get(c[0], ''))[:26].ljust(widths[i]) for i, c in enumerate(cols)))


def main():
    args = sys.argv[1:]

    if args and args[0] == '--save':
        if len(args) < 3:
            print('用法: python tools/cfstat_py.py --save <token> <account_id>')
            return 1
        ok = cred_save(TARGET, args[2], args[1])
        print('✅ 凭据已存入 Windows 凭据管理器（target=%s）' % TARGET if ok else '✗ 写入失败')
        return 0 if ok else 1

    tok, acct = cred_read(TARGET)
    if args and args[0] == '--show':
        if tok:
            print('✅ 已存凭据：token %s…（%d 字符）  account=%s' % (tok[:8], len(tok), acct))
        else:
            print('✗ 尚未存凭据 —— 先跑：python tools/cfstat_py.py --save <token> <account_id>')
        return 0
    if not tok or not acct:
        print('✗ 尚未存 CF 凭据。先跑：')
        print('   python tools/cfstat_py.py --save <token> <account_id>')
        return 1

    if args and args[0] == '--sql':
        query = args[1] if len(args) > 1 else ''
        res, err = q(query, tok, acct)
        if err:
            print('✗ ' + err)
            return 1
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0

    print('== CF 下载统计（Analytics Engine）==')
    print('   dataset=%s   account=%s…' % (DATASET, acct[:8]))

    checks = [
        ('① 独立访客数（全部）',
         "SELECT count(DISTINCT index1) AS people, count() AS hits FROM %s" % DATASET,
         [('people', 0), ('hits', 0)]),
        ('② 下载人数（仅 apk，同一 IP 只算一次）',
         "SELECT count(DISTINCT index1) AS people, count() AS hits FROM %s WHERE blob1='apk'" % DATASET,
         [('people', 0), ('hits', 0)]),
        ('③ 目标 × 入口',
         "SELECT blob1 AS target, blob4 AS src, count() AS hits, count(DISTINCT index1) AS people FROM %s GROUP BY target, src ORDER BY hits DESC" % DATASET,
         [('target', 0), ('src', 0), ('hits', 0), ('people', 0)]),
        ('④ 版本分布（仅 apk）',
         "SELECT blob2 AS ver, count() AS hits, count(DISTINCT index1) AS people FROM %s WHERE blob1='apk' GROUP BY ver ORDER BY hits DESC" % DATASET,
         [('ver', 0), ('hits', 0), ('people', 0)]),
        ('⑤ 类型分布',
         "SELECT blob3 AS kind, count() AS hits, count(DISTINCT index1) AS people FROM %s GROUP BY kind ORDER BY hits DESC" % DATASET,
         [('kind', 0), ('hits', 0), ('people', 0)]),
        ('⑥ 按天（近 14 天）',
         "SELECT toDate(timestamp) AS day, count() AS hits, count(DISTINCT index1) AS people FROM %s GROUP BY day ORDER BY day DESC LIMIT 14" % DATASET,
         [('day', 0), ('hits', 0), ('people', 0)]),
    ]
    for title, query, cols in checks:
        res, err = q(query, tok, acct)
        if err:
            print('\n── %s ──\n   ✗ %s' % (title, err[:200]))
        else:
            table(res, title, cols)

    print('\n★提醒：本数据集只记录「绑定 + 重新部署生效」之后的下载；GitHub 的历史累计不在其中。')
    return 0


sys.exit(main())
