# Tool configurations are internal to this monorepo: every repository owns its
# own vitest, oxlint, tsconfig, tsdown and stryker configuration. What leaves
# this repository is a plugin (rules, guards, engines), never a configuration.
# This module decides which packages are configurations, what a consumer takes
# instead, and the message a consumer store refuses one with.
{ lib }:
let
  unscoped = name: lib.last (lib.splitString "/" name);

  # A package is a configuration when its unscoped npm name contains `config`
  # or `preset` (REPO-S6 in AGENTS.md). A false positive fails loudly; the
  # remedy is renaming the package, never an exemption here.
  isConfig = name: lib.any (word: lib.hasInfix word (unscoped name)) [ "config" "preset" ];

  # What a consumer takes instead of each configuration: the plugins it turns
  # on, by their lib.mkConsumerStore attribute name, or a package published
  # outside this workspace, and how to wire them from the consumer's own
  # configuration. A row with no packages means no plugin ships for it.
  oxlint = packages: {
    inherit packages;
    wire = "wire each plugin's `configs.recommended` from your own `oxlint.config.ts`";
  };
  none = { packages = [ ]; wire = null; };
  consumeInstead = {
    oxlint-config-recommended = oxlint [
      "oxlint-plugin-cell-architecture"
      "oxlint-plugin-dmmf-workflow"
      "oxlint-plugin-effect-platform"
      "oxlint-plugin-effect-schema"
      "oxlint-plugin-test-discipline"
    ];
    oxlint-config-cell-architecture = oxlint [ "oxlint-plugin-cell-architecture" ];
    oxlint-config-dmmf = oxlint [ "oxlint-plugin-dmmf-workflow" "oxlint-plugin-effect-schema" ];
    oxlint-config-rule-authoring = none;
    vitest-config = { packages = [ "vitest" ]; wire = "import its guard exports from your own vitest configuration"; };
    stryker-config = { packages = [ "@systemfsoftware/stryker-js" ]; wire = "run it with your own stryker configuration"; };
    tsconfig = none;
    tsdown-config = none;
  };

  refusal = name:
    let row = consumeInstead.${unscoped name} or none;
    in "${name} is a tool configuration. Configs are internal to the systemfsoftware monorepo and are not distributed; "
    + "own the configuration in your repository"
    + (if row.packages == [ ]
    then ". No plugin ships for it."
    else " and consume what it turns on instead: ${lib.concatStringsSep ", " row.packages}; ${row.wire}.");
in
{
  inherit isConfig consumeInstead refusal;
}
