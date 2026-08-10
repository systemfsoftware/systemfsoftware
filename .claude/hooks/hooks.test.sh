#!/usr/bin/env bash
# Falsification suite for the PreToolUse guards. Every guard must fire on its
# known-bad payload AND stay silent on a known-good one; a guard that only ever
# fires, or only ever passes, is not a gate. Run: bash .claude/hooks/hooks.test.sh
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(mktemp -d)
BARE=$(mktemp -d)
mkdir -p "$ROOT/wiki"
trap 'rm -rf "$ROOT" "$BARE" "${TMPDIR:-/tmp}/claude-wiki-query/fixture"' EXIT

fail=0
check() {
  local name=$1 want=$2 got=$3
  if [ "$want" = "$got" ]; then
    printf '  ok   %-34s exit=%s\n' "$name" "$got"
  else
    printf '  FAIL %-34s want=%s got=%s\n' "$name" "$want" "$got"
    fail=$((fail + 1))
  fi
}

write_payload() {
  jq -cn --arg f "$ROOT/$1" --arg c "${2-}" \
    '{session_id:"fixture", tool_input:{file_path:$f, content:$c}}'
}

run_write() {
  local root=${3:-$ROOT}
  write_payload "$1" "${2-}" | CLAUDE_PROJECT_DIR="$root" bash "$HERE/guard-protected-writes.sh" 2>/dev/null
  echo $?
}

run_bash() {
  jq -cn --arg c "$1" '{session_id:"fixture", tool_input:{command:$c}}' |
    bash "$HERE/guard-qmd-scope.sh" 2>/dev/null
  echo $?
}

echo "guard-protected-writes.sh"
check "S3 vendored write refused" 2 "$(run_write repos/constitution/CONSTITUTION.md x)"
check "S3 repos/AGENTS.md allowed" 0 "$(run_write repos/AGENTS.md x)"
check "S1 tsconfig true refused" 2 "$(run_write packages/a/tsconfig.json '{"isolatedDeclarations": true}')"
check "S1 tsconfig false allowed" 0 "$(run_write packages/a/tsconfig.json '{"isolatedDeclarations": false}')"
check "S1 non-tsconfig allowed" 0 "$(run_write packages/a/other.json '{"isolatedDeclarations": true}')"
check "S2 exclude key refused" 2 "$(run_write pnpm-workspace.yaml 'minimumReleaseAgeExclude: [x]')"
check "S2 workspace otherwise ok" 0 "$(run_write pnpm-workspace.yaml 'packages: [a]')"
check "W4 plan without query refused" 2 "$(run_write docs/plans/p.md x)"
check "W4 plan in bare clone ok" 0 "$(run_write docs/plans/p.md x "$BARE")"
check "control ordinary source write" 0 "$(run_write packages/a/index.ts 'export const a = 1')"

echo "guard-protected-writes.sh (Edit and MultiEdit shapes)"
edit=$(jq -cn --arg f "$ROOT/packages/a/tsconfig.json" \
  '{session_id:"fixture", tool_input:{file_path:$f, new_string:"\"isolatedDeclarations\": true"}}')
printf '%s' "$edit" | CLAUDE_PROJECT_DIR="$ROOT" bash "$HERE/guard-protected-writes.sh" 2>/dev/null
check "S1 via Edit.new_string" 2 $?
multi=$(jq -cn --arg f "$ROOT/packages/a/tsconfig.json" \
  '{session_id:"fixture", tool_input:{file_path:$f, edits:[{new_string:"\"isolatedDeclarations\":true"}]}}')
printf '%s' "$multi" | CLAUDE_PROJECT_DIR="$ROOT" bash "$HERE/guard-protected-writes.sh" 2>/dev/null
check "S1 via MultiEdit.edits[]" 2 $?

echo "guard-qmd-scope.sh"
check "W5 bare query refused" 2 "$(run_bash 'qmd query "attention"')"
check "W5 bare search piped refused" 2 "$(run_bash 'qmd search "x" | head -5')"
check "W5 -c wiki allowed" 0 "$(run_bash 'qmd query -c wiki "x"')"
check "W5 --collection= allowed" 0 "$(run_bash 'qmd query --collection=wiki "x"')"
check "W5 collection list allowed" 0 "$(run_bash 'qmd collection list')"
check "W5 ls is already scoped" 0 "$(run_bash 'qmd ls wiki')"
check "control unrelated command" 0 "$(run_bash 'pnpm check')"

echo "guard-qmd-scope.sh (verbatim commands this repo has actually run)"
check "real: scoped search, piped" 0 "$(run_bash 'cd /repo && qmd search -c wiki "attention position encoding RoPE NoPE lost in middle" 2>&1 | head -30')"
check "real: timeout + scoped query" 0 "$(run_bash 'cd /repo && timeout 900 qmd query -c wiki "AGENTS.md precedence nearest file wins" 2>&1 | head -8')"
check "real: --help needs no scope" 0 "$(run_bash 'qmd query --help 2>&1 | sed -n "1,40p"')"
check "real: bare query after cd" 2 "$(run_bash 'cd /repo && qmd query "AGENTS.md precedence nearest file wins"')"

echo "stamp-wiki-query.sh"
stamp="${TMPDIR:-/tmp}/claude-wiki-query/fixture"
rm -f "$stamp"
jq -cn '{session_id:"fixture", tool_input:{command:"qmd query -c docs \"x\""}}' |
  bash "$HERE/stamp-wiki-query.sh"
check "no stamp for non-wiki scope" "absent" "$([ -e "$stamp" ] && echo present || echo absent)"
jq -cn '{session_id:"fixture", tool_input:{command:"qmd query -c wiki \"x\""}}' |
  bash "$HERE/stamp-wiki-query.sh"
check "stamp written for -c wiki" "present" "$([ -e "$stamp" ] && echo present || echo absent)"
check "W4 plan allowed once stamped" 0 "$(run_write docs/plans/p.md x)"

echo
if [ "$fail" -eq 0 ]; then
  echo "SELFTEST PASS: every guard fires on known-bad and stays silent on known-good"
  exit 0
fi
echo "SELFTEST FAIL: $fail cell(s)"
exit 1
