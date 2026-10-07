# The default package: gritlint inside a kernel sandbox with no network and a
# read-only working directory, so a rule run can neither fetch nor write, and a
# scanned tree cannot be modified by the scan itself.
#
# Copied from comment-checker's sandbox (nix/comment-checker-sandbox.nix): one
# cwd guard, one Linux wrapper.
{ bubblewrap, writeShellScriptBin, stdenv, gritlint }:

let
  bin = "${gritlint}/bin/gritlint";
  system = stdenv.hostPlatform.system;

  # A working directory reaches the sandbox only when every character is in
  # `[A-Za-z0-9_/.-]`, so a crafted `$PWD` cannot smuggle in bind arguments of
  # its own. `/` and `$HOME` are refused because read-only there means the whole
  # filesystem or the whole home directory, and an empty `$PWD` is refused so
  # bwrap is never handed an empty bind.
  cwdGuard = ''
    safe_cwd() {
      case "$1" in
        "" | / | "$HOME") return 1 ;;
        *[!A-Za-z0-9_/.-]*)
          echo "gritlint: no read access for a working directory outside [A-Za-z0-9_/.-]: $1" >&2
          return 1
          ;;
      esac
      return 0
    }
  '';

  # No FHS bind: rustPlatform patches the binary's interpreter and rpath into
  # /nix/store, so the loader and libc come from the store bind below.
  #
  # No /proc either: mounting procfs inside the new pid namespace is refused on
  # hosts that forbid it (a container, and any unprivileged user there), which
  # would fail a run rather than tighten it.
  linux = writeShellScriptBin "gritlint" ''
    ${cwdGuard}
    binds=()
    safe_cwd "$PWD" && binds=(--ro-bind "$PWD" "$PWD" --chdir "$PWD")
    exec ${bubblewrap}/bin/bwrap \
      --ro-bind /nix/store /nix/store \
      --dev /dev --tmpfs /tmp \
      --unshare-all --new-session --clearenv --die-with-parent \
      ''${binds[@]+"''${binds[@]}"} \
      -- ${bin} "$@"
  '';
in
if stdenv.hostPlatform.isLinux then
  linux
else
  throw "gritlint: no sandbox for ${system}"
