{ stdenvNoCC, bubblewrap, writeShellScriptBin, comment-checker }:

let
  bin = "${comment-checker}/bin/comment-checker";
  system = stdenvNoCC.hostPlatform.system;

  # A working directory reaches the sandbox only when every character is in
  # `[A-Za-z0-9_/.-]`, so a crafted `$PWD` cannot smuggle in bind arguments of
  # its own. `/` and `$HOME` are refused because read-only there means the whole
  # filesystem or the whole home directory, and an empty `$PWD` is refused so
  # bwrap is never handed an empty bind. The hook reads its payload on stdin, so
  # a refused directory costs file reads, never the check itself.
  cwdGuard = ''
    safe_cwd() {
      case "$1" in
        "" | / | "$HOME") return 1 ;;
        *[!A-Za-z0-9_/.-]*)
          echo "comment-checker: no read access for a working directory outside [A-Za-z0-9_/.-]: $1" >&2
          return 1
          ;;
      esac
      return 0
    }
  '';

  # No FHS bind: the input derivation patchelfs, so the binary resolves its
  # loader and libc from /nix/store.
  #
  # No /proc either: the hook reads its payload on stdin, and mounting procfs
  # inside the new pid namespace is refused on hosts that forbid it (a
  # container, and any unprivileged user there), which would fail the hook
  # rather than tighten it.
  linux = writeShellScriptBin "comment-checker" ''
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
if stdenvNoCC.hostPlatform.isLinux then linux
else throw "comment-checker: no sandbox for ${system}"
