#!/bin/sh
# Installs Fusion for Claude Code and/or opencode (macOS, Linux, Git Bash on Windows). Safe to run again.
# Uninstall: sh install.sh --uninstall
set -e
here=$(cd "$(dirname "$0")" && pwd)
oc="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
if [ "$1" = "--uninstall" ]; then
  rm -rf "$HOME/.fusion/fusion.mjs" "$HOME/.claude/skills/fusion" "$oc/command/fusion.md" "$oc/agents/fusion-worker.md"
  echo "Fusion removed (backup copies in ~/.fusion/backups are kept)."; exit 0
fi
command -v node >/dev/null 2>&1 || { echo "Fusion needs Node.js 18 or newer: https://nodejs.org"; exit 1; }
command -v opencode >/dev/null 2>&1 || [ -x "$HOME/.opencode/bin/opencode" ] || echo "Note: the worker runs through opencode (https://opencode.ai). Install it before using /fusion."
mkdir -p "$HOME/.fusion"; cp "$here/fusion.mjs" "$HOME/.fusion/fusion.mjs"
if [ -d "$HOME/.claude" ]; then
  mkdir -p "$HOME/.claude/skills/fusion"; cp "$here/claude-code/skills/fusion/SKILL.md" "$HOME/.claude/skills/fusion/"
  echo "Claude Code: /fusion installed"
fi
mkdir -p "$oc/command" "$oc/agents"
cp "$here/opencode/command/fusion.md" "$oc/command/"; cp "$here/opencode/agents/fusion-worker.md" "$oc/agents/"
echo "opencode: /fusion and the fusion-worker agent installed"
echo "Done. Restart Claude Code / opencode, then type /fusion."
