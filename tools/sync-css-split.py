# -*- coding: utf-8 -*-
"""app.css 拆分为 3 文件后，同步所有依赖（12 个文件 / 29 处引用）。
每处替换都断言原串唯一存在，避免误伤。"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
changed = []


def edit(rel, pairs):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for old, new, tag in pairs:
        if s.count(old) != 1:
            print('❌ [%s] %s 出现 %d 次（期望 1）' % (rel, tag, s.count(old)))
            sys.exit(1)
        s = s.replace(old, new)
        print('   ✅ %-22s %s' % (rel, tag))
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    changed.append(rel)


# ---------- 1. 运行时：index.html 引入（顺序不可调换）----------
edit('www/index.html', [(
    '<link rel="stylesheet" href="app.css">',
    '<link rel="stylesheet" href="app.css">\n'
    '    <!-- ★2026-10-25 app.css 拆为 3 层，引入顺序不可调换（保序切分，见 app.css 头部说明） -->\n'
    '    <link rel="stylesheet" href="app-modal.css">\n'
    '    <link rel="stylesheet" href="app-form.css">',
    '加 app-modal.css / app-form.css 引入')])

# ---------- 2. 离线缓存：sw.js ----------
edit('www/sw.js', [
    ("'./app.css'", "'./app.css', './app-modal.css', './app-form.css'", 'CORE_ASSETS 加 2 项'),
    ("const CACHE_NAME = 'xixi-hiking-v90';", "const CACHE_NAME = 'xixi-hiking-v91';", 'CACHE_NAME v90→v91'),
])

# ---------- 3. 读源码断言：test.js 必须拼接全部 CSS ----------
edit('test.js', [(
    "const _APP_CSS = path.join(ROOT, 'www/app.css');\n"
    "function readPage() {\n"
    "    let _css = '';\n"
    "    try { _css = fs.readFileSync(_APP_CSS, 'utf8'); } catch (e) {}\n"
    "    return fs.readFileSync(HTML, 'utf8') + '\\n<style>' + _css + '</style>\\n';\n"
    "}",
    "// ★2026-10-25 app.css 已拆为 3 个文件（保序切分）：必须**全部拼接**，\n"
    "//   否则断言只扫到第 1 段，拆出去的部分全部漏检 = 假绿。\n"
    "const CSS_FILES = ['app.css', 'app-modal.css', 'app-form.css'];\n"
    "function readPage() {\n"
    "    let _css = '';\n"
    "    for (const _f of CSS_FILES) {\n"
    "        try { _css += fs.readFileSync(path.join(ROOT, 'www', _f), 'utf8') + '\\n'; } catch (e) {}\n"
    "    }\n"
    "    return fs.readFileSync(HTML, 'utf8') + '\\n<style>' + _css + '</style>\\n';\n"
    "}",
    'readPage 拼接 3 个 CSS')])

# ---------- 4. audit.js ----------
edit('tools/audit.js', [(
    "const cssAll = fs.readFileSync(path.join(WWW, 'app.css'), 'utf8');",
    "const cssAll = ['app.css', 'app-modal.css', 'app-form.css']\n"
    "    .map((f) => { try { return fs.readFileSync(path.join(WWW, f), 'utf8'); } catch (e) { return ''; } })\n"
    "    .join('\\n');",
    'cssAll 拼接 3 个 CSS')])

# ---------- 5. deepcheck.js ----------
edit('tools/deepcheck.js', [(
    "const pageCss = (() => { try { return fs.readFileSync(path.join(WWW, 'app.css'), 'utf8'); } catch (e) { return ''; } })();",
    "// ★2026-10-25 app.css 拆为 3 个文件，此处拼接全部（否则 ①⑥⑦ 信号只扫到第 1 段）\n"
    "const pageCss = (() => { try {\n"
    "  return ['app.css', 'app-modal.css', 'app-form.css']\n"
    "    .map((f) => fs.readFileSync(path.join(WWW, f), 'utf8')).join('\\n');\n"
    "} catch (e) { return ''; } })();",
    'pageCss 拼接 3 个 CSS')])

# ---------- 6. map.js ----------
edit('tools/map.js', [(
    "const JS_FILES = ['index.html', 'app.css',",
    "const JS_FILES = ['index.html', 'app.css', 'app-modal.css', 'app-form.css',",
    'JS_FILES 加 2 个 CSS')])

edit('tools/map.js', [(
    "    if (f === 'app.css') {",
    "    if (f === 'app.css' || f === 'app-modal.css' || f === 'app-form.css') {",
    '样式分区索引覆盖 3 个 CSS')])

# ---------- 7. 同步清单：prev-snapshot / ghsync / release / versiondiff ----------
for rel, marker in [
    ('prev-snapshot.js', "['index.html', 'app.css',"),
    ('tools/ghsync.js', "['index.html', 'app.css',"),
    ('tools/release.js', "['index.html', 'app.css',"),
    ('tools/versiondiff.js', "['index.html', 'app.css',"),
]:
    edit(rel, [(marker, marker + " 'app-modal.css', 'app-form.css',", 'WWW 清单加 2 个 CSS')])

# ---------- 8. security.js 哈希清单（ResGuard 完整性校验必须覆盖全部 CSS）----------
edit('tools/security.js', [(
    "const HASH_FILES = ['index.html', 'app.css',",
    "const HASH_FILES = ['index.html', 'app.css', 'app-modal.css', 'app-form.css',",
    'HASH_FILES 加 2 个 CSS')])

# ---------- 9. rollback.js 路径映射 ----------
edit('tools/rollback.js', [(
    "['app.css', 'www/app.css'],",
    "['app.css', 'www/app.css'],\n    ['app-modal.css', 'www/app-modal.css'],\n    ['app-form.css', 'www/app-form.css'],",
    '回滚映射加 2 个')])

print('\n✅ 共修改 %d 个文件' % len(changed))
