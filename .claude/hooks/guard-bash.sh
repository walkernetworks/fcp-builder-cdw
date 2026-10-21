#!/usr/bin/env bash
# PreToolUse guard for the Bash tool (registered in .claude/settings.json).
#
# Denies shell commands that could destroy the local database, the data or backups folders, or uncommitted work,
# whatever a prompt says: see "Data handling" in CLAUDE.md. Those operations are done by hand, outside Claude Code.
# It only sees commands Claude Code runs; the app's own queries (deleting an engagement) are not affected.
# Forward migrations are allowed, and a backup runs first (scripts/db-backup.sh); if the backup fails, the
# migration is denied.
#
# Fails closed: if the input cannot be read, or this script hits an error, the command is blocked (exit 2).
set -uo pipefail
trap 'echo "guard-bash: internal error; the command was blocked to be safe." >&2; exit 2' ERR

payload=$(cat)
if [ -z "$payload" ]; then echo "guard-bash: no hook input; blocked." >&2; exit 2; fi

# The command itself; without jq or python3, the whole payload is checked (it contains the command, so this only over-blocks).
command=""
if command -v jq >/dev/null 2>&1; then
  command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
elif command -v python3 >/dev/null 2>&1; then
  command=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)
fi
[ -n "$command" ] || command=$payload

deny() {
  # The reason is fixed text with no quotes or backslashes, so it is valid JSON as written.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by .claude/hooks/guard-bash.sh: %s. Destructive database and file operations are never run by Claude Code, even when asked; do this by hand in your own terminal if you really mean it (see Data handling in CLAUDE.md)."}}\n' "$1"
  exit 0
}

shopt -s nocasematch
B='(^|[^[:alnum:]_])'   # start of a word
E='([^[:alnum:]_]|$)'   # end of a word
S='[[:space:]]+'

# SQL that removes databases, tables or rows.
[[ $command =~ ${B}drop${S}(database|schema|table)${E} ]] && deny "DROP DATABASE, DROP SCHEMA or DROP TABLE"
[[ $command =~ ${B}truncate${E} ]] && deny "TRUNCATE"
if [[ $command =~ ${B}delete${S}from${E} ]]; then
  [[ $command =~ ${B}where${E} ]] || deny "DELETE without a WHERE clause"
  [[ $command =~ ${B}where${S}(1|true|1[[:space:]]*=[[:space:]]*1|\'1\'[[:space:]]*=[[:space:]]*\'1\'|[^[:space:]]+${S}is${S}not${S}null|[^[:space:]]+${S}like${S}\'%\')([[:space:]\;\"\']|$) ]] && deny "DELETE with a WHERE clause that matches every row"
fi

# Schema tools and database administration that drop or overwrite.
[[ $command =~ drizzle-kit${S}(drop|push)${E} ]] && deny "drizzle-kit drop or drizzle-kit push"
[[ $command =~ db:push ]] && deny "pnpm db:push (it generates new migrations; apply existing ones with pnpm db:migrate)"
[[ $command =~ ${B}mysqladmin${S}(.*${S})?drop${E} ]] && deny "mysqladmin drop"
# Loading a dump replaces tables (dumps contain DROP TABLE): restores are done by hand.
[[ $command =~ ${B}mysql${E}[^\|\;\&]*\<[[:space:]]*[^\<[:space:]] ]] && deny "loading SQL from a file into mysql (a restore)"
[[ $command =~ \|[[:space:]]*mysql${E} ]] && deny "piping SQL into mysql (a restore)"

# Deleting the MySQL data directory, data/, backups/ or uploads.
if [[ $command =~ ${B}(rm|rmdir|unlink|shred|srm)${E} || $command =~ ${B}-delete${E} ]]; then
  [[ $command =~ (var/mysql|var/lib/mysql|mysql/data|mysql-files|/mysql/) ]] && deny "deleting the MySQL data directory"
  [[ $command =~ (^|[[:space:]/\"\'=])(data|backups|uploads?)(/|[[:space:]\"\'\;\&\|\)]|$) ]] && deny "deleting data/, backups/ or uploads"
fi

# Git operations that throw away work or ignored files (.env, data/, backups/).
if [[ $command =~ ${B}git${S}(.*${S})?clean${E} ]]; then
  [[ $command =~ ${S}(-[a-z]*n[a-z]*|--dry-run)${E} ]] || deny "git clean (only git clean -n, a dry run, is allowed)"
fi
[[ $command =~ ${B}git${S}(.*${S})?reset${S}(.*${S})?--hard${E} ]] && deny "git reset --hard"

# This guard and the settings that load it cannot be changed or switched off from a command.
if [[ $command =~ (\.claude/hooks|\.claude/settings) ]]; then
  [[ $command =~ (\>|${B}(sed|perl)${S}(-[a-z]*${S})*-i|${B}(rm|mv|cp|tee|chmod|chown|ln|truncate|install|dd)${E}|${B}git${S}(.*${S})?(checkout|restore|rm|mv|stash)${E}) ]] && deny "changing the guard hook or Claude Code settings"
fi

# Forward migrations are allowed; back the database up first (pnpm db:migrate already does).
if [[ $command =~ drizzle-kit${S}migrate${E} ]]; then
  project=${CLAUDE_PROJECT_DIR:-$(pwd)}
  if ! bash "$project/scripts/db-backup.sh" >&2; then
    deny "the pre-migration backup failed, so the migration did not run"
  fi
fi

exit 0
