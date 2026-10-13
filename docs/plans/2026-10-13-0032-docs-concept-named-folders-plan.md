---
title: Concept-named packages and folders - Plan
type: docs
date: 2026-10-13
topic: concept-named-folders
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Concept-named packages and folders - Plan

## Goal Capsule

- **Objective:** a package, family folder or first-party folder that any repository enrolling `package-topology` adds, renames or moves is named for the one concept it owns. A reviewer can refuse a role word from the diff alone.
- **Means:** a package-topology rule (R1-R6) whose gate is `review`; REPO-S5's pointer to it (R7) follows in a later pull request.
- **Product authority:** the root's intent of 2026-10-13 ("strengthen `compound-packs/package-topology/` with a rule that refuses package, family-folder, and other folder names that communicate no checkable concept"), then this plan. The root chose a `review` gate on 2026-10-13 after doc review showed a CI lane conflicts with an enrolled pack rule (Key Decisions).
- **Stop conditions:** evidence that a listed word names a concept somewhere in first-party code.
- **Delivery:** one pull request off `main`, sharing no file with any other open pull request; the root owns the merge. R7 edits `AGENTS.md`, which #743 and #736 also edit, so the root deferred it on 2026-10-13 to a one-line follow-up after both land.
- **Open blockers:** none.

## Product Contract

### Summary

Add a package-topology rule that a package, family folder or first-party folder is named for the one concept it owns, never for a role, layer or mechanism. The rule carries a closed list of words that fail on sight and a check question for every other name. Point REPO-S5 at the rule instead of restating it.

### Problem Frame

Role-word folders recur in this organisation, and each one costs a restructure.

- On 2026-09-05, packages sat in role tiers: `packages/core/effect/*`, `packages/lint`, `packages/testing` (`e686ab9b1:pnpm-workspace.yaml:100`). Undoing it, #357 (`02c393fcf4`), touched 1,339 files. CONST-N1 cites it as its WRONG example (`CONSTITUTION.md:47`).
- On 2026-08-23, a package was published as `@systemfsoftware/arethetypeswrong-core` (`01696895c:packages/testing/type-testing/arethetypeswrong/core/package.json:2`); #241 (`3d6aa9f9e1`) split it into packages named for their capabilities.
- On 2026-10-12, a private product repository grew a `core/` folder holding a daemon, a CLI, an SDK, code generation and end-to-end tests. Beside it was a `ui/shell` package whose description listed the Vite entry, providers, frame, root routes and conversation UI. Neither name says what a reader could check is inside.
- The stryker packages plan wrote the lint rule for one change (`docs/plans/2026-08-08-001-refactor-capability-named-stryker-packages-plan.md:249-255`) and renamed `src/di/`, `src/fs/`, `src/process/` and dissolved `utils/` under it (`:511-533`). After the rule was deleted, the attw split plan restated the ban by hand (`docs/plans/2026-08-23-002-refactor-attw-package-split-plan.md:50`).

The law exists. CONST-N1 asks that a name "answer 'of what?'", and the vendored constitution's check fails "Layer names (core, shell), junk drawers (util, service, manager)" (`repos/constitution/ENFORCEMENT.md:127-128`). This repository once enforced it: the oxlint rule `capability-named-directory` was added and enabled everywhere on 2026-08-08 (`a43886dbeb`, `f3a5e38635`) and deleted on 2026-08-16 with the thirteen-package cell-role rule fleet (`166e6bb655`, 31,465 lines removed), a subtraction of the fleet rather than a ruling on that rule. Since then no pack rule applies the law at review, and REPO-S5 says only "Never add a grab-bag folder" (`AGENTS.md:62`).

### Key Decisions

- **Placement in `package-topology`, with its subject widened to what a package is named and where it lives.** The root chose the pack; a package's unscoped npm name is its directory name (REPO-S5), so naming is part of what a published package is. Governs R1, R6.
- **The gate is `review`; no CI lane.** A lane that checks this repository's own folder names in CI is a job "whose subject is the repo's own docs, plans or layout", which the enrolled `compound-packs/ci-wall-clock/no-lane-grades-the-repos-own-docs.md` refuses, and the planned lane copied the wiring of `single-plan`, the lane that rule names as condemned. A pre-push-only form was weighed and declined: `--no-verify` passes it. The root chose `review`. The rule's check question works from paths a diff shows, so every enrolling repository gets the same gate. Governs R5.
- **The closed list is the one this repository enforced before, plus `libs` and `adapter`/`adapters`.** `capability-named-directory` refused `core`, `shell`, `util(s)`, `service(s)`, `manager(s)`, `helper(s)`, `common`, `shared`, `misc`, `lib`, `di`, `fs` and `impl` (`a43886dbeb:packages/oxlint-plugins/cell-taxonomy/src/rules/capability-named-directory.config.ts:3-36`). `adapter`/`adapters` join them: the attw plan banned both by hand (`docs/plans/2026-08-23-002-refactor-attw-package-split-plan.md:50`), and cell-architecture forbids an `adapters/` folder (`compound-packs/cell-architecture/service-and-layer-boundaries.md:29`); the stryker plan renamed `src/di/` and `src/fs/` under the same law. No first-party folder at `origin/main` (`763fd66399`) uses any of these words for a concept. `sandbox` stays off: `effect-microsandbox` ships `src/SandboxRuntime.ts`, so the word names a concept here. Governs R3.
- **Scope: every first-party folder, `src/` subfolders included; vendored `repos/*`, test roots and generated trees excluded.** `repos/` is read-only third-party code (REPO-S3, `AGENTS.md:60`) with 32 folders whose own name is a listed word. Test roots (`__tests__`, `test`, `tests`, `__mocks__`, `fixtures`, `__fixtures__`, `testResources`) follow the deleted rule's reasoned exemption: "A test helper is reached from the test that imports it, not by navigating the product tree" (`…capability-named-directory.config.ts:38-54`). Governs R2.
- **A folder is judged by its own name.** An ancestor is judged when it is itself added, renamed or moved, so `src/core/formatters/` is refused for `core`, not for `formatters`. Governs R3.
- **Existing occurrences are findings, not exceptions.** Four first-party folders at `763fd66399` carry a listed word. A change that adds a file inside one renames that folder first, in the same change or a lower stacked layer, so ordinary work closes them and the rule names none of them as allowed. Governs R4, R8.
- **Layer words stay lawful in prose and fail as names.** CONST-B1 and CONST-B4 use "core" and "shell" for the decision and I/O regimes (`CONSTITUTION.md:31-42`), while the N1 check fails them as names (`repos/constitution/ENFORCEMENT.md:128`). Governs R3.
- **One source: REPO-S5 points at the rule, in a follow-up.** REPO-S5 keeps placement (where a package lives, when a family folder exists) as root law; its "grab-bag" clause becomes a pointer (CONST-S4). Its second clause, on directory segments a path-matching lint rule treats specially, is placement law and stays. Until the follow-up lands, REPO-S5's "Never add a grab-bag folder" agrees with the rule. Governs R7.

### Requirements

**The rule**

- R1. A new package-topology rule states that a package, family folder or first-party folder is named for the one concept it owns, and refuses a name that states a role, layer or mechanism instead, citing CONST-N1's "of what?" (`CONSTITUTION.md:43-48`) rather than restating it.
- R2. The rule applies to any added, renamed or moved package, family folder, or folder at any depth, `src/` subfolders included, outside vendored `repos/*`, `node_modules`, `dist`, and test roots (`__tests__`, `test`, `tests`, `__mocks__`, `fixtures`, `__fixtures__`, `testResources`).
- R3. The rule carries a closed list that fails on sight: `core`, `shell`, `util`/`utils`, `service`/`services`, `manager`/`managers`, `helper`/`helpers`, `common`, `shared`, `misc`, `lib`/`libs`, `adapter`/`adapters`, `di`, `fs`, `impl`. A word matches the folder's own name, or any part of it split on `-`, `_` or `.`, in any case. A name outside the list still fails when the folder's contents share no concept the name states. Prose may name an architectural layer (a functional core, an imperative shell); a folder or package name may not stand in for the concept it owns.
- R4. A change that adds a file inside a folder whose own name is on the list renames that folder first, in the same change or a lower stacked layer.
- R5. The rule has the pack's exact format: frontmatter `title`, `applies_when` (any new package, family folder or folder; any rename or move of one; adding a file inside a folder named by a listed word) and `tags`; one WRONG/RIGHT pair from the anonymised 2026-10-12 pattern; a closing `Gate: review` line whose question a reviewer answers from the diff's paths and `package.json` names alone.
- R6. The package-topology README indexes the rule, and its subject line covers naming.

**Ownership and findings**

- R7. Deferred to a follow-up pull request: REPO-S5 keeps its placement law and replaces "Never add a grab-bag folder" with a pointer to the new rule; its gate stays `review`.
- R8. Today's four findings are recorded here for later small rename PRs, outside this change: `packages/sim/differential-spec/src/core`, `packages/toolchain/stryker-config/lib`, `packages/toolchain/vitest-config/lib` and `packages/microvm-test-images/lib`.

### Acceptance Examples

- AE1. **Covers R2, R3.** A diff adds `packages/foo/src/utils/format.ts`: the reviewer refuses `utils` and asks what the folder owns.
- AE2. **Covers R4.** A diff adds a file inside the existing `packages/sim/differential-spec/src/core/`: the reviewer asks for `core` to be renamed first, in this change or a lower layer.
- AE3. **Covers R2, R3.** A diff moves `packages/sim/differential-spec` to `packages/sim/diff-spec`: `src/core` arrives at a new path and is refused, so the move renames it.
- AE4. **Covers R3.** A diff adds `@systemfsoftware/trace-shared`: refused on `shared`. `@systemfsoftware/effect-microsandbox` holds, because `microsandbox` is one word and `sandbox` is not listed.
- AE5. **Covers R2.** A subtree update adds `repos/effect/packages/effect/src/internal/core/`, or a diff adds `src/__tests__/helpers/`: neither is judged.
- AE6. **Covers R3.** A diff adds `src/core/` holding pure workflows and `src/shell/` (or `src/adapters/`) holding I/O: all are refused. The split lives in modules: an adapter module sits flat beside its service module inside a folder named for the concept both serve, such as `src/pricing/`.
- AE7. **Covers R3.** A diff adds `src/core/formatters/`: refused for `core`. A diff adds `formatters/` inside an existing listed folder: R4 applies to that folder.

### Scope Boundaries

- Renaming the four findings (R8) is out of this change; each is a later small PR, or the lower layer of the next change that touches it (R4).
- No pack rule governs a role-word file basename today; cell-architecture governs suffixes (`*.workflow.ts`, `*.schema.ts`) only. One first-party basename is on the list (`packages/oxlint-presets/oxlint-config-recommended/ui-state-fixture/src/shell.ts`). Files stay outside this rule.
- Words with a concept reading here stay off the list and fall to R3's review half: `kernel` in the simulation family, `internal` (a visibility marker the exports map can check), `base`, `tools`, `sandbox`.
- No lint rule, repo-checks lane, CI job or hook (Key Decisions).

### Sources / Research

- Pack format: `compound-packs/package-topology/*.md` (frontmatter `title`/`applies_when`/`tags`, prose, an optional fenced WRONG/RIGHT, a closing `Gate:` line); README subject at `compound-packs/package-topology/README.md:3`.
- The deleted rule: `a43886dbeb` (added), `f3a5e38635` (enabled everywhere), `166e6bb655` (deleted with the fleet).
- External: Dave Cheney, "Avoid package names like base, util, or common" (https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common): utility packages are where "helpers and utility code congeal", and "their utility is hard to describe in terms of what the package provides".
- REPO-S5's origin: `docs/plans/2026-09-25-0309-refactor-package-families-plan.md:37-38,66`.
- Doc review of the earlier draft (four personas and a blind DeepSeek V4.1 Flash peer): the lane conflicted with `ci-wall-clock`; the gate history, `sandbox`, the leaf-versus-path reading, the move case and the `repos/` count are folded in above. The full-path code review of `11a2c007d7` confirmed two findings (an `adapters/` example cell-architecture forbids, and a citation to a blank line), both fixed; its correctness lens added `__fixtures__` and `testResources` to the test roots.

## Planning Contract

### Key Technical Decisions

- KTD1. **One rule file, `compound-packs/package-topology/concept-named-folders.md`,** shaped like `import-time-inertness.md`: prose, one fenced WRONG/RIGHT in neutral code, a closing `Gate:` line. Governs R1-R5.
- KTD2. **The WRONG/RIGHT pair is a directory tree**, the anonymised 2026-10-12 pattern with no repository name, scope or path; #357 and #241 are cited in prose by public commit.
- KTD3. **No tests.** The change is pack text; nothing executes it (test-layer-selection: no runtime behaviour to admit).

## Implementation Units

### U1. The rule and its README line

- **Goal:** R1-R6.
- **Files:** `compound-packs/package-topology/concept-named-folders.md` (new), `compound-packs/package-topology/README.md`.

## Verification Contract

- Every new in-repo citation (`<sha>:<path>:<line>` and `path:line`) resolves to the quoted text.
- The CE pack resolver (`skills/ce-plan/scripts/packs-resolve.py` in the compound-engineering plugin, run from the repository root) lists `concept-named-folders.md` under the `package-topology` root with empty `errors` and `warnings`.
- `pnpm check:local` after the last edit (the `/dev/kvm` microVM suite runs in CI).
- The full-path `ce-code-review` receipt lists every loaded pack and each matched pack and constitution rule's disposition, with a blind DeepSeek or MiniMax peer; a privacy grep over changed files, commit messages and the PR body finds no private name, path, PR number or run id; CI is green on the final head.

## Definition of Done

- U1 and this plan landed in one pull request; R7 is recorded as the follow-up.
- Every Verification Contract item passed on the final head; no throwaway branch, commit or scratch file left behind.
