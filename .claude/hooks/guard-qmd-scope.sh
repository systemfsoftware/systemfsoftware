#!/usr/bin/env bash
# PreToolUse gate on Bash: refuses an unscoped qmd retrieval. query, search and
# vsearch fan out over every collection flagged includeByDefault, which is local
# state this repo cannot know, so a nil result names no scope and nobody can
# re-run it. ls, get, collection and the rest are already scoped.
set -uo pipefail

cmd=$(cat | jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

# One entry per qmd retrieval call, cut at the next pipeline or list operator.
calls=$(printf '%s' "$cmd" | grep -oE 'qmd[[:space:]]+(query|search|vsearch)([^|;&]*)' || true)
[ -n "$calls" ] || exit 0

while IFS= read -r call; do
  printf '%s' "$call" | grep -qE '(^|[[:space:]])(--help|-h)([[:space:]]|$)' && continue
  printf '%s' "$call" | grep -qE '(^|[[:space:]])(-c|--collection)([[:space:]]|=)' && continue
  printf 'Unscoped qmd retrieval: %s\nPass at least one -c <collection>; take names from `qmd collection list` (REPO-W5).\n' "$call" >&2
  exit 2
done <<<"$calls"

exit 0
