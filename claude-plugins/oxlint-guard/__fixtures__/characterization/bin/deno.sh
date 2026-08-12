#!/bin/sh
sub=$1
last=
for a in "$@"; do last=$a; done
name=${last##*/}

emit_violation() {
  printf 'src/bad.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n\n1 problem\n'
  exit 1
}

case "$name" in
deno-check-fail.ts)
  if [ "$sub" = "check" ]; then emit_violation; else exit 0; fi
  ;;
deno-lint-fail.ts)
  if [ "$sub" = "check" ]; then exit 0; else emit_violation; fi
  ;;
*)
  exit 0
  ;;
esac
