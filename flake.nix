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
      url = "github:systemfsoftware/pnpm-release-management/8cd6e83009531de040cd9c03e1370b4966fd2a12";
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
    in
    {
      # A consumer's sandbox store: its lockfile's registry packages plus the
      # named workspace tarballs, which its package.json depends on as
      # `file:<dir>/<name>-<version>.tgz`.
      lib.mkConsumerStore = { pkgs, src, packages, dir ? ".sfs-deps", lockFile ? src + "/pnpm-lock.yaml" }:
        let
          workspace = workspaceOf pkgs;
          members = workspace.workspace-tarballs.members;
          chosen = map (name:
            lib.findFirst (member: member.attr == name)
              (throw "lib.mkConsumerStore: no public workspace package named ${name}")
              members) packages;
        in
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
          denoTool = import ./nix/deno-tool.nix { inherit (pkgs) lib writeShellApplication deno; };
          own = {
            inherit dprint gritlint-unwrapped;
            # scripts/tools/test-timings.ts for any pnpm workspace: `plan` asks
            # pnpm for the workspace's packages; `part` and `merge` read it.
            test-timings = denoTool {
              name = "test-timings";
              files = [ ./scripts/tools/test-timings.ts ];
              entry = "tools/test-timings.ts";
              permissions = "--allow-read --allow-write --allow-env --allow-run=pnpm";
              runtimeInputs = [ pkgs.pnpm_12 ];
            };
            # Repository invariants for any pnpm workspace (subtrees,
            # release-age, project-membership, single-plan); see
            # scripts/tools/repo-checks/cli.ts. project-membership runs the
            # workspace's own installed compiler.
            repo-checks = denoTool {
              name = "repo-checks";
              files = [ ./scripts/tools/repo-checks ];
              entry = "tools/repo-checks/cli.ts";
              permissions = "--allow-read --allow-env --allow-run=git,./node_modules/.bin/tsc";
              runtimeInputs = [ pkgs.git ];
            };
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
        test-timings = self.packages.${pkgs.stdenv.hostPlatform.system}.test-timings;
        repo-checks = self.packages.${pkgs.stdenv.hostPlatform.system}.repo-checks;
        consumer-store = pkgs.callPackage ./nix/consumer-store-check.nix {
          inherit (self.lib) mkConsumerStore;
          workspace = workspaceOf pkgs;
          package = "tsconfig";
        };
      });

      # The consumer-store check against a lockfile that claims a wrong
      # integrity: building it must fail.
      sabotage = forEachSystem (pkgs: {
        consumer-store-wrong-integrity = pkgs.callPackage ./nix/consumer-store-check.nix {
          inherit (self.lib) mkConsumerStore;
          workspace = workspaceOf pkgs;
          package = "tsconfig";
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
