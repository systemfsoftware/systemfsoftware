#!/usr/bin/env bash
set -euo pipefail

mode="${1:-check}"
case "$mode" in
  check) frozen=--frozen ;;
  update) frozen=--frozen=false ;;
  *)
    echo "usage: $0 [check|update]" >&2
    exit 2
    ;;
esac

cd "$(git rev-parse --show-toplevel)"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
status=0
while IFS= read -r lock; do
  dir="$(dirname "$lock")"
  config="$dir/deno.jsonc"
  [ -f "$config" ] || continue
  mapfile -t entries < <(git ls-files -- "$dir/*.ts")
  [ "${#entries[@]}" -gt 0 ] || continue
  if deno install --quiet --config="$config" --lock="$lock" "$frozen" --entrypoint "${entries[@]}" >"$log" 2>&1; then
    echo "$lock: ${#entries[@]} entry points resolve"
  else
    grep -v '^Download ' "$log" >&2 || true
    if grep -q 'The lockfile is out of date' "$log"; then
      echo "::error file=$lock,title=deno-lock-stale::$lock is missing modules its entry points import; run \`pnpm deno-locks:update\` and commit $lock" >&2
    else
      echo "::error file=$lock,title=deno-lock-unresolvable::deno failed before it could judge $lock (error above). A network or registry error: retry and check access to jsr.io and registry.npmjs.org. An error naming the lockfile: restore it with \`git checkout -- $lock\`" >&2
    fi
    status=1
  fi
done < <(git ls-files -- '*deno.lock' ':!:repos/**')
exit "$status"
