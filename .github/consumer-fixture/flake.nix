{
  description = "Consumer fixture for systemfsoftware's reusable workflows: its .sfs-deps tarballs and a trivial check";

  inputs = {
    # stryker-js-effect at the commit that first published `workspace-tarballs`: stryker-js 17.0.2 and
    # stryker-js-vitest-runner 8.1.1. Nothing follows, so its own lock reproduces the released bytes.
    stryker-published.url = "github:systemfsoftware/stryker-js-effect/f06f244fad1fbb5cf85937ae717c665a8c5f23bc";
    # A systemfsoftware commit whose effect-cell-types is 12.0.0, the version stryker-js 17.0.2 resolves.
    # A pin that moves to another version fails `sfs-deps verify` as a missing tarball.
    systemfsoftware.url = "github:systemfsoftware/systemfsoftware/732f66a0c85819b2005f9e0930a595bc4de91ee1";
    nixpkgs.follows = "systemfsoftware/nixpkgs";
  };

  outputs = { self, nixpkgs, stryker-published, systemfsoftware }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn: lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});

      # Every tarball pnpm-lock.yaml names under `file:.sfs-deps/`, by producer.
      sfsPackages = {
        stryker-published = [ "stryker-js" "stryker-js-vitest-runner" ];
        systemfsoftware = [ "effect-cell-types" ];
      };

      producers = system: {
        stryker-published = stryker-published.packages.${system};
        systemfsoftware = systemfsoftware.packages.${system};
      };

      # Each tarball is its producer's own per-package output, so a cold build makes only these.
      sfsDepsOf = pkgs:
        let
          system = pkgs.stdenv.hostPlatform.system;
          pick = producer: name:
            let
              upstream = (producers system).${producer};
              member = lib.findFirst (member: member.attr == name)
                (throw "flake.nix: ${producer} has no public workspace package named ${name}")
                upstream.workspace-tarballs.members;
            in
            { name = member.tarball; path = upstream.${member.attr}; };
        in
        pkgs.linkFarm "sfs-deps"
          (lib.concatLists (lib.mapAttrsToList (producer: names: map (pick producer) names) sfsPackages));
    in
    {
      packages = forEachSystem (pkgs: { sfs-deps = sfsDepsOf pkgs; });

      checks = forEachSystem (pkgs: {
        answer = derivation {
          name = "consumer-fixture-answer";
          inherit (pkgs.stdenv.hostPlatform) system;
          builder = "/bin/sh";
          args = [ "-c" "echo 42 > $out" ];
        };
      });
    };
}
