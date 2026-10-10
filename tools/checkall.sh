#!/usr/bin/env bash
#
# tools/checkall.sh —— 全量门禁（bash 直跑版 · 专治 node spawn EBUSY）
#
# 为什么需要它（2026-10-10 新增）：
#   node 版 `tools/checkall.js` 用 child_process.spawn 逐套跑测试，而**本机 spawn 会集体
#   EBUSY**（每套都报「未解析（退出码 null / EBUSY）」）→ 一条命令跑不通，只能人工逐套
#   直跑再肉眼汇总（每次 10+ 分钟、还容易漏看一套）。
#   shell 的 fork/exec 不走 node 的 spawn → 本脚本用 bash 顺序直跑，一条命令拿到同样结论。
#
# ★smoke.js 的额外处理：它内部靠 spawnSync 调 `node --check`，EBUSY 下会报
#   **32 项全红、且错误信息为空**（`语法错误: ` 后面没内容）= 纯假失败。
#   本脚本识别该特征后自动降级：用 bash 直跑 `node --check` 复刻「语法校验」部分，
#   给出真实结论；「安全执行」部分本机确实测不了，会在输出里注明。
#
# 用法：
#   bash tools/checkall.sh              # 全量（含 E2E，最慢约 3~5 分钟）
#   bash tools/checkall.sh --no-e2e     # 跳过 E2E（约 40 秒）
#   bash tools/checkall.sh --fast       # smoke + modalw + test + sitetest + sitecl
#   bash tools/checkall.sh --online     # 再加线上站点体检（siteaudit，需网络，约 +60s）
# 退出码：0 = 全过；1 = 有失败（可直接当门禁）
#
# 与 node 版 checkall.js 的关系：套件清单一致、结论等价；本脚本多了 smoke 的 EBUSY 降级
# 与 --online。环境正常时 node 版更省事，本机（EBUSY）用本脚本。

set -u
cd "$(dirname "$0")/.." || exit 1

# ---------- 环境 ----------
export PATH="/usr/bin:/bin:/c/Windows/System32:/c/Windows:$PATH"
export NODE_PATH="C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules"
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"

NODE="C:/Users/NIU-XC/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
if [ ! -f "$NODE" ]; then NODE="node"; fi

FAST=0; SKIP_E2E=0; ONLINE=0
for a in "$@"; do
  case "$a" in
    --fast)   FAST=1 ;;
    --no-e2e) SKIP_E2E=1 ;;
    --online) ONLINE=1 ;;
  esac
done

TOTAL_PASS=0; TOTAL_FAIL=0; ANY_FAIL=0
FAILED_LIST=""

_run() {  # $1=name，其余=命令；输出结论行
  local name="$1"; shift
  printf '▶ %-38s ' "$name"
  local out line p f
  out="$("$@" 2>&1)"
  line="$(printf '%s\n' "$out" | grep -oE '[0-9]+ 通过 / [0-9]+ 失败' | tail -1)"
  if [ -z "$line" ]; then
    echo "⚠ 未解析结果行"
    ANY_FAIL=1
    FAILED_LIST="${FAILED_LIST}  · ${name}（输出里没有「N 通过 / M 失败」）"$'\n'
    return
  fi
  p="${line%% 通过*}"; f="${line##*/ }"; f="${f%% 失败*}"
  TOTAL_PASS=$((TOTAL_PASS + p)); TOTAL_FAIL=$((TOTAL_FAIL + f))
  if [ "$f" = "0" ]; then
    echo "✅ ${line}"
  else
    echo "❌ ${line}"
    ANY_FAIL=1
    FAILED_LIST="${FAILED_LIST}  · ${name}（${line}）"$'\n'
  fi
}

run_smoke() {  # smoke.js + EBUSY 降级
  printf '▶ %-38s ' "工具链冒烟（语法+安全执行）"
  local out line p blank
  out="$("$NODE" tools/smoke.js 2>&1)"
  line="$(printf '%s\n' "$out" | grep -oE '[0-9]+ 通过 / [0-9]+ 失败' | tail -1)"
  p="${line%% 通过*}"
  blank="$(printf '%s\n' "$out" | grep -cE '语法✗.*语法错误: *$')"
  # EBUSY 特征：0 通过 + 大量「错误信息为空」的语法失败
  if [ "$p" = "0" ] && [ "${blank:-0}" -ge 10 ]; then
    local files n bad
    files="$(ls tools/*.js *.js e2e/*.js 2>/dev/null)"
    n=0; bad=""
    for f in $files; do
      if "$NODE" --check "$f" >/dev/null 2>&1; then n=$((n + 1)); else bad="$bad $f"; fi
    done
    if [ -z "$bad" ]; then
      echo "✅ ${n} 个 JS 语法全通过（★EBUSY 降级：node --check 直跑替代；安全执行部分本机测不了）"
      TOTAL_PASS=$((TOTAL_PASS + n))
    else
      echo "❌ 语法错误:$bad"
      ANY_FAIL=1
      TOTAL_FAIL=$((TOTAL_FAIL + 1))
      FAILED_LIST="${FAILED_LIST}  · 工具链冒烟（语法错误:$bad）"$'\n'
    fi
    return
  fi
  if [ -z "$line" ]; then
    echo "⚠ 未解析结果行"
    ANY_FAIL=1
    FAILED_LIST="${FAILED_LIST}  · 工具链冒烟（未解析）"$'\n'
    return
  fi
  local f; f="${line##*/ }"; f="${f%% 失败*}"
  TOTAL_PASS=$((TOTAL_PASS + p)); TOTAL_FAIL=$((TOTAL_FAIL + f))
  if [ "$f" = "0" ]; then
    echo "✅ ${line}"
  else
    echo "❌ ${line}"
    ANY_FAIL=1
    FAILED_LIST="${FAILED_LIST}  · 工具链冒烟（${line}）"$'\n'
  fi
}

echo "== checkall.sh == 全量门禁（bash 直跑）"
echo "   工程: $(pwd)"
echo ""

if [ "$FAST" = "1" ]; then
  run_smoke
  _run "弹窗内联宽度锁定"                     "$NODE" tools/modalwidth.js --quiet
  _run "数据层/语法自检"                      "$NODE" test.js
  _run "官网下载入口（Pages Function）"       "$NODE" tools/sitetest.js
  _run "官网更新日志同步（vs BUILTIN）"       "$NODE" tools/sitechangelog.js --check
else
  run_smoke
  _run "iOS 网页适配"                         "$NODE" tools/ioscheck.js --no-sim --no-net
  _run "数据层/语法自检"                      "$NODE" test.js
  _run "jsdom UI 自检"                        "$NODE" test-ui.js
  _run "P0P3 链路自检"                        "$NODE" _test_p0p3.js
  if [ "$SKIP_E2E" = "1" ]; then
    printf '▶ %-38s %s\n' "E2E 真实渲染回归" "—— 已跳过（--no-e2e）"
  else
    _run "E2E 真实渲染回归"                   "$NODE" e2e/run.js
  fi
  _run "弹窗内联宽度锁定"                     "$NODE" tools/modalwidth.js --quiet
  _run "官网下载入口（Pages Function）"       "$NODE" tools/sitetest.js
  _run "官网更新日志同步（vs BUILTIN）"       "$NODE" tools/sitechangelog.js --check
fi

if [ "$ONLINE" = "1" ]; then
  _run "★线上站点体检（siteaudit）"           "$NODE" tools/siteaudit.js
fi

echo ""
echo "================ 汇总 ================"
echo "合计：${TOTAL_PASS} 通过 / ${TOTAL_FAIL} 失败"
if [ "$ANY_FAIL" = "0" ]; then
  echo "✅ 全过"
  exit 0
fi
echo "❌ 有失败："
printf '%s' "$FAILED_LIST"
exit 1
