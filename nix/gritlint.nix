# gritlint, compiled from Cargo.lock.
#
# Three facts about the pinned engine drive this file.
#
# 1. Cargo.lock is the only place the biomejs/gritql rev appears; it is read
#    out of the lock here for the `preBuild` checkout below.
# 2. The gritql checkout holds two crates with one name in several places
#    (`tree-sitter-c-sharp` 0.23.1 and 0.20.0, `tree-sitter-php`), and three
#    locked crates live only in its submodules. `importCargoLock` takes the
#    first `find` hit by name, so its vendor tree differed between machines
#    under one derivation hash. `cargoHash` vendors through `fetchCargoVendor`,
#    which picks deterministically, and its fixed-output hash fails loudly if
#    the vendor tree ever changes. A re-pin updates `cargoHash`.
# 3. marzano-language reads `include_str!("../../../resources/node-types/…")`
#    from outside its crate, which from `<vendor>/source-git-0/<crate>/src`
#    is the vendor root. `preBuild` copies those files there from a checkout
#    of the pinned rev.
{
  lib,
  rustPlatform,
  version,
}:

let
  engineRepo = "https://github.com/biomejs/gritql";

  # `builtins.match` is POSIX ERE, so the `+`, `.` and `?` are escaped.
  engineRevs = lib.unique (
    builtins.concatLists (
      builtins.filter (hit: hit != null) (
        map (builtins.match "source = \"git\\+https://github\\.com/biomejs/gritql\\?rev=([0-9a-f]+)#.*\"") (
          lib.splitString "\n" (builtins.readFile ../Cargo.lock)
        )
      )
    )
  );

  engineRev =
    assert lib.assertMsg (builtins.length engineRevs == 1)
      "nix/gritlint.nix: Cargo.lock must pin exactly one biomejs/gritql rev, found ${toString (builtins.length engineRevs)}";
    builtins.head engineRevs;

  engineSource = builtins.fetchGit {
    url = engineRepo;
    rev = engineRev;
  };
in
rustPlatform.buildRustPackage {
  pname = "gritlint";
  inherit version;

  # Only what cargo compiles, out of the whole monorepo: a TypeScript, flake or
  # workflow edit must not move the src hash and rebuild the Rust output.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../Cargo.toml
      ../Cargo.lock
      ../apps/gritlint
      ../crates/gritlint_core
      ../packs
    ];
  };

  cargoHash = "sha256-j96CiB8XTiRqyZ79LjUnqyOsmkAnwmu2/niYeBnSmdI=";

  preBuild = ''
    vendor="$NIX_BUILD_TOP/$(stripHash "$cargoDeps")"
    mkdir -p "$vendor/resources"
    cp -r ${engineSource}/resources/node-types "$vendor/resources/node-types"
  '';

  # Only the CLI: gritlint_core's contract tests belong to CI, where they run
  # against a checkout instead of inside a derivation.
  cargoBuildFlags = [
    "-p"
    "gritlint"
  ];
  doCheck = false;

  passthru = {
    inherit engineRev engineSource;
  };

  meta = {
    description = "Run GritQL rule packs over the config files of a repository";
    homepage = "https://github.com/systemfsoftware/systemfsoftware/tree/main/crates";
    license = lib.licenses.mit;
    mainProgram = "gritlint";
    platforms = lib.platforms.unix;
  };
}
