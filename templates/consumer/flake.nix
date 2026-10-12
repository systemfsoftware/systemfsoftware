{
  description = "A pnpm workspace on systemfsoftware's toolchain";

  inputs = {
    systemfsoftware.url = "github:systemfsoftware/systemfsoftware";
    nixpkgs.follows = "systemfsoftware/nixpkgs";
  };

  outputs = { self, nixpkgs, systemfsoftware }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn: lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});

      # Every package pnpm-lock.yaml installs from `file:.sfs-deps/`: the presets
      # and the @systemfsoftware/* packages they depend on.
      sfsPackages = [ "effect-cell-types" "effect-schema-discovery" "effect-schema-law" "effect-schema-recursion-budget" "effect-schema-vite" "oxlint-config-cell-architecture" "oxlint-config-dmmf" "oxlint-config-recommended" "oxlint-config-rule-authoring" "oxlint-plugin-cell-architecture" "oxlint-plugin-dmmf-workflow" "oxlint-plugin-effect-platform" "oxlint-plugin-effect-schema" "oxlint-plugin-test-discipline" "stryker-config" "tsconfig" "vitest" "vitest-config" ];

      tarballsOf = pkgs:
        let
          upstream = systemfsoftware.packages.${pkgs.stdenv.hostPlatform.system};
          pick = name:
            let
              member = lib.findFirst (member: member.attr == name)
                (throw "flake.nix: systemfsoftware has no public workspace package named ${name}")
                upstream.workspace-tarballs.members;
            in
            { name = member.tarball; path = upstream.${member.attr}; };
        in
        map pick sfsPackages;

      sfsDepsOf = pkgs: pkgs.linkFarm "sfs-deps" (tarballsOf pkgs);
    in
    {
      # The tarballs pnpm-lock.yaml names, for `nix build .#sfs-deps` and the
      # reusable workflows' `sfs-deps-installable`.
      packages = forEachSystem (pkgs: { sfs-deps = sfsDepsOf pkgs; });

      # Installs the workspace offline from the lockfile, runs every package's
      # typecheck, lint and test, and records a change intent.
      checks = forEachSystem (pkgs:
        let
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.difference ./. (lib.fileset.unions [
              ./flake.nix
              ./flake.lock
              (lib.fileset.maybeMissing ./.sfs-deps)
              (lib.fileset.maybeMissing ./node_modules)
            ]);
          };
          store = systemfsoftware.lib.mkConsumerStore {
            inherit pkgs src;
            packages = sfsPackages;
          };
        in
        {
          workspace = pkgs.runCommand "workspace-check" { nativeBuildInputs = [ pkgs.pnpm_12 pkgs.nodejs_24 ]; } ''
            export HOME="$TMPDIR"
            cp -r ${src} workspace && chmod -R u+w workspace
            cp -rL ${sfsDepsOf pkgs} workspace/.sfs-deps

            # pnpm writes to the store's index.db, so it gets a private copy
            # beside links to the read-only content files.
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

            cd workspace
            export pnpm_config_store_dir="$TMPDIR/store" \
              pnpm_config_offline=true \
              pnpm_config_frozen_lockfile=true \
              pnpm_config_trust_lockfile=true \
              pnpm_config_manage_package_manager_versions=false \
              pnpm_config_package_import_method=copy
            pnpm install --reporter=append-only
            pnpm -r --reporter=append-only typecheck
            pnpm -r --reporter=append-only lint
            pnpm -r --reporter=append-only test

            # The changesets setup records an intent the release tooling accepts.
            pnpm change --bump patch --summary "Checks the template's release setup." slug
            pnpm change check
            touch "$out"
          '';
        });

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell { packages = [ pkgs.nodejs_24 pkgs.pnpm_12 ]; };
      });
    };
}
