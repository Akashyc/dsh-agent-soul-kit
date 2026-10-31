#!/usr/bin/env bash
# dsh-agent-soul 安装包 · macOS 一行装（Linux 也能用）
#
#   curl -fsSL https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.sh | bash
#   带参数：curl -fsSL https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.sh | bash -s -- --setup 大肥鱼
#
# 这里只做 bash 才方便做的三件事：找一个能用的 node、把安装包放到固定位置、在真终端里启动 install.mjs。
# 选方案、一问一答、退出 DSH、安装、心跳、自检都在 install.mjs 里（Windows 的 install.ps1 交给的是同一份）。
#
# 环境变量：DSH_KIT_DIR 安装包放哪（默认 ~/Documents/dsh-agent-soul-kit）；DSH_KIT_REF 安装包的分支（默认 main）；DSH_NODE 指定 node。
set -eo pipefail

# 整段包在 main 里、最后一行才调用：curl 下载到一半断了，bash 不会执行半截脚本
main() {
  local repo="Akashyc/dsh-agent-soul-kit" ref="${DSH_KIT_REF:-main}"
  local kit="${DSH_KIT_DIR:-$HOME/Documents/dsh-agent-soul-kit}"
  say() { printf '  %s\n' "$*"; }
  die() { printf '  ✗ %s\n' "$*" >&2; exit 1; }
  node_ok() { [ -n "$1" ] && [ -x "$1" ] && "$1" -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' 2>/dev/null; }
  # macOS 没装开发者工具时 /usr/bin/git 是个占位，一跑就弹安装框：先试一下 git --version 才算有 git
  has_git() { git --version >/dev/null 2>&1; }

  printf '\n  dsh-agent-soul 安装包\n  ─────────────────────\n'

  # 1. node：DSH_NODE → DSH 自带 → PATH（install.mjs 自己还会再挑一遍写进配置用的那个）
  local node=""
  if node_ok "${DSH_NODE:-}"; then node="$DSH_NODE"; fi
  if [ -z "$node" ]; then
    # DSH 同时带 arm64 和 x64 两份运行时：先挑本机架构的（x64 那份在 Apple 芯片上要走 Rosetta）
    local app c arch
    arch="$(uname -m)"; [ "$arch" = x86_64 ] && arch=x64
    for app in /Applications/*.app "$HOME"/Applications/*.app; do
      case "$(basename "$app")" in *[Dd][Ss][Hh]*|*[Dd]eep[Ss]eek*) ;; *) continue ;; esac
      c="$(find "$app/Contents/Resources" -maxdepth 7 -path "*/$arch/*dependencies/node/bin/node" -type f 2>/dev/null | head -n 1 || true)"
      [ -n "$c" ] || c="$(find "$app/Contents/Resources" -maxdepth 7 -path '*dependencies/node/bin/node' -type f 2>/dev/null | head -n 1 || true)"
      if node_ok "$c"; then node="$c"; break; fi
    done
  fi
  if [ -z "$node" ] && node_ok "$(command -v node || true)"; then node="$(command -v node)"; fi
  [ -n "$node" ] || die "找不到 18 以上的 node。先装 DSH 并打开一次（用它自带的 node），或者 brew install node，或者设 DSH_NODE=<node 的路径> 再跑。"
  say "node：$node（$("$node" -v)）"

  # 2. 安装包：已有就更新（能快进才更新，有本地改动就原样用），没有就 clone 或下载
  if [ -d "$kit/.git" ] && has_git; then
    if git -C "$kit" pull --ff-only --quiet 2>/dev/null; then say "安装包已是最新：$kit"
    else say "安装包有本地改动或连不上 GitHub，照现有的用：$kit"; fi
  elif [ -f "$kit/install.mjs" ]; then
    say "用已有的安装包：$kit（想同步到最新版就跑 install.mjs --kit-update）"
  else
    mkdir -p "$(dirname "$kit")"
    if has_git; then
      git clone --quiet --depth 1 --branch "$ref" "https://github.com/$repo.git" "$kit" \
        || die "git clone 失败。网络不通的话设 HTTPS_PROXY 再跑，或者浏览器下载 https://github.com/$repo/archive/$ref.tar.gz 解压到 $kit"
    else
      mkdir -p "$kit"
      curl -fsSL "https://codeload.github.com/$repo/tar.gz/$ref" | tar -xz --strip-components=1 -C "$kit" \
        || die "下载失败。网络不通的话设 HTTPS_PROXY 再跑，或者浏览器下载 https://github.com/$repo/archive/$ref.tar.gz 解压到 $kit"
    fi
    say "安装包已放好：$kit"
  fi

  # 3. 交给 install.mjs。curl | bash 时标准输入是脚本本身，问答要从 /dev/tty 读；
  #    没有终端（例如在 agent 里跑）就不接，install.mjs 会说清楚下一步（--setup，或 --questions + --answers）
  cd "$kit"
  if { : </dev/tty; } 2>/dev/null; then exec "$node" install.mjs "$@" </dev/tty; fi
  exec "$node" install.mjs "$@"
}

main "$@"
