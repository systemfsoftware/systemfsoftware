{ stdenvNoCC, bubblewrap, writeShellScriptBin, writeText, comment-checker }:

let
  bin = "${comment-checker}/bin/comment-checker";
  system = stdenvNoCC.hostPlatform.system;

  # A working directory reaches the sandbox only when every character is in
  # `[A-Za-z0-9_/.-]`, because SBPL has no escape syntax: a crafted `$PWD`
  # could otherwise close the `(subpath "...")` string and append grants of its
  # own. `/` and `$HOME` are refused for the same reason on Linux, where
  # read-only there means the whole filesystem or the whole home directory, and
  # an empty `$PWD` is refused so bwrap is never handed an empty bind. The hook
  # reads its payload on stdin, so a refused directory costs file reads, never
  # the check itself.
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

  # Seatbelt baseline: (deny default) plus the minimum a native binary needs to
  # exec (dyld shared cache, libSystem, mach lookups, the inherited TTY).
  # Network stays denied by the default rule.
  seatbelt = writeText "comment-checker.sb" ''
    (version 1)
    (deny default)
    (allow process-fork)
    (allow process-exec)
    (allow signal (target same-sandbox))
    (allow sysctl-read)
    (allow file-read-metadata)
    (allow mach-lookup
        (global-name "com.apple.system.notification_center")
        (global-name "com.apple.system.logger")
        (global-name "com.apple.distributed_notifications@Uv3")
        (global-name "com.apple.CoreServices.coreservicesd")
        (global-name "com.apple.FSEvents"))
    (allow file-read-data (literal "/"))
    (allow file-read*
        (subpath "/nix")
        (subpath "/usr/lib")
        (subpath "/usr/share")
        (subpath "/System")
        (subpath "/Library")
        (subpath "/private/etc")
        (subpath "/private/var/db/dyld")
        (subpath "/private/var/db/timezone"))
    (allow file-read* (subpath "/dev/fd"))
    (allow file-read* file-write* file-ioctl
        (literal "/dev/tty")
        (regex #"^/dev/ttys[0-9]+$"))
    (allow file-read* file-write*
        (literal "/dev/null")
        (literal "/dev/zero")
        (literal "/dev/random")
        (literal "/dev/urandom"))
    (allow file-write* (subpath "/private/tmp"))
  '';

  # sandbox-exec prints a deprecation warning on stderr on every call, and this
  # hook's stderr is the channel the model reads, so that one line is filtered
  # out and the child's exit status is preserved.
  darwin = writeShellScriptBin "comment-checker" ''
    ${cwdGuard}
    cwdRules=""
    safe_cwd "$PWD" && cwdRules=" (subpath \"$PWD\")"
    real="$(pwd -P)"
    [ "$real" != "$PWD" ] && safe_cwd "$real" && cwdRules="$cwdRules (subpath \"$real\")"
    profile=$(cat ${seatbelt})
    [ -n "$cwdRules" ] && profile="$profile
    (allow file-read*$cwdRules)"
    err=$(mktemp "''${TMPDIR:-/tmp}/comment-checker.XXXXXX")
    /usr/bin/env -i /usr/bin/sandbox-exec -p "$profile" -- ${bin} "$@" 2>"$err"
    status=$?
    grep -vF 'sandbox-exec is deprecated' "$err" >&2
    rm -f "$err"
    exit $status
  '';
in
if stdenvNoCC.hostPlatform.isLinux then linux
else if stdenvNoCC.hostPlatform.isDarwin then darwin
else throw "comment-checker: no sandbox for ${system}"
