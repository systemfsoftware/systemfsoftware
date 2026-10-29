---
title: E2E lane and placement rule (strangler slice 1) - Plan
type: refactor
date: 2026-10-28
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# E2E lane and placement rule (strangler slice 1) - Plan

## Goal Capsule

- **Objective:** The test-discipline lint plugin knows an end-to-end tier. A test written in the `effect-e2e` runner's `test` is in an e2e lane, chosen from what it imports. A deny-severity rule fails it in any package that has not declared the e2e role, and fails an integration test in a package that has. A suite as `effect-e2e init` writes it, in a package that declares the role, lints clean under the published preset.
- **Means:** One new rule, `e2e-tier-placement`; an `e2e` lane and an `e2e` package role in the plugin's lane model; the two naming and placement rules taught the tier; one edit to the scaffold's example titles so the scaffold meets the preset it ships into (KTD6).
- **Authority:** `CONSTITUTION.md` (CONST-T12: decide from what a file is and does, never from its name or location; CONST-T3 and CONST-T10 for the rule tests; CONST-S4: subtract before you add); the plugin's own lane model and rule tests as the pattern; the settled decisions annotated below.
- **Execution profile:** One PR carrying this plan and its code, executed with `ce-work`. The plugin is an evaluator surface, so the rule change lands in a commit of its own, observed failing before and passing after (U1 to U3); the scaffold edit is a separate commit (U4). Public repository: no committed text names a private repository, package or path, and none cites a ticket or pull-request number.
- **Stop conditions:** Stop and report when the scaffold smoke in U4 cannot be run as specified, or finds a preset finding whose fix would change what a template file demonstrates or loosen the preset (Risks); or when the census in U1 stops being empty because main moved.

---

## Product Contract

### Summary

The plugin names five lanes a test can be in, chosen from its imports (behaviour, conformance, differential, trace, property), and a runner lane for the Vitest runner packages. It has no lane for a test run by `@systemfsoftware/effect-e2e`. Three consequences follow. The scaffold `effect-e2e init` writes (`tests/example.e2e.ts`) is not a test file to the plugin, so `tests-dir-helpers-in-fixtures` reports it as a stray helper. A real end-to-end test can only be written as an integration file. And nothing says which packages may hold an e2e suite. This slice gives the tier a lane, a package role and a placement rule, so that later slices have a defined destination when they ban process-spawning from integration tests and move today's offenders.

### Problem Frame

The tier boundary exists as maintainer rulings and review judgment; no command decides it. The strangler order is: the destination (this slice), the move of the offenders into it, and the ban on the integration side together with the repair of its whole current population. This slice lands only what its population allows at deny today. Census at planning time: no package declares the e2e role; no `.e2e.ts` file sits under a `tests/` directory outside the runner's own `tests/__fixtures__/`; no test file imports `test` from the runner entry in an import declaration. The new rule starts with an empty population, so it needs no warn level, no baseline and no allowlist.

### Requirements

Lane and admission:

- R1. A test file is in the **e2e lane** when it value-imports `test` (an alias counts) or a namespace from `@systemfsoftware/effect-e2e/runner`. The verdict comes from content, whatever the file's name or location. `test` is the one API that registers an e2e test; importing `expect`, `describe`, a hook, the composition API (`makeRunner`, `makeGlobalSetup`, the `RUN_*` keys) or only types selects no lane.
- R2. A file named `<subject>.e2e.ts` under a `tests/` directory, with no `__fixtures__` directory directly under any `tests` directory above it, is a test file for the lane model. This is the shape `effect-e2e init` scaffolds and the runner's default collection (`tests/**/*.e2e.ts`, excluding `tests/__fixtures__/**`) runs. An e2e-lane file is named that way; a `.test.ts` file in the e2e lane is a naming error, whatever other harness it imports.

Role and placement:

- R3. A package declares the **e2e role** in its own lint config's `settings`, in the key `vitest-runner` already uses. Every rule reads that one setting. No rule accepts a role option.
- R4. The rule `e2e-tier-placement` is registered at `error` in the plugin's recommended set, so the published preset carries it. It reports (a) an e2e-lane file in a package without the e2e role, and (b) an integration (behaviour-lane) test that is not also in the e2e lane, in a package with the e2e role. There is no warn severity, no allowlist and no baseline.
- R5. `test-suffix-outside-src` names the e2e lane (`.e2e.ts`, ahead of every other lane) and `tests-dir-helpers-in-fixtures` stops reporting an admitted e2e file as a helper.

Proof:

- R6. Every rule change ships with tests written the way the plugin tests its rules: `RuleTester` through `src/rules/__tests__/_tester.ts`, written before the code and observed failing on main. The placement rule's arms decide from imports and the role, so they run through the `everywhere()` place matrix to prove they ignore name and location. Admission and naming decide from the path, so they use explicit filenames. A planted violation is each rule's known-bad case.
- R7. A suite as `effect-e2e init` writes it, in a package declaring the e2e role, is reported by no rule of the published preset. Evidence: scaffold-shaped valid cases in the plugin's tests, and a live run of the real scaffold through the preset, recorded in the body of the scaffold commit. `init` writes no lint configuration, so an adopter who extends the preset learns of the role from the plugin README, the `effect-e2e-cli` README and the changeset bodies.

### Scope Boundaries

Deferred to follow-up slices (named here, not planned in detail):

- **Slice 2:** the integration-side ban. A behaviour-lane file fails when it, or a helper or fixture it imports, calls a process entry from the plugin's `IO_SPECIFIERS` (`child_process`, `ChildProcessSpawner`, `CommandExecutor`, `Bun.spawn`, `Deno.Command`) or makes a fixture executable. Testcontainers through `DOCKER_HOST` and microVM services from `effect-microsandbox` stay legal. A downstream consumer's integration test that spawns a process is the case it must report. This repository's own offenders must be repaired in or before that slice, since no warn level, baseline or allowlist is allowed: the plugin's `no-inline-suppression` test, the recommended preset's diagnostics fixture, and the process-spawning features of `effect-e2e-conformance`. Those features cannot move into an e2e package until they are authored in the runner's `test` (Risks), so the move precedes or accompanies the ban.
- **Later slices:** moving `effect-e2e-conformance`'s command-line and runner features into the first package that declares the e2e role, and the CI job that runs it (workflow files are an evaluator surface and ship separately); the loopback page servers of the engine law suite; microVM-backed tiers.

Outside this slice's identity (considered, not built):

- Warn severities, dated baselines and allowlists. They are dominated in this repository (`docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`).
- Any edit under `.github/`, `flake.nix` or `reusable-checks.yml`.
- Moving or deleting an `effect-e2e-conformance` suite.
- Source or API changes in `@systemfsoftware/effect-e2e`, and any change to the recommended preset's own source (it already spreads the plugin's recommended rules).
- Selecting the lane from `package.json`. No rule reads the disk and `RuleTester` lints virtual files.

### Open Questions

Deferred, non-blocking:

- The brief for this slice words the lane as "selected by importing `@systemfsoftware/effect-e2e`". KTD2 narrows that to the runner's `test`, on the census below. If the wider reading is wanted, 31 existing test files (27 in `packages/runner/effect-e2e/tests/`, 1 in `packages/runner/effect-e2e-web/tests/`, 3 in `packages/runner/effect-e2e-conformance/tests/`) become e2e-lane files in packages that cannot hold the role, and the slice cannot land without moving them.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Plugin-first, one rule, whole.** The slice adds one rule and teaches two existing ones. The lane and the role land with the rule that needs them, in the same commit, with the rule's population empty at deny (session-settled: user-directed — chosen over warn or a baseline: a warn rule fails no command here and a baseline only enumerates debt).
- KTD2. **The lane keys on the runner's `test`, not on any import of the package.** `@systemfsoftware/effect-e2e` and its subpaths are imported by 31 test files that are integration tests of the runner itself (27, 1 and 3 across the three packages above). The two that import the runner entry take `makeRunner`, `makeGlobalSetup`, the `RUN_*` keys and types. A file is an e2e test because it registers its tests with the runner's `test`, which `src/runner/mod.ts` exports and every scaffolded test imports. Selecting on the package would call those 31 files e2e suites. Selecting on `expect` or a hook would let an integration file leave the behaviour lane, and arm (b) of the rule, by importing one name. The lane is derived per import declaration in `derive` in `lane.ts`, because `HARNESS_LANES` selects by package or subpath alone; a namespace import of the runner entry selects it too, since members cannot be told apart cheaply. Type-only imports select nothing, as for every lane. A suite that reaches `test` through a re-export module selects no lane by import; its `.e2e.ts` files then fail `test-suffix-outside-src` as lane-less (U2).
- KTD3. **Admission mirrors what the runner collects.** `isE2eTestFile(filename)` holds for a basename ending `.e2e.ts` with a `tests` directory in the path and no `__fixtures__` segment directly following a `tests` segment. The runner includes `tests/**/*.e2e.ts` and excludes `tests/__fixtures__/**` (`packages/runner/effect-e2e/src/runner/test-files.ts`); adjacency is that exclusion, so `tests/nested/__fixtures__/x.e2e.ts` is collected by the runner and admitted by the plugin. Only `.ts` is admitted because the default pattern is `.ts`. The constants live in `path.config.ts` beside `SANCTIONED_TEST_DIRS`. The plugin cannot import `e2eTestFiles` from the runner: it is published to adopters and a lint plugin must not depend on a runner for two globs. The copy is pinned by the scaffold-shaped cases (U2) and by the live smoke (U4). `isTestFile` is unchanged; `lanesOf`, `test-suffix-outside-src` and `tests-dir-helpers-in-fixtures` call `isE2eTestFile` beside it. The nine `.e2e.ts` files under `effect-e2e-conformance/tests/__fixtures__/runner-suite/tests/` sit under that package's `tests/__fixtures__/`, which is the exclusion, so they are fixtures to the plugin as to the runner.
- KTD4. **The role is a second value of the existing setting.** `PluginSettings` in `lane.ts` decodes `role` as `'vitest-runner'` today; it widens to `'vitest-runner' | 'e2e'`, and `isE2ePackage(context)` reads it beside `isRunnerPackage`. A package has one role, so `effect-e2e`, which declares `vitest-runner`, can never be an e2e package. The rule declares `schema: []`, as the others do, and `runner-role.test.ts` gains the rule in its refuse-a-rule-option table. The role is a trust point: a package that declares it without being an e2e package is treated as one, which is why arm (b) refuses integration tests there, and the README says reviewers check every role change in a config diff.
- KTD5. **The placement rule has two arms and one name.** `e2e-tier-placement` answers "where may e2e tests live?": in e2e packages, and an e2e package holds no integration test. Arm (b) fires on the behaviour lane without the e2e lane; conformance, differential, trace and property tests are not integration tests and stay legal there. Both arms decide from content and the declared role, never from the file's name or location. Messages follow the house `{{name}} ... Expected ... Actual ... Fix` shape in a `.config.ts` beside the rule, with two message ids.
- KTD6. **The scaffold is edited once, to meet the preset it ships into.** `damp-test-naming` runs on every file but `.tst` and requires `Should_<Pascal>_When_<Pascal>` titles. The scaffold's examples are titled `'the home page shows a heading'` and `'a visitor reaches the top of the home page'`, so a suite as `init` writes it fails the preset today at `missingShouldPrefix`, independent of any lane. Exempting the e2e lane from the naming rule would loosen a constraint that grades the work; the scaffold's titles move instead, to `Should_ShowAHeading_When_TheHomePageOpens` and `Should_ReachTheTopOfThePage_When_TheAgentScrolls`. Five sites pin the titles and move together in one commit: `packages/runner/effect-e2e-cli/src/templates/example.template.ts`, `example-agent.template.ts`, the example in `packages/runner/effect-e2e/README.md`, and the `DETERMINISTIC` and `AGENT` constants of `cli-init.integration.test.ts` and `cli-run-web.integration.test.ts` in `effect-e2e-conformance`. This is the slice's only edit outside the plugin, and the scaffold-lints-clean criterion requires it (session-settled: user-directed — "an `effect-e2e init` scaffold lints clean" is a done condition).
- KTD7. **Commit order follows the evaluator rule.** The plugin commit (U1 to U3) holds the rule, its tests written first and observed red on main, the registration and docs. The scaffold commit (U4) follows. The smoke of the real scaffold is recorded before the plugin commit (red: the helper rule on both examples, the naming rule on both titles) and again after each commit.
- KTD8. **The pack rewrite is context only.** The `e2e-testing` and `integration-testing` compound packs are under change and not on main. This slice cites no pack rule as authority; its rule stands on the plugin's lane model.

### High-Level Technical Design

> Directional guidance for review, not implementation specification.

The verdict for one file is a function of three inputs: whether the plugin counts it as a test, which lanes its imports select, and the package's declared role.

| File and imports                                                         | Role  | Verdict                                                                                      |
| ------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------- |
| `tests/x.e2e.ts`, imports `test`, `expect` from the runner               | `e2e` | passes every plugin rule                                                                     |
| same file                                                                | none  | `e2e-tier-placement`: e2e-lane file outside an e2e package                                   |
| `tests/x.test.ts`, imports `test` from the runner                        | none  | `e2e-tier-placement`, and `test-suffix-outside-src`: expected name `.e2e.ts`                 |
| `tests/x.integration.test.ts`, Gherkin harness only                      | `e2e` | `e2e-tier-placement`: integration test in an e2e package                                     |
| `tests/x.integration.test.ts`, Gherkin plus `expect` from the runner     | `e2e` | `e2e-tier-placement`: still an integration test; `expect` selects no lane                    |
| `tests/x.integration.test.ts`, Gherkin plus `makeRunner` from the runner | none  | no e2e finding: the composition API selects no lane (how the runner's own tests are written) |
| `tests/__fixtures__/x.e2e.ts`, imports `test` from the runner            | none  | silent: the runner does not collect it, so the plugin sees no test                           |
| `tests/nested/__fixtures__/x.e2e.ts`, imports `test` from the runner     | none  | `e2e-tier-placement`: the runner collects it                                                 |
| `tests/x.e2e.ts`, imports nothing from a harness                         | any   | `test-suffix-outside-src`: no lane                                                           |
| `tests/helper.ts`                                                        | any   | `tests-dir-helpers-in-fixtures`, unchanged                                                   |

### Assumptions

- A1. The issue defining this slice was read from the maintainers' summary of it, not from the tracker. Its objective (a) is this plan; its objective (b) and the integration-side ban are slice 2.
- A2. The recommended preset spreads the plugin's recommended rules (`rules` in `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`) to every package that extends it, so registering the rule in the plugin's `recommendedRules` is the whole wiring. The rule's population is empty today.
- A3. e2e suites are proven in CI, not on workstations. Locally this slice runs typecheck, lint and the plugin's tests. The two conformance features whose constants change in U4 run in CI.

---

## Implementation Units

### U1. The e2e lane, the role and the placement rule

- **Goal:** `e2e-tier-placement` reports both arms from content and role, the lane model compiles, and the rule's tests fail on main first.
- **Requirements:** R1, R2, R3, R4, R6.
- **Dependencies:** none.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/path.config.ts` (`E2E_TEST_BASENAME`, a `__fixtures__` constant, the runner entry specifier), `src/rules/path.ts` (`isE2eTestFile`), `src/rules/lane.ts` (`e2e` in the `Lane` union, the per-import derivation, the widened role, `isE2ePackage`), `src/rules/test-suffix-outside-src.config.ts` (`NamedLane` excludes `e2e`, so `LANE_WORDS` and `suffixOf` keep compiling; the naming change is U2), `src/rules/e2e-tier-placement.ts` and `.config.ts` (new), `src/rules/__tests__/e2e-tier-placement.test.ts` (new), `src/rules/__tests__/runner-role.test.ts` (the new rule joins the refused-option table).
- **Approach:**
  1. Write the tests first and observe them fail on main: the rule does not exist, so every case fails at import. Then add the lane and the rule.
  2. `lanesOf` returns lanes when `isTestFile(basename) || isE2eTestFile(filename)`. In `derive`, an import declaration of exactly `@systemfsoftware/effect-e2e/runner` adds `e2e` when a non-type specifier imports `test` (aliases included) or is a namespace specifier.
  3. The rule reads `lanesOf(context)` once and `isE2ePackage(context)`, reports on the `Program` node, and applies no filename test of its own.
- **Execution note:** test-first. Settings that fail to decode declare no role, as `isRunnerPackage` does.
- **Patterns to follow:** `src/rules/no-io-module-in-source-test.ts` and `src/rules/test-suffix-outside-src.ts` for `defineRule`, `meta` and message shape; `src/rules/__tests__/test-suffix-outside-src.test.ts` for settings-bearing cases.
- **Test scenarios:**
  - Through `everywhere()`, no role: a file importing `expect` and `test` from the runner is reported as outside an e2e package at every place. With `settings` declaring `e2e` it passes at every place.
  - Through `everywhere()`: `test as it` is reported; `import * as E2E` from the runner is reported; a file importing only `makeRunner`, `makeGlobalSetup` and `RUN_OUTPUT_KEY` passes; a file importing only `expect`, `describe` or a hook passes; a type-only import passes; `test` imported from `vitest` passes.
  - Through `everywhere()`, role `e2e`: a file importing only the Gherkin harness is reported as an integration test in an e2e package; the same file plus `expect` from the runner is still reported (the known-bad case for the one-name opt-out); the same file plus `test` from the runner passes; the Gherkin-only file with no role passes.
  - Explicit filenames: `/repo/pkg/tests/x.e2e.ts` with a `test` import is reported without the role and passes with it; `/repo/pkg/tests/__fixtures__/x.e2e.ts` passes without the role; `/repo/pkg/tests/__fixtures__/suite/tests/x.e2e.ts` passes without the role (the conformance template's shape); `/repo/pkg/tests/nested/__fixtures__/x.e2e.ts` is reported without the role; `/repo/pkg/src/x.e2e.ts` and `/repo/pkg/helpers/x.e2e.ts` pass (not tests); `/repo/pkg/tests/x.e2e.ts` with no runner import passes this rule.
  - Role `vitest-runner` is not role `e2e`: an e2e-lane file in a runner package is reported. Undecodable settings report.
  - Planted violation: the first no-role case is the known-bad fixture.
  - `runner-role.test.ts`: declaring `role` as a rule option on `e2e-tier-placement` is refused as a configuration error.
- **Verification:** the plugin's tests and typecheck pass; the new file's cases were observed red on main first.

### U2. The naming and helper rules learn the tier

- **Goal:** An admitted e2e file is named for its lane and is not a stray helper; the scaffold's example shape is accepted by every plugin rule.
- **Requirements:** R2, R5, R6, R7.
- **Dependencies:** U1.
- **Files:** `src/rules/test-suffix-outside-src.ts` and `.config.ts` (entry gate, the e2e lane, its `.e2e.ts` name, precedence, the fix and no-lane texts, `meta.docs.description`), `src/rules/tests-dir-helpers-in-fixtures.ts` and `.config.ts` (admit via `isE2eTestFile`; description), `src/rules/__tests__/test-suffix-outside-src.test.ts`, `src/rules/__tests__/tests-dir-helpers-in-fixtures.test.ts`, and a new `src/rules/__tests__/e2e-scaffold-shape.test.ts` that runs the scaffold-shaped sources through every rule of the plugin's default export.
- **Approach:**
  1. The entry gate of `test-suffix-outside-src` widens from `isTestFile(basename)` to `isTestFile(basename) || isE2eTestFile(filename)`, so an admitted `.e2e.ts` file reaches the lane check.
  2. `nameableLanes` returns only the e2e lane when the file is in it, ahead of conformance, differential, trace and behaviour: the runner collects `.e2e.ts` and nothing else, so no other name can serve an e2e-lane file. The e2e name is a bare `.e2e.ts` suffix, not a `.<word>.test.ts` word, so it has its own suffix check and is not a `LANE_WORDS` entry; `x.e2e.test.ts` is not that name.
  3. `tests-dir-helpers-in-fixtures` returns for `isTestFile(basename) || isE2eTestFile(filename)`.
  4. The scaffold-shape test lints the two example files under `tests/` with the titles of KTD6, the role declared, through each rule with default options. The sources are literals copied from the scaffold; they are the independent oracle for what a consumer receives.
- **Test scenarios:**
  - `test-suffix-outside-src` valid: `tests/x.e2e.ts` with a `test` import; the same file also importing the Gherkin harness; the same file also importing a conformance, differential or trace harness; `tests/x.integration.test.ts` importing Gherkin and `makeRunner` (unchanged).
  - `test-suffix-outside-src` invalid, expected name `.e2e.ts`: `tests/x.test.ts` with a `test` import; `tests/x.e2e.test.ts` with a `test` import; `tests/x.integration.test.ts` with Gherkin and a `test` import; `tests/x.trace.test.ts` with trace and a `test` import. Reported as no lane: `tests/x.e2e.ts` with no harness import, and `tests/x.e2e.ts` whose only runner access is a local re-export module.
  - `tests-dir-helpers-in-fixtures` valid: `tests/x.e2e.ts`, `tests/nested/x.e2e.ts`, `tests/__fixtures__/x.e2e.ts`. Invalid: `tests/helper.ts` and `tests/x.e2e.mts` (only `.ts` is the runner's default).
  - Scaffold shape: both example files report nothing under every plugin rule; a copy with a neutral non-DAMP title (`'the page greets a visitor'`) reports `missingShouldPrefix`, the case that forces U4.
- **Verification:** as U1; the scaffold-shape cases were observed red on main (the helper rule and the naming rule).

### U3. Register, document, record

- **Goal:** The rule is in the plugin's recommended set, documented, and its package change is declared.
- **Requirements:** R3, R4, R7.
- **Dependencies:** U1, U2.
- **Files:** `src/index.ts` (import, `recommendedRules` at `error`, `rules`), `README.md` (the rule's row; an E2E row in the Test Lanes table; the `test-suffix-outside-src` and `tests-dir-helpers-in-fixtures` rows; the role paragraph names `e2e` beside `vitest-runner`; the trust-point note covers both), `etc/oxlint-plugin-test-discipline.api.md` (regenerated by the repository's API report step, never hand-edited), a `.changeset/` intent for the plugin (minor: a new rule at error and a widened role value), and for any other publishable package whose build hash the change moves, decided by `pnpm change` (REPO-R2). The body states what a consumer observes: the new lane and role, the new rule at error in the recommended preset, and that a suite using the runner's `test` must sit in a package that declares the role.
- **Test expectation:** none beyond U1 and U2. This is registration and documentation.
- **Verification:** `pnpm check:local` passes after the last edit of the plugin commit; the API report diff names only the new rule.

### U4. The scaffold meets the preset

- **Goal:** A suite as `effect-e2e init` writes it, with the e2e role declared, is reported by no rule of the published preset.
- **Requirements:** R7.
- **Dependencies:** U3.
- **Files:** `packages/runner/effect-e2e-cli/src/templates/example.template.ts` and `example-agent.template.ts` (titles), `packages/runner/effect-e2e-cli/README.md` (one sentence: a suite linted with the recommended preset declares the e2e role in its lint settings), `packages/runner/effect-e2e/README.md` (the example's title), `packages/runner/effect-e2e-conformance/tests/cli-init.integration.test.ts` and `cli-run-web.integration.test.ts` (the `DETERMINISTIC` and `AGENT` constants), `.changeset/` intents for `effect-e2e-cli` (patch: new scaffolds carry new titles) and `effect-e2e` (patch: README).
- **Approach:**
  1. Titles are those of KTD6; the five sites must agree.
  2. Smoke, recorded in the scaffold commit's body and not committed as a file: write a scaffold with the `effect-e2e` bin that `effect-e2e-conformance` already links, into `packages/runner/effect-e2e-conformance/__tmp__/` (ignored by the repository's `.gitignore`), with `--no-install`; give it an `oxlint.config.ts` that extends the recommended preset (resolved from that package's installed dependencies) and declares the role; run `oxlint` over it; record the findings before and after each commit; delete the directory before landing. The preset enables type-aware rules, which need a tsconfig and installed dependencies the scratch directory lacks. If the type-aware pass cannot run, report that it did not and run the rest; do not count it as clean.
  3. A finding from the plugin is fixed in the plugin commit. A finding from a template file is fixed in the template when the fix keeps what the file demonstrates. Any other outcome is a stop condition.
- **Test scenarios:** the two conformance features keep their scenarios; only the title constants change. They run in CI (A3).
- **Verification:** the smoke reports no finding after the scaffold commit; the old titles no longer appear at the five sites (the `git grep` in the Verification Contract); `pnpm check:local` passes.

---

## Verification Contract

| Command                                                                                                                                                                                                  | What it proves                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline test`                                                                                                                                      | The new rule, both arms, the lane through `everywhere()`, the naming and helper changes, the scaffold shape. |
| `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline typecheck`                                                                                                                                 | The widened `Lane` and role types reach every consumer.                                                      |
| `pnpm check:local`                                                                                                                                                                                       | The repository gate after the last edit, including the API report and the preset's own lint.                 |
| the scaffold smoke of U4                                                                                                                                                                                 | A real `effect-e2e init` suite is clean under the preset; red before, green after.                           |
| `git grep -nI -e 'the home page shows a heading' -e 'a visitor reaches the top' -- packages/runner/effect-e2e-cli/src packages/runner/effect-e2e/README.md packages/runner/effect-e2e-conformance/tests` | After U4, none of the five pinned sites keeps an old title. Exit 1 expected.                                 |

---

## Definition of Done

Global:

- R1 through R7 hold; `pnpm check:local` exits 0 after the last edit.
- The plugin commit and the scaffold commit are separate; the rule's tests were observed failing on main before the rule existed.
- The rule is at `error` with no warn level, no allowlist, no baseline; its population is empty on the branch.
- No scratch directory, smoke output or dead fixture is in the diff. Commit messages satisfy REPO-C1 and REPO-C2.

Per unit:

- U1: both arms of the rule are covered, including the one-name opt-out and the nested-fixtures case; the option-refusal case passes.
- U2: the scaffold-shape cases pass under every plugin rule; the naming and helper rules report the boundary cases above.
- U3: the rule is registered, documented and declared in a changeset intent.
- U4: the smoke is clean or reported as unable to run; the five title sites agree.

---

## Risks and Dependencies

- **Evaluator-surface approval.** The plugin is an evaluator surface and this slice adds a gate. Merging needs the owner's approval, recorded on the PR. The scaffold edit is outside the plugin and says so in its commit.
- **Arm (b) shapes the move slice.** `makeFeature` takes the Effect Vitest bindings and the runner's `test` is an `E2ETest` (`packages/runner/effect-e2e/src/runner/test-api.ts`), so a Gherkin feature cannot take the runner's `test` as its `it`. The command-line and runner features a later slice moves out of `effect-e2e-conformance` are Gherkin-only integration features today; in an e2e package they must be rewritten in the runner's `test`, or stay out. That is what "never beside integration tests" means, and it is the first thing the move slice must show before it lands.
- **The scaffold may fail the preset for reasons beyond titles.** The preset applies oxlint's own `vitest/expect-expect` to everything under `tests/`, and the agent example asserts through `agent.assert`, not `expect`; whether that fires on a `test` imported from the runner is unverified. The root template files fall under the preset's base rules (`categories.correctness`, the dmmf and cell-architecture configs). The smoke decides. A finding that would need the preset loosened, an inline suppression, or a changed example is a stop-and-report, never a workaround.
- **The admission constants copy the runner's collection globs.** A suite that sets its own `tests` globs falls outside admission, and a change to the runner's default drifts the copy until the scaffold-shape cases or the smoke notice. Accepted: KTD3.
- **The lane is per import declaration.** A re-export module or a dynamic import of the runner hides `test` from the lane; the `.e2e.ts` files of such a suite fail `test-suffix-outside-src` as lane-less instead. A namespace import selects the lane even when only the composition API is used; no such file exists, and the runner's own tests use named imports.
- **The role is a trust point.** A package can declare it without being an e2e package. Arm (b) limits what such a package may hold; review checks the declaration.
- **The new rule reaches every package that extends the preset at once.** The census is empty today; re-run it at the start of `ce-work` in case main moved.
- **Pack rewrite unmerged.** No citation here depends on it (KTD8).

## Sources and Research

- Plugin anchors: `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/lane.ts` (`HARNESS_LANES`, `derive`, `lanesOf`, `SETTINGS_KEY`), `path.ts`, `path.config.ts` (`TEST_BASENAME`, `SANCTIONED_TEST_DIRS`), `test-suffix-outside-src.ts` and `.config.ts` (`LANE_WORDS`, `NamedLane`, `nameableLanes`), `tests-dir-helpers-in-fixtures.ts`, `damp-test-naming.ts` and `.config.ts` (applies to every file but `.tst`; `PASCAL_CASE`), `src/index.ts` (`recommendedRules`), `src/rules/__tests__/_tester.ts` (`createRuleTester`, `everywhere`), `runner-role.test.ts`, `README.md` (role paragraph, Test Lanes table).
- Scaffold and runner anchors: `packages/runner/effect-e2e-cli/src/templates/suite.ts` (the six files `init` writes, `tests/example.e2e.ts` among them) and the example templates; `packages/runner/effect-e2e/src/runner/mod.ts` (the authoring exports), `src/runner/test-files.ts` (`e2eTestFiles`: include `tests/**/*.e2e.ts`, exclude `tests/__fixtures__/**` and `.e2e/**`) and `src/runner/test-api.ts` (`E2ETest`); `packages/runner/effect-e2e/README.md` and `packages/runner/effect-e2e-cli/README.md`; `packages/gherkin/effect-gherkin-spec/src/Feature.ts` (`makeFeature`).
- Census inputs (planning time): `.e2e.ts` files, all nine under `packages/runner/effect-e2e-conformance/tests/__fixtures__/runner-suite/tests/`; import declarations of `@systemfsoftware/effect-e2e` in `*.test.ts` files (31, composition API and types only); importers of the runner entry, none of which imports `test` from a test file; preset wiring in `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` (`rules`, `testFilePatterns`, `observerOverrides`).
- Learnings: `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` (deny without a baseline; why no warn level).
