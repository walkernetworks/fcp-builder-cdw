#!/usr/bin/env bash
# Dumps the local development database (DATABASE_URL, from the environment or .env) to
# backups/<database>-<UTC timestamp>.sql.gz. Runs before every migration (`pnpm db:migrate`, and the
# Claude Code hook in .claude/hooks/guard-bash.sh), so a mistake is always recoverable.
#
# backups/ is git-ignored and holds real customer data: never commit, open or share its files.
# Restore by hand: gunzip -c backups/<file>.sql.gz | mysql -u <user> -p <database>
# Nothing here prints the connection string or the password.
set -euo pipefail
cd "$(dirname "$0")/.."

url="${DATABASE_URL:-}"
if [ -z "$url" ] && [ -f .env ]; then
  url=$(grep -E '^[[:space:]]*DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | sed -e 's/^[[:space:]]*["'\'']//' -e 's/["'\''][[:space:]]*$//')
fi
[ -n "$url" ] || { echo "db-backup: DATABASE_URL is not set (environment or .env)" >&2; exit 1; }

# mysql://user[:password]@host[:port]/database[?options]
pattern='^mysql://([^:@/]+)(:([^@]*))?@([^:/?]+)(:([0-9]+))?/([^?/]+)'
[[ $url =~ $pattern ]] || { echo "db-backup: DATABASE_URL is not a mysql:// URL" >&2; exit 1; }
user=${BASH_REMATCH[1]}
password=${BASH_REMATCH[3]}
host=${BASH_REMATCH[4]}
port=${BASH_REMATCH[6]:-3306}
database=${BASH_REMATCH[7]}
# The URL may percent-encode the password.
password=$(printf '%b' "${password//%/\\x}")

# This is a development safety net: it never pulls a remote (shared or production) database onto this machine.
case "$host" in
  127.0.0.1|localhost|::1) ;;
  *) if [ "${FCP_BACKUP_ALLOW_REMOTE:-}" != "1" ]; then echo "db-backup: refusing to dump non-local host; set FCP_BACKUP_ALLOW_REMOTE=1 to override" >&2; exit 1; fi ;;
esac

command -v mysqldump >/dev/null || { echo "db-backup: mysqldump is not installed" >&2; exit 1; }

umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/${database}-${stamp}.sql.gz"
partial="${target}.partial"
trap 'rm -f "$partial"' EXIT

# --set-gtid-purged=OFF and --no-tablespaces avoid needing RELOAD or PROCESS; newer mysqldump also dumps masking
# policies (an Enterprise feature this app does not use), which the app's user may not read.
extra=()
help=$(mysqldump --help 2>/dev/null || true)
case "$help" in *--masking-policies*) extra+=(--skip-masking-policies --skip-add-drop-masking-policy) ;; esac
MYSQL_PWD="$password" mysqldump --host="$host" --port="$port" --user="$user" \
  --single-transaction --set-gtid-purged=OFF --no-tablespaces --triggers --default-character-set=utf8mb4 ${extra[@]+"${extra[@]}"} "$database" | gzip -9 > "$partial"
mv "$partial" "$target"
trap - EXIT
echo "db-backup: wrote $target ($(du -h "$target" | cut -f1 | tr -d ' '))"
