# Tool configurations are internal to this monorepo: every repository owns its
# own vitest, oxlint, tsdown and stryker configuration. What leaves this
# repository is a plugin (rules, guards, engines), never a configuration. A
# TypeScript base (`tsconfig`, as in `@tsconfig/*`) is shared by convention
# and is not a configuration here.
# This module decides which packages are configurations, what a consumer takes
# instead, the message a consumer store refuses one with, and the violations
# the `config-distribution` flake check fails on.
{ lib }:
let
  unscoped = name: lib.last (lib.splitString "/" name);

  # A package is a configuration when its unscoped npm name carries `config`
  # or `preset(s)` as a whole hyphen-delimited word (REPO-S7 in AGENTS.md):
  # `vitest-config` and `oxlint-config-dmmf` are, `tsconfig` is not. A false
  # positive fails loudly; the remedy is renaming the package, never an
  # exemption here.
  isConfig = name:
    lib.any (pattern: builtins.match pattern (unscoped name) != null) [ "(.*-)?config(-.*)?" "(.*-)?presets?(-.*)?" ];

  # What a consumer takes instead of each configuration: the packages that
  # replace it, by their lib.mkConsumerStore attribute name or as a package
  # published outside this workspace, and how to wire them from the
  # consumer's own configuration. A row with no packages means no plugin ships
  # for it.
  preset = name: {
    packages = [ "oxlint-plugin-recommended" ];
    wire = "wire its preset with `extends: [plugin.configs['${name}']]` in your own `oxlint.config.ts`, "
      + "and declare your own `ignorePatterns` there: ignore patterns are repository configuration, and oxlint does not carry them through `extends`";
  };
  none = { packages = [ ]; wire = null; };
  consumeInstead = {
    oxlint-config-recommended = preset "recommended";
    oxlint-config-cell-architecture = preset "cell-architecture";
    oxlint-config-dmmf = preset "dmmf";
    oxlint-config-rule-authoring = preset "rule-authoring";
    vitest-config = { packages = [ "vitest" ]; wire = "import its guard exports from your own vitest configuration"; };
    stryker-config = { packages = [ "@systemfsoftware/stryker-js" ]; wire = "run it with your own stryker configuration"; };
    tsdown-config = none;
  };

  refusal = name:
    let row = consumeInstead.${unscoped name} or none;
    in "${name} is a tool configuration. Configs are internal to the systemfsoftware monorepo and are not distributed; "
    + "own the configuration in your repository"
    + (if row.packages == [ ]
    then ". No plugin ships for it."
    else " and consume instead: ${lib.concatStringsSep ", " row.packages}; ${row.wire}.");

  # The workspace's package directories, as pnpm records them: the keys of the
  # `importers` block of the lockfile's workspace document. pnpm writes its
  # env lockfile as a first YAML document, whose importers hold only the root,
  # so the workspace document is the last one. A key is either a mapping
  # (`  dir:`) or empty (`  dir: {}`); the root `.` is the workspace itself,
  # not a package. A pure line scan keeps evaluation free of
  # import-from-derivation, so every system evaluates the same way.
  importerDirs = lockText:
    let
      document = lib.last (lib.splitString "\n---\n" lockText);
      step = state: line:
        if state.phase == "before" then state // { phase = if line == "importers:" then "in" else "before"; }
        else if state.phase == "after" then state
        else if line != "" && !(lib.hasPrefix " " line) then state // { phase = "after"; }
        else
          let key = builtins.match "  ([^ ][^:]*):( \\{})?" line;
          in if key == null then state else state // { keys = state.keys ++ [ (builtins.head key) ]; };
      scanned = builtins.foldl' step { phase = "before"; keys = [ ]; } (lib.splitString "\n" document);
    in
    lib.remove "." scanned.keys;

  # A manifest as the check sees it. Runtime edges are the ones a consumer's
  # install follows: dependencies, optionalDependencies, peerDependencies.
  packageOf = manifest: {
    inherit (manifest) name;
    private = manifest.private or false;
    runtimeDependencies = builtins.attrNames
      ((manifest.dependencies or { }) // (manifest.optionalDependencies or { }) // (manifest.peerDependencies or { }));
  };

  # Every way a configuration could leave the repository, over plain data:
  # `manifests` are the workspace's package.json values and `distributed` the
  # workspace-tarballs members, read by npm `name`. The result lists one
  # { kind, subject, other } per violation.
  violations = { manifests, distributed }:
    let
      packages = map packageOf manifests;
      byName = builtins.listToAttrs (map (p: lib.nameValuePair p.name p) packages);
      violation = kind: subject: other: { inherit kind subject other; };
      ofMember = member:
        if !(byName ? ${member.name}) then [ (violation "member-not-in-importers" member.name null) ]
        else
          lib.optional byName.${member.name}.private (violation "private-distributed" member.name null)
          ++ map (dep: violation "config-dependency" member.name dep)
            (builtins.filter isConfig byName.${member.name}.runtimeDependencies);
    in
    lib.optional (packages == [ ]) (violation "no-packages" "pnpm-lock.yaml" null)
    ++ map (p: violation "public-config" p.name null) (builtins.filter (p: isConfig p.name && !p.private) packages)
    ++ lib.concatMap ofMember distributed;

  describe = v: {
    no-packages = "no workspace package was read from the pnpm-lock.yaml importers";
    public-config = "${v.subject} is a tool configuration (its name contains `config` or `preset`) but is not private";
    member-not-in-importers = "${v.subject} is distributed but is not a pnpm-lock.yaml importer";
    private-distributed = "${v.subject} is private but is a distributed workspace-tarballs member";
    config-dependency = "${v.subject} is distributed and depends at runtime on the tool configuration ${v.other}";
  }.${v.kind};

  # The check proves it can fail in the same evaluation: each fixture runs
  # through `violations` and must yield exactly the kinds it expects.
  plugin = { name = "@fixture/oxlint-plugin-x"; };
  fixtures = {
    public-eslint-config = {
      input = { manifests = [ { name = "@fixture/eslint-config-x"; } ]; distributed = [ ]; };
      expect = [ "public-config" ];
    };
    public-bare-tsconfig = {
      input = { manifests = [ { name = "@fixture/tsconfig"; } ]; distributed = [ ]; };
      expect = [ "public-config" ];
    };
    public-preset = {
      input = { manifests = [ { name = "@fixture/oxlint-preset-x"; } ]; distributed = [ ]; };
      expect = [ "public-config" ];
    };
    public-plugin = {
      input = { manifests = [ { name = plugin.name; } ]; distributed = [ plugin ]; };
      expect = [ ];
    };
    private-distributed = {
      input = { manifests = [ { name = "@fixture/lib"; private = true; } ]; distributed = [ { name = "@fixture/lib"; } ]; };
      expect = [ "private-distributed" ];
    };
    runtime-config-dependency = {
      input = {
        manifests = [
          { name = plugin.name; dependencies."@fixture/oxlint-config-x" = "workspace:^"; }
          { name = "@fixture/oxlint-config-x"; private = true; }
        ];
        distributed = [ plugin ];
      };
      expect = [ "config-dependency" ];
    };
    dev-config-dependency = {
      input = {
        manifests = [
          { name = plugin.name; devDependencies."@fixture/oxlint-config-x" = "workspace:^"; }
          { name = "@fixture/oxlint-config-x"; private = true; }
        ];
        distributed = [ plugin ];
      };
      expect = [ ];
    };
    no-importers = {
      input = { manifests = [ ]; distributed = [ ]; };
      expect = [ "no-packages" ];
    };
    member-not-in-importers = {
      input = { manifests = [ { name = "@fixture/a"; } ]; distributed = [ { name = "@fixture/b"; } ]; };
      expect = [ "member-not-in-importers" ];
    };
  };

  unproven = builtins.filter (line: line != null) (lib.mapAttrsToList
    (name: fixture:
      let produced = map (v: v.kind) (violations fixture.input);
      in if produced == fixture.expect then null
      else "fixture ${name} produced [${toString produced}], expected [${toString fixture.expect}]")
    fixtures);

  # Failure lines for the workspace read from `lockText` and `manifestOf`
  # against the real distributed member list; empty means the check passes.
  failures = { lockText, manifestOf, distributed }:
    unproven ++ map describe (violations {
      inherit distributed;
      manifests = map manifestOf (importerDirs lockText);
    });
in
{
  inherit isConfig consumeInstead refusal failures;
}
