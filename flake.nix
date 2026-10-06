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
      url = "github:systemfsoftware/pnpm-release-management/180122866dd537fa728b5563fb1820fbd2af88cc";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker, rust-overlay, pnpm-release-management }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forEachSystem = fn:
        lib.genAttrs systems (system: fn (import nixpkgs { inherit system; overlays = [ (import rust-overlay) ]; }));

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
          hash = "sha256-bmjL0LdPhgPL7ciNd4wTFksgbxrhexKmXGtuopnNOPM=";
        };
    in
    {
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
            # effect-unit-of-work's race test starts a throwaway server from this output.
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
      checks = forEachSystem (pkgs: {
        gritlint = self.packages.${pkgs.stdenv.hostPlatform.system}.gritlint;
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
