# gritlint, compiled from Cargo.lock.
#
# Two facts about the pinned engine drive this file.
#
# 1. Cargo.lock is the only place the biomejs/gritql rev appears. The rev and
#    the set of git-sourced packages are read out of the lock here, so a re-pin
#    is `cargo update` and never a nix edit — and a new tree-sitter grammar in
#    the lock arrives with its `outputHashes` entry already filled in.
# 2. nixpkgs vendors each git-sourced crate into its own directory, so
#    marzano-language's `include_str!("../../../resources/node-types/…")` — 25
#    tracked files that live outside that crate — have no source beside the
#    vendor tree. `preBuild` copies them from a checkout of the pinned rev.
#
# `cargoLock.outputHashes` wants one entry per git-sourced package, and every
# crate vendored from one git revision shares that checkout's hash, so the
# entries are derived from Cargo.lock rather than listed by hand: one literal
# hash, 29 derived keys.
{
  lib,
  rustPlatform,
  version,
}:

let
  engineRepo = "https://github.com/biomejs/gritql";
  enginePrefix = "git+${engineRepo}?";
  # `builtins.match` is POSIX ERE, so the `+`, `.` and `?` are escaped.
  engineSourcePattern = "git\\+https://github\\.com/biomejs/gritql\\?rev=([0-9a-f]+)#([0-9a-f]+)";

  lockText = builtins.readFile ../Cargo.lock;

  field =
    name: section:
    let
      hits = builtins.filter (hit: hit != null) (
        map (line: builtins.match " *${name} = \"(.*)\"" line) (lib.splitString "\n" section)
      );
    in
    if hits == [] then null else builtins.head (builtins.head hits);

  # One chunk per `[[package]]` section, plus the file header, which carries no
  # name.
  sections = map (section: {
    name = field "name" section;
    version = field "version" section;
    source = field "source" section;
  }) (lib.splitString "[[package]]" lockText);

  enginePackages = builtins.filter (
    package: package.name != null && package.source != null && lib.hasPrefix enginePrefix package.source
  ) sections;

  engineRevs = lib.unique (
    map (package: builtins.head (builtins.match engineSourcePattern package.source)) enginePackages
  );

  engineRev =
    assert lib.assertMsg (builtins.length engineRevs == 1)
      "nix/package.nix: Cargo.lock must pin exactly one biomejs/gritql rev, found ${toString (builtins.length engineRevs)}";
    builtins.head engineRevs;

  # Fixed-output hash of that checkout — the value `cargoLock.outputHashes`
  # wants for every crate vendored from it, identical for all of them.
  engineHash = "sha256-+kYe4+DOqjbB6mlRkz6u86dp1/B9fooA+l/oR2dMBZo=";

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

  cargoLock = {
    lockFile = ../Cargo.lock;
    outputHashes = builtins.listToAttrs (
      map (package: lib.nameValuePair "${package.name}-${package.version}" engineHash) enginePackages
    );
  };

  preBuild = ''
    mkdir -p ../resources
    cp -r ${engineSource}/resources/node-types ../resources/node-types
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
