# -*- coding: utf-8 -*-
"""
tools/dlstat_py.py —— 下载量统计（GitHub Releases）

为什么用 python：本机 node https 连不上 api.github.com（hosts 有活动行 127.0.0.1
  api.github.com，node 又不读 https_proxy）→ 与 tools/ghrelease_py.py 同一条降级通道。

用法：
  python tools/dlstat_py.py            # 汇总：累计 / 最新版 / 最近 10 个版本
  python tools/dlstat_py.py --all      # 列出全部有资产的版本
  python tools/dlstat_py.py --json     # 输出原始 JSON

★口径（必须记住，别误读）：
  GitHub 的 `download_count` 是「**文件被下载的次数**」——
  含重复下载、爬虫抓取、以及发版时脚本自己的「下载回验」，**无法按人去重**。
  要「多少人下载（同一 IP 只算一次）」得看 Cloudflare Analytics Engine，
  且需先在 CF 控制台绑定数据集（步骤见会话根 `CF-下载统计-配置步骤.md`）。

★快照：每次运行会把结果写入 `tools/notes/dlstat-history.json`，
  下次运行据此算出「自上次查询以来的新增下载」。
"""
import io
import json
import os
import subprocess
import sys
import urllib.request

REPO = 'NiUKinGDoM/xixi-hiking'
HIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notes', 'dlstat-history.json')
ROOT_TOOLS = os.path.dirname(os.path.abspath(__file__))


def token():
    t = (os.environ.get('GH_TOKEN') or '').strip()
    if t.startswith('ghp_'):
        return t
    try:
        out = subprocess.run([sys.executable, os.path.join(ROOT_TOOLS, 'ghtoken.py')],
                             capture_output=True, text=True, timeout=30)
        t = (out.stdout or '').strip().split('\n')[0].strip()
        return t if t.startswith('ghp_') else None
    except Exception:
        return None


def fetch(tok):
    h = {'User-Agent': 'xixi-dlstat', 'Accept': 'application/vnd.github+json'}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    req = urllib.request.Request('https://api.github.com/repos/%s/releases?per_page=100' % REPO, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def bar(n, mx, width=18):
    if mx <= 0:
        return ''
    k = max(1, int(round(n / mx * width))) if n > 0 else 0
    return '█' * k


def main():
    args = sys.argv[1:]
    tok = token()
    try:
        rels = fetch(tok)
    except Exception as e:
        print('✗ 拉取失败：%s（本机网络受限时属正常，可换网络重试）' % e)
        return 1

    rows = []
    for r in rels:
        assets = [a for a in (r.get('assets') or []) if a.get('name', '').lower().endswith('.apk')]
        if not assets:
            continue
        n = sum(int(a.get('download_count') or 0) for a in assets)
        rows.append({
            'tag': r.get('tag_name') or '?',
            'date': (r.get('published_at') or '')[:10],
            'ts': r.get('published_at') or '',   # ★按完整时间戳排序：同一天发多个版本时，只按日期排会乱（曾把 v1.2.3.10 误判成「最新版」）
            'count': n,
            'size': assets[0].get('size') or 0,
        })
    rows.sort(key=lambda x: x['ts'])

    if '--json' in args:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    total = sum(r['count'] for r in rows)
    latest = rows[-1] if rows else None

    # 快照对比：算「自上次查询以来新增」
    prev_total, prev_at, delta = None, None, None
    try:
        with io.open(HIST, encoding='utf-8') as f:
            old = json.load(f)
        prev_total = old.get('total')
        prev_at = old.get('at', '')[:16].replace('T', ' ')
        by_tag = {r['tag']: r['count'] for r in rows}
        delta = sum(n - old.get('by_tag', {}).get(t, 0) for t, n in by_tag.items())
    except Exception:
        pass

    print('== 下载量统计（GitHub Releases · 累计口径）==')
    print('   查询时间：%s' % __import__('time').strftime('%Y-%m-%d %H:%M'))
    print('')
    if latest:
        print('📦 最新版本 %s：%d 次下载（发布于 %s）' % (latest['tag'], latest['count'], latest['date']))
    print('📊 累计总下载：%d 次（%d 个版本有安装包）' % (total, len(rows)))
    if len(rels) >= 100:
        print('   ★本次只统计了最近 100 个 Release（API 单页上限）→ 真实累计只会更多')
    if prev_total is not None:
        print('🆕 自上次查询（%s，%d 次）以来：+%d 次' % (prev_at or '?', prev_total, delta if delta is not None else 0))
        print('   ★注意：新增里也包含你自己装包 / 脚本回验产生的下载')
    if total < 60:
        print('   ★样本还很小（%d 次）：目前下载大概率主要来自你自己与身边朋友的验证' % total)
    print('')

    show = rows if '--all' in args else rows[-10:]
    mx = max(r['count'] for r in show) if show else 1
    print('最近 %d 个版本：' % len(show))
    for r in show:
        print('  %-12s %4d 次  %-18s %s' % (r['tag'], r['count'], bar(r['count'], mx), r['date']))

    print('')
    print('★口径提醒（这条最重要）：')
    print('  · 这是「下载**次数**」，不是「**人数**」——含重复下载、爬虫抓取、')
    print('    以及发版脚本自己的「下载回验」，GitHub 不提供去重。')
    print('  · 要「多少人（同一 IP 只算一次）」→ 看 Cloudflare Analytics Engine：')
    print('    需先在 CF 控制台绑定数据集（见 CF-下载统计-配置步骤.md），')
    print('    然后在 Analytics Engine 里跑：')
    print("      SELECT count(DISTINCT index1) AS people FROM xixi_hiking_dl WHERE blob1='apk'")
    print('    ★别名一律写英文：CF 的 SQL 解析器不认中文标识符（写「AS 人数」会报 sql parser error）')
    print('  · 「多少人打开了官网」→ CF Pages 项目 → Metrics 里的 Unique visitors')

    try:
        os.makedirs(os.path.dirname(HIST), exist_ok=True)
        with io.open(HIST, 'w', encoding='utf-8') as f:
            f.write(json.dumps({
                'at': __import__('time').strftime('%Y-%m-%dT%H:%M:%S'),
                'total': total,
                'by_tag': {r['tag']: r['count'] for r in rows},
            }, ensure_ascii=False, indent=1))
        print('\n（快照已保存：tools/notes/dlstat-history.json —— 下次运行能算出新增）')
    except Exception as e:
        print('\n（快照保存跳过：%s）' % e)
    return 0


sys.exit(main())
