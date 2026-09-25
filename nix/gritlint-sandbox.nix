# The default package: gritlint inside a kernel sandbox with no network and a
# read-only working directory, so a rule run can neither fetch nor write, and a
# scanned tree cannot be modified by the scan itself.
#
# Copied from comment-checker's sandbox (nix/comment-checker-sandbox.nix): one
# cwd guard, one Linux wrapper, one darwin wrapper.
{ bubblewrap, writeShellScriptBin, writeText, stdenv, gritlint }:

let
  bin = "${gritlint}/bin/gritlint";
  system = stdenv.hostPlatform.system;

  # A working directory reaches the sandbox only when every character is in
  # `[A-Za-z0-9_/.-]`, because SBPL has no escape syntax: a crafted `$PWD`
  # could otherwise close the `(subpath "...")` string and append grants of its
  # own. `/` and `$HOME` are refused for the same reason on Linux, where
  # read-only there means the whole filesystem or the whole home directory, and
  # an empty `$PWD` is refused so bwrap is never handed an empty bind.
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

  # Seatbelt baseline: (deny default) plus the minimum a native binary needs to
  # exec (dyld shared cache, libSystem, mach lookups, the inherited TTY).
  # Network stays denied by the default rule, and every write outside the
  # sandbox's tmp allowance is denied with it.
  seatbelt = writeText "gritlint.sb" ''
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

  # sandbox-exec prints a deprecation warning on stderr on every call, and
  # gritlint's stderr is the channel findings are read on, so that one line is
  # filtered out and the child's exit status is preserved.
  darwin = writeShellScriptBin "gritlint" ''
    ${cwdGuard}
    cwdRules=""
    safe_cwd "$PWD" && cwdRules=" (subpath \"$PWD\")"
    real="$(pwd -P)"
    [ "$real" != "$PWD" ] && safe_cwd "$real" && cwdRules="$cwdRules (subpath \"$real\")"
    profile=$(cat ${seatbelt})
    [ -n "$cwdRules" ] && profile="$profile
    (allow file-read*$cwdRules)"
    err=$(mktemp "''${TMPDIR:-/tmp}/gritlint.XXXXXX")
    /usr/bin/env -i /usr/bin/sandbox-exec -p "$profile" -- ${bin} "$@" 2>"$err"
    status=$?
    grep -vF 'sandbox-exec is deprecated' "$err" >&2
    rm -f "$err"
    exit $status
  '';
in
if stdenv.hostPlatform.isLinux then
  linux
else if stdenv.hostPlatform.isDarwin then
  darwin
else
  throw "gritlint: no sandbox for ${system}"
