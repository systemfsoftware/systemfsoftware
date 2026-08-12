#!/bin/sh
# The guard selects this binary by path, so per-file behaviour has to be
# dispatched from inside it rather than configured from the test.
#
# Only shell builtins are used: the harness gives this process a PATH holding
# nothing but its own fakes, so any external command would silently resolve to
# nothing and collapse every case into the default branch.
last=
for a in "$@"; do last=$a; done
name=${last##*/}
ta=0
for a in "$@"; do if [ "$a" = "--type-aware" ]; then ta=1; fi; done

emit_violation() {
  printf 'src/bad.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n\n1 problem\n'
  exit 1
}

emit_tsgolint() {
  printf 'Failed to find tsgolint executable. You may need to add the `oxlint-tsgolint` package to your project?\n'
  exit 1
}

case "$name" in
tsgolint.ts)
  if [ $ta -eq 1 ]; then emit_tsgolint; else exit 0; fi
  ;;
retry.ts)
  if [ $ta -eq 1 ]; then emit_tsgolint; else emit_violation; fi
  ;;
tsgolint-noise.ts)
  if [ $ta -eq 1 ]; then
    printf 'warning: unrelated runtime noise from the backend\n' >&2
    emit_tsgolint
  else
    exit 0
  fi
  ;;
huge.ts)
  printf 'huge.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n'
  pad=xxxxxxxxxxxxxxxx
  n=0
  while [ $n -lt 13 ]; do
    pad="$pad$pad"
    n=$((n + 1))
  done
  printf '%s' "$pad"
  exit 1
  ;;
typeaware-timeout.ts)
  if [ $ta -eq 1 ]; then sleep 3600; else exit 0; fi
  ;;
retry-timeout.ts)
  if [ $ta -eq 1 ]; then emit_tsgolint; else sleep 3600; fi
  ;;
bad.ts)
  emit_violation
  ;;
ignored.ts)
  printf 'No files found to lint. Please check your paths and ignore patterns.\n'
  exit 1
  ;;
outside.ts)
  printf 'path is expected to be under the root\n'
  exit 1
  ;;
*)
  exit 0
  ;;
esac
