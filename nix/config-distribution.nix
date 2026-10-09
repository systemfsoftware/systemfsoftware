# Tool configurations are internal to this monorepo: every repository owns its
# own vitest, oxlint, tsdown and stryker configuration. What leaves this
# repository is a plugin (rules, guards, engines), never a configuration. A
# TypeScript base (`tsconfig`, as in `@tsconfig/*`) is shared by convention
# and is not a configuration here.
# This module decides which packages are configurations, what a consumer takes
# instead, and the message a consumer store refuses one with.
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
in
{
  inherit isConfig consumeInstead refusal;
}
