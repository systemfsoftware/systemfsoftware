# Oxlint plugin census — 2026-09-12

Every custom oxlint plugin and the rules it registers, enumerated from the pinned commit's own
modules. Counts and rule ids are internal readoff; the mechanism behind each rule is prose keyed to
those ids, and each registered id appears in exactly one row below.

| Field   | Value                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------- |
| Subject | `systemfsoftware/systemfsoftware`                                                                                    |
| Commit  | `30ee3bf9cc823d3a5f62fe8884a94f0e6ee36545`                                                                           |
| Scope   | `packages/oxlint-plugin/**`; plus every config that registers a custom plugin, and the two adjacent lint instruments |
| Run     | 2026-09-12                                                                                                           |

Claim kinds used below: **readoff** (a quantity read off this record's own table or a named file),
**measurement** (a fact about the working tree, carrying its command), **derivation** (follows from
named premises), **judgement** (no procedure decides it).

## How to re-run

**Measurement.** From the repository root, after `pnpm gate:dist`. This repo has no root
`node_modules`, and `packages/oxlint-plugin/all` is the one package whose workspace links cover
every plugin, so the enumerator runs there and resolves each plugin through its own
`package.json#exports['.'].default`:

```bash
CAND="$(pwd)/packages/oxlint-plugin/all"
PLUGDIR="$(pwd)/packages/oxlint-plugin"
cp docs/census/oxlint/{packages,run}.ts "$CAND"/
(cd "$CAND" && node --experimental-strip-types ./run.ts "$PLUGDIR" > /tmp/oxlint-census.json)
rm "$CAND"/{packages,run}.ts
```

`packages.ts` names the thirteen plugin packages; `run.ts` reads each module's runtime `rules` map,
its `configs.recommended.rules` membership, counts `*.ts` files under `src/rules/` by kind
(rule / `*.config.ts` / test), and reads `stryker.config.json`. The published-name check is
`curl -s 'https://registry.npmjs.org/-/v1/search?text=@systemfsoftware&size=250'`.

**Gates already in the tree.** `pnpm lint` covers every package. Two tests pin rule identity:
`@systemfsoftware/oxlint-plugin#test` (`src/__tests__/aggregate.test.ts` asserts the aggregate's 19
ids and 15 recommended ids against a pre-split literal) and `@systemfsoftware/oxlint-config#test`
(`src/__tests__/base-registration.test.ts` derives the loaded namespaces from the preset's own
`jsPlugins` and fails on an orphaned `@systemfsoftware/…` rule key).

`docs/census/oxlint/` holds three files: `packages.ts` (the thirteen names), `run.ts` (the
enumerator), `CENSUS.md` (this record). The enumerator is also the only place the 150-id union is
written down.

---

## Headline numbers

| Measure                                                  | Count |
| -------------------------------------------------------- | ----- |
| Plugin packages declared as workspace members            | 13    |
| Public plugin packages                                   | 10    |
| Private (inlined) plugin leaves                          | 3     |
| Distinct registered rule ids at the source layer         | 150   |
| Rule ids a consumer reaches through a preset, as shipped | 61    |
| Rule ids a repo package reaches through `base`+extras    | 63    |
| Rule source files                                        | 74    |
| `*.config.ts` static-config files                        | 66    |
| RuleTester test files                                    | 69    |
| Packages with a mutation cell (`stryker.config.json`)    | 10    |
| Packages in the family that carry no rule logic          | 4     |

**Derivation of 61.** `all` and `base` register four plugins — `oxlint-plugin` (15 recommended),
`cell-vocabulary` (1), `effect-dmmf` (41), `effect-entrypoint` (4) — and spread each one's
`configs.recommended`. Premises: each plugin's own `configs.recommended.rules`; the four
`jsPlugins` entries in each preset. If a leaf's recommended set changes, this number changes with it.

**Derivation of 63.** A package extending `base` additionally enables `no-new-worker-with-wasm-import`
and `no-io-boundary-tests` by name. It does **not** gain the cell-vocabulary rule or the four
entrypoint rules — 63, not 68.

The remaining 87 source-layer ids are reached only by a consumer that loads a leaf directly, or by
nothing at all; the 9 never-recommended rules are enumerated with their reasons at the end.

## The thirteen packages

| #  | Package                                            | Kind                           | Rules | Public | Mutation cell |
| -- | -------------------------------------------------- | ------------------------------ | ----- | ------ | ------------- |
| 1  | `@systemfsoftware/oxlint-plugin`                   | Aggregate of 3 private leaves  | 19    | yes    | no            |
| 2  | `@systemfsoftware/oxlint-plugin-cell-vocabulary`   | Leaf                           | 1     | yes    | yes           |
| 3  | `@systemfsoftware/oxlint-plugin-effect-entrypoint` | Leaf                           | 4     | yes    | yes           |
| 4  | `@systemfsoftware/oxlint-plugin-effect-dmmf`       | Aggregate of 5 leaves          | 41    | yes    | no            |
| 5  | `@systemfsoftware/oxlint-plugin-recommended`       | Settings over stock rules only | 0 own | yes    | no            |
| 6  | `@systemfsoftware/oxlint-plugin-effect-native`     | Leaf (private)                 | 8     | no     | yes           |
| 7  | `@systemfsoftware/oxlint-plugin-tag-discipline`    | Leaf (private)                 | 4     | no     | yes           |
| 8  | `@systemfsoftware/oxlint-plugin-structure`         | Leaf (private)                 | 7     | no     | yes           |
| 9  | `@systemfsoftware/oxlint-plugin-effect-schema`     | Leaf                           | 9     | yes    | yes           |
| 10 | `@systemfsoftware/oxlint-plugin-effect-workflow`   | Leaf                           | 7     | yes    | yes           |
| 11 | `@systemfsoftware/oxlint-plugin-property-testing`  | Leaf                           | 9     | yes    | yes           |
| 12 | `@systemfsoftware/oxlint-plugin-test-hygiene`      | Leaf                           | 4     | yes    | yes           |
| 13 | `@systemfsoftware/oxlint-plugin-test-placement`    | Leaf                           | 12    | yes    | yes           |

**Judgement.** The 13-way split is a mutation-budget decision, not a taxonomy — recorded in
`mutation-budgets-split-rule-packages-into-private-cells.md`. The three private leaves exist because
one 19-rule package concentrated ~2,075 mutants into a single Stryker cell; the public
`oxlint-plugin` re-keys them so no consumer id migrates. What decides "private" versus "public" is
whether the split was an internal budget move (private, inlined) or a consumer-side cohesion
decision (public name).

---

## 1 · `@systemfsoftware/oxlint-plugin` — 19 rules

**Readoff.** 19 rules, 15 recommended, no `src/rules/` of its own. `src/index.ts` spreads three
private leaves and re-keys every rule under its own plugin name; `recommendedFrom` keeps only what
each leaf itself recommends. No mutation cell and no RuleTester suite: the leaves carry both.

### 1a · effect-native (leaf, 8 rules)

| Rule                              | Enforces                                                                                             | Recommended |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| `no-date-now-in-effect`           | Effect imported ⇒ `Date.now()` banned, including inside `Effect.sync`; use `Clock.currentTimeMillis` | yes         |
| `no-native-map-in-effect`         | Effect imported ⇒ `new Map` banned; use `HashMap`                                                    | yes         |
| `no-native-set-in-effect`         | Effect imported ⇒ `new Set` banned; use `HashSet`                                                    | yes         |
| `no-native-setinterval-in-effect` | Effect imported ⇒ `setInterval`/`clearInterval` banned; use `Effect.repeat` with a `Schedule`        | yes         |
| `no-native-settimeout-in-effect`  | Effect imported ⇒ `setTimeout` banned; use `Effect.delay`/`Effect.sleep`                             | yes         |
| `no-new-promise-in-effect`        | Effect imported ⇒ `new Promise(executor)` banned; use `Effect.async` or `Promise.withResolvers`      | yes         |
| `no-new-worker-with-wasm-import`  | A file importing a WASM module may not `new Worker(path)` — WASM global state races across threads   | no          |
| `no-logging-in-catch`             | No logging inside an Effect catch block; use `Effect.tapError`                                       | yes         |

Six of these fire only when Effect is imported; the import is the rule's scope condition, not a
coincidence. `no-new-worker-with-wasm-import` is the one this leaf registers but does not recommend.

### 1b · tag-discipline (leaf, 4 rules)

| Rule                           | Enforces                                                                                   | Recommended |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ----------- |
| `no-context-generic-tag`       | Bans `Context.GenericTag`; a v4 service is declared with `Context.Service`                 | yes         |
| `no-direct-tag-access`         | Bans direct `_tag` access; use the Match API or guards. Configurable: expected, fix, allow | yes         |
| `no-either-tag-assertions`     | Bans Either `_tag` assertions in test files; compare with `Either.left`/`Either.right`     | yes         |
| `no-bodyless-status-assertion` | An HTTP status assertion must surface the response body (`checkResponseWithBody`)          | no          |

### 1c · structure (leaf, 7 rules)

| Rule                          | Enforces                                                                                                                                   | Recommended |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `ban-classes`                 | Bans every class except the Effect v4 sanctioned idioms (`Context.Service`, `Schema.Class`, `Data.TaggedClass`, Rpc factories)             | no          |
| `ban-error-string`            | Bans string coercion of error-like values; carry `{ cause }`                                                                               | yes         |
| `internal-export-jsdoc`       | Every export under an `internal` path segment carries a JSDoc `@internal` tag                                                              | yes         |
| `no-barrels`                  | Detects barrel files (`index.ts`/`mod.ts` re-exporting) and barrel imports                                                                 | no          |
| `no-inline-destructured-type` | Bans inline `TSTypeLiteral` on destructured parameters; use a named type                                                                   | no          |
| `no-internal-jsdoc-outside`   | Forbids `@internal` outside an `internal` path segment                                                                                     | yes         |
| `no-io-boundary-tests`        | I/O boundary files (`acl`/`store`/`adapter`/`handler`) get composition tests, never `*.test.ts` or an in-source `import.meta.vitest` block | yes         |

**Measurement.** `no-io-boundary-tests` is the only rule added to `base` by name beyond the
presets' own recommended sets (`packages/oxlint-plugin/oxlint-config/src/oxlint-config.base.ts`),
and `@systemfsoftware/effect-daemon-spec` repeats the entry in its own config — the only consumer
config in the tree that names a custom rule explicitly.

## 2 · `@systemfsoftware/oxlint-plugin-cell-vocabulary` — 1 rule

| Rule                    | Enforces                                                                                                                                                                                                                                                                                            | Recommended |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `no-io-in-phase-bodies` | I/O reachable from the body of a phase whose kind forbids it. Phase names, the kind partition, the description module, and the I/O classification are module-load projections of `Cell.vocabulary`; an empty walked pure-phase set throws at load rather than loading a rule with nothing to decide | yes         |

Registered by `@systemfsoftware/all` only. It is the one plugin in the family that imports
`@systemfsoftware/effect-cell-types` at runtime, which is why it is delivered consumer-side through
each consumer's own `jsPlugins` (`OX-DL1`) instead of through the `effect-dmmf` aggregate — routing
it through an aggregate would close a cyclic build dependency.

## 3 · `@systemfsoftware/oxlint-plugin-effect-entrypoint` — 4 rules

All four key on the exact basename `main.ts`.

| Rule                            | Enforces                                            | Recommended |
| ------------------------------- | --------------------------------------------------- | ----------- |
| `entrypoint-interprets-once`    | Exactly one interpretation edge per entrypoint file | yes         |
| `entrypoint-no-exports`         | `main.ts` exports nothing                           | yes         |
| `entrypoint-no-promise-wrapper` | `main.ts` never wraps a foreign promise runtime     | yes         |
| `entrypoint-not-imported`       | Nothing imports `main.ts`                           | yes         |

`entrypoint-no-exports` and `entrypoint-not-imported` are enabled as a pair; the first is this
package's obligation rule, the tenth id in the family that fails a file for lacking something.

## 4 · `@systemfsoftware/oxlint-plugin-effect-dmmf` — 41 rules

Defines none. Re-exports five public leaves under one namespace and recomposes each leaf's own
recommended set by re-keying, so a consumer sees `@systemfsoftware/oxlint-plugin-effect-dmmf/<rule>`.
`base` registers it and spreads all 41. No mutation cell, no suite — the leaves carry both.

### 4a · effect-schema (9 rules)

| Rule                                    | Enforces                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ban-effect-schema-imports`             | Bans the bare `@effect/schema` import path                                                                                   |
| `ban-data-taggederror`                  | Bans `Data.TaggedError`; failures are `Schema.TaggedError`                                                                   |
| `no-manual-tag-member`                  | Bans a hand-written `_tag` class member where a schema owns the tag                                                          |
| `no-manual-tag-property`                | Bans a hand-written `_tag` property                                                                                          |
| `schema-checked-element-named`          | A `check`ped element in a collection combinator (`Array`/`Record`/`Tuple`/`Set`/`Map`/`Union`) is extracted to a named const |
| `schema-declaration-location`           | Schemas are declared where the architecture puts them                                                                        |
| `schema-file-exports-schemas-only`      | A schema file exports schemas and nothing else                                                                               |
| `schema-filter-constructive-generation` | `filter` stays constructive for derived arbitraries                                                                          |
| `schema-recursive-union-budget`         | A recursive union stays within its declared generation budget                                                                |

### 4b · effect-workflow (7 rules)

| Rule                            | Enforces                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `damp-workflow-stem`            | Workflow file stems follow the DAMP naming stem                                           |
| `make-body-purity`              | A `Workflow.make` argument body stays pure                                                |
| `make-command-schema`           | The command a workflow accepts is a schema                                                |
| `make-file-location`            | `Workflow.make` lives in a single-segment `<stem>.workflow.ts`, at most one call per file |
| `workflow-file-export-topology` | The workflow file's export shape                                                          |
| `workflow-file-make-presence`   | A workflow file contains a `Workflow.make`                                                |
| `workflow-match-exhaustive`     | Workflow dispatch is exhaustive over the closed decision union                            |

`make-body-purity` and `workflow-match-exhaustive` are boundary-scoped — only `Workflow.make`
argument bodies are examined — and four of the seven report nothing outside a single-segment
`<stem>.workflow.ts`.

### 4c · property-testing (9 rules)

| Rule                           | Enforces                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `no-assert-in-property`        | A property predicate never calls `expect`/`assert`; it returns a verdict on every path |
| `no-nested-quantification`     | No `fc.assert` inside a property predicate                                             |
| `no-silent-return`             | A property predicate never returns without a verdict                                   |
| `no-unbounded-fanout`          | No unbounded generation fan-out inside a property                                      |
| `prop-arbitrary-schema-origin` | An arbitrary derives from a schema, not a hand-rolled generator                        |
| `prop-fixture-schema-origin`   | A fixture derives from a schema                                                        |
| `prop-generated-law-duplicate` | A generated law is not restated by a hand-written case in the same file                |
| `property-file-purity`         | Property files stay pure                                                               |
| `require-effect-fastcheck`     | `fast-check` is reached through the Effect integration that ships it                   |

### 4d · test-hygiene (4 rules)

| Rule                         | Enforces                                                |
| ---------------------------- | ------------------------------------------------------- |
| `damp-test-naming`           | Test names follow the DAMP convention                   |
| `no-behaviourless-assertion` | No assertion that exercises no behaviour                |
| `no-unrun-effect-test`       | An Effect test is actually run, not built and discarded |
| `pbt-naming`                 | Property-test names follow the PBT convention           |

The one leaf with no README; its rules live only in `src/rules/`.

### 4e · test-placement (12 rules)

| Rule                              | Enforces                                                          |
| --------------------------------- | ----------------------------------------------------------------- |
| `behaviour-exercises-use-case`    | A behaviour spec exercises a use case, not an internal            |
| `behaviour-one-feature-per-file`  | One Gherkin feature per file                                      |
| `behaviour-test-requires-gherkin` | A behaviour test is written in Gherkin                            |
| `in-source-test-prop-only`        | An in-source `import.meta.vitest` block holds property tests only |
| `in-source-test-targets-private`  | In-source tests target private code                               |
| `no-io-module-in-source-test`     | No I/O module inside an in-source test                            |
| `no-test-file-in-src`             | No `*.test.ts` under `src/`                                       |
| `src-property-test-cell`          | A `src/` property test occupies an allowed cell                   |
| `test-file-outside-tests-dir`     | Test files outside `tests/` follow the placement rules            |
| `test-suffix-outside-src`         | A `*.test.ts` suffix outside `src/` follows the placement rules   |
| `tests-dir-helpers-in-fixtures`   | Helpers under `tests/` live in fixtures                           |
| `tests-import-public-api`         | A test imports the published surface, not `src/` internals        |

## 5 · `@systemfsoftware/oxlint-plugin-recommended` — settings, 0 rules

Registers no plugin and defines no rule of its own. It exports `plugins` (stock namespaces:
`typescript`, `import`, `unicorn`, `vitest`), `options` (`typeAware: true`), `overrides`
(observer-file patterns enabling six `vitest/*` rules on test paths), and a `rules` map of 25
**stock** oxlint ids the architecture recommends:

| Group                         | Ids                                                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| assertion and cast discipline | `typescript/consistent-type-assertions` (`assertionStyle: 'never'`), `typescript/no-unnecessary-type-assertion`, `typescript/no-non-null-assertion`, `typescript/ban-ts-comment` (`ts-ignore`/`ts-nocheck` forbidden, `ts-expect-error` requires a description) |
| unsafe-flow discipline        | `typescript/no-unsafe-argument`, `typescript/no-unsafe-assignment`, `typescript/no-unsafe-call`, `typescript/no-unsafe-member-access`, `typescript/no-unsafe-return`, `typescript/no-explicit-any`                                                              |
| promise discipline            | `typescript/no-floating-promises`, `typescript/no-misused-promises`, `typescript/await-thenable`, `typescript/only-throw-error`, `no-throw-literal`                                                                                                             |
| control-flow discipline       | `no-ternary`, `typescript/no-unnecessary-condition`, `typescript/strict-boolean-expressions`, `typescript/switch-exhaustiveness-check` (a `default` case may not stand in for exhaustiveness)                                                                   |
| value discipline              | `typescript/no-base-to-string`                                                                                                                                                                                                                                  |
| module discipline             | `import/no-cycle`, `import/no-mutable-exports`, `no-var`                                                                                                                                                                                                        |
| suppression discipline        | `unicorn/no-abusive-eslint-disable`                                                                                                                                                                                                                             |
| test discipline               | `vitest/no-standalone-expect` (off here, on in the `overrides` tier)                                                                                                                                                                                            |

It is not a `jsPlugin` — no `jsPlugins` entry exists for it anywhere in the tree; `all` consumes it
by spreading exports into its config object. Its own `lint` script runs
`node scripts/guard-no-behavior.ts`, which fails if any arrow function, function declaration,
control-flow keyword, or test surface appears under `src/` after comment and literal stripping —
the package is declaration data by construction, so a computed glob or rule key cannot be
introduced silently.

**Judgement.** This is the family's only non-plugin public package, and the decision it encodes is
that stock-rule recommendation and custom-rule delivery are separate surfaces: the custom plugins
exist because stock oxlint cannot see the architecture's vocabulary, and everything stock oxlint
_can_ see is recorded here as a rule list rather than re-implemented.

## 6 · `@systemfsoftware/all` — the preset

`jsPlugins` names four plugins via `import.meta.resolve`, so the specifier list and the rule list
derive from the same imports: `oxlint-plugin`, `oxlint-plugin-cell-vocabulary`,
`oxlint-plugin-effect-dmmf`, `oxlint-plugin-effect-entrypoint`. It spreads the four recommended sets
(61 ids), adds the `recommended` package's stock tier, sets `correctness: 'error'`, configures the
path-scoped `complexity` rule (`max 2` under `src/`, `max 1` for `**/src/**/*.workflow.ts`, off in
tests, `modified` variant), and adds `no-restricted-imports` banning `node:*`, bare Node builtins,
and the `@std/*` modules that mirror Effect services.

### Delivery asymmetry

`all` registers `cell-vocabulary` and `effect-entrypoint`; `base` does not. Every package in this
repo extends `base` or `strict`, so none of them runs the cell-vocabulary rule or the four
entrypoint rules. Nothing reports the gap: a rule configured without its plugin loaded is reported
as unknown at most once, then silently inert.

**Empirical, not derived.** The asymmetry is read off the two configs (`all/src/mod.ts:23-28` versus
`oxlint-config.base.ts:30-33`), and the consequence is the known behavior of an unloaded plugin in
oxlint. The consequence itself was not probed in this run. `docs/plans/2026-09-04-1710-refactor-oxlint-core-plugin-split-plan.md`
records the same asymmetry as pre-existing and outside that change's identity; it is still open.

## 7 · `@systemfsoftware/oxlint-config` — private preset

- `base` — `jsPlugins` resolves `oxlint-plugin` and `oxlint-plugin-effect-dmmf`; the 15 + 41 rules
  arrive by name or by spread, 2 more by name (`no-new-worker-with-wasm-import`,
  `no-io-boundary-tests`), plus the stock type-aware tier and two overrides (test files, fixtures).
- `strict` — extends `base` and adds `no-unnecessary-condition`, `strict-boolean-expressions`,
  `no-non-null-assertion`. **Judgement**, stated in the file: the other ~1750 findings the enabled
  categories produce were read and rejected as renames and reshapes of working code, on the ground
  that a rule which fires on correct code teaches a team to disable rules.

`packages/oxlint-plugin/oxlint.config.ts` is the one config in this subtree that registers no custom
plugin — the leaves are not linted by their own rules. Recorded as accepted debt in that file.

## 8 · Adjacent lint instruments the census surfaced

Not oxlint plugins; they produce no oxlint rules. They are listed because the boundary between them
and the plugins is a design decision, not an accident.

| Instrument                              | Form                                                | Gates                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `omp/plugins/omp-typescript-discipline` | OMP plugin: 2 markdown rules + 2 Deno check scripts | `tsconfigs` (project references for tooling files; no `@types/node` in the library `tsconfig.json`), `no-hand-rolled-std` (prefer Effect or `@std/*` over hand-rolled encoding, async, bytes, path, dates, uuid, crypto)                                                              |
| `agent-plugins/oxlint-guard`            | Claude Code plugin: pre/post-edit hooks             | Lints every edit against the nearest project oxlint config; vetoes an edit to any oxlint config that turns a rule **newly** `off`. It scans literal `key: off` syntax in JSON and in TS config rules maps, and fails closed when it cannot reconstruct an edit's before/after content |
| `scripts/guards/*`                      | Deno guard scripts                                  | Repo-level invariants that must fail a command                                                                                                                                                                                                                                        |

**Judgement.** The split is by _decidability_: the oxlint plugins are AST decisions over one file
plus options, while these instruments are filesystem and edit-payload decisions that no lint rule
can make. `OX-TS2` states the constraint on the plugin side — a rule's verdict depends only on the
linted file's own AST plus `options`/`settings`, never on disk facts — and `oxlint-guard` is what
happens when the property genuinely needs the disk.

---

## Rule families and their obligation rules

`OX-OB1`: a family that judges a shape keeps at least one rule that fails a file for **lacking**
something rather than for containing something. Across the 74 rule sources, the obligation rules are:

| Family           | Obligation rule                    | What must be present                        |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| entrypoint       | `entrypoint-interprets-once`       | exactly one interpretation edge             |
| workflow         | `workflow-file-make-presence`      | a `Workflow.make`                           |
| schema           | `schema-file-exports-schemas-only` | the file's export shape                     |
| structure        | `internal-export-jsdoc`            | an `@internal` tag                          |
| property-testing | `require-effect-fastcheck`         | the Effect fast-check integration           |
| property-testing | `no-silent-return`                 | a verdict on every path                     |
| cell-vocabulary  | — none                             | `CELL-V4` records the obligation as unowned |

## The 9 rules no preset recommends

The gap between 150 source-layer ids and the 63 a package reaches. Each entry is the leaf's own
stated reason, read from the leaf's README header.

| Rule (leaf)                                    | Recommended | Reason as stated by the leaf                                           |
| ---------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| `structure/ban-classes`                        | no          | Needs a per-package whitelist of the sanctioned Effect v4 class idioms |
| `structure/no-barrels`                         | no          | Fires on correct code                                                  |
| `structure/no-inline-destructured-type`        | no          | Fires on correct code                                                  |
| `structure/no-io-boundary-tests`               | yes         | Recommended, but only `base` and `effect-daemon-spec` enable it        |
| `effect-native/no-new-worker-with-wasm-import` | no          | Recommended by nobody; `base` enables it by name                       |
| `tag-discipline/no-bodyless-status-assertion`  | no          | Needs a status-assertion vocabulary only some packages have            |

Three of the nine — `ban-classes`, `no-barrels`, `no-inline-destructured-type` — are additionally
re-registered by the core aggregate, which is why the unrecommended set spans 12 ids across the
family and 9 distinct rule names. **Judgement.** The pattern is that every unrecommended rule is one
whose firing depends on a vocabulary or a whitelist the plugin cannot own, which is the same
constraint that pushed `cell-vocabulary` out of the `effect-dmmf` aggregate.

## Registry state

**Measurement**, 2026-09-12, npm search API for the scope.

`@systemfsoftware/oxlint-plugin` carries 21 published versions, first `0.1.0` on 2026-06-25, latest
`4.0.0` on 2026-09-11. Thirteen `@systemfsoftware/oxlint-plugin*` names exist.

Four published names have **no package in this workspace**: `oxlint-plugin-cell-imports` (`1.0.2`,
2026-08-09), `oxlint-plugin-cell-taxonomy` (`1.1.2`, 2026-08-05), `oxlint-plugin-effect-executor`
(`1.1.2`, 2026-08-05), `oxlint-plugin-effect-kernel` (`1.0.2`, 2026-08-13). **Measurement:** no file
under `packages/`, `omp/`, `scripts/`, `.github/`, or `agent-plugins/` references any of the four.
They shipped from the retired `packages/lint/oxlint/plugins/` and `packages/oxlint-plugins/`
layouts, which `.changeset/ledger.yaml` still names for their release history.

**Judgement.** This record does not recommend deprecating them and does not count them as current.
They are public names whose source is absent, which is a registry fact rather than a census finding.

## Gaps against this census

| Gap                                                                                                                                     | What would close it                                                          | Owner                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Per-rule **event counts** on this tree are not measured — this census reports that a rule exists, not where it fires                    | A no-error-count lint run over the tree                                      | whoever owns the lint gate                         |
| `all` and `base` register different plugin sets, and a package extending `base` gets neither cell-vocabulary nor entrypoint             | Register all four in `base`, or declare the asymmetry in `base`'s own header | `packages/oxlint-plugin/oxlint-config`             |
| No gate enumerates rules across all plugins; the `effect-dmmf` aggregate's own invariant (`ED1`) is `review`-gated by its own admission | A colocated aggregation suite for `effect-dmmf`                              | `packages/oxlint-plugin/oxlint-plugin-effect-dmmf` |
| The 9 unrecommended rules have no machine-readable reason                                                                               | A field beside each rule's static config                                     | the leaf owning each rule                          |
| `effect-daemon-spec` declares `cell-vocabulary` as a devDependency without registering it                                               | Either register it or drop the edge                                          | `packages/effect-daemon-spec`                      |
