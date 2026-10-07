{ lib, writeShellApplication, deno }:

# scripts/tools/test-timings.ts for any pnpm workspace: `plan`, `part` and
# `merge` read the workspace at the working directory, so another repository's
# CI runs the planner this one runs, with this repository's pinned imports.
# `--frozen` because the lock sits read-only in the store; Deno fetches the
# locked jsr modules into DENO_DIR on first run and checks their integrity.
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
    exec deno run --config=${scripts}/deno.jsonc --lock=${scripts}/deno.lock --frozen \
      --allow-read --allow-write --allow-env ${scripts}/tools/test-timings.ts "$@"
  '';
}
