---
title: Lint Rule Hygiene - Plan
type: fix
date: 2026-10-09
supersedes: docs/plans/2026-10-08-2256-fix-lint-rule-hygiene-plan.md
topic: lint-rule-hygiene
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Lint Rule Hygiene - Plan

## Goal Capsule

- **Objective:** the shared lint configuration has no duplicate rule for the `@internal` tag, no warning-severity rule, and no ignore entry that hides source a tool did not produce.
- **Means:** merge the two `@internal` JSDoc rules into `internal-export-jsdoc`, settle `effecttsgo/unstable-api-usage` at `error` or `off`, delete the dead `ignorePatterns` entries, and keep one ignore list, owned by `oxlint-config-rule-authoring` and imported by `oxlint-config-dmmf`, `oxlint-config-cell-architecture` and `oxlint-config-recommended`.
- **Authority:** conductor rulings 01 to 04 on the 2026-10-08 harness brainstorm. Doctrine: `repos/constitution/ENFORCEMENT.md` ("Changing an instrument", "Enrollment"), `CONST-E9`, `DEL1`. This is layer 2 of three independent pull requests, cut from `main` and not stacked on the others.
- **Stop conditions:** stop and report if U1 to U3 newly flag any file in this repository, if U4 cannot fix a finding without loosening a rule, or if the `unstable-api-usage` count cannot be produced from a real lint run.
- **Execution profile:** the maker writes the instrument changes (U1 to U3). Any finding the changed instrument newly raises in tree code is fixed by a separate subagent with fresh context (U4), never by the maker (`CONST-E9`).
- **Ships as:** one pull request with this plan as its only plan file (`REPO-D2`).

---

## Product Contract

### Summary

The `@internal` tag has one rule enforcing both directions of its invariant. The one `warn` severity becomes a decision. Ignore entries that match nothing a tool here produces are deleted, and the presets carry one shared list instead of three copies.

### Problem Frame

Two rules in `oxlint-plugin-cell-architecture` enforce the two directions of one predicate: an export carries `@internal` if and only if its path has an `internal` segment. Both are `error` in the same recommended map (`src/index.ts:32-33`) and share their kernels (`internal-jsdoc.ts`, `internal-path.ts`).

`effecttsgo/unstable-api-usage` is the only configured `warn` in the tree (`packages/oxlint-presets/oxlint-config-recommended/src/index.ts:63`). It is written after the `promoteWarnToError` spreads, so promotion never reaches it. A warning fails no command, and `ENFORCEMENT.md` forbids it.

Four presets put an `ignorePatterns` list on their default config: `oxlint-config-rule-authoring`, `oxlint-config-dmmf` and `oxlint-config-cell-architecture` each hand-wrote one, and `oxlint-config-recommended` imports and spreads dmmf's. Fifteen entries match nothing a tool here produces, and `**/*.d.ts` is a sixteenth (KTD3). No package lint run in this repository honours any of these lists: every package config, including each preset's own, consumes a preset through `extends`, and oxlint 1.82 does not carry `ignorePatterns` through `extends` (`docs/solutions/build-errors/oxlint-extends-drops-ignore-patterns.md`). The lists are still published surface: consumers outside this repository spread `recommended.ignorePatterns` into their own config, and that form honours them.

### Key Decisions

- **One rule, the biconditional.** The pair merges into `internal-export-jsdoc`, and the other ID is removed everywhere with no alias. Governs R9. (session-settled: user-directed — chosen over keeping both rules: two rules for one predicate is the duplicate the audit flagged)
- **`warn` resolves by finding count.** Zero findings over the tree: `error`. Any findings: `off`, with the reason named beside the entry. Governs R10. (session-settled: user-directed — chosen over leaving `warn`: `ENFORCEMENT.md` "warn is forbidden: error with a clean tree, or off with the reason named")
- **Each surviving ignore entry names one producer.** Governs R11. (session-settled: user-directed — chosen over a blanket keep: an entry with no producer only hides source)
- **`schema-declaration-location` is untouched.** No defect was reproduced. The duplicated `WORKFLOW_FILE_BASENAME` regex stays too. (session-settled: user-directed — chosen over a speculative refactor: not a confirmed defect)

### Requirements

- R9. `internal-export-jsdoc` enforces both directions of the `@internal` invariant. The second `@internal` rule (the one reporting `internalTagOutsideFolder`) no longer exists in code, recommended maps, READMEs, API reports or docs.
- R10. No configured rule severity is `warn`.
- R11. Every `ignorePatterns` entry a preset carries names output a tool in this repository produces, or a tree that must not be linted. Entries with neither are deleted. The list exists once, in `oxlint-config-rule-authoring`, and the other presets import it.

### Acceptance Examples

- AE7. An untagged export under `internal/`.
  - **Covers R9.** **Given** `src/internal/x.ts` exporting a function with no `@internal` tag. **Then** `internal-export-jsdoc` reports `missingInternalTag`.
- AE8. A tagged export outside `internal/`.
  - **Covers R9.** **Given** `src/x.ts` exporting a function tagged `@internal`. **Then** `internal-export-jsdoc` reports `internalTagOutsideFolder`, and no other rule reports it.
- AE9. A consumer that spreads the preset list.
  - **Covers R11.** **Given** a config of the form `defineConfig({ extends: [recommended], ignorePatterns: [...recommended.ignorePatterns] })`, a scratch `debugger` in a hand-written `.mjs` file and another under a `repos/` directory (scratch, removed). **When** oxlint runs with that config. **Then** the `.mjs` violation is reported and the `repos/` one is not. A config that only lists the preset under `extends` reports both, before and after this change.

### Scope Boundaries

- No new lint rule, CI grep or guard.
- `schema-declaration-location`, the `WORKFLOW_FILE_BASENAME` regex, per-package complexity relaxations and `model-fixture-imports-subject` are out of scope (rulings Q4, Q6).
- No new ignore entries for gitignored outputs that are missing today (`.vitest/`, `reports/`, `__tmp__/`, `temp/`). R11 deletes dead entries; it does not complete the list.

### Sources / Research

- `@internal` pair: `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/internal-export-jsdoc.ts`, `internal-jsdoc.ts`, `internal-path.ts`, `src/index.ts:7,18,32-33,58,64`, `README.md:15,21`, `etc/oxlint-plugin-cell-architecture.api.md:21,27`, `src/rules/__tests__/` (12 cases for the survivor, 6 for the other).
- Removed-ID references in docs: `docs/plans/2026-08-23-001-*.md` (3 lines), `docs/plans/2026-09-04-1710-*.md:130`.
- `warn`: `packages/oxlint-presets/oxlint-config-recommended/src/index.ts:9-19,50-51,62-63`. The comment at `:62` says detection widened to modules "in active use", so a non-zero count is likely.
- Ignore entries: the one list now lives at `packages/oxlint-presets/oxlint-config-rule-authoring/src/index.ts:7-17`. Before this change, the dmmf list was at `packages/oxlint-presets/oxlint-config-dmmf/src/index.ts:69-95` at commit `e3e1ca688e`, and `oxlint-config-cell-architecture/src/index.ts` held an identical list there. Every package `lint` script runs `oxlint .` from its package directory. `packages/toolchain/{vitest-config,stryker-config,tsdown-config}` have no `lint` script, and no oxlint config covers `scripts/`, `packs/` or the repo root.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **`internal-export-jsdoc` survives.** Removing this one would touch two solution docs (`docs/solutions/build-errors/`, `docs/solutions/conventions/`). Dated plans that name the other ID are historical records and stay as written (ruling 04). Both messageIds survive inside the merged rule, so each direction keeps its own diagnostic.
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

  Delete, no producer: `**/lib/**`, `**/esm/**`, `**/cjs/**`, `**/build/**`, `**/out/**`, `**/.tshy/**`, `**/.tshy-build/**`, `**/__pycache__/**` (no Python is tracked), `**/*.mjs` (tsdown's `.mjs` lands in `dist/`, already covered), `**/.opencode/**`, `**/.sisyphus/**`, `**/.repo/**`, `**/.issues/**`, `**/.papi/**`, `**/submodules/**`, and `**/*.d.ts` (no tool writes `.d.ts` outside `dist/` and `node_modules/`). The kept list lives in `oxlint-config-rule-authoring`, the only preset with no preset dependency, and the other three import it; their named `ignorePatterns` exports go.
- KTD4. **Instrument commits first, migration after** (ruling Q3, applied here by analogy). Each of U1 to U3 is its own commit. U3 newly flags nothing in this repository, because no package lint run honours a preset list, so U4 has no input.

### Assumptions

- Removing `**/lib/**` newly lints nothing, because neither package holding a tracked `lib/` has a `lint` script. It is deleted because it has no producer, not for coverage.

### Risks

- A spreading consumer outside this repository newly lints hand-written `.mjs` and `.d.ts` files. The four presets take a `major` bump with the migration named in the changeset.
- A consumer that imports the named `ignorePatterns` from `oxlint-config-dmmf` or `oxlint-config-cell-architecture` no longer resolves it. Both take a `major` bump whose changeset names `oxlint-config-rule-authoring` as the new source.
- `DEL1`'s `git grep` for the removed ID matches the two dated plans. That is intended (ruling 04); the grep's scope excludes `docs/plans/`.

---

## Implementation Units

### U1. Merge the `@internal` rules into `internal-export-jsdoc`

- **Goal:** R9.
- **Requirements:** R9; AE7, AE8.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/internal-export-jsdoc.ts`, `.config.ts`, the second rule's source, config and test files (deleted), `src/index.ts`, `README.md`, `etc/oxlint-plugin-cell-architecture.api.md` (regenerated by `api:update`), `src/rules/__tests__/internal-export-jsdoc.test.ts`, and a `.changeset/` intent with a `major` bump for `@systemfsoftware/oxlint-plugin-cell-architecture`: the plugin no longer exports the removed rule ID (package-topology pack, `surface-changes-are-versioned.md`).
- **Approach:** the surviving rule visits the same export nodes and reports `missingInternalTag` inside an `internal` segment or `internalTagOutsideFolder` outside one, through the existing kernels. Its `meta.docs.description` states the biconditional. The second rule's RuleTester cases move into the survivor's test file only where they pin a behaviour the survivor's existing cases do not.
- **Execution note:** red first. Add the outside-direction cases to the survivor's test file and watch them fail before the rule changes.
- **Test scenarios:**
  - AE7 and AE8 as RuleTester cases.
  - A tagged export under `internal/` and an untagged export outside it are both silent.
  - A mid-sentence mention of `@internal` in a comment does not count as the tag, in either direction (the `REQUIRED_TAG`/`FORBIDDEN_TAG` start-of-line anchors).
- **Verification:** the package's `test` and `api:check` pass. A `git grep` for the removed ID outside `repos/` and `docs/plans/` returns nothing.

### U2. Settle `effecttsgo/unstable-api-usage`

- **Goal:** R10.
- **Requirements:** R10.
- **Files:** `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`, a `.changeset/` intent.
- **Approach:** count per KTD2. Zero: set `error`. Otherwise set `off` and replace the "Advisory" comment with the reason and the count.
- **Test expectation:** none. This is a severity value in a config. The count, read from a real lint run, is the evidence.
- **Verification:** a `git grep` for a `'warn'` severity in tracked oxlint configs and presets returns nothing. At `error`: `pnpm lint` exits 0. At `off`: the entry is `'off'`, the reason and the count sit beside it, and `pnpm lint` exits 0.

### U3. Delete dead `ignorePatterns` entries and keep one list

- **Goal:** R11.
- **Requirements:** R11; AE9.
- **Files:** the `src/index.ts` and `package.json` of `oxlint-config-rule-authoring`, `oxlint-config-dmmf`, `oxlint-config-cell-architecture` and `oxlint-config-recommended`, `pnpm-lock.yaml`, and `.changeset/` intents.
- **Approach:** apply KTD3. `oxlint-config-rule-authoring` exports the kept list; the other three depend on it at runtime and import it onto their default configs.
- **Execution note:** AE9 runs with a scratch spread config and is removed afterwards.
- **Test expectation:** none beyond AE9. The ignore list is configuration, and AE9 is its observable consequence.
- **Verification:** AE9 holds. The full tree `lint` run reports no finding absent on `main`.

### U4. Fix newly exposed findings (separate subagent)

- **Goal:** the tree is clean under U1 to U3.
- **Dependencies:** U1, U2, U3.
- **Runs only if** U1 to U3 newly flag tree code; that is also a stop condition, so the conductor rules before U4 starts.
- **Approach:** a subagent with fresh context receives the finding list and nothing else. It fixes code, never configuration or rules, one commit per package.
- **Verification:** `pnpm check:local` exits 0.

---

## Verification Contract

- `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test` and `api:check` exit 0.
- Carriage through the published artifact (`ENFORCEMENT.md` "Enrollment"): after `build`, AE7 and AE8 reproduce as scratch files in a consumer of `oxlint-config-recommended` under its own `lint` script, and the scratch files are removed afterwards.
- AE9 reproduces as stated, through the built `oxlint-config-recommended`.
- `pnpm check:local` exits 0 after the last edit (`REPO-D1`). The pull request is watched to green.
- No mutation run (`REPO-D3`).

## Definition of Done

- R9 to R11 hold, and every Verification Contract command passed after the last edit.
- Instrument commits (U1 to U3) and any U4 migration commits are separate, and U4's commits are by the separate subagent.
- One `.changeset/` intent per publishable package whose build hash moved, with consumer-observable bodies (`REPO-R2`).
- No scratch file, temporary config or probe remains in the tree.
