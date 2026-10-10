# Installs the toolchain config tarballs into a consumer outside the monorepo,
# offline from lib.mkConsumerStore, and loads every entry point they publish
# under Node (check.mjs). The consumer-store check proves a
# tarball is indexed; this one proves it works once installed, which workspace
# symlinks hide: Node refuses to strip types from a file under node_modules.
#
# pnpm-lock.yaml is the consumer's lockfile with each workspace tarball's
# file name, version and integrity left as @<attr>.tgz@, @<attr>.version@ and
# @<attr>.integrity@, filled here from the flake's own tarballs. Registry
# packages stay literal. It lives in this directory so dprint leaves pnpm's
# layout alone: pnpm-lock.nix parses that layout. When a packed manifest's
# dependencies or peers change, the frozen install fails; regenerate the
# template then: write `manifest` below with the built tarballs in .sfs-deps/,
# run `pnpm install --lockfile-only`, and put the placeholders back.
{ pkgs, mkConsumerStore, workspace }:
let
  inherit (pkgs) lib;
  attrs = [ "tsdown-config" "vitest-config" "stryker-config" "vitest" ];
  members = map (attr: lib.findFirst (m: m.attr == attr)
    (throw "consumer-load-check: no public workspace package named ${attr}")
    workspace.workspace-tarballs.members) attrs;
  specOf = member: "file:.sfs-deps/${member.tarball}";

  manifest = builtins.toJSON {
    name = "consumer-load-check";
    version = "0.0.0";
    private = true;
    dependencies = lib.listToAttrs (map (m: lib.nameValuePair m.name (specOf m)) members) // {
      "@microsoft/api-extractor" = "7.59.1";
      effect = "4.0.2";
      vite = "8.2.1";
      vitest = "5.0.1";
    };
  };

  lockTemplate = ./pnpm-lock.yaml;

  substitutions = lib.concatMapStrings (m: ''
    -e "s|@${m.attr}.tgz@|${m.tarball}|g" \
    -e "s|@${m.attr}.version@|${m.version}|g" \
    -e "s|@${m.attr}.integrity@|sha512-$(openssl dgst -sha512 -binary ${workspace.${m.attr}} | base64 -w0)|g" \
  '') members;

  src = pkgs.runCommand "consumer-load-check-src" { nativeBuildInputs = [ pkgs.openssl ]; } ''
    mkdir -p "$out"
    printf '%s\n' ${lib.escapeShellArg manifest} > "$out/package.json"
    sed ${substitutions} ${lockTemplate} > "$out/pnpm-lock.yaml"
  '';

  store = mkConsumerStore {
    inherit pkgs src;
    packages = attrs;
    lockFile = lockTemplate;
  };
in
pkgs.runCommand "consumer-load-check" { nativeBuildInputs = [ pkgs.pnpm_12 pkgs.nodejs_24 ]; } ''
  export HOME="$TMPDIR"
  cp -r ${src} consumer && chmod -R u+w consumer
  mkdir consumer/.sfs-deps
  ${lib.concatMapStrings (m: "cp ${workspace.${m.attr}} consumer/.sfs-deps/${m.tarball}\n") members}
  cp ${./check.mjs} consumer/check.mjs

  # pnpm writes to the store's index.db, so it gets a private copy beside
  # links to the read-only content files.
  for layout in ${store}/v*; do
    mkdir -p "store/''${layout##*/}"
    for entry in "$layout"/*; do
      if [ "''${entry##*/}" = index.db ]; then
        cp "$entry" "store/''${layout##*/}/index.db" && chmod u+w "store/''${layout##*/}/index.db"
      else
        ln -s "$entry" "store/''${layout##*/}/''${entry##*/}"
      fi
    done
  done

  cd consumer
  pnpm_config_store_dir="$TMPDIR/store" \
  pnpm_config_offline=true \
  pnpm_config_frozen_lockfile=true \
  pnpm_config_trust_lockfile=true \
  pnpm_config_ignore_scripts=true \
  pnpm_config_manage_package_manager_versions=false \
  pnpm_config_package_import_method=copy \
    pnpm install --reporter=append-only
  node check.mjs
  touch "$out"
''
