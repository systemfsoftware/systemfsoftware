{
  description = "systemfsoftware toolchain — the formatter, runtimes and gritlint the check chain shells out to";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # The release manifest (`nix/release-hashes.json`) rides in this input, so
    # `nix flake update comment-checker` moves the version and every per-target
    # digest together — no hash pinned in this repo.
    comment-checker = {
      url = "github:systemfsoftware/comment-checker";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    pnpm-release-management = {
      url = "github:systemfsoftware/pnpm-release-management/5eb4c5d5a607d2f9470a21237b2316a858ae1776";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker, rust-overlay, pnpm-release-management }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn:
        lib.genAttrs (lib.unique (systems ++ [ "x86_64-windows" ])) (system:
          if builtins.elem system systems
          then fn (import nixpkgs { inherit system; overlays = [ (import rust-overlay) ]; })
          else throw "systemfsoftware's flake builds on ${lib.concatStringsSep ", " systems}; ${system} is not one of them");

      # The Rust toolchain is rust-toolchain.toml, so a flake build and
      # `nix develop` compile with what CI compiles with.
      rust = pkgs: pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

      # One version across the crates and the flake: read out of Cargo.toml
      # instead of repeated here.
      gritlintVersion =
        let
          hits = builtins.filter (hit: hit != null)
            (map (builtins.match " *version = \"(.*)\"") (lib.splitString "\n" (builtins.readFile ./Cargo.toml)));
        in
        if hits == [ ] then throw "flake.nix: Cargo.toml carries no `version = \"…\"`" else builtins.head (builtins.head hits);

      workspaceOf = pkgs:
        pnpm-release-management.lib.mkPnpmWorkspacePackages {
          inherit pkgs;
          src = self;
          pname = "systemfsoftware";
          pnpm = pkgs.pnpm_12;
        };

      configs = import ./nix/config-distribution.nix { inherit lib; };
    in
    {
      # A consumer's sandbox store: its lockfile's registry packages plus the
      # named workspace tarballs, which its package.json depends on as
      # `file:<dir>/<name>-<version>.tgz`. A tool configuration is refused
      # before anything is built: configs are internal, plugins are distributed.
      lib.mkConsumerStore = { pkgs, src, packages, dir ? ".sfs-deps", lockFile ? src + "/pnpm-lock.yaml" }:
        let
          workspace = workspaceOf pkgs;
          members = workspace.workspace-tarballs.members;
          refused = builtins.filter configs.isConfig packages;
          chosen = map (name:
            lib.findFirst (member: member.attr == name)
              (throw "lib.mkConsumerStore: no public workspace package named ${name}")
              members) packages;
        in
        if refused != [ ]
        then throw "lib.mkConsumerStore: ${lib.concatMapStringsSep "\n" configs.refusal refused}"
        else
          pnpm-release-management.lib.mkPnpmConsumerStore {
            inherit pkgs src lockFile;
            files.${dir} = pkgs.linkFarm "systemfsoftware-consumer-tarballs"
              (map (member: { name = member.tarball; path = workspace.${member.attr}; }) chosen);
          };

      packages = forEachSystem (pkgs:
        let
          dprint = pkgs.callPackage ./nix/dprint.nix { };
          unwrapped = pkgs.callPackage ./nix/comment-checker.nix {
            hashes = "${comment-checker}/nix/release-hashes.json";
          };
          sandboxed = pkgs.callPackage ./nix/comment-checker-sandbox.nix {
            comment-checker = unwrapped;
          };
          gritlint-unwrapped = pkgs.callPackage ./nix/gritlint.nix {
            rustPlatform = pkgs.makeRustPlatform { cargo = rust pkgs; rustc = rust pkgs; };
            version = gritlintVersion;
          };
          workspace = workspaceOf pkgs;
          own = {
            inherit dprint gritlint-unwrapped;
            test-timings = pkgs.callPackage ./nix/test-timings.nix { };
            inherit (pkgs) postgresql_17;
            comment-checker = sandboxed;
            comment-checker-unwrapped = unwrapped;
            gritlint = pkgs.callPackage ./nix/gritlint-sandbox.nix { gritlint = gritlint-unwrapped; };
            default = dprint;
          };
          clashes = builtins.attrNames (builtins.intersectAttrs own workspace);
        in
        assert clashes == [ ] || throw "flake.nix: workspace packages ${lib.concatStringsSep ", " clashes} collide with flake packages";
        workspace // own);

      # `nix flake check` builds checks but only evaluates packages, so the
      # sandboxed gritlint rides here: an eval-only gate ships a compile failure green.
      checks = forEachSystem (pkgs: let workspace = workspaceOf pkgs; in {
        gritlint = self.packages.${pkgs.stdenv.hostPlatform.system}.gritlint;
        test-timings = self.packages.${pkgs.stdenv.hostPlatform.system}.test-timings;
        consumer-store = pkgs.callPackage ./nix/consumer-store-check.nix {
          inherit (self.lib) mkConsumerStore;
          inherit workspace;
          package = "upstream-manifest";
        };
        # Configs stay in this repository (REPO-S7): evaluation throws listing
        # every config that is public, every private package that is
        # distributed, and every distributed package that depends on a config.
        config-distribution =
          let
            failures = configs.failures {
              lockText = builtins.readFile ./pnpm-lock.yaml;
              manifestOf = dir: lib.importJSON (./. + "/${dir}/package.json");
              distributed = workspace.workspace-tarballs.members;
            };
          in
          if failures == [ ] then pkgs.runCommand "config-distribution" { } "touch $out"
          else throw "config-distribution:\n${lib.concatMapStringsSep "\n" (failure: "  - ${failure}") failures}";
      });

      # The consumer-store check against a lockfile that claims a wrong
      # integrity: building it must fail.
      sabotage = forEachSystem (pkgs: {
        consumer-store-wrong-integrity = pkgs.callPackage ./nix/consumer-store-check.nix {
          inherit (self.lib) mkConsumerStore;
          workspace = workspaceOf pkgs;
          package = "upstream-manifest";
          integrity = "sha512-${lib.fixedWidthString 86 "A" ""}==";
        };
      });

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker
            pnpm-release-management.packages.${pkgs.stdenv.hostPlatform.system}.sandbox
            (rust pkgs)
            pkgs.cargo-deny
            pkgs.nodejs_24
            pkgs.pnpm_12
            pkgs.deno
          ];
          SANDBOX_PNPM_STORE = self.packages.${pkgs.stdenv.hostPlatform.system}.pnpm-store;
        };
      });
    };
}
