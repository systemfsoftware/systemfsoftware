## 1.2.0

### Minor Changes

- New oxlint plugin whose rule vocabulary is derived, not declared: `no-io-in-phase-bodies` reads the pure-phase set, the description's module name and the I/O-cell classification off `Cell.vocabulary` at load time, so reclassifying a cell or changing a phase's kind moves the rule with no edit here.

  The rule reports an I/O call reached from a pure phase body, directly or through a module-level helper it calls. That wording is the predicate's exact reach: a binding captured from an enclosing closure is not followed, and the message does not claim it is.

  An empty walk throws at load rather than matching nothing, because a set-membership rule over an empty set stays registered and green while deciding nothing.

  Delivered consumer-side through each consumer's own `jsPlugins`, never through the aggregate config: the plugin depends on `@systemfsoftware/effect-cell-types`, and declaring it in the aggregate would close a build cycle.

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- State the canonical-identifier contract once

  Six leaves carried the same rule: a rule matches the canonical identifier only, its suite
  carries a near-miss valid case proving the alias does not fire, and widening the match makes
  every one of those cases pass vacuously. It now lives once in the hub leaf that governs the
  whole family, so a leaf below inherits it rather than restating it.

  One clause was genuinely package-specific and stayed: a computed `Effect['fn']` still counts
  as an exported `Effect` value under `store-effect-fn-required`, which the shared rule does
  not say.

  Also corrects the turbo cycle recorded in two places. Both chains from `effect-executor` to
  `effect-dmmf` are real — `effect-cell-types` dev-depends on `oxlint-config` directly and
  again through `effect-gherkin-spec` — so the two were true at different granularity rather
  than in conflict, and both now say so. The closing edge is absent today; the rules exist to
  keep it absent.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@3.0.0
