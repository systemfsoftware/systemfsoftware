{ bubblewrap, writeShellScriptBin, comment-checker }:

writeShellScriptBin "comment-checker" ''
  extra=""
  [ -e /lib ] && extra="$extra --ro-bind /lib /lib"
  [ -e /lib64 ] && extra="$extra --ro-bind /lib64 /lib64"
  exec ${bubblewrap}/bin/bwrap \
    --ro-bind /nix/store /nix/store \
    --ro-bind /etc /etc \
    --ro-bind /usr /usr \
    $extra \
    --proc /proc --dev /dev --tmpfs /tmp \
    --unshare-net --die-with-parent \
    --ro-bind "$PWD" "$PWD" \
    --chdir "$PWD" \
    -- ${comment-checker}/bin/comment-checker "$@"
''
