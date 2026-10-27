# -*- coding: utf-8 -*-

"""全局函数收敛 v2（★2026-10-26 修正版）：只私有化函数，变量一律留在全局。

★当前状态：**不启用**。2026-10-26 实测三轮全部引入隐性回归（详见 .workbuddy/memory/2026-10-26.md 第七节）。
本脚本仅作备用/研究，**不要直接跑**；真要再试，先读那份记录里的五个坑。

v1 失败原因（两次）：
  ① 正则漏了 `async function` 和 `window.xxx` 引用 → 函数没导出
  ② **变量导出后仍会分裂**：`msCelebrateQueue = []` 这种重新赋值只改 IIFE 内的局部变量，
     window 上的副本脱钩（原逻辑：导出后别处读写 window.xxx 与实际变量不同步）。
     ⇒ 变量**不能**进 IIFE。

v2 做法：
  1) 把顶层 `var/let/const x = ...;` 整行**剪切到 IIFE 之前**（保持全局语义，跨文件读写照旧）
  2) 剩余内容包进 IIFE，函数成为私有；只把「被其他文件/HTML/e2e 引用」的函数导到 window
  3) 函数导出写在 IIFE **开头**（function 声明 hoist，后段抛错也不会连带丢导出）

不包 IIFE：app-core.js（21 个变量被跨文件赋值）、app-data-plans.js（3 个）。
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')
NODE = 'C:/Users/NIU-XC/.workbuddy/binaries/node/versions/22.22.2-6/node.exe'

ALL_JS = ['app-core.js', 'app-data.js', 'app-data-detail.js', 'app-data-lightbox.js',
          'app-data-heatmap.js', 'app-data-plans.js', 'app-data-plan-detail.js',
          'app-init.js', 'app-sync.js']
SKIP = {'app-core.js', 'app-data-plans.js'}
TARGETS = [f for f in ALL_JS if f not in SKIP]
# --only a.js,b.js 只处理指定文件（二分定位用）
for _a in sys.argv[1:]:
    if _a.startswith('--only='):
        TARGETS = [x.strip() for x in _a[7:].split(',') if x.strip()]

DRY = '--dry-run' in sys.argv

src = {f: io.open(os.path.join(WWW, f), encoding='utf-8').read() for f in ALL_JS}
html = io.open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()
ext = ''
for d in [os.path.join(ROOT, 'e2e'), os.path.join(ROOT, 'tools'), ROOT]:
    for fn in os.listdir(d):
        if fn.endswith('.js'):
            try:
                ext += io.open(os.path.join(d, fn), encoding='utf-8').read() + '\n'
            except Exception:
                pass

fn_re = re.compile(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(')
# ★只匹配**完整单行**的变量声明（行尾必须是分号）。
#   原写法 `^(var|let|const)\s+name` 会把多行声明 `var a = 1,` 的首行剪走、
#   留下孤立的续行 ⇒ SyntaxError: Unexpected token 'var'（app-data-plan-detail.js 实测）。
var_line_re = re.compile(r'^(var|let|const)\s+[A-Za-z_$][\w$]*.*;\s*$')


def used_outside(name, own):
    pat = re.compile(r'\b' + re.escape(name) + r'\b')
    cnt = 0
    for g, s in src.items():
        if g == own:
            continue
        cnt += len(pat.findall(s))
    return cnt + len(pat.findall(html)) + len(pat.findall(ext))


def process(f):
    s = src[f]
    if '全局收敛：本文件已包进 IIFE' in s:
        print('  ⏭ %-26s 已处理，跳过' % f)
        return None
    lines = s.split('\n')
    fn_names, var_names, keep = [], [], []
    for ln in lines:
        m = fn_re.match(ln)
        if m:
            fn_names.append(m.group(1))
            keep.append(ln)
            continue
        m = var_line_re.match(ln)
        if m:
            # ★只在 IIFE 外**声明**名字，初始化仍留在原位置 ——保持执行顺序。
            #   v2 曾把整行剪到 IIFE 前：若初始化表达式依赖下面的函数
            #   （函数现在在 IIFE 内）→ ReferenceError，连带后续所有 script 不执行
            #   （p0p3 实测从 302 项掉到 253 项，就是 app-data-plan-detail.js 引起）。
            vm = re.match(r'^(?:var|let|const)\s+([A-Za-z_$][\w$]*)', ln)
            var_names.append(vm.group(1))
            rest = ln[len(ln) - len(ln.lstrip()):]
            body = re.sub(r'^(?:var|let|const)\s+', '', ln.strip())
            keep.append(body)          # 原位变成纯赋值
            continue
        keep.append(ln)

    exp_fns = [n for n in fn_names if used_outside(n, f) > 0]
    priv_fns = [n for n in fn_names if n not in exp_fns]

    head = (
        "/* ===== ★2026-10-26 全局收敛：本文件函数已包进 IIFE =====\n"
        "   本文件顶层函数 %d 个，其中 %d 个仅本文件使用 → 已成为文件私有；%d 个跨文件/测试需要 → 导出到 window。\n"
        "   顶层变量 %d 个**保持全局**（不放进 IIFE）——变量会被跨文件或本文件重新赋值，\n"
        "   放进 IIFE 会导致 window 副本与局部变量脱钩（v1 实测：msCelebrateQueue 队列长度恒为 0）。\n"
        "   ★正文缩进保持不变：tools 下多个脚本按源码正则匹配。\n"
        "   ★不包 IIFE 的文件：app-core.js、app-data-plans.js（变量被跨文件赋值）。 */\n"
    ) % (len(fn_names), len(priv_fns), len(exp_fns), len(var_names))
    if var_names:
        head += '\n'.join('var %s;' % n for n in var_names) + '\n'   # 仅声明，不初始化
    head += "\n(function () {\n"
    if exp_fns:
        head += "/* ---- 函数导出（hoist 生效，勿删）---- */\n" + \
                '\n'.join('window.%s = %s;' % (n, n) for n in exp_fns) + '\n'

    body = '\n'.join(keep).rstrip('\n') + '\n'
    return {'text': head + body + "})();\n",
            'fns': len(fn_names), 'exp': len(exp_fns), 'priv': len(priv_fns), 'vars': len(var_names)}


print('== 全局收敛 v2（只收敛函数，变量保持全局）==')
print('目标 %d 个（跳过 %s）\n' % (len(TARGETS), ', '.join(sorted(SKIP))))
res = {}
for f in TARGETS:
    r = process(f)
    if r:
        res[f] = r
        print('  %-26s 函数 %2d → 私有 %2d / 导出 %2d | 变量 %2d 保持全局' % (
            f, r['fns'], r['priv'], r['exp'], r['vars']))

print('\n合计：函数私有化 %d 个（变量全部保持全局）' % sum(r['priv'] for r in res.values()))
if DRY:
    print('\n[dry-run] 未写入')
    sys.exit(0)

for f, r in res.items():
    p = os.path.join(WWW, f)
    io.open(p, 'w', encoding='utf-8', newline='').write(r['text'])
    chk = subprocess.run([NODE, '--check', p], capture_output=True, text=True)
    if chk.returncode != 0:
        io.open(p, 'w', encoding='utf-8', newline='').write(src[f])
        print('❌ %s 语法错误已还原：%s' % (f, chk.stderr[:300]))
        sys.exit(1)
    print('✅ %s' % f)
print('\n完成')
