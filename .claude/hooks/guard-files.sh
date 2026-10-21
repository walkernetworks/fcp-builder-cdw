#!/usr/bin/env bash
# PreToolUse guard for the file-editing tools (registered in .claude/settings.json).
#
# Claude Code cannot change the guard hooks or any Claude Code settings file, so the guard cannot be switched off
# (for example with disableAllHooks) from inside a session. Edit them by hand.
# Fails closed: unreadable input or an internal error blocks the edit (exit 2).
set -uo pipefail
trap 'echo "guard-files: internal error; the edit was blocked to be safe." >&2; exit 2' ERR

payload=$(cat)
if [ -z "$payload" ]; then echo "guard-files: no hook input; blocked." >&2; exit 2; fi

target=""
if command -v jq >/dev/null 2>&1; then
  target=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)
elif command -v python3 >/dev/null 2>&1; then
  target=$(printf '%s' "$payload" | python3 -c 'import json,sys; i=json.load(sys.stdin).get("tool_input",{}); print(i.get("file_path") or i.get("notebook_path") or "")' 2>/dev/null || true)
fi
[ -n "$target" ] || target=$payload

if [[ $target =~ (\.claude/hooks/|\.claude/settings(\.local)?\.json|managed-settings\.json) ]]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by .claude/hooks/guard-files.sh: Claude Code does not edit its guard hooks or settings files. Change them by hand in your editor."}}\n'
fi
exit 0
