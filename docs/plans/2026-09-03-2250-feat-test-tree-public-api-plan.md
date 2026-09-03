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

- **Objective:** A consumer of any workspace package can trust that the behavior proven by files under the package's `tests/` or `__tests__/` tree is proven through the package's published surface, because lint refuses every relative import that reaches `src/` from those trees, no test in those trees reaches `src` by any transitive path, and no disable comment naming the rule survives anywhere in the workspace.
- **Means:** Strengthen the existing `tests-import-public-api` oxlint rule from test-basename gating to test-tree-location gating, then remove every live violation by binding the public surface or deleting the smuggled test (KTD1–KTD3).
- **Authority:** User objective and user doctrine > `CONSTITUTION.md` > repo rules. The doctrine: a test that reaches `src` — directly or through a laundering fixture — is illegitimate; the remedy is a public binding or deletion. A disable comment is a license, not a fix; tests are not restored or preserved for their own sake.
- **Stop conditions:** A site whose deletion removes coverage no public binding can express is still deleted; the deletion is named in the unit's verification evidence. The only blocker is a gate that cannot go green without muting the rule.
- **Execution profile:** One rule unit; then independent package-scoped migration units; verification is orchestrator-run.

---

## Product Contract

### Summary

Every file under `<package-root>/tests/` or `<package-root>/__tests__/`, at any depth, binds the package's public API: a package name or subpath, or a sibling helper under the test tree. Relative imports that reach `src/` are lint errors, and every violation is removed — public binding where the surface allows, deletion where it does not. No suppression comment for this rule remains in the workspace.

### Problem Frame

The rule `tests-import-public-api` keys its applicability on a test-file basename (`path.config.ts` `TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/`). Files under the sanctioned test trees that do not carry a test basename — `__fixtures__` helpers, `*.tst.ts` type tests, `*.deny.ts` type fixtures — import `../src/...`, and one test file suppressed the same import form under per-line disables. Measured population: ten files, seventeen src-reaching imports, six packages. Each import is a route around the published surface: typecheck resolves the `@systemfsoftware/source` condition and never opens `dist`, so an export gap cannot surface at test time.

### Requirements

Grouped: enforcement (R1–R3), migration (R4), proof and doctrine (R5–R6).

- R1. Every file under a package-root `tests/` or `__tests__/` directory, recursively, regardless of basename, is in scope for the smuggling ban: relative specifiers containing a `src` segment, or climbing into an `internal` folder, are reported across static, type-only, named, namespace, default, re-export, side-effect, dynamic `import()`, and `import ... = require(...)` forms.
- R2. Files under any `src/` directory stay exempt — in-source `import.meta.vitest` blocks and colocated `src/**/__tests__/` suites keep importing their own module tree.
- R3. The ban reaches every workspace package through the existing delivery chain (`@systemfsoftware/oxlint-config/base` → `@systemfsoftware/oxlint-plugin-effect-dmmf` aggregate), with zero per-package lint-config edits.
- R4. After migration: zero in-scope files import from `src` without a public binding; every site lands on its disposition from the site inventory (Planning Contract) — public binding where the surface allows, deletion of the fixture and of every test that cannot bind publicly otherwise; and zero `oxlint-disable` comments naming this rule remain anywhere in the workspace, including pre-existing ones.
- R5. The rule's unit suite proves the new applicability: non-test basenames under test trees, package-root `__tests__`, `__fixtures__`, and the preserved `src/` exemption, including the internal-climb and sibling-internal decisions.
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

- KTD1. Applicability is `!isUnderSrc(file) && (isTestFile(basename) || hasTestTreeAncestor(file))`, decided in one pass (`isInTestsImportScope` in `path.ts`) so the per-file lint path pays a single segment decode; `TEST_TREE_DIRS` derives from `SANCTIONED_TEST_DIRS` plus `NESTED_TEST_DIR` so no literal is stated twice. The basename branch is preserved so stray `*.test.ts` files outside test trees keep their current coverage — dropping it would narrow enforcement, stopping reports the rule emits today. The segment scan is a deliberate over-approximation of "package-root tree": measured workspace state has every `tests/`/`__tests__/` directory at a package root, so the scan is exact today; a nested case would land in scope, which matches the ban's intent. Rejected: a walk-up-to-`package.json` resolver — filesystem access per file inside a lint visitor for a boundary that is exact in this workspace. Rejected: keeping the basename gate and hand-enumerating violations — it re-opens the hole with every new fixture suffix. Rejected: adding `__tests__` to `SANCTIONED_TEST_DIRS` — that set governs other placement rules and would reclassify root-level `__tests__` as sanctioned placement, an unrelated semantic change.
- KTD2. The change lands inside the existing rule in `packages/lint/oxlint/plugins/testing/test-placement/src/rules/tests-import-public-api.ts`; delivery rides the `effect-dmmf` aggregate that `base` spreads. Rejected: a `scripts/guards/` evaluator script — it duplicates lint infrastructure that already runs per package in every gate (`turbo lint`). Rejected: oxlint's built-in `no-restricted-imports` configured per package — it satisfies the shape only by repeating one spec in every package's config, violating R3's delivery and drifting independently. Rejected: a warn-severity rollout before error — the objective is prohibition, not measurement. Rejected: a vitest-level plugin — enforcement belongs at lint, which runs in every gate and does not couple to a test runner.
- KTD3. Migration doctrine per site: (1) the binding is public → import the package name or subpath; (2) the subject is internal → the smuggled test or fixture is deleted, together with every consumer that cannot bind publicly; the deleted coverage is named in the unit's evidence. Tests are not preserved for their own sake, and no `oxlint-disable` comment naming this rule may exist when the work lands — a disable is a license, not a fix. Widening a package's public API or `exports` to satisfy a test is not a remedy — that is an unpriced surface decision (REPO-W8). A type-test lane left empty by deletions is removed with its script and devDependency rather than left failing on an empty match.
- KTD4. The analysis package's `adapters.integration.test.ts` is deleted: four of its imports bound package-private adapters from `src`, and five of its scenarios carried DAMP titles the gherkin title types reject. The two scenarios whose bindings are fully public (`PackageStore`, `PackageStoreStub` from the published entry) survive under `package-store-stub.integration.test.ts` with prose titles. Deleted coverage: stub-contract scenarios for the tarball, resolver, typescript, and lexer adapters, and tarball-extract coverage including byte-for-byte binary preservation — all internal-subject, unrecoverable without widening `@systemfsoftware/arethetypeswrong`'s surface.

### Site inventory and committed dispositions

| Site                                                                      | Binding                                   | Public                                                               | Disposition                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `stryker-js/cli/tests/__fixtures__/node-platform.ts`                      | `nodePlatformLayer`, `workerEntriesLayer` | No — cli `exports` only `./package.json`                             | Deleted with its consumer test and orphaned fixture project                                        |
| `stryker-js/instrumenter/tests/__fixtures__/instrument.ts`                | `instrument`                              | Yes                                                                  | Rewritten to `@systemfsoftware/stryker-js-instrumenter`                                            |
| `stryker-js/instrumenter/tests/__fixtures__/print.ts`                     | `printProgram`                            | No — absent from barrel                                              | Deleted with the print-corpus suite and data                                                       |
| `stryker-js/instrumenter/tests/__fixtures__/registry.ts`                  | `allMutators`                             | No — absent from barrel                                              | Deleted; registry scenario removed from the surviving suite                                        |
| `stryker-js/vitest-runner/tests/__fixtures__/vitest-runner-harness.ts`    | `makeVitestRunnerLayer`                   | No — barrel exports `strykerPlugins`, `strykerValidationSchema` only | Deleted with all three dependent integration suites                                                |
| `stryker-plugins/tests/*/__fixtures__/AstNode.tst.ts` (×2)                | estree↔schema type bindings               | No — neither barrel re-exports them                                  | Deleted; package's empty `test:types` lane removed                                                 |
| `specs/gherkin/effect/tests/__fixtures__/scenario-title.anti-damp.tst.ts` | `ScenarioTitle`, `ScenarioTitleRejected`  | No                                                                   | Deleted; empty `test:types` lane removed                                                           |
| `specs/gherkin/effect/tests/__fixtures__/scenario-title.deny.ts`          | `ScenarioFn`                              | Yes                                                                  | Rewritten to `@systemfsoftware/effect-gherkin-spec`                                                |
| `arethetypeswrong/analysis/tests/adapters.integration.test.ts`            | four adapters                             | No — package-private                                                 | File deleted; the two public-binding scenarios survive in `package-store-stub.integration.test.ts` |

The implementer may keep a site by finding a public path the inventory missed; deletion is the default for internal subjects.

### Assumptions

Grounding note — destructive review, first cycle: lens **Inversion** applied against the enforcement-first design ("what breaks if every test must bind public names?").

1. _Assumption:_ tests outside `src` are consumer-altitude and should bind the published seam. Warrant: the user objective and doctrine; wiki `test-placement` A9 is `posit` (the corpus's own placement doctrine), supported by the public-API canon that a package's implementation tree is sealed (`library-public-api-surface` A6, `canon`). Mechanism, verifiable in-repo: typecheck compiles through the `@systemfsoftware/source` condition and never opens `dist`, so a src-reaching test passes every gate while the exports map drifts — binding the package name makes the exports map the gate. The harm is structural, not anecdotal.
2. _Assumption:_ binding a package name from tests executes built `dist`, and `dist` exists when tests run. Warrant: `turbo.json` `test.dependsOn` is `["^build", "build"]`; `@systemfsoftware/arethetypeswrong`'s analysis tests already bind public package names and pass.
3. _Assumption:_ ancestor-segment scanning decides "under a test tree" without resolving the package root. Warrant: the existing rules already classify by segment scans over `context.filename` (`isUnderSrc`, `isInSanctionedTestDir` in `path.ts`).

---

## Implementation Units

### U1. Location-gate the rule and prove it in the unit suite

- **Goal:** The rule reports src-reaching imports from any file under a test tree, regardless of basename, and stays silent under `src`.
- **Requirements:** R1, R2, R3, R5, R6.
- **Dependencies:** none.
- **Files:** `packages/lint/oxlint/plugins/testing/test-placement/src/rules/path.config.ts`, `path.ts`, `tests-import-public-api.ts`, `src/rules/__tests__/tests-import-public-api.test.ts`, `README.md`, `AGENTS.md`.
- **Approach:** `TEST_TREE_DIRS` derived from the existing constants; single-pass `isInTestsImportScope`; unit cases for fixture helpers, `.tst.ts`, root `__tests__`, dynamic import, the src exemptions, and the preserved internal-climb and sibling-internal decisions; README/AGENTS rule text.
- **Test scenarios:** each new applicability case red before the guard change, green after; full plugin suite green.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test` and `build` pass; negative probe against a real package red on its fixtures.

### U2. Remove stryker-js fixture smugglers

- **Goal:** The five fixture helpers in `stryker-js/cli`, `stryker-js/instrumenter`, and `stryker-js/vitest-runner` land on their dispositions.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** the five fixture files plus consumers as the dispositions require, the affected vitest/oxlint configs, and the instrumenter and vitest-runner AGENTS.md doctrine lines the deletions falsify.
- **Approach:** `instrument` rewrites public; the internal-subject fixtures and their non-public-bindable consumers are deleted; every deletion named in evidence; stale configs and doctrine updated in the same unit.
- **Test scenarios:** each affected package's remaining suite passes; zero relative src imports remain under its test trees.
- **Verification:** per-package `lint` and `test` green (orchestrator-run).

### U3. Remove stryker-plugins type-test fixtures

- **Goal:** The two `.tst.ts` fixtures are deleted; no dangling consumers; the empty type-test lane is removed.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/mutation/plugins/stryker-plugins/tests/effect-schema-ignorer/__fixtures__/AstNode.tst.ts`, `tests/workflow-make-ignorer/__fixtures__/AstNode.tst.ts`, package `package.json`.
- **Approach:** Delete both fixtures; remove the `test:types` script and `tstyche` devDependency left empty.
- **Test scenarios:** package `test` passes; `test:types` no longer exists as a failing empty lane.
- **Verification:** per-package `lint` and `test` green (orchestrator-run).

### U4. Remove gherkin-spec fixture smugglers

- **Goal:** The internal-subject fixture is deleted; the public binding is rewritten; the empty type-test lane is removed.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/specs/gherkin/effect/tests/__fixtures__/scenario-title.anti-damp.tst.ts` (deleted), `scenario-title.deny.ts` (public rewrite), package `package.json`.
- **Approach:** Delete anti-damp; rewrite `deny.ts` to `@systemfsoftware/effect-gherkin-spec`; drop the `test:types` script and `tstyche` devDependency; update the stale lane comment in `deny.ts`.
- **Test scenarios:** package `test` and `typecheck` pass; the `@ts-expect-error` directives still verify under `typecheck`.
- **Verification:** per-package `lint`, `test`, and `typecheck` green (orchestrator-run).

### U5. Delete the analysis package's smuggled adapter tests

- **Goal:** No src-binding or disable-suppressed test remains in the analysis package's test tree.
- **Requirements:** R4.
- **Dependencies:** U1.
- **Files:** `packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts` (deleted), `package-store-stub.integration.test.ts` (created from its two public-binding scenarios).
- **Approach:** Keep only the scenarios whose bindings come entirely from the published entry; give them prose titles (the old DAMP titles are rejected by the gherkin title types); delete the adapter-bound scenarios with the file.
- **Test scenarios:** package `lint`, `test`, and `typecheck` pass; a workspace-wide grep finds zero disable comments naming this rule.
- **Verification:** per-package gates green (orchestrator-run).

### U6. Workspace integration proof and changesets

- **Goal:** The whole workspace is green under the strengthened rule, and consumers are notified.
- **Requirements:** R3, R4; repo rule REPO-R2.
- **Dependencies:** U1–U5.
- **Files:** `.changeset/` intents for `@systemfsoftware/oxlint-plugin-test-placement` and `@systemfsoftware/oxlint-plugin-effect-dmmf` (minor each: new lint errors plus test removals are consumer-observable; the aggregate's build hash moves with its dependency).
- **Approach:** Verify zero disable comments naming this rule remain workspace-wide; run the full local gate; record the changeset bodies as consumer-observable facts (rule now covers every file under `tests/` and `__tests__/` trees, not only `*.test.ts`/`*.spec.ts` basenames).
- **Test scenarios:** `check-changeset` accepts the changeset set; the workspace-wide disable sweep returns zero hits.
- **Verification:** `pnpm check:local` exits 0.

---

## Verification Contract

| Gate              | Command                                                                                                              | Proves                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Rule unit suite   | `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test`                                                   | R5, R1 applicability                         |
| Rule build        | `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement build`                                                  | consumers receive the strengthened rule (R3) |
| Negative probe    | temp smuggler under a `tests/` tree → `pnpm --filter <pkg> lint` nonzero, then removed                               | R1 end to end                                |
| Resolution proof  | every public rewrite resolves through the package entry (`typecheck`/`test` green against the rewritten import)      | migration correctness, not just rule wiring  |
| Smuggle sweep     | grep each migrated package's `tests/` tree for unexcused `../`…`/src/` specifiers → zero hits                        | R4                                           |
| Disable sweep     | grep the workspace for disable comments naming this rule → zero hits                                                 | R4's no-license end state                    |
| Per-package gates | `pnpm --filter <pkg> lint && pnpm --filter <pkg> test` (+`typecheck` where fixtures carried compile-time assertions) | R4                                           |
| Workspace gate    | `pnpm check:local`                                                                                                   | R3, R4, tree green                           |

---

## Definition of Done

- R1–R6 hold on the current tree; each verified by the gate named in the Verification Contract.
- Zero unexcused src-reaching imports remain under any `tests/` or `__tests__/` tree; zero disable comments naming this rule remain in the workspace.
- Changesets shipped for `@systemfsoftware/oxlint-plugin-test-placement` and `@systemfsoftware/oxlint-plugin-effect-dmmf`; `pnpm check:local` exits 0 after the last edit; work lands as a pull request watched to green (REPO-D1).
- Cleanup: no probe files, no dead disables, no empty type-test lanes, no orphaned fixture helpers, no unused constants left behind.
