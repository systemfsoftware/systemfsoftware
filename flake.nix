{
  description = "systemfsoftware toolchain — the formatter and runtimes the check chain shells out to";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # The release manifest (`nix/release-hashes.json`) rides in this input, so
    # `nix flake update comment-checker` moves the version and every per-target
    # digest together — no hash pinned in this repo.
    comment-checker = {
      url = "github:systemfsoftware/comment-checker";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
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
        in {
          inherit dprint;
          comment-checker = sandboxed;
          comment-checker-unwrapped = unwrapped;
          default = dprint;
        });

      # pnpm is deliberately absent: `packageManager` pins pnpm@11.21.0 and
      # corepack is the one thing allowed to resolve it. A second pnpm on PATH
      # would answer `pnpm install` with a version the lockfile never saw.
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker
            pkgs.nodejs_24
            pkgs.deno
          ];
        };
      });
    };
}
