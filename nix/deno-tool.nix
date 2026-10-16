{ lib, writeShellApplication, deno }:

# A Deno program under scripts/ as a flake package another repository runs
# with `nix run`, against the working directory, with this repository's
# pinned imports. `--frozen` because the lock sits read-only in the store;
# Deno fetches the locked jsr modules on first run, checking their integrity,
# into DENO_DIR. Unset, DENO_DIR is $RUNNER_TEMP/<name>/deno, else
# $XDG_CACHE_HOME/<name>/deno, else a fresh directory under ${TMPDIR:-/tmp};
# HOME is never read.
{ name, files, entry, permissions, runtimeInputs ? [ ] }:
let
  scripts = lib.fileset.toSource {
    root = ../scripts;
    fileset = lib.fileset.unions ([ ../scripts/deno.jsonc ../scripts/deno.lock ] ++ files);
  };
in
writeShellApplication {
  inherit name;
  runtimeInputs = [ deno ] ++ runtimeInputs;
  text = ''
    if [ -z "''${DENO_DIR:-}" ]; then
      if [ -n "''${RUNNER_TEMP:-}" ]; then
        DENO_DIR="$RUNNER_TEMP/${name}/deno"
      elif [ -n "''${XDG_CACHE_HOME:-}" ]; then
        DENO_DIR="$XDG_CACHE_HOME/${name}/deno"
      else
        DENO_DIR=$(mktemp -d "''${TMPDIR:-/tmp}/${name}-deno.XXXXXX")
      fi
      export DENO_DIR
    fi
    exec deno run --quiet --config=${scripts}/deno.jsonc --lock=${scripts}/deno.lock --frozen \
      ${permissions} ${scripts}/${entry} "$@"
  '';
}
