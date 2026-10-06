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
    # The oracle lane's only source of upstream's suite (plan KTD5). It is a
    # plain source tree, not a flake, so it is pinned by rev in the URL and by
    # narHash in flake.lock; the lane runs this, never a checkout on disk.
    xstate-upstream = {
      url = "github:statelyai/xstate/2146ae26ebfc7e6a624b3a1f237f9e6ddc30b9f5";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, comment-checker, rust-overlay, xstate-upstream }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = fn:
        lib.genAttrs systems (system: fn (import nixpkgs { inherit system; overlays = [ (import rust-overlay) ]; }));

      # The Rust toolchain is rust-toolchain.toml, so a flake build and
      # `nix develop` compile with what CI compiles with.
      rust = pkgs: pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

      # The six forked upstream packages, upstream dir name -> fork dir name.
      xstatePackages = {
        core = "xstate";
        xstate-effect = "xstate-effect";
        xstate-test = "xstate-test";
        xstate-react = "xstate-react";
        xstate-store = "xstate-store";
        xstate-store-react = "xstate-store-react";
      };

      # `packages.<system>.xstate-upstream-suite` (KTD5.1): the pinned upstream
      # source pruned to the six packages' `test/` trees, their colocated
      # `src/**/*.test.ts(x)`, the fixtures beside them, and the JSON schemas.
      # The oracle lane runs this tree; upstream `src/` is never shipped, because
      # every relative `src/` import resolves to the fork.
      xstateUpstreamSuite = pkgs:
        pkgs.stdenvNoCC.mkDerivation {
          pname = "xstate-upstream-suite";
          version = "2146ae26ebfc7e6a624b3a1f237f9e6ddc30b9f5";
          src = xstate-upstream;
          dontConfigure = true;
          dontBuild = true;
          installPhase = ''
            runHook preInstall
            mkdir -p $out/packages
            ${lib.concatStringsSep "\n" (lib.mapAttrsToList (upstream: _:
              let
                dir = "packages/${upstream}";
              in ''
                mkdir -p $out/${dir}
                if [ -d ${dir}/test ]; then
                  cp -r ${dir}/test $out/${dir}/test
                fi
                ( cd ${dir} && find src -type f \
                    \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.schema.json' \
                       -o -path '*/test/*' -o -path '*/fixtures/*' -o -path '*/__fixtures__/*' \) \
                    -print0 | xargs -0 -r cp --parents -t $out/${dir} )
              '') xstatePackages)}
            # KTD5.1: the store's Vue and Solid files test bindings this repo did
            # not fork, so the suite never carries them.
            rm -rf $out/packages/xstate-store/test/vue.test.ts \
                   $out/packages/xstate-store/test/solid.test.tsx \
                   $out/packages/xstate-store/test/*.vue \
                   $out/packages/xstate-store/test/*.solid.*
            runHook postInstall
          '';
        };

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
          # effect-unit-of-work's race test starts a throwaway server from this output.
          inherit (pkgs) postgresql_17;
          comment-checker = sandboxed;
          comment-checker-unwrapped = unwrapped;
          gritlint = pkgs.callPackage ./nix/gritlint-sandbox.nix { gritlint = gritlint-unwrapped; };
          "xstate-upstream-suite" = xstateUpstreamSuite pkgs;
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
