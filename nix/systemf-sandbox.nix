# The sandboxed systemf: a kernel sandbox with no network and a read-only
# repository, so a check can neither fetch nor modify what it inspects.
#
# Copied from gritlint's sandbox (nix/gritlint-sandbox.nix): one cwd guard, one
# Linux wrapper. There is no darwin wrapper — a seatbelt profile nobody has run
# is worse than a package that says it has no sandbox.
{
  lib,
  bubblewrap,
  writeShellScriptBin,
  stdenv,
  systemf,
}:

let
  bin = lib.getExe systemf;
  system = stdenv.hostPlatform.system;

  # A working directory reaches the sandbox only when every character is in
  # `[A-Za-z0-9_/.-]`, because bwrap arguments are positional and `$PWD` is
  # interpolated into them. `/` and `$HOME` are refused because read-only there
  # means the whole filesystem or the whole home directory, and an empty `$PWD`
  # is refused so bwrap is never handed an empty bind.
  cwdGuard = ''
    safe_cwd() {
      case "$1" in
        "" | / | "$HOME") return 1 ;;
        *[!A-Za-z0-9_/.-]*)
          echo "systemf: no read access for a working directory outside [A-Za-z0-9_/.-]: $1" >&2
          return 1
          ;;
      esac
      return 0
    }
  '';

  # No FHS bind: the wrapper's node, the CLI's dependencies and the TypeScript
  # native binary are all in /nix/store.
  #
  # /proc is a read-only bind of the host's, not a fresh procfs. The TypeScript
  # 7 native API reads `/proc/self/exe` in its vfs init and panics without it
  # ("failed to get executable path"), so gritlint's no-/proc wrapper does not
  # generalize. Mounting a fresh procfs needs a user namespace, and bwrap's
  # `--proc /proc` is refused wherever a user namespace may not mount procfs
  # (observed: `bwrap --unshare-all --proc /proc` -> "Can't mount proc on
  # /proc: Operation not permitted", while `unshare -Upf --mount-proc` fails
  # the same way). A read-only bind needs no such permission, cannot be written
  # through, and nests under any host.
  linux = writeShellScriptBin systemf.meta.mainProgram ''
    ${cwdGuard}

    # pnpm's node_modules symlinks climb out of the package to the workspace
    # root, so the repository that encloses $PWD is what has to be readable —
    # not just the package inside it. A git working tree holds `.git` as a
    # directory; a worktree added with `git worktree add` holds it as a file.
    repoRoot() {
      dir="$PWD"
      while [ "$dir" != / ]; do
        if [ -e "$dir/.git" ]; then
          printf '%s\n' "$dir"
          return 0
        fi
        dir="''${dir%/*}"
        [ -n "$dir" ] || dir=/
      done
      printf '%s\n' "$PWD"
    }

    root=$(repoRoot)
    binds=()
    safe_cwd "$PWD" && safe_cwd "$root" && binds=(--ro-bind "$root" "$root" --chdir "$PWD")

    exec ${bubblewrap}/bin/bwrap \
      --ro-bind /nix/store /nix/store \
      --ro-bind /proc /proc \
      --dev /dev --tmpfs /tmp \
      --unshare-all --new-session --clearenv --die-with-parent \
      ''${binds[@]+"''${binds[@]}"} \
      -- ${bin} "$@"
  '';
in
if stdenv.hostPlatform.isLinux then
  linux
else
  throw "${systemf.meta.mainProgram}: no sandbox for ${system}"
