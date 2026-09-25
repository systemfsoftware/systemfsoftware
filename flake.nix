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
  };

  outputs = { self, nixpkgs, comment-checker, rust-overlay }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = fn:
        lib.genAttrs systems (system: fn (import nixpkgs { inherit system; overlays = [ (import rust-overlay) ]; }));

      # The Rust toolchain is rust-toolchain.toml, so a flake build and
      # `nix develop` compile with what CI compiles with.
      rust = pkgs: pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

      # One version across the crates, the launcher, the platform packages and
      # the flake: read out of Cargo.toml instead of repeated here.
      gritlintVersion =
        let
          hits = builtins.filter (hit: hit != null)
            (map (builtins.match " *version = \"(.*)\"") (lib.splitString "\n" (builtins.readFile ./Cargo.toml)));
        in
        if hits == [ ] then throw "flake.nix: Cargo.toml carries no `version = \"…\"`" else builtins.head (builtins.head hits);
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
        in {
          inherit dprint gritlint-unwrapped;
          comment-checker = sandboxed;
          comment-checker-unwrapped = unwrapped;
          gritlint = pkgs.callPackage ./nix/gritlint-sandbox.nix { gritlint = gritlint-unwrapped; };
          default = dprint;
        });

      # `nix flake check` builds checks but only evaluates packages, so the
      # sandboxed gritlint rides here: an eval-only gate ships a compile failure green.
      checks = forEachSystem (pkgs: {
        gritlint = self.packages.${pkgs.stdenv.hostPlatform.system}.gritlint;
      });

      # pnpm is deliberately absent: `packageManager` pins pnpm@12.6.0 and
      # corepack is the one thing allowed to resolve it. A second pnpm on PATH
      # would answer `pnpm install` with a version the lockfile never saw.
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker
            (rust pkgs)
            pkgs.cargo-deny
            pkgs.nodejs_24
            pkgs.deno
          ];
        };
      });
    };
}
