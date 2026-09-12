# base parity diff — `@systemfsoftware/oxlint-config/base` re-derived from the leaf fragments

Every custom rule key the base preset resolved before the change, and the leaf-owned key that
replaces it. The gate is mechanical: `src/__tests__/base-registration.test.ts` compares the pre-change
map (pinned as a literal, because the composition it came from no longer exists) against the map the
re-derived `base` resolves, through the table below.

| Field       | Value                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| Subject     | `@systemfsoftware/oxlint-config` base preset                            |
| Run         | 2026-09-12                                                              |
| Verify      | `pnpm --filter @systemfsoftware/oxlint-config test` (13 tests)          |
| Diff        | `packages/oxlint-plugin/oxlint-config/src/oxlint-config.base.ts`        |
| Artifact of | `docs/census/oxlint/CENSUS.md` §6 "Delivery asymmetry" and its gaps row |

Claim kinds: **readoff** (a quantity read off a named file or off the table above), **measurement**
(a fact about the working tree, carrying its command), **derivation** (follows from named premises),
**judgement** (no procedure decides it).

## What changed

**Readoff.** `base` now declares `extends: [<nine leaf presets>]` and nothing else house-owned:

- `jsPlugins` deleted — each fragment preset self-registers its own plugin via `import.meta.resolve`,
  so the plugin set is the nine leaves exactly.
- `import effectDmmf` deleted, and with it the `...effectDmmf.configs.recommended.rules` spread.
- The fourteen `@systemfsoftware/oxlint-plugin/<rule>` literals deleted; the fragments' own
  `recommended` maps now carry those rules under the owning leaf's namespace.
- Three custom literals kept, re-keyed to their owner: `effect-native/no-new-worker-with-wasm-import`
  (`error`), `structure/no-barrels` (`off`), `structure/no-inline-destructured-type` (`off`). The
  worker rule is also `recommended` by `effect-native` in this tree, so its literal is idempotent.
- Stock deltas kept verbatim: `categories.correctness`, `options.typeAware`, the `plugins` list, the
  19 stock rule literals, the `promoteWarnToError(tsgoCorrectness.rules)` spread, and
  `ignorePatterns`.
- Both `overrides` blocks re-keyed: the six custom ids from the aggregate namespace to the leaf
  namespaces that own them. Nothing else about them changed.
- `cell-vocabulary` is **not** extended: its rule imports `@systemfsoftware/effect-cell-types`, which
  closes a package cycle through this config. It is delivered consumer-side instead — see
  "Delivered consumer-side (OX-DL1)".

**Judgement — why not `oxlint-plugin-recommended`.** The parity gate is the binding contract: `base`'s
resolved map must equal the pre-change map modulo re-keying. `@systemfsoftware/oxlint-plugin-recommended`
is not a leaf fragment; it is a stock-rule tier of 25 ids, and extending it would inject stock rules
`base` never carried into every package that extends `base`. The intended delta is the four
effect-entrypoint rules that never loaded under the aggregates — nothing else.

## Consumer fallout — two configs must re-key

**Measurement.** Every package in this repo extends `base` or `strict`, so the plugin set `base`
registers is the plugin set they load. Two consumer configs name a custom rule under the aggregate
namespace, which is no longer a loaded plugin. oxlint rejects the config outright — probed with a
config of that shape against the new `base`:

```
$ oxlint -c .smoke-consumer/cfg.ts .smoke-consumer/probe.ts
Failed to parse oxlint configuration file.
  × Plugin '@systemfsoftware' not found
```

| File                                                             | Current rule key                                      | Must become                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `packages/effect-daemon-spec/oxlint.config.ts:7`                 | `@systemfsoftware/oxlint-plugin/no-io-boundary-tests` | `@systemfsoftware/oxlint-plugin-structure/no-io-boundary-tests` |
| `packages/stryker-js/stryker-js-instrumenter/oxlint.config.ts:7` | `@systemfsoftware/oxlint-plugin/ban-classes`          | `@systemfsoftware/oxlint-plugin-structure/ban-classes`          |

Both edits landed in this change: `effect-daemon-spec/oxlint.config.ts` and
`stryker-js-instrumenter/oxlint.config.ts` are re-keyed in the same commits that re-derived
`base` — the table above is the record, not a to-do.
The plugin needs no new dependency in either package — the owning leaf registers through the
`extends` chain. `effect-daemon-spec` carries a second obligation: registering `cell-vocabulary`
itself, per "Delivered consumer-side (OX-DL1)".

## Counts

| Measure                                        | Count |
| ---------------------------------------------- | ----- |
| Custom rule ids the pre-change `base` declared | 58    |
| Custom rule ids the re-derived `base` resolves | 62    |
| Pre ids mapped onto a leaf-owned id            | 58    |
| Ids added (the delivery-asymmetry fix)         | 4     |
| Pre ids dropped                                | 0     |
| Mapped pairs whose severity/options differ     | 0     |
| Own custom literals kept by `base`             | 3     |

**Derivation of 58 → 62.** 58 = the 17 aggregate literals (14 aggregate rules plus
`no-new-worker-with-wasm-import`, `no-barrels` and `no-inline-destructured-type`) plus the 41 ids of
the `effect-dmmf` recommended spread. 62 = the union of the nine extended leaves' `recommended` maps
(8 + 3 + 4 + 9 + 7 + 9 + 4 + 12 + 4 = 60) plus `no-barrels` and `no-inline-destructured-type`, which no
leaf recommends. 58 mapped + 4 added = 62. The gate pins 62 twice: as the parity sum, and as
`baseCustomIds` = 62 resolved + 6 override-named = 68.

## The re-key table

**Measurement.** Rendered from `packages/oxlint-plugin/oxlint-config/src/__tests__/base-registration.test.ts`
`ID_MAPPING`; every `Equal` cell is the test's own assertion, not a reading.

| Pre-change id                                                                      | Leaf-owned id                                                                        | Pre severity | Equal | Owner leaf       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------ | ----- | ---------------- |
| `@systemfsoftware/oxlint-plugin/no-date-now-in-effect`                             | `@systemfsoftware/oxlint-plugin-effect-native/no-date-now-in-effect`                 | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-logging-in-catch`                               | `@systemfsoftware/oxlint-plugin-effect-native/no-logging-in-catch`                   | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-native-map-in-effect`                           | `@systemfsoftware/oxlint-plugin-effect-native/no-native-map-in-effect`               | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-native-set-in-effect`                           | `@systemfsoftware/oxlint-plugin-effect-native/no-native-set-in-effect`               | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-native-setinterval-in-effect`                   | `@systemfsoftware/oxlint-plugin-effect-native/no-native-setinterval-in-effect`       | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-native-settimeout-in-effect`                    | `@systemfsoftware/oxlint-plugin-effect-native/no-native-settimeout-in-effect`        | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-new-promise-in-effect`                          | `@systemfsoftware/oxlint-plugin-effect-native/no-new-promise-in-effect`              | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin/no-new-worker-with-wasm-import`                    | `@systemfsoftware/oxlint-plugin-effect-native/no-new-worker-with-wasm-import`        | `error`      | yes   | effect-native    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/ban-data-taggederror`                  | `@systemfsoftware/oxlint-plugin-effect-schema/ban-data-taggederror`                  | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/ban-effect-schema-imports`             | `@systemfsoftware/oxlint-plugin-effect-schema/ban-effect-schema-imports`             | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-member`                  | `@systemfsoftware/oxlint-plugin-effect-schema/no-manual-tag-member`                  | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-property`                | `@systemfsoftware/oxlint-plugin-effect-schema/no-manual-tag-property`                | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/schema-checked-element-named`          | `@systemfsoftware/oxlint-plugin-effect-schema/schema-checked-element-named`          | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/schema-declaration-location`           | `@systemfsoftware/oxlint-plugin-effect-schema/schema-declaration-location`           | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/schema-file-exports-schemas-only`      | `@systemfsoftware/oxlint-plugin-effect-schema/schema-file-exports-schemas-only`      | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/schema-filter-constructive-generation` | `@systemfsoftware/oxlint-plugin-effect-schema/schema-filter-constructive-generation` | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/schema-recursive-union-budget`         | `@systemfsoftware/oxlint-plugin-effect-schema/schema-recursive-union-budget`         | `error`      | yes   | effect-schema    |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/damp-workflow-stem`                    | `@systemfsoftware/oxlint-plugin-effect-workflow/damp-workflow-stem`                  | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/make-body-purity`                      | `@systemfsoftware/oxlint-plugin-effect-workflow/make-body-purity`                    | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/make-command-schema`                   | `@systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema`                 | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/make-file-location`                    | `@systemfsoftware/oxlint-plugin-effect-workflow/make-file-location`                  | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-export-topology`         | `@systemfsoftware/oxlint-plugin-effect-workflow/workflow-file-export-topology`       | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-make-presence`           | `@systemfsoftware/oxlint-plugin-effect-workflow/workflow-file-make-presence`         | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-match-exhaustive`             | `@systemfsoftware/oxlint-plugin-effect-workflow/workflow-match-exhaustive`           | `error`      | yes   | effect-workflow  |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-assert-in-property`                 | `@systemfsoftware/oxlint-plugin-property-testing/no-assert-in-property`              | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-nested-quantification`              | `@systemfsoftware/oxlint-plugin-property-testing/no-nested-quantification`           | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-silent-return`                      | `@systemfsoftware/oxlint-plugin-property-testing/no-silent-return`                   | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-unbounded-fanout`                   | `@systemfsoftware/oxlint-plugin-property-testing/no-unbounded-fanout`                | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/prop-arbitrary-schema-origin`          | `@systemfsoftware/oxlint-plugin-property-testing/prop-arbitrary-schema-origin`       | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/prop-fixture-schema-origin`            | `@systemfsoftware/oxlint-plugin-property-testing/prop-fixture-schema-origin`         | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/prop-generated-law-duplicate`          | `@systemfsoftware/oxlint-plugin-property-testing/prop-generated-law-duplicate`       | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/property-file-purity`                  | `@systemfsoftware/oxlint-plugin-property-testing/property-file-purity`               | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/require-effect-fastcheck`              | `@systemfsoftware/oxlint-plugin-property-testing/require-effect-fastcheck`           | `error`      | yes   | property-testing |
| `@systemfsoftware/oxlint-plugin/ban-error-string`                                  | `@systemfsoftware/oxlint-plugin-structure/ban-error-string`                          | `error`      | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/internal-export-jsdoc`                             | `@systemfsoftware/oxlint-plugin-structure/internal-export-jsdoc`                     | `error`      | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/no-barrels`                                        | `@systemfsoftware/oxlint-plugin-structure/no-barrels`                                | `off`        | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/no-inline-destructured-type`                       | `@systemfsoftware/oxlint-plugin-structure/no-inline-destructured-type`               | `off`        | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/no-internal-jsdoc-outside`                         | `@systemfsoftware/oxlint-plugin-structure/no-internal-jsdoc-outside`                 | `error`      | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/no-io-boundary-tests`                              | `@systemfsoftware/oxlint-plugin-structure/no-io-boundary-tests`                      | `error`      | yes   | structure        |
| `@systemfsoftware/oxlint-plugin/no-context-generic-tag`                            | `@systemfsoftware/oxlint-plugin-tag-discipline/no-context-generic-tag`               | `error`      | yes   | tag-discipline   |
| `@systemfsoftware/oxlint-plugin/no-direct-tag-access`                              | `@systemfsoftware/oxlint-plugin-tag-discipline/no-direct-tag-access`                 | `error`      | yes   | tag-discipline   |
| `@systemfsoftware/oxlint-plugin/no-either-tag-assertions`                          | `@systemfsoftware/oxlint-plugin-tag-discipline/no-either-tag-assertions`             | `error`      | yes   | tag-discipline   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/damp-test-naming`                      | `@systemfsoftware/oxlint-plugin-test-hygiene/damp-test-naming`                       | `error`      | yes   | test-hygiene     |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-behaviourless-assertion`            | `@systemfsoftware/oxlint-plugin-test-hygiene/no-behaviourless-assertion`             | `error`      | yes   | test-hygiene     |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-unrun-effect-test`                  | `@systemfsoftware/oxlint-plugin-test-hygiene/no-unrun-effect-test`                   | `error`      | yes   | test-hygiene     |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/pbt-naming`                            | `@systemfsoftware/oxlint-plugin-test-hygiene/pbt-naming`                             | `error`      | yes   | test-hygiene     |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-exercises-use-case`          | `@systemfsoftware/oxlint-plugin-test-placement/behaviour-exercises-use-case`         | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-one-feature-per-file`        | `@systemfsoftware/oxlint-plugin-test-placement/behaviour-one-feature-per-file`       | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-test-requires-gherkin`       | `@systemfsoftware/oxlint-plugin-test-placement/behaviour-test-requires-gherkin`      | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-prop-only`              | `@systemfsoftware/oxlint-plugin-test-placement/in-source-test-prop-only`             | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-targets-private`        | `@systemfsoftware/oxlint-plugin-test-placement/in-source-test-targets-private`       | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-io-module-in-source-test`           | `@systemfsoftware/oxlint-plugin-test-placement/no-io-module-in-source-test`          | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/no-test-file-in-src`                   | `@systemfsoftware/oxlint-plugin-test-placement/no-test-file-in-src`                  | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/src-property-test-cell`                | `@systemfsoftware/oxlint-plugin-test-placement/src-property-test-cell`               | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/test-file-outside-tests-dir`           | `@systemfsoftware/oxlint-plugin-test-placement/test-file-outside-tests-dir`          | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/test-suffix-outside-src`               | `@systemfsoftware/oxlint-plugin-test-placement/test-suffix-outside-src`              | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/tests-dir-helpers-in-fixtures`         | `@systemfsoftware/oxlint-plugin-test-placement/tests-dir-helpers-in-fixtures`        | `error`      | yes   | test-placement   |
| `@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api`               | `@systemfsoftware/oxlint-plugin-test-placement/tests-import-public-api`              | `error`      | yes   | test-placement   |

## Added by the delivery-asymmetry fix

The four rules no aggregate registered a plugin for. They are the only ids post may add, and the gate
fails if a fifth appears.

| Newly loading id                                                                 | Severity |
| -------------------------------------------------------------------------------- | -------- |
| `@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-interprets-once`    | `error`  |
| `@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-no-exports`         | `error`  |
| `@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-no-promise-wrapper` | `error`  |
| `@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-not-imported`       | `error`  |

**Measurement.** With the new preset, oxlint reports these on a throwaway probe directory inside the
package (deleted after the run), and parses the config. The block lists the three rule codes under
test; the run also emits unrelated diagnostics from other rules in the same preset (and exits 1
because it found violations).

```
$ oxlint -c .smoke-amended/cfg-base.ts .smoke-amended/barrel.ts .smoke-amended/tag.ts \
    .smoke-amended/tag.spec.ts .smoke-amended/native.ts -f json
.smoke-amended/barrel.ts    :: @systemfsoftware/effect-entrypoint(entrypoint-not-imported)
.smoke-amended/native.ts    :: @systemfsoftware/effect-native(no-native-map-in-effect)
.smoke-amended/tag.ts       :: @systemfsoftware/tag-discipline(no-direct-tag-access)
```

`tag.spec.ts` holds the same `_tag` comparison and reports neither rule — which is the re-keyed
test-file `overrides` block doing its job; an un-re-keyed override leaves a dead key and it would
report.

## Delivered consumer-side (OX-DL1)

`cell-vocabulary`'s single rule is not in `base`. Its plugin imports `@systemfsoftware/effect-cell-types`
at module load, and Turbo counts `devDependencies` in the package graph, so extending its preset
closes a cycle and fails the build:

| Edge                                                  | Kind                                                   |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `oxlint-plugin-cell-vocabulary` → `effect-cell-types` | `dependencies`                                         |
| `effect-cell-types` → `oxlint-config`                 | `devDependencies` (extended by its `oxlint.config.ts`) |

`packages/oxlint-plugin/AGENTS.md` `OX-DL1` states the remedy: a plugin needing
`@systemfsoftware/effect-cell-types` is delivered through each consuming package's own
`jsPlugins`/`rules`, never through `effect-dmmf` or `oxlint-config`. Two probes against the amended
preset, both run from a scratch directory inside this package:

```
$ oxlint -c cfg-cell-named.ts barrel.ts          # base alone, rule named anyway
Failed to parse oxlint configuration file.
  × Plugin '@systemfsoftware/cell-vocabulary' not found

$ oxlint -c cfg-cell-delivered.ts barrel.ts      # base plus the fragment's own preset
.smoke-amended/barrel.ts:1:1: error @systemfsoftware/effect-entrypoint(entrypoint-not-imported): ...
```

`cfg-cell-delivered.ts` is `extends: [base, cellVocabularyPreset]` with the rule named as
`@systemfsoftware/oxlint-plugin-cell-vocabulary/no-io-in-phase-bodies`: the config parses and lints,
so the delivery shape works for whoever adopts it. `packages/effect-daemon-spec` is that adopter — it
already declares the devDependency edge and repeats `no-io-boundary-tests` in its own config — and its
`oxlint.config.ts` is outside this change's scope.

## Ownership corrections

**Measurement.** Owners read from each leaf's `src/index.ts` in this tree. The owner table in the
task that commissioned this change (said to come from the census) names five owners wrongly; the
census document itself, `CENSUS.md` §1a–§1c, agrees with the sources.

| Rule                     | The assignment's owner table | Owner in the package sources |
| ------------------------ | ---------------------------- | ---------------------------- |
| `no-direct-tag-access`   | effect-native                | tag-discipline               |
| `no-date-now-in-effect`  | structure                    | effect-native                |
| `no-context-generic-tag` | structure                    | tag-discipline               |
| `no-io-boundary-tests`   | tag-discipline               | structure                    |
| `ban-classes`            | tag-discipline               | structure                    |

**Readoff.** Two further divergences from `CENSUS.md`, both about the same rule: §1a marks
`effect-native/no-new-worker-with-wasm-import` as not recommended, and the "9 rules no preset
recommends" table says "Recommended by nobody". `oxlint-plugin-effect-native/src/index.ts`
recommends it in this tree (8 recommended ids), which is why `base`'s re-keyed literal for it is
idempotent. The census pins a commit; these rule sets changed with the leaf splits.

## Gaps this change leaves open

- `CENSUS.md` §6 "Delivery asymmetry" and §7's description of `base` (jsPlugins, 15 + 41 rules by
  name or spread) describe the pre-change composition and are now stale — the census owner, not
  `oxlint-config`, owns that file.
- `cell-vocabulary` has no in-repo consumer that registers it yet. Its rule is delivered consumer-side
  (see above); until `effect-daemon-spec` — which already declares the `effect-cell-types` devDependency
  edge — registers the fragment, its rule fires nowhere in this repo.
- Two consumer configs must re-key a custom rule id, or their lint fails to parse (see "Consumer
  fallout"): `packages/effect-daemon-spec/oxlint.config.ts` and
  `packages/stryker-js/stryker-js-instrumenter/oxlint.config.ts`. Both are outside this change's scope.
