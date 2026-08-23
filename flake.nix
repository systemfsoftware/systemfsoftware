{
  description = "systemfsoftware toolchain — the formatter and runtimes the check chain shells out to";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs:
        let
          dprint = pkgs.callPackage ./nix/dprint.nix { };
          comment-checker = pkgs.callPackage ./nix/comment-checker.nix { };
          comment-checker-bwrap = pkgs.callPackage ./nix/comment-checker-bwrap.nix { inherit comment-checker; };
        in { inherit dprint comment-checker comment-checker-bwrap; default = dprint; });

      # pnpm is deliberately absent: `packageManager` pins pnpm@11.21.0 and
      # corepack is the one thing allowed to resolve it. A second pnpm on PATH
      # would answer `pnpm install` with a version the lockfile never saw.
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker-bwrap
            pkgs.nodejs_24
            pkgs.deno
          ];
        };
      });
    };
}
