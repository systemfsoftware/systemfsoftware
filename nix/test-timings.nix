{ lib, writeShellApplication, deno, pnpm_12 }:

# scripts/tools/test-timings.ts for any pnpm workspace: `plan`, `part` and
# `merge` read the workspace at the working directory, so another repository's
# CI runs the planner this one runs, with this repository's pinned imports.
# `plan` asks pnpm for the workspace's packages. `--frozen` because the lock
# sits read-only in the store; Deno fetches the locked jsr modules on first
# run, checking their integrity, into DENO_DIR. Unset, DENO_DIR is
# $RUNNER_TEMP/test-timings/deno, else $XDG_CACHE_HOME/test-timings/deno,
# else a fresh directory under ${TMPDIR:-/tmp}; HOME is never read.
let
  scripts = lib.fileset.toSource {
    root = ../scripts;
    fileset = lib.fileset.unions [
      ../scripts/deno.jsonc
      ../scripts/deno.lock
      ../scripts/tools/test-timings.ts
    ];
  };
in
writeShellApplication {
  name = "test-timings";
  runtimeInputs = [ deno pnpm_12 ];
  text = ''
    if [ -z "''${DENO_DIR:-}" ]; then
      if [ -n "''${RUNNER_TEMP:-}" ]; then
        DENO_DIR="$RUNNER_TEMP/test-timings/deno"
      elif [ -n "''${XDG_CACHE_HOME:-}" ]; then
        DENO_DIR="$XDG_CACHE_HOME/test-timings/deno"
      else
        DENO_DIR=$(mktemp -d "''${TMPDIR:-/tmp}/test-timings-deno.XXXXXX")
      fi
      export DENO_DIR
    fi
    exec deno run --config=${scripts}/deno.jsonc --lock=${scripts}/deno.lock --frozen \
      --allow-read --allow-write --allow-env --allow-run=pnpm ${scripts}/tools/test-timings.ts "$@"
  '';
}
