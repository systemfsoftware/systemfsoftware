# Builds lib.mkConsumerStore for one workspace package and requires the store
# to index that package's tarball under the integrity of the flake output.
# `integrity` overrides what the consumer's lockfile claims, so a wrong value
# must fail the store build.
{ pkgs, mkConsumerStore, workspace, package, integrity ? null }:
let
  inherit (pkgs) lib;
  member = lib.findFirst (m: m.attr == package)
    (throw "consumer-store-check: no public workspace package named ${package}")
    workspace.workspace-tarballs.members;
  tarball = workspace.${package};
  spec = "file:.sfs-deps/${member.tarball}";

  manifest = builtins.toJSON {
    name = "consumer-store-check";
    version = "0.0.0";
    private = true;
    dependencies.${member.name} = spec;
  };

  # The tarball's own dependencies are left out of the snapshot: the check is
  # about the tarball entering the store, not about resolving its graph.
  lockTemplate = builtins.toFile "pnpm-lock.yaml" ''
    lockfileVersion: '9.0'

    settings:
      autoInstallPeers: true
      excludeLinksFromLockfile: false

    importers:

      .:
        dependencies:
          '${member.name}':
            specifier: ${spec}
            version: ${spec}

    packages:

      '${member.name}@${spec}':
        resolution: {integrity: @integrity@, tarball: ${spec}}
        version: ${member.version}

    snapshots:

      '${member.name}@${spec}': {}
  '';

  integrityOf = "sha512-$(openssl dgst -sha512 -binary ${tarball} | base64 -w0)";

  src = pkgs.runCommand "consumer-store-check-src" { nativeBuildInputs = [ pkgs.openssl ]; } ''
    mkdir -p "$out"
    printf '%s\n' ${lib.escapeShellArg manifest} > "$out/package.json"
    sed "s|@integrity@|${if integrity == null then integrityOf else integrity}|" ${lockTemplate} > "$out/pnpm-lock.yaml"
  '';

  store = mkConsumerStore {
    inherit pkgs src;
    packages = [ package ];
    lockFile = lockTemplate;
  };
in
pkgs.runCommand "consumer-store-check-${package}" { nativeBuildInputs = [ pkgs.openssl pkgs.sqlite ]; } ''
  want="${integrityOf}"
  # sqlite writes -wal/-shm beside a database it opens, and a builder without
  # the Nix sandbox can write into the store path, so query a private copy.
  cp ${store}/v*/index.db index.db
  got="$(sqlite3 -readonly index.db "select key from package_index where key like '%	${spec}'")"
  if [ "''${got%%	*}" != "$want" ]; then
    echo "consumer-store-check: ${member.name} is indexed as '$got', expected $want" >&2
    exit 1
  fi
  touch "$out"
''
