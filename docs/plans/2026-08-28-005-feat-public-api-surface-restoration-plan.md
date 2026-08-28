---
title: Public API Surface - Enforcement and Behavioral Coverage Restoration - Plan
type: feat
date: 2026-08-28
topic: declared-public-api-surface
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
supersedes: docs/plans/2026-08-27-004-feat-declared-public-api-surface-plan.md
---

# Public API Surface - Enforcement and Behavioral Coverage Restoration - Plan

## Goal Capsule

- **Objective:** every package's public API is declared or the build breaks — an untagged export fails the package build, `@public` publishes, `@internal` stays workspace-only — while the behavioral integration suites under `tests/` remain the coverage instrument: restored, runnable, and green in the lanes that ran them before. A generated surface snapshot per exports-map key pins each entry's runtime export set as an additive check, never a replacement for behavior tests. The lint-disable escape hatch stays closed.
- **Product authority:** this plan owns surface enforcement and test-lane preservation for the branch it governs. Legacy surface slimming, a type-level surface pin, and surface-change ceremony are context, not scope (Scope Boundaries).
- **Open blockers:** none.
- **Execution profile:** U1 → U2 → U3 in order; the shipping tail (commit, push, PR, CI watch) returns to the lfg caller.
- **Stop conditions:** stop and surface a blocker if a restored suite cannot pass without importing internals — its subject is internal wiring and its disposition is a per-file decision, never a lane-wide deletion.

---

## Product Contract

### Summary

Every exported declaration carries a release tag at write time: untagged fails the package build via the api-extractor gate, `@public` publishes immediately, `@internal` stays workspace-only. Behavioral integration suites under `tests/` exercise the public API and are the repo's integration coverage; `tests-import-public-api` (error, guard-protected) is the instrument that keeps them on the public surface, and no rule restricts their assertion style. A generated snapshot per exports-map key adds a surface pin on top, so a widened export reddens `pnpm test` with a reviewable diff.

### Problem Frame

Two failure modes, both silent under green gates. First: the repo forces integration tests onto the public API (`tests-import-public-api`, error), so an agent whose test subject is internal takes the cheapest compliant route — export it. Nothing forced the classification decision; at api-extractor 7.58.9 an untagged declaration is silently labeled `@public`, and all 25 gated configs disabled the one message that refuses it. Second: a test lane that admits only snapshot-shaped files deletes behavioral coverage while every gate stays green — a snapshot of `Object.keys(module)` detects that the surface changed, not that behavior regressed. Jest's own documentation defines the snapshot contract as change detection — the test "will fail if the two snapshots don't match: either the change is unexpected, or the reference snapshot needs to be updated" (jestjs.io/docs/snapshot-testing) — and the survey literature ranks snapshot fragility and blind updating among the top drawbacks of the technique (JSS 2023, doi:10.1016/j.jss.2023.111797). The enforcement pair that kills the first failure mode without causing the second: the tag gate forces deliberateness at the export site, and the import rule forces tests through the declared surface; the per-key snapshot is an additive pin on the declared surface, and behavioral suites stay the coverage instrument.

### Key Decisions

- Binary tags, no staging — `@public` or `@internal` at write time; `@alpha`/`@beta` unused (session-settled: user-directed — chosen over `@beta` staging: nobody spends time on promotions). Governs R1, R3.
- The declared exports map is the enforcement unit — Node's `exports` field is the encapsulation boundary an installed package enforces, so the snapshot lane iterates its keys, and packages the type-rollup gate cannot reach (`atom`, `atom-react`) are enforced per-key, not exempted. Governs R1, R7.
- The untagged default flips at the existing gate — one config key per package plus the build chain (session-settled: user-approved). Governs R1, R2.
- Behavioral suites under `tests/` are the coverage instrument; no rule restricts assertion style — a hand-assertive test through the public API is the coverage; an export-set snapshot is a surface pin (session-settled: user-directed — chosen over a snapshot-only `tests/` lane: `Object.keys` snapshots assert no behavior, per the Jest contract cited in Problem Frame). Governs R4, R5.
- Reach-in tests stay delete-only; no private import route — a test whose subject is internal wiring loses the test, per `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` R12 (session-settled: user-directed — chosen over a sanctioned internal-test path). The doctrine applies to reach-ins only; a public-API suite is never in that class. Governs R5.
- The surface snapshot rides the generated-file-with-real-import-edges pattern — precedent: `packages/core/effect/schema/vite/src/mod.ts` rewrites the one filename the placement taxonomy whitelists, so mutation related-file walks reach the generated imports. Governs R7.
- Mass-`@public` tagging stays mechanically green — the backstop is the `.api.md` diff plus the forced changeset intent; no red gate (session-settled: user-approved). Governs R3.

### Requirements

**Surface gate**

- R1. An exported declaration without a release tag fails that package's build, naming the symbol. Gate: `ae-missing-release-tag` at `logLevel: "error"` in every `packages/**/api-extractor.json` (29 entry configs across 25 gated packages); tags inherit from containers. `packages/core/effect/atom/atom` and `atom-react` carry no api-extractor config (rollup measured 154/51 declaration errors against tsdown's 0, `packages/core/effect/atom/AGENTS.md`) — R7 is their enforced lane. Two of the 29 — `packages/core/effect/cell/gen/api-extractor.json` and `packages/core/effect/cell/types/api-extractor.json` — sit at `logLevel: "none"` with unswept surfaces (zero release tags in either `src/`); U4 brings them to this requirement.
- R2. Every gated package's `build` chains `api:check`.
- R3. Every currently-exported outermost declaration carries a tag — today's surface, including deep subpaths, is the declared baseline; the sweep covered every exports-map key of every multi-entry package.

**Test lanes**

- R4. Every behavioral integration suite under `tests/` runs green in the lane that ran it before: the suites are restored byte-identical from the merge-base; the lane definitions — contract-lane configs (`vitest.contract.config.ts` + `test:contract` scripts for the two CLI packages) and vitest include semantics — are restored or reconciled per KTD2. Gate: `git diff <merge-base> -- '*tests/**'` shows only suite restorations, surface-snapshot additions, and the one reach-in deletion; the reconciled configs match KTD2's shapes; every affected package's `pnpm test` exits 0.
- R5. `tests-import-public-api` at `error` — guard-protected — is the sole instrument against internal reach-ins; no rule restricts matcher shape or assertion style under `tests/`. Gate: a scratch test importing an internal fails lint naming the rule; a restored behavioral suite passes lint unmodified.
- R6. The CLI contract lanes run their container-backed suites in CI: `pnpm --filter @systemfsoftware/stryker-js-cli test:contract` and the arethetypeswrong CLI's `test:contract` are restored with their configs and scripts. Gate: CI's contract lane executes them and passes.
- R7. Each package carries one small generated snapshot per exports-map key pinning the entry's runtime export set; a changed export set fails `pnpm test` until the snapshot updates, and an update adding or removing exports pairs with a changeset body naming each symbol. Snapshots are additive: the sanctioned basename allowance in `test-suffix-outside-src` is their only placement interaction.

**Guard and ceremony**

- R8. `tests-import-public-api` stays in `PROTECTED_RULE_IDS` (`scripts/guards/check-forbidden-lines.ts`); any suppression exits the guard non-zero. The adapters reach-in (`packages/testing/type-testing/arethetypeswrong/analysis/tests/adapters.integration.test.ts`) stays deleted — its subjects are package-private wiring (R12).
- R9. The test-format rule `no-hand-assertive-test-outside-src` is removed with every trace: rule module, config, RuleTester suite, plugin registration, both `.api.md` reports, atom config entries. Gate: `git grep -n "no-hand-assertive-test-outside-src"` across the tree exits with zero matches (git grep exits 1 when clean).
- R10. Release intents grade on consumer observability: `@systemfsoftware/oxlint-plugin-test-placement` carries a `patch` (the `surface.snapshot.test.ts` basename allowance in the suffix rule is its only consumer-visible change); the gated packages' tag, wiring, and test-lane work is `none`. Gate: the changeset guard passes against the merge-base; `pnpm check:local` exits 0.

### Acceptance Examples

- AE1. **Covers R1.** A scratch untagged export added to a gated package fails its `build` naming file, line, and symbol; reverted, the build is green.
- AE2. **Covers R2.** `html-reporter`'s build task runs `api:check` as part of the task, not only in CI.
- AE3. **Covers R4.** A restored behavioral suite — e.g. atom's `tests/Registry.integration.test.ts` — passes `pnpm test` and `pnpm lint` byte-unmodified.
- AE4. **Covers R5.** A scratch test under `tests/` importing a package-private module fails lint naming `tests-import-public-api`; the same file importing only public exports passes with hand assertions.
- AE5. **Covers R7.** Adding an export to an entry fails that package's `pnpm test` until the per-key snapshot updates; the diff names the key.
- AE6. **Covers R9.** `git grep -n "no-hand-assertive-test-outside-src"` returns zero lines.
- AE7. **Covers R10.** The changeset guard passes with the corrected intents; the published `@systemfsoftware/oxlint-plugin-test-placement` surface differs from main only by the basename allowance.
- AE8. **Covers R6.** CI's contract lane runs both restored CLI suites' Gherkin scenarios and passes.

### Success Criteria

- An agent widening or leaving untagged an export sees red inside its own loop — at `build` or `test` — without waiting for CI or review.
- Behavioral integration coverage under `tests/` is byte-identical to the merge-base corpus (minus the one reach-in); it runs in the same lanes, and no gate restricts how it asserts.
- Published rollup types contain only `@public`-tagged declarations; the broad-`@public` baseline is the accepted residual, visible through the `.api.md` diff and forced changeset intents, not a success signal.

### Scope Boundaries

- Private internal-test import paths — rejected; reach-ins stay delete-only.
- Surface ceremony beyond R10 — rejected as ritual.
- tstyche type-level surface pin — deferred; the build gate carries the same force one lane earlier.
- Legacy surface slimming — the baseline accepts today's surface; narrowing is separate work.
- In-src property-test placement — unchanged.

### Dependencies / Assumptions

- api-extractor 7.58.9 semantics as measured in a fixture: untagged defaults to `@public` silently unless `ae-missing-release-tag` is raised; tags inherit; the public trim excludes non-`@public` tags.
- The `@systemfsoftware/source` resolve condition keeps workspace typecheck tag-agnostic.
- Merge-base vitest include semantics are the lane definitions: `stryker-plugins` and `stryker-test-contribution` ran `tests/**/*.integration.test.ts` in plain `pnpm test`; `platform-node` ran `tests/**/*.integration.test.ts` + `src/**/__tests__/*.test.ts`; `atom-react` ran `tests/**/*.integration.test.ts` (minus `ssr`) in a browser project plus `ssr` in a node project; the two CLIs ran contract files only under `vitest.contract.config.ts`; packages whose configs did not name `tests/` did not run them in plain `pnpm test`.

### Sources

- Jest snapshot contract (change detection, not behavior assertion): https://jestjs.io/docs/snapshot-testing
- Snapshot-testing drawbacks survey: doi:10.1016/j.jss.2023.111797
- Atom carve-out measurement: `packages/core/effect/atom/AGENTS.md`
- Reach-in instance and prior doctrine: `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` R12
- Merge-base lane shapes: `packages/testing/mutation/plugins/stryker-plugins/vitest.config.ts`, `packages/testing/mutation/stryker-js/platform-node/vitest.config.ts`, `packages/core/effect/atom/atom-react/vitest.config.ts`, `packages/testing/mutation/stryker-js/cli/vitest.contract.config.ts`, `packages/testing/type-testing/arethetypeswrong/cli/vitest.contract.config.ts`
- Generated-file precedent: `packages/core/effect/schema/vite/src/mod.ts`

---

## Planning Contract

### Key Technical Decisions

- KTD1. Restoration is byte-identical from the merge-base for the suite corpus and the lane files it needs: the behavioral suites, the two `vitest.contract.config.ts` files, the `test:contract` script entries, the stryker CLI AGENTS verification line for the contract lane, and the widened `include` blocks (post-KTD2 reconciliation). The atom `oxlint.config.ts` files are not byte-restored — their target shape is KTD4's. The one exception in the suite corpus is the adapters reach-in, which stays deleted under R8. Byte-identity over the suite corpus is the verification: `git diff <merge-base> -- '*tests/**'` shows only restorations, surface-snapshot additions, and that one deletion. Governs U1.
- KTD2. Include reconciliation restores merge-base semantics and adds the surface file explicitly where it must run: where a config's include was widened to a blanket `tests/**/*.test.ts` that the merge-base did not carry, the widening is reverted and `'tests/surface.snapshot.test.ts'` is added as its own glob — so the only suite-set change in plain `pnpm test` is the surface file itself. The `@systemfsoftware/source` resolve conditions stay: they pin `src`, not stale `dist`. Governs U1.
- KTD3. The format rule's removal is a clean cutover, not a demotion: the rule's target — tests reaching internals — is already caught by `tests-import-public-api`, and once behavioral suites are legitimate, a matcher-shape rule forbids exactly the coverage the lane exists for; warn-severity or config-scoped variants would leave the same prohibition alive with no job left to do. Removal covers rule module, config, RuleTester suite, `src/index.ts` registration, both `.api.md` reports (test-placement, effect-dmmf), and the atom config rule lines; the `tests-import-public-api` lines in those configs stay. Governs U2.
- KTD4. `atom` and `atom-react` keep the test-placement plugin registered with `tests-import-public-api` at `error` explicitly in their own minimal configs — registration is not enablement, and their AGENTS.md deliberately declines the shared config. Target shape, executed once by U2: the merge-base config plus `jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')]` and `'@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api': 'error'`; `atom` alone re-gains `ignorePatterns: ['tests/AtomRpc.integration.test.ts']`; no format rule. Governs U2.
- KTD5. The test-placement changeset grades `patch`: against main, the plugin's consumer-visible change is the suffix rule's `surface.snapshot.test.ts` basename allowance — an added allowance in an existing rule. The format rule never reaches a consumer: the branch is unmerged, the intent set is branch-local, and the grade describes the net-vs-main surface. Governs U3.

### Assumptions

- The generator and its per-key snapshots are landed and green on the branch; nothing in this plan regenerates them (R7's rejection criterion governs future updates).
- CI's contract lane has the containers the two CLI suites need; the suites were green there before the format-lane work.

### Sequencing

U1 (restore) and U2 (remove) are one verification unit in practice — restored suites pass lint only after the rule is gone — but land as separate commits for reviewable diffs. U4 is independent of both. U3 closes with intent correction and the full gate. Ordering: U1, U2, U4 may interleave; U3 is last.

---

## Implementation Units

Landed on the branch and binding: R2, R3 (23 of 25 packages), R7's generator and snapshots, R8. The units below cover the outstanding work: U1–U2 the test lanes, U3 the intents, U4 the two-package gate completion R1 names.

### U1. Restore behavioral suites and their lanes

- **Goal:** the merge-base behavioral corpus under `tests/` is back, byte-identical, running in the lanes that ran it.
- **Files:** every `tests/**/*.integration.test.ts` (and `tests/**/*.test.ts`) suite deleted by the format-lane work across `packages/`, `omp/packages/`, `omp/plugins/`; `packages/testing/mutation/stryker-js/cli/vitest.config.ts` + `vitest.contract.config.ts` + `package.json` (`test:contract`); `packages/testing/type-testing/arethetypeswrong/cli/vitest.config.ts` + `vitest.contract.config.ts` + `package.json` (`test:contract`); `packages/testing/mutation/stryker-js/cli/AGENTS.md` (contract-lane line); the widened `include` blocks in the affected `vitest.config.ts` files (reconciled per KTD2). The atom `oxlint.config.ts` files are U2's, per KTD4.
- **Approach:** restore from the merge-base (`git checkout <merge-base> -- <paths>`), excluding the adapters reach-in; reconcile includes per KTD2; keep surface snapshots and their `surface:update` scripts.
- **Test scenarios:**
  - Covers AE3: atom's restored `Registry` suite and `atom-react`'s restored browser suites pass `pnpm test` byte-unmodified.
  - Covers R6: both CLIs' `test:contract` scripts exist and their configs select the contract files; CI's contract lane runs them.
  - `git diff <merge-base> -- <restored paths>` is empty for the restored set.
- **Verification:** affected packages' `pnpm test` green; the two `test:contract` lanes green in CI; the diff audit passes.

### U2. Remove the test-format rule cleanly

- **Goal:** no trace of `no-hand-assertive-test-outside-src` remains; the reach-in gate stands alone.
- **Requirements:** R5, R9.
- **Files:** `packages/lint/oxlint/plugins/testing/test-placement/src/rules/no-hand-assertive-test-outside-src.ts` and `.config.ts`; `.../src/rules/__tests__/no-hand-assertive-test-outside-src.test.ts`; `.../src/index.ts`; `.../etc/oxlint-plugin-test-placement.api.md`; `packages/lint/oxlint/plugins/meta/effect-dmmf/etc/oxlint-plugin-effect-dmmf.api.md`; `packages/core/effect/atom/atom/oxlint.config.ts` and `atom-react/oxlint.config.ts` (drop the format-rule lines, keep `tests-import-public-api` per KTD4); `path.config.ts` keeps `SURFACE_SNAPSHOT_BASENAME` (the suffix rule consumes it) and drops `SNAPSHOT_MATCHERS` if nothing else reads it.
- **Approach:** delete the rule files; unwind registration; regenerate both `.api.md` reports through the packages' builds (`api:update`), or hand-edit to the identical shape the build emits; restore atom configs to merge-base shape plus the plugin registration with the reach-in rule at error.
- **Test scenarios:**
  - Covers AE4: a scratch internal-import test under `tests/` fails lint naming `tests-import-public-api`; the same file with public imports and hand assertions passes.
  - Covers AE6: `git grep -n "no-hand-assertive-test-outside-src"` exits clean.
  - The plugin suite and effect-dmmf aggregation suite are green with the rule gone.
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-test-placement build && pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test`; the git-grep audit; lint green on a package carrying restored suites.

### U3. Correct release intents and run the full gate

- **Goal:** intents match the consumer-visible surface; the tree passes everything.
- **Requirements:** R10.
- **Files:** `.changeset/*` (the test-placement intent rewritten to `patch` with the basename-allowance summary; the `none` intents re-read against the final diff).
- **Approach:** grade per KTD5; verify the intent set against the turbo build-hash movement vs the merge-base; run the full gate.
- **Test scenarios:**
- **Verification:** `pnpm check:local` exit 0; the changeset workflow green in CI.

### U4. Complete the tag gate for `cell/gen` and `cell/types`

- **Goal:** the two remaining entry configs enforce the tag gate; both packages' surfaces carry the declared baseline.
- **Requirements:** R1, R3 (for these two packages).
- **Files:** `packages/core/effect/cell/gen/api-extractor.json`; `packages/core/effect/cell/types/api-extractor.json`; tag-only additions in each package's `src/`; regenerated `etc/*.api.md` reports.
- **Approach:** per package, raise `ae-missing-release-tag` to `error`, tag exactly the declarations the red names `@public`, regenerate the report (`api:update`). Red/green observation: the flip observed red on a scratch untagged export in one of the two, green after revert — the Evaluator-surface discipline R8's predecessor carried.
- **Test scenarios:**
  - Covers AE1 (for these two): a scratch untagged export fails the build naming the symbol; revert is green.
  - Both packages' `api:check` green at `error` against the tagged baseline; diff audit shows tag-only source deltas.
- **Verification:** both builds green post-flip; the red/green observation recorded as command + exit code.

---

## Verification Contract

| Gate                 | Command                                                                                                          | Proves                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Restoration fidelity | `git diff <merge-base> -- <restored paths>`                                                                      | R4 — byte-identical suites and lanes                               |
| Behavioral suites    | `pnpm --filter <pkg> test`                                                                                       | R4, R7 — suites and surface snapshots green together               |
| Contract lanes       | `pnpm --filter @systemfsoftware/stryker-js-cli test:contract` (+ attw CLI) in CI                                 | R6                                                                 |
| Reach-in gate        | `pnpm --filter <pkg> lint`                                                                                       | R5 — internal-import tests fail; public suites pass                |
| Rule removal         | `git grep -n "no-hand-assertive-test-outside-src"`                                                               | R9 — zero matches                                                  |
| Guard                | `pnpm check:ci` (runs `check:forbidden-lines`)                                                                   | R8 — protected-rule suppressions fail                              |
| Changesets           | changeset workflow vs merge-base                                                                                 | R10                                                                |
| Cell gate completion | `pnpm --filter @systemfsoftware/effect-cell-gen build && pnpm --filter @systemfsoftware/effect-cell-types build` | R1, R3 — the remaining two configs at error, tagged baseline green |

Evidence discipline: red/green observations (AE1 scratch export, AE4 scratch import) are captured as command + exit code in the implementing transcript and referenced in commit bodies.

---

## Definition of Done

- All four units landed; every unit's verification evidence exists in the implementing transcript.
- The behavioral corpus under `tests/` matches the merge-base minus exactly one file (the adapters reach-in).
- `pnpm check:local` exits 0 after the final edit (REPO-D1); the PR's CI is watched to decided (REPO-D2). Mutation runs are never started by the implementing agent (REPO-D3).
- Scratch fixtures are reverted, not committed.
