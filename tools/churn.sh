#!/usr/bin/env bash
#
# tools/churn.sh —— 改动热点分析（★2026-10-10 新增）
#
# 解决什么问题：
#   本项目 2 个月发了 176 个版本（≈ 每天近 3 版）。快是好事，但**某个文件被反复改**
#   往往意味着「那块设计一直没定下来」—— 这类地方是重构/收敛的候选。
#   本工具从 git 历史把这件事量化出来，免得靠感觉猜。
#
# ★为什么用 bash 而不是 node：读 git 历史必须调用 git 命令，
#   而本机 node 的 `child_process.spawn` 会集体 EBUSY。shell 直调 git 不受影响。
#
# 用法：
#   bash tools/churn.sh              # Top 20 热点文件 + 提交节奏 + 同号重发统计
#   bash tools/churn.sh 40           # 看 Top 40
#   bash tools/churn.sh --since 30   # 只看最近 30 天
#
# 说明：git 仓库在 `backups/github-同步目录/xixi-hiking/`（不是主工程目录）。

set -u
TOP="${1:-20}"
case "$TOP" in --*) TOP=20 ;; esac
SINCE=""
if [ "${1:-}" = "--since" ] && [ -n "${2:-}" ]; then SINCE="--since=$2.days"; fi
if [ "${2:-}" = "--since" ] && [ -n "${3:-}" ]; then SINCE="--since=$3.days"; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GH="$ROOT/../backups/github-同步目录/xixi-hiking"

if [ ! -d "$GH/.git" ]; then
  echo "✗ 找不到 git 仓库: $GH"
  exit 1
fi

cd "$GH" || exit 1

TOTAL=$(git rev-list --count HEAD 2>/dev/null || echo 0)
FIRST=$(git log --reverse --format=%cs 2>/dev/null | head -1)
LAST=$(git log -1 --format=%cs 2>/dev/null)

echo "== churn == 改动热点分析"
echo "   仓库: $GH"
echo "   提交数: $TOTAL   区间: $FIRST → $LAST ${SINCE:+（筛选 $SINCE）}"
echo

echo "【改动最频繁的文件】—— 次数多 = 那块一直在变，是重构/收敛的候选"
echo
printf '  %6s  %s\n' "次数" "文件"
echo "  --------------------------------------------"
git -c core.quotepath=false log --numstat --pretty=format: $SINCE 2>/dev/null \
  | awk -v TOP="$TOP" '
      NF >= 3 {
        p = $3
        gsub(/"/, "", p)
        if (p == "") next
        n[p]++
      }
      END {
        for (p in n) printf "%d\t%s\n", n[p], p
      }
    ' \
  | sort -rn | head -"$TOP" \
  | awk '{ printf "  %6d  %s\n", $1, $2 }'
echo

echo "【提交节奏】"
echo
git log --format=%cs 2>/dev/null | sort | uniq -c | sort -rn | head -8 \
  | awk '{ printf "  %3d 次提交   %s\n", $1, $2 }'
echo

echo "【同号重发统计】—— 同号重发的代价是「手机收不到更新提示」，值得留意频率"
echo
REBUILD=$(git log --format=%s 2>/dev/null | grep -ciE "rebuild|同号重发|同号修正" || true)
RERELEASE=$(git log --format=%s 2>/dev/null | grep -cE "^release: v" || true)
echo "  发版类提交 : $RERELEASE"
echo "  同号重发   : $REBUILD"
if [ "$RERELEASE" -gt 0 ]; then
  awk -v a="$REBUILD" -v b="$RERELEASE" 'BEGIN{ printf "  占比       : %.0f%%\n", a*100/b }'
fi
echo

echo "【本轮区间内的提交主题（最近 15 条）】"
echo
git log --format='  %cs  %s' 2>/dev/null | head -15
echo
echo "> 提示：若 Top1 长期是同一个文件，说明那块设计还没收敛 —— 值得专门想一次，而不是继续打补丁。"
