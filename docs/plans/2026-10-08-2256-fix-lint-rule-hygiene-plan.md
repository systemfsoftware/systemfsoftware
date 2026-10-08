---
title: Lint Rule Hygiene - Plan
type: fix
date: 2026-10-08
topic: lint-rule-hygiene
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Lint Rule Hygiene - Plan

## Goal Capsule

- **Objective:** the shared lint configuration has no duplicate rule for the `@internal` tag, no warning-severity rule, and no ignore entry that hides source a tool did not produce.
- **Means:** merge the two `@internal` JSDoc rules into `internal-export-jsdoc`, settle `effecttsgo/unstable-api-usage` at `error` or `off`, and delete the dead `ignorePatterns` entries in both presets that carry the list, `oxlint-config-dmmf` and `oxlint-config-cell-architecture`.
- **Authority:** conductor rulings 01, 02 and 03 on the 2026-10-08 harness brainstorm. Doctrine: `repos/constitution/ENFORCEMENT.md` ("Changing an instrument", "Enrollment"), `CONST-E9`, `DEL1`. This is layer 2 of three independent pull requests, cut from `main` and not stacked on the others.
- **Stop conditions:** stop and report if un-ignoring a pattern exposes findings in a file outside the three packages U4 expects (`packages/gherkin/storybook-gherkin`, `packages/daemon/effect-daemon-process`, `packages/runner/vitest`), if U4 cannot fix a finding without loosening a rule, or if the `unstable-api-usage` count cannot be produced from a real lint run.
- **Execution profile:** the maker writes the instrument changes (U1 to U3). Any finding the changed instrument newly raises in tree code is fixed by a separate subagent with fresh context (U4), never by the maker (`CONST-E9`).
- **Ships as:** one pull request with this plan as its only plan file (`REPO-D2`).

---

## Product Contract

### Summary

The `@internal` tag has one rule enforcing both directions of its invariant. The one `warn` severity becomes a decision. Ignore entries that match nothing a tool here produces are deleted from every preset that carries them, so tracked hand-written files they hid get linted.

### Problem Frame

Two rules in `oxlint-plugin-cell-architecture` enforce the two directions of one predicate: an export carries `@internal` if and only if its path has an `internal` segment. Both are `error` in the same recommended map (`src/index.ts:32-33`) and share their kernels (`internal-jsdoc.ts`, `internal-path.ts`).

`effecttsgo/unstable-api-usage` is the only configured `warn` in the tree (`packages/oxlint-presets/oxlint-config-recommended/src/index.ts:63`). It is written after the `promoteWarnToError` spreads, so promotion never reaches it. A warning fails no command, and `ENFORCEMENT.md` forbids it.

`oxlint-config-dmmf`'s `ignorePatterns` (`src/index.ts:69-95`) is forwarded verbatim by `oxlint-config-recommended` to about 28 packages and inherited through `extends` by 5 schema packages. `oxlint-config-cell-architecture` carries the same 25-entry list (`src/index.ts`, `ignorePatterns`), and `oxlint-config-recommended` extends both presets, so an entry deleted from one list alone still hides its files. Fifteen entries match nothing a tool here produces, and `**/*.d.ts` is a sixteenth (KTD3). Two of them hide tracked hand-written files: `**/*.mjs` hides `packages/gherkin/storybook-gherkin/scripts/check-dts.mjs` and `packages/daemon/effect-daemon-process/tests/__fixtures__/child-script.mjs`, which their packages' `oxlint .` would otherwise reach. `**/*.d.ts` hides `packages/runner/vitest/src/compat.d.ts`.

### Key Decisions

- **One rule, the biconditional.** The pair merges into `internal-export-jsdoc`, and the other ID is removed everywhere with no alias. Governs R9. (session-settled: user-directed — chosen over keeping both rules: two rules for one predicate is the duplicate the audit flagged)
- **`warn` resolves by finding count.** Zero findings over the tree: `error`. Any findings: `off`, with the reason named beside the entry. Governs R10. (session-settled: user-directed — chosen over leaving `warn`: `ENFORCEMENT.md` "warn is forbidden: error with a clean tree, or off with the reason named")
- **Each surviving ignore entry names one producer.** Governs R11. (session-settled: user-directed — chosen over a blanket keep: an entry with no producer only hides source)
- **`schema-declaration-location` is untouched.** No defect was reproduced. The duplicated `WORKFLOW_FILE_BASENAME` regex stays too. (session-settled: user-directed — chosen over a speculative refactor: not a confirmed defect)

### Requirements

- R9. `internal-export-jsdoc` enforces both directions of the `@internal` invariant. The second `@internal` rule (the one reporting `internalTagOutsideFolder`) no longer exists in code, recommended maps, READMEs, API reports or docs.
- R10. No configured rule severity is `warn`.
- R11. Every `ignorePatterns` entry in `oxlint-config-dmmf` and `oxlint-config-cell-architecture` names output a tool in this repository produces, or a tree that must not be linted. Entries with neither are deleted from both lists.

### Acceptance Examples

- AE7. An untagged export under `internal/`.
  - **Covers R9.** **Given** `src/internal/x.ts` exporting a function with no `@internal` tag. **Then** `internal-export-jsdoc` reports `missingInternalTag`.
- AE8. A tagged export outside `internal/`.
  - **Covers R9.** **Given** `src/x.ts` exporting a function tagged `@internal`. **Then** `internal-export-jsdoc` reports `internalTagOutsideFolder`, and no other rule reports it.
- AE9. A hand-written `.mjs` file in a linted package.
  - **Covers R11.** **Given** a deliberate violation in `packages/gherkin/storybook-gherkin/scripts/check-dts.mjs` (scratch, reverted). **When** `pnpm --filter @systemfsoftware/storybook-gherkin lint` runs. **Then** the violation is reported. Today it is silent: the before-state is a false negative, not a red failure.

### Scope Boundaries

- No new lint rule, CI grep or guard.
- `schema-declaration-location`, the `WORKFLOW_FILE_BASENAME` regex, per-package complexity relaxations and `model-fixture-imports-subject` are out of scope (rulings Q4, Q6).
- No new ignore entries for gitignored outputs that are missing today (`.vitest/`, `reports/`, `__tmp__/`, `temp/`). R11 deletes dead entries; it does not complete the list.

### Sources / Research

- `@internal` pair: `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/internal-export-jsdoc.ts`, `internal-jsdoc.ts`, `internal-path.ts`, `src/index.ts:7,18,32-33,58,64`, `README.md:15,21`, `etc/oxlint-plugin-cell-architecture.api.md:21,27`, `src/rules/__tests__/` (12 cases for the survivor, 6 for the other).
- Removed-ID references in docs: `docs/plans/2026-08-23-001-*.md` (3 lines), `docs/plans/2026-09-04-1710-*.md:130`.
- `warn`: `packages/oxlint-presets/oxlint-config-recommended/src/index.ts:9-19,50-51,62-63`. The comment at `:62` says detection widened to modules "in active use", so a non-zero count is likely.
- Ignore entries: `packages/oxlint-presets/oxlint-config-dmmf/src/index.ts:69-95` and the identical list in `packages/oxlint-presets/oxlint-config-cell-architecture/src/index.ts`. Every package `lint` script runs `oxlint .` from its package directory. `packages/toolchain/{vitest-config,stryker-config,tsdown-config}` have no `lint` script, and no oxlint config covers `scripts/`, `packs/` or the repo root.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **`internal-export-jsdoc` survives.** Removing the other ID touches two historical plans. Removing this one would also touch two solution docs (`docs/solutions/build-errors/`, `docs/solutions/conventions/`). Both messageIds survive inside the merged rule, so each direction keeps its own diagnostic.
- KTD2. **Count `unstable-api-usage` from the existing lint output.** Build once, run the tree's own `lint` tasks, and count diagnostics for the rule. Warnings print today, so no config edit is needed to count. The count and the command go in the commit message that sets the severity.
- KTD3. **Per-entry producer table** (ruling Q10). Keep, with producer:

  | Entry                | Producer                                                                |
  | -------------------- | ----------------------------------------------------------------------- |
  | `**/node_modules/**` | pnpm                                                                    |
  | `**/dist/**`         | tsdown and turbo `build`                                                |
  | `**/.turbo/**`       | turbo                                                                   |
  | `**/coverage/**`     | vitest v8 coverage (`packages/toolchain/vitest-config/lib/base.js`)     |
  | `**/.stryker-tmp/**` | Stryker (`packages/toolchain/stryker-config/lib/base.js`)               |
  | `**/*.tsbuildinfo`   | `tsc -b`                                                                |
  | `**/.worktrees/**`   | worktrunk                                                               |
  | `**/.claude/**`      | Claude Code session state (`settings.local.json`)                       |
  | `**/repos/**`        | git subtree vendoring (`subtrees.toml`); must not be linted (`REPO-S3`) |

  Delete, no producer: `**/lib/**`, `**/esm/**`, `**/cjs/**`, `**/build/**`, `**/out/**`, `**/.tshy/**`, `**/.tshy-build/**`, `**/__pycache__/**` (no Python is tracked), `**/*.mjs` (tsdown's `.mjs` lands in `dist/`, already covered; the entry also hides the tracked source `packages/toolchain/tsdown-config/src/eager-entry-budget.mjs`, which newly lints nothing because that package has no `lint` script), `**/.opencode/**`, `**/.sisyphus/**`, `**/.repo/**`, `**/.issues/**`, `**/.papi/**`, `**/submodules/**`, and `**/*.d.ts` (no tool writes `.d.ts` outside `dist/` and `node_modules/`; the entry hides the hand-written `packages/runner/vitest/src/compat.d.ts`, which is U4's concern, not a reason to keep the entry). The same deletions apply to both lists.
- KTD4. **Instrument commits first, migration after** (ruling Q3, applied here by analogy). Each of U1 to U3 is its own commit, observed red before and green after. U3's before-state is a false negative (the AE9 violation is silent), so for U3 "red before" means "silent before". U4's fixes land in separate commits by a separate subagent.

### Assumptions

- Removing `**/lib/**` newly lints nothing, because neither package holding a tracked `lib/` has a `lint` script. It is deleted because it has no producer, not for coverage.

### Risks

- Deleting an entry can surface findings in files the maker does not own (`check-dts.mjs`, `child-script.mjs`, `compat.d.ts`). U4 owns those. If a finding is unfixable without loosening a rule, U4 stops and reports. A loosened rule or re-added entry is the cheat `ENFORCEMENT.md` forbids.
- `DEL1`'s `git grep` for the removed ID would match a plan that spells it out. This plan names that rule by its messageId instead.

---

## Implementation Units

### U1. Merge the `@internal` rules into `internal-export-jsdoc`

- **Goal:** R9.
- **Requirements:** R9; AE7, AE8.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/internal-export-jsdoc.ts`, `.config.ts`, the second rule's source, config and test files (deleted), `src/index.ts`, `README.md`, `etc/oxlint-plugin-cell-architecture.api.md` (regenerated by `api:update`), `src/rules/__tests__/internal-export-jsdoc.test.ts`, the two historical plans, and a `.changeset/` intent with a `major` bump for `@systemfsoftware/oxlint-plugin-cell-architecture`: the plugin no longer exports the removed rule ID (package-topology pack, `surface-changes-are-versioned.md`).
- **Approach:** the surviving rule visits the same export nodes and reports `missingInternalTag` inside an `internal` segment or `internalTagOutsideFolder` outside one, through the existing kernels. Its `meta.docs.description` states the biconditional. The second rule's RuleTester cases move into the survivor's test file only where they pin a behaviour the survivor's existing cases do not.
- **Execution note:** red first. Add the outside-direction cases to the survivor's test file and watch them fail before the rule changes.
- **Test scenarios:**
  - AE7 and AE8 as RuleTester cases.
  - A tagged export under `internal/` and an untagged export outside it are both silent.
  - A mid-sentence mention of `@internal` in a comment does not count as the tag, in either direction (the `REQUIRED_TAG`/`FORBIDDEN_TAG` start-of-line anchors).
- **Verification:** the package's `test` and `api:check` pass. A `git grep` for the removed ID outside `repos/` returns nothing.

### U2. Settle `effecttsgo/unstable-api-usage`

- **Goal:** R10.
- **Requirements:** R10.
- **Files:** `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`, a `.changeset/` intent.
- **Approach:** count per KTD2. Zero: set `error`. Otherwise set `off` and replace the "Advisory" comment with the reason and the count.
- **Test expectation:** none. This is a severity value in a config. The count, read from a real lint run, is the evidence.
- **Verification:** a `git grep` for a `'warn'` severity in tracked oxlint configs and presets returns nothing. At `error`: `pnpm lint` exits 0. At `off`: the entry is `'off'`, the reason and the count sit beside it, and `pnpm lint` exits 0.

### U3. Delete dead `ignorePatterns` entries

- **Goal:** R11.
- **Requirements:** R11; AE9.
- **Files:** `packages/oxlint-presets/oxlint-config-dmmf/src/index.ts`, `packages/oxlint-presets/oxlint-config-cell-architecture/src/index.ts`, a `.changeset/` intent per preset.
- **Approach:** apply KTD3 to both lists.
- **Execution note:** the AE9 scratch violation is shown silent before and reported after, then reverted.
- **Test expectation:** none beyond AE9. The ignore list is configuration, and AE9 is its observable consequence.
- **Verification:** AE9 holds. The full `lint` run lists every new finding. That list is U4's input and is not committed.

### U4. Fix newly exposed findings (separate subagent)

- **Goal:** the tree is clean under U1 to U3.
- **Requirements:** R9, R10, R11 hold with `pnpm check:local` green.
- **Dependencies:** U1, U2, U3.
- **Files:** only files that U1 to U3 newly flag. Expected candidates: `check-dts.mjs`, `child-script.mjs`, `compat.d.ts`, and any misplaced `@internal` tags.
- **Approach:** a subagent with fresh context receives the finding list and nothing else. It fixes code, never configuration or rules, one commit per package. An empty list skips this unit.
- **Test expectation:** none. The behaviour of the fixed files does not change: the observable protocol of `child-script.mjs` (its output lines, exit codes and signal handling) and the `dts:check` verdict of `check-dts.mjs` stay as they are. Their existing tests and the lint run are the evidence.
- **Verification:** `pnpm check:local` exits 0.

---

## Verification Contract

- `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test` and `api:check` exit 0.
- Carriage through the published artifact (`ENFORCEMENT.md` "Enrollment"): after `build`, AE7 and AE8 reproduce as scratch files in a consumer of `oxlint-config-recommended` under its own `lint` script, and the scratch files are removed afterwards.
- AE9 reproduces as stated.
- `pnpm check:local` exits 0 after the last edit (`REPO-D1`). The pull request is watched to green.
- No mutation run (`REPO-D3`).

## Definition of Done

- R9 to R11 hold, and every Verification Contract command passed after the last edit.
- Instrument commits (U1 to U3) and migration commits (U4) are separate, and U4's commits are by the separate subagent.
- One `.changeset/` intent per publishable package whose build hash moved, with consumer-observable bodies (`REPO-R2`).
- No scratch file, temporary config or probe remains in the tree.
