{
  description = "systemfsoftware toolchain — the formatter, runtimes and gritlint the check chain shells out to";

  nixConfig = {
    extra-substituters = "https://nix.systemfsoftware.com";
    extra-trusted-public-keys = "nix-cache-1:wXA8I4DayNW9q6enUyQA/P/nT38pGSTLt374t3gsn7M=";
    fallback = true;
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # The release manifest (`nix/release-hashes.json`) rides in this input, so
    # `nix flake update comment-checker` moves the version and every per-target
    # digest together — no hash pinned in this repo.
    comment-checker = {
      url = "github:systemfsoftware/comment-checker";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # gritlint's own repository builds and gates the binary, and its rule
    # packs are compiled into it; this flake re-exports both variants.
    gritlint.url = "github:systemfsoftware/gritlint";
    pnpm-release-management = {
      url = "github:systemfsoftware/pnpm-release-management/741c8c4334c261058dd4a3b2976c9f2e3796d523";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker, gritlint, pnpm-release-management }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn:
        lib.genAttrs (lib.unique (systems ++ [ "x86_64-windows" ])) (system:
          if builtins.elem system systems
          then fn (import nixpkgs { inherit system; })
          else throw "systemfsoftware's flake builds on ${lib.concatStringsSep ", " systems}; ${system} is not one of them");

      workspaceOf = pkgs:
        pnpm-release-management.lib.mkPnpmWorkspacePackages {
          inherit pkgs;
          src = self;
          pname = "systemfsoftware";
          pnpm = pkgs.pnpm_12;
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
          workspace = workspaceOf pkgs;
          denoTool = import ./nix/deno-tool.nix { inherit (pkgs) lib writeShellApplication deno; };
          own = {
            inherit dprint;
            inherit (gritlint.packages.${pkgs.stdenv.hostPlatform.system}) gritlint gritlint-unwrapped;
            # scripts/tools/test-timings.ts for any pnpm workspace: `plan` asks
            # pnpm for the workspace's packages; `part` and `merge` read it.
            test-timings = denoTool {
              name = "test-timings";
              files = [ ./scripts/tools/test-timings.ts ./scripts/tools/mutation-plan.ts ./scripts/tools/mutation-probe.mjs ];
              entry = "tools/test-timings.ts";
              permissions = "--allow-read --allow-write --allow-env --allow-run=pnpm";
              runtimeInputs = [ pkgs.pnpm_12 ];
            };
            inherit (pkgs) postgresql_17;
            # Bun runs the tooling/* packages; nixpkgs pinned by flake.lock fixes its version
            # for the dev shell and for CI, which puts this output on PATH.
            inherit (pkgs) bun;
            comment-checker = sandboxed;
            comment-checker-unwrapped = unwrapped;
            default = dprint;
          };
          clashes = builtins.attrNames (builtins.intersectAttrs own workspace);
        in
        assert clashes == [ ] || throw "flake.nix: workspace packages ${lib.concatStringsSep ", " clashes} collide with flake packages";
        workspace // own);

      checks = forEachSystem (pkgs: {
        test-timings = self.packages.${pkgs.stdenv.hostPlatform.system}.test-timings;
      });

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker
            pnpm-release-management.packages.${pkgs.stdenv.hostPlatform.system}.sandbox
            pkgs.nodejs_24
            pkgs.pnpm_12
            pkgs.deno
            self.packages.${pkgs.stdenv.hostPlatform.system}.bun
          ];
          SANDBOX_PNPM_STORE = self.packages.${pkgs.stdenv.hostPlatform.system}.pnpm-store;
        };
      });
    };
}
