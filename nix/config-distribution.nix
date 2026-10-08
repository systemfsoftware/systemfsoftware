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
  # outside this workspace. An empty list means no plugin ships for it.
  consumeInstead = {
    oxlint-config-recommended = [
      "oxlint-plugin-cell-architecture"
      "oxlint-plugin-dmmf-workflow"
      "oxlint-plugin-effect-platform"
      "oxlint-plugin-effect-schema"
      "oxlint-plugin-test-discipline"
    ];
    oxlint-config-cell-architecture = [ "oxlint-plugin-cell-architecture" ];
    oxlint-config-dmmf = [ "oxlint-plugin-dmmf-workflow" "oxlint-plugin-effect-schema" ];
    oxlint-config-rule-authoring = [ ];
    vitest-config = [ "vitest" ];
    stryker-config = [ "@systemfsoftware/stryker-js" ];
    tsconfig = [ ];
    tsdown-config = [ ];
  };

  refusal = name:
    let instead = consumeInstead.${unscoped name} or [ ];
    in "${name} is a tool configuration. Configs are internal to the systemfsoftware monorepo and are not distributed; "
    + "own the configuration in your repository"
    + (if instead == [ ]
    then ". No plugin ships for it."
    else " and consume what it turns on instead: ${lib.concatStringsSep ", " instead}.");
in
{
  inherit isConfig consumeInstead refusal;
}
