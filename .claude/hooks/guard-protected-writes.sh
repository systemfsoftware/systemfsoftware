#!/usr/bin/env bash
# PreToolUse gate: refuses writes the root AGENTS.md would otherwise only ask
# about. Reads the hook JSON on stdin, exits 2 to refuse, 0 to allow.
# Enforces behaviour only — reads no doctrine file, so REPO-S6 and
# check:script-provenance stay satisfied.
set -uo pipefail

payload=$(cat)
target=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -n "$target" ] || exit 0

root=${CLAUDE_PROJECT_DIR:-$PWD}
case "$target" in
  "$root"/*) rel=${target#"$root"/} ;;
  /*) exit 0 ;;
  *) rel=$target ;;
esac

# Every string this one call would add, across Write, Edit and MultiEdit shapes.
added=$(printf '%s' "$payload" | jq -r '
  [ .tool_input.content?, .tool_input.new_string?,
    (.tool_input.edits? // [] | .[].new_string?) ]
  | map(select(. != null)) | join("\n")')

refuse() {
  printf '%s\n' "$1" >&2
  exit 2
}

case "$rel" in
  # repos/AGENTS.md is ours: it is the leaf that maps the vendored subtrees.
  repos/AGENTS.md) ;;
  repos/*) refuse "repos/ is a vendored subtree and is read-only — amend upstream, not the vendored copy (REPO-S3)." ;;
esac

case "$rel" in
  tsconfig*.json | */tsconfig*.json)
    printf '%s' "$added" | grep -qE '"isolatedDeclarations"[[:space:]]*:[[:space:]]*true' &&
      refuse "isolatedDeclarations breaks idiomatic Effect across this workspace — leave it disabled (REPO-S1)."
    ;;
esac

case "$rel" in
  pnpm-workspace.yaml)
    printf '%s' "$added" | grep -q 'minimumReleaseAgeExclude' &&
      refuse "minimumReleaseAgeExclude is the supply-chain cutoff — pin the dependency tighter or wait for it (REPO-S2)."
    ;;
esac

case "$rel" in
  docs/plans/*)
    # A clone without the gitignored corpus cannot satisfy this; say so by allowing.
    [ -d "$root/wiki" ] || exit 0
    session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')
    [ -e "${TMPDIR:-/tmp}/claude-wiki-query/$session" ] && exit 0
    refuse "Search the corpus before planning: run a wiki-scoped query (qmd query -c wiki '<question>'). Running one clears this gate for the session (REPO-W4)."
    ;;
esac

exit 0
