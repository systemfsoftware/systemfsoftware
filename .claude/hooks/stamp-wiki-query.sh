#!/usr/bin/env bash
# PostToolUse on Bash: records that a wiki-scoped corpus query actually ran.
# guard-protected-writes.sh reads this stamp to gate plan writes, so it is set
# after the command ran, never before it was intended.
set -uo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

printf '%s' "$cmd" | grep -qE 'qmd[[:space:]]+(query|search|vsearch)[^|;&]*(-c|--collection)[[:space:]]+wiki\b' || exit 0

session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')
dir="${TMPDIR:-/tmp}/claude-wiki-query"
mkdir -p "$dir" 2>/dev/null || exit 0
: >"$dir/$session"
exit 0
