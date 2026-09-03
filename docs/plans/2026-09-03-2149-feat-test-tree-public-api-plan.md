---
title: Test trees bind the public API - Plan
type: feat
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Test trees bind the public API

## Goal Capsule

- **Objective:** A consumer of any workspace package can trust that the behavior proven by files under the package's `tests/` or `__tests__/` tree is proven through the package's published surface, because lint refuses every relative import that reaches `src/` from those trees unless that one import carries a deliberate, reasoned per-line disable.
- **Means:** Strengthen the existing `tests-import-public-api` oxlint rule from test-basename gating to test-tree-location gating, then migrate the live violations (KTD1, KTD2).
- **Authority:** User objective > `CONSTITUTION.md` > repo rules. The rule's own fix text already states the expectation (packages/lint/oxlint/plugins/testing/test-placement/src/rules/tests-import-public-api.config.ts).
- **Stop conditions:** A migration site whose fix cannot hold the package's tests green after the ladder in KTD3 is exhausted is a blocker, not a silent disable.
- **Execution profile:** One rule unit first; then five independent package-scoped migration units; verification is orchestrator-run.

---

## Product Contract

### Summary

Every file under `<package-root>/tests/` or `<package-root>/__tests__/`, at any depth, binds the package's public API: a package name or subpath, or a sibling helper under the test tree. Relative imports that reach `src/` are lint errors. Existing violations are migrated so the workspace lints green.

### Problem Frame

The rule `tests-import-public-api` keys its applicability on a test-file basename (`path.config.ts` `TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/`). Nine files under the sanctioned test trees that do not carry a test basename — `__fixtures__` helpers, `*.tst.ts` type tests, `*.deny.ts` type fixtures — import `../src/...` unexcused today, across five packages; a tenth file (`adapters.integration.test.ts`, analysis package) reaches src under four per-line disables. Measured population: nine files, thirteen src-reaching imports, six packages. Each import is a route around the published surface: typecheck resolves the `@systemfsoftware/source` condition and never opens `dist`, so an export gap cannot surface at test time.

### Requirements

Grouped: enforcement (R1–R3), migration (R4), proof and doctrine (R5–R6).

- R1. Every file under a package-root `tests/` or `__tests__/` directory, recursively, regardless of basename, is in scope for the smuggling ban: relative specifiers containing a `src` segment, or climbing into an `internal` folder, are reported across static, type-only, named, namespace, default, re-export, side-effect, dynamic `import()`, and `import ... = require(...)` forms.
- R2. Files under any `src/` directory stay exempt — in-source `import.meta.vitest` blocks and colocated `src/**/__tests__/` suites keep importing their own module tree.
- R3. The ban reaches every workspace package through the existing delivery chain (`@systemfsoftware/oxlint-config/base` → `@systemfsoftware/oxlint-plugin-effect-dmmf` aggregate), with zero per-package config edits.
- R4. After migration, zero in-scope files import from `src` without either a public binding or a deliberate per-line `oxlint-disable-next-line` carrying the correct rule id (`@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api`) and a reason: each site lands on the site inventory's committed rung (Planning Contract), disabled sites are accepted routes counted by the U6 hygiene check, and no site is muted without a reason.
- R5. The rule's unit suite proves the new applicability: non-test basenames under test trees, package-root `__tests__`, `__fixtures__`, and the preserved `src/` exemption.
- R6. The plugin's README and AGENTS.md state the location-based scope for this rule.

### Success Criteria

- A synthetic smuggler placed under any package's `tests/` tree (non-test basename) fails `pnpm --filter <pkg> lint`; the same file passes under `src/`.
- `pnpm check:local` exits 0 on the migrated tree.
- The plugin package's vitest suite passes including the new applicability cases.

### Scope Boundaries

Out of scope: singular `test/` trees (e.g. `storybook/test/browser/`), `testResources/` directories, vendored `repos/`, in-src placement rules (`test-file-outside-tests-dir`, `SANCTIONED_TEST_DIRS` semantics), and any new guard script. Deferred to follow-up work: extending the location gate to singular `test/` if that tree is ever sanctioned.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Applicability becomes `!isUnderSrc(file) && (isTestFile(basename) || hasTestTreeAncestor(file))`, where `hasTestTreeAncestor` scans directory segments for `tests` or `__tests__` (new `TEST_TREE_DIRS` in `path.config.ts`, new `isInTestTree` in `path.ts`). The basename branch is preserved so stray `*.test.ts` files outside test trees keep their current coverage — dropping it would narrow enforcement, stopping reports the rule emits today. The segment scan is a deliberate over-approximation of "package-root tree": it cannot distinguish a nested sub-package's `tests/` from the root's. Measured workspace state: every `tests/`/`__tests__/` directory sits at a package root, so the scan is exact today; if a nested case appears, it lands in scope, which matches the ban's intent. Rejected: a walk-up-to-`package.json` resolver — filesystem access per file inside a lint visitor for a boundary that is exact in this workspace. Rejected: keeping the basename gate and hand-enumerating violations — it re-opens the hole with every new fixture suffix. Rejected: adding `__tests__` to `SANCTIONED_TEST_DIRS` — that set governs other placement rules and would reclassify root-level `__tests__` as sanctioned placement, an unrelated semantic change.
- KTD2. The change lands inside the existing rule in `packages/lint/oxlint/plugins/testing/test-placement/src/rules/tests-import-public-api.ts`; delivery rides the `effect-dmmf` aggregate that `base` spreads. Rejected: a `scripts/guards/` evaluator script — it duplicates lint infrastructure that already runs per package in every gate (`turbo lint`). Rejected: oxlint's built-in `no-restricted-imports` configured per package — it satisfies the shape only by repeating one spec in every package's config, violating R3's zero-config-edit delivery and drifting independently. Rejected: a warn-severity rollout before error — the objective is prohibition, not measurement; a warn phase leaves every smuggler allowed. Rejected: a vitest-level plugin — enforcement belongs at lint, which runs in every gate and does not couple to a test runner.
- KTD3. Migration ladder per site, applied in order: (1) binding is public → import the package name or subpath; (2) the helper exists only for tests → keep the helper under the test tree but bind public names inside it; (3) the subject is internal and the reach is dispensable → delete the reach or inline the value, naming any coverage lost; (4) the private binding is load-bearing → per-line disable with the correct rule id and a reason naming why the binding must stay private. Rung 4 is the expected outcome for test infrastructure that wires production internals (composition layers, harnesses, internal type fixtures); it is an accepted, counted route, not a failure state. Widening a package's public API or `exports` to satisfy a test is not on the ladder — that is an unpriced surface decision (REPO-W8).
- KTD4. `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts` keeps its four correct per-line disables and loses the dead file-level disable on line 1, which names a namespace (`@systemfsoftware/effect-dmmf/`) that no config registers.

### Site inventory and committed resolution

Verified against each package's `exports`/barrel before any unit starts. Rungs cite KTD3.

| Site                                                                       | Binding                                   | Public today                                                                     | Rung                                                                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `stryker-js/cli/tests/__fixtures__/node-platform.ts`                       | `nodePlatformLayer`, `workerEntriesLayer` | No — cli `exports` only `./package.json`                                         | 4 — production composition layer; cli ships a bin, not a module surface                                           |
| `stryker-js/instrumenter/tests/__fixtures__/instrument.ts`                 | `instrument`                              | Yes                                                                              | 1 — `@systemfsoftware/stryker-js-instrumenter`                                                                    |
| `stryker-js/instrumenter/tests/__fixtures__/print.ts`                      | `printProgram`                            | No — absent from barrel                                                          | 4 — internal printer, output-shape coverage; 3 if the consumer read shows the public `instrument` output suffices |
| `stryker-js/instrumenter/tests/__fixtures__/registry.ts`                   | `allMutators`                             | No — absent from barrel                                                          | Consumer read decides: 3 (delete unused helper) or 4 with reason                                                  |
| `stryker-js/vitest-runner/tests/__fixtures__/vitest-runner-harness.ts`     | `makeVitestRunnerLayer`                   | No — barrel exports `strykerPlugins`, `strykerValidationSchema` only             | 4 — harness wires the production kernel for integration tests                                                     |
| `stryker-plugins/tests/*/__fixtures__/AstNode.tst.ts` (×2)                 | estree↔schema type bindings               | No — neither barrel re-exports them                                              | 4 — the only ESTree equivalence coverage for the ignorer schemas                                                  |
| `specs/gherkin/effect/tests/__fixtures__/scenario-title.anti-damp.tst.ts`  | `ScenarioTitle`, `ScenarioTitleRejected`  | No — barrel exports `OutlineFn`, `ScenarioBody`, `ScenarioFn`, `ScenarioOptions` | 4 — title-brand types are internal                                                                                |
| `specs/gherkin/effect/tests/__fixtures__/scenario-title.deny.ts`           | `ScenarioFn`                              | Yes                                                                              | 1 — `@systemfsoftware/effect-gherkin-spec`                                                                        |
| `arethetypeswrong/analysis/tests/adapters.integration.test.ts` (4 imports) | adapters                                  | No — package-private by design                                                   | 4 already; U5 removes only the dead file-level disable                                                            |

The implementer may upgrade a site to rung 1–3 when the consumer read reveals a public path; a rung-4 landing requires the reason in its disable comment.

### Assumptions

Grounding note — destructive review, first cycle: lens **Inversion** applied against the enforcement-first design ("what breaks if every fixture must bind public names?").

1. _Assumption:_ tests outside `src` are consumer-altitude and should bind the published seam. Warrant: the user objective; wiki `test-placement` A9 is `posit` (the corpus's own placement doctrine), supported by the public-API canon that a package's implementation tree is sealed (`library-public-api-surface` A6, `canon`). Mechanism, verifiable in-repo: typecheck compiles through the `@systemfsoftware/source` condition and never opens `dist`, so a src-reaching test passes every gate while the exports map drifts — binding the package name makes the exports map the gate. The harm is therefore structural, not anecdotal; the residual risk of noise is bounded by the U6 disable-hygiene check and KTD3's rung-4 reason requirement. Kill recorded under the lens: none — this assumption survived as the premise, but its warrant is the directive plus this mechanism, not the corpus.
2. _Assumption:_ binding a package name from tests executes built `dist`, and `dist` exists when tests run. Warrant: `turbo.json` `test.dependsOn` is `["^build", "build"]`; `@systemfsoftware/arethetypeswrong`'s analysis tests already bind public package names and pass. Kill recorded: "every fixture can migrate with zero disables" — killed; a fixture whose reach is load-bearing at runtime in a copied sandbox falls to ladder rung 4.
3. _Assumption:_ ancestor-segment scanning decides "under a test tree" without resolving the package root. Warrant: the existing rules already classify by segment scans over `context.filename` (`isUnderSrc`, `isInSanctionedTestDir` in `path.ts`). Kill recorded: none.

---

## Implementation Units

### U1. Location-gate the rule and prove it in the unit suite

- **Goal:** The rule reports src-reaching imports from any file under a test tree, regardless of basename, and stays silent under `src`.
- **Requirements:** R1, R2, R3, R5, R6.
- **Dependencies:** none.
- **Files:** `packages/lint/oxlint/plugins/testing/test-placement/src/rules/path.config.ts`, `path.ts`, `tests-import-public-api.ts`, `src/rules/__tests__/tests-import-public-api.test.ts`, `README.md`, `AGENTS.md`.
- **Approach:**
  1. Add `TEST_TREE_DIRS` (documented as the package-root trees whose subtree binds the public API) and `isInTestTree` beside the existing helpers.
  2. Widen the applicability guard per KTD1.
  3. Extend the rule's unit suite; update README/AGENTS rule text.
- **Test scenarios:**
  - Plain-basename helper under `tests/__fixtures__/` with `export { x } from '../src/mod.js'` → reported.
  - `.tst.ts` file under `tests/` with `import type { X } from '../src/Thing.js'` → reported.
  - Plain file under a package-root `__tests__/` importing `../src/mod.js` → reported.
  - Dynamic `import('../src/mod.js')` from a fixture helper → reported.
  - Any of the above shapes under `src/rules/__tests__/` → not reported.
  - Non-test basename outside any test tree → not reported.
  - Existing report forms (static, type, re-export, side-effect, `TSImportEquals`) stay reported — regression set already in the suite.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test` and `build` pass; orchestrator runs a negative probe (temp smuggler under a package tests tree → lint red → removed).

### U2. Migrate stryker-js fixture smugglers

- **Goal:** The five fixture helpers in `stryker-js/cli`, `stryker-js/instrumenter`, and `stryker-js/vitest-runner` land on their committed rungs from the site inventory.
- **Requirements:** R4.
- **Dependencies:** U1 (verification reflects the strengthened rule).
- **Files:** `packages/testing/mutation/stryker-js/cli/tests/__fixtures__/node-platform.ts`, `packages/testing/mutation/stryker-js/instrumenter/tests/__fixtures__/instrument.ts`, `print.ts`, `registry.ts`, `packages/testing/mutation/stryker-js/vitest-runner/tests/__fixtures__/vitest-runner-harness.ts`; consumers of these helpers when imports change shape.
- **Approach:** Read each consumer first. Land each site on its inventory rung; only `instrument` is verified public today (rung 1). A rung-4 landing writes the disable with the reason from the inventory; a rung-3 landing names the coverage it deletes.
- **Test scenarios:** each affected package's suite passes unchanged after the rewrite; any test that only passed because it exercised src-not-dist either passes against dist or is repaired per KTD3.
- **Verification:** per-package `lint` and `test` green (orchestrator-run).

### U3. Migrate stryker-plugins type-test fixtures

- **Goal:** The two `.tst.ts` fixtures under `stryker-plugins/tests/*/__fixtures__/` bind public names.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/mutation/plugins/stryker-plugins/tests/effect-schema-ignorer/__fixtures__/AstNode.tst.ts`, `tests/workflow-make-ignorer/__fixtures__/AstNode.tst.ts`.
- **Approach:** The `AstNode.schema` bindings are verified absent from both barrels. Land rung 4 per the inventory (per-line disable with the ESTree-equivalence-coverage reason); rung 1 is available only if the implementer's consumer read finds a public path, and rung 3 requires naming the lost equivalence coverage in the unit report.
- **Test scenarios:** the package's type-test/`test` scripts pass.
- **Verification:** per-package `lint` and `test` green (orchestrator-run).

### U4. Migrate gherkin-spec fixture smugglers

- **Goal:** The two type fixtures under `effect-gherkin-spec`'s `tests/__fixtures__/` bind public names.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/specs/gherkin/effect/tests/__fixtures__/scenario-title.anti-damp.tst.ts`, `scenario-title.deny.ts`.
- **Approach:** `ScenarioFn` is public (rung 1, `@systemfsoftware/effect-gherkin-spec`); `ScenarioTitle`/`ScenarioTitleRejected` are verified absent from the barrel — rung 4 per the inventory, with the title-brand reason.
- **Test scenarios:** the package's suite and type-test scripts pass.
- **Verification:** per-package `lint` and `test` green (orchestrator-run).

### U5. Fix dead suppression in the analysis package

- **Goal:** Suppression in `adapters.integration.test.ts` is intentional and minimal.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts`.
- **Approach:** Grep the file for every import specifier and confirm only the four named imports reach src; then delete the line-1 file-level disable (unregistered namespace per KTD4) and keep the four correct per-line disables with their reasons.
- **Test scenarios:** package `lint` exits 0; the four src imports remain suppressed only by their own per-line comments.
- **Verification:** per-package `lint` green (orchestrator-run).

### U6. Workspace integration proof and changeset

- **Goal:** The whole workspace is green under the strengthened rule, and consumers are notified.
- **Requirements:** R3, R4; repo rule REPO-R2.
- **Dependencies:** U1–U5.
- **Files:** `.changeset/` intents for `@systemfsoftware/oxlint-plugin-test-placement` and `@systemfsoftware/oxlint-plugin-effect-dmmf` (minor each: new lint errors are consumer-observable, and the aggregate's build hash moves with its dependency); the U6 hygiene script lives inline in this unit's verification, not in `scripts/`.
- **Approach:**
  1. Disable hygiene check: scan the workspace for disable comments naming this rule under any test tree; each must carry the correct rule id and a non-empty reason. Fail U6 on any violation.
  2. Record the changeset bodies as consumer-observable facts (rule now covers every file under `tests/` and `__tests__/` trees, not only `*.test.ts`/`*.spec.ts` basenames).
  3. Run the full local gate.
- **Test scenarios:** the hygiene check passes with every landed rung-4 disable accounted for; `check-changeset` accepts the changeset set.
- **Verification:** `pnpm check:local` exits 0.

---

## Verification Contract

| Gate              | Command                                                                                                                         | Proves                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Rule unit suite   | `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test`                                                              | R5, R1 applicability                         |
| Rule build        | `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement build`                                                             | consumers receive the strengthened rule (R3) |
| Negative probe    | temp smuggler under a `tests/` tree → `pnpm --filter <pkg> lint` nonzero, then removed                                          | R1 end to end                                |
| Resolution proof  | every rung-1 rewritten binding resolves through the package entry (`typecheck`/`test:types` green against the rewritten import) | migration correctness, not just rule wiring  |
| Disable hygiene   | U6 scan: correct rule id + non-empty reason on every disable naming this rule                                                   | R4's accepted-route accounting               |
| Per-package gates | `pnpm --filter <pkg> lint && pnpm --filter <pkg> test` for the six affected packages                                            | R4                                           |
| Workspace gate    | `pnpm check:local`                                                                                                              | R3, R4, tree green                           |

---

## Definition of Done

- R1–R6 hold on the current tree; each verified by the gate named in the Verification Contract.
- No unexcused src-smuggling site remains under any `tests/` or `__tests__/` tree; every landed disable carries the correct rule id and a reason, counted by the U6 hygiene check.
- Changesets shipped for `@systemfsoftware/oxlint-plugin-test-placement` and `@systemfsoftware/oxlint-plugin-effect-dmmf`; `pnpm check:local` exits 0 after the last edit; work lands as a pull request watched to green (REPO-D1).
- Cleanup: no probe files, no dead disables, no unused constants left behind.
