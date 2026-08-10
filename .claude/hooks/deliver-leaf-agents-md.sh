#!/usr/bin/env bash
# PreToolUse gate: reads the hook JSON on stdin, exits 2 to refuse the write.
# Nothing below the root AGENTS.md auto-loads — work reaches a package through
# `pnpm --filter`, never `cd`, so a leaf is delivered only by being named here.
# Refuses the first write under each governing leaf once per session, then stops.
set -uo pipefail

payload=$(cat)
target=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty')
session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')
root=${CLAUDE_PROJECT_DIR:-$PWD}

[ -n "$target" ] || exit 0

case "$target" in
  "$root"/*) rel=${target#"$root"/} ;;
  /*) exit 0 ;;
  *) rel=$target ;;
esac

dir=$(dirname "$rel")
leaf=""
while [ "$dir" != "." ] && [ "$dir" != "/" ] && [ -n "$dir" ]; do
  case "$dir" in
    # Inside a vendored subtree the AGENTS.md is upstream's; keep walking up to
    # repos/AGENTS.md, which is ours and is the file that says so.
    repos/?*) ;;
    *) [ -f "$root/$dir/AGENTS.md" ] && { leaf="$dir/AGENTS.md"; break; } ;;
  esac
  dir=$(dirname "$dir")
done

[ -n "$leaf" ] || exit 0

stampdir="${TMPDIR:-/tmp}/claude-leaf-delivery/$session"
mkdir -p "$stampdir" || exit 0
stamp="$stampdir/$(printf '%s' "$leaf" | tr '/' '_')"
[ -e "$stamp" ] && exit 0
: >"$stamp"

printf 'Read %s before editing under %s/ — it carries the deltas the root AGENTS.md omits for this directory. Then re-issue the same tool call. This gate fires once per leaf per session.\n' "$leaf" "$dir" >&2
exit 2
