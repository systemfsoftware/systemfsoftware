{ lib, writeShellApplication, deno }:

# scripts/tools/test-timings.ts for any pnpm workspace: `plan`, `part` and
# `merge` read the workspace at the working directory, so another repository's
# CI runs the planner this one runs, with this repository's pinned imports.
# `--frozen` because the lock sits read-only in the store; Deno fetches the
# locked jsr modules on first run and checks their integrity, into DENO_DIR,
# or when unset a writable cache dir: the runner's temp dir under CI, else
# the XDG cache, so a read-only HOME default never stops it.
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
  runtimeInputs = [ deno ];
  text = ''
    if [ -z "''${DENO_DIR:-}" ]; then
      if [ -n "''${RUNNER_TEMP:-}" ]; then
        DENO_DIR="$RUNNER_TEMP/test-timings/deno"
      else
        DENO_DIR="''${XDG_CACHE_HOME:-$HOME/.cache}/test-timings/deno"
      fi
      export DENO_DIR
    fi
    exec deno run --config=${scripts}/deno.jsonc --lock=${scripts}/deno.lock --frozen \
      --allow-read --allow-write --allow-env ${scripts}/tools/test-timings.ts "$@"
  '';
}
