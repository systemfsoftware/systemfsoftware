---
title: Durable solution docs and the problem_type stream rule - Plan
type: docs
date: 2026-09-25
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Durable solution docs and the problem_type stream rule - Plan

## Goal Capsule

- **Objective:** An agent researching `docs/solutions/` finds only learnings whose failure can still happen in this repository, each citing names that survive a file move, and every doc is reachable by the `problem_type` value the learnings search routes on.
- **Means:** subtraction first, then consolidation, then citation repair (KD1, KD2, KD3), plus one repo stream rule that stops a wrong `problem_type` at write time (KD4, KTD1).
- **Authority:** `AGENTS.md` repo rules and `repos/constitution/ENFORCEMENT.md` for the instrument commit, then this plan's Product Contract, then its Planning Contract.
- **Stop conditions:** a deletion whose failure is shown to still recur in the current tree; a citation fix that needs a fact the doc does not carry; the stream rule failing its precision/recall floors.
- **Execution profile:** the doc edits already sit in the working tree of branch `docs/solutions-durability`; execution verifies each unit against its acceptance, repairs any defect found, and lands one commit per unit.

## Product Contract

### Summary

Delete the solution docs whose failure can no longer occur here, fold three overlapping groups into one survivor each, replace brittle repo-path and line-number citations with package names and exported symbols, give every doc a valid `problem_type`, and ship a repo-local TTSR rule that rejects any `problem_type` outside the 17-value enum.

### Problem Frame

`docs/solutions/` held 126 docs on `main`. Many described failures in code that has since been removed or moved to other repositories, so a researching agent followed advice for a system that no longer exists. Citations like `file.ts:42` and repo-relative paths rotted with every package regroup (#532). An earlier bulk rewrite by a scripted agent pass invented package names, cut sentences, and added frontmatter; that pass was reverted, and the surviving edits were redone by hand. Four docs carried `problem_type: architecture-pattern` and nine carried no `problem_type` at all, so the learnings researcher's exact-value `problem_type` search never returned them.

### Key Decisions

- KD1. **Delete a doc when its failure cannot recur in this repository, regardless of its quality.** (session-settled: user-directed — chosen over polishing every doc in scope: effort spent refreshing docs about deleted code was the wrong target.) Governs R1.
- KD2. **Merge each overlapping group into one survivor that keeps every unique fact once.** (session-settled: user-approved — chosen over keeping the overlapping docs side by side: each copy drifted independently.) Governs R2.
- KD3. **Solution docs cite packages, exported symbols, rule ids, or bare doc edges; never repo-relative code paths, `file:line` coordinates, or present-tense version and count snapshots.** (session-settled: user-directed — chosen over path-and-line citations: they need constant updates after every move.) Governs R3.
- KD4. **Enforce the `problem_type` enum with a stream rule only; add no deterministic docs gate to `check:local`.** (session-settled: user-directed — chosen over a docs check wired into `check:local`: `AGENTS.md` classes `docs/solutions/` as Doctrine, never an input to a gate.) Governs R5.

### Requirements

**Subtraction**

- R1. Every doc deleted in this change describes a failure whose mechanism is absent from the current tree, and no file outside `docs/plans/` links to a deleted doc.
- R2. The three overlap groups (turbo cache keys, changeset requirement keys, pnpm changeset ledger) each end as one survivor that is shorter than the sum of its inputs and loses no unique fact.

**Durability**

- R3. Every modified doc's prose satisfies KD3, and every `@systemfsoftware/...` name it cites is a real workspace package or catalog entry.
- R4. No modified doc gains frontmatter keys, loses a sentence mid-thought, or changes a quoted log, command, or code block, except where the quoted material named a package that has since been renamed. Quoted material is evidence and is exempt from R3.

**Discoverability**

- R5. Every doc declares a `problem_type` that is one of the 17 enum values, and a write or edit that sets any other value under `docs/solutions/` triggers the repo stream rule.

### Scope Boundaries

- The `tooling-decisions/` reorganization (13 docs filed under the wrong category) is out; it waits on an owner decision.
- The scripted markdown-rewrite stream rule is out: it scored precision 0.86 and recall 0.83 on 9,394 real calls, below the floor.
- User-local changes under `~/.omp/agent/` (the citation rule and the `ttsr-rules` skill) are not repository files and do not ship here.
- The incidental `scripts/deno.lock` drift from local script runs is not part of this change.

## Planning Contract

### Key Technical Decisions

- KTD1. **The rule lives at `.omp/rules/solution-problem-type-enum.md` with its labeled corpus at `.omp/rules-corpus/solution-problem-type-enum.json`, and it never interrupts (`interruptMode: never`).** A wrong value is reversible by the next edit, so an abort buys nothing. The corpus is committed beside the rule so a later edit can be re-measured. Instantiates KD4; governs R5.
- KTD2. **The four hyphenated values and the missing keys are corrected first; the rule and its corpus then land alone in their own commit.** `repos/constitution/ENFORCEMENT.md` requires enrollment over a clean tree (migrate every live violation first) and an instrument change that lands alone, observed failing before and passing after. For a stream rule, "failing before" means it fires on a write that sets `architecture-pattern`; "passing after" means it stays silent on the corrected value.

### Assumptions

- The researcher's `problem_type` search arm matches exact enum values, so a doc with an invalid or missing value drops out of that arm and is reached only through its title, tags, or module. The 17 values mirror the compound-engineering `yaml-schema.md` enum; when that plugin changes the enum, the rule's value list is re-derived from it.
- Link integrity is checked by a repo-wide search for each deleted doc's `<basename>.md`; `docs/plans/` may keep historical references.

## Implementation Units

### U1. Delete non-recurring solution docs

- **Goal:** remove the 24 docs whose failure cannot recur here and cut every link to them.
- **Requirements:** R1 (KD1).
- **Dependencies:** none.
- **Files:** the deleted docs under `docs/solutions/{architecture-patterns,build-errors,integration-issues,logic-errors,performance-issues,runtime-errors,test-failures,tooling-decisions}/`, plus each surviving doc whose `Related` list pointed at one.
- **Approach:** for each deleted doc, confirm its mechanism is gone: the code, package, hook, or tool it describes no longer exists in the tree. Remove `Related` entries that point at a deleted doc, and drop a `Related` heading left empty.
- **Test expectation:** none -- documentation deletion; verified by the link scan below.
- **Verification:** a repo-wide search for every deleted doc's `<basename>.md` finds no hit outside `docs/plans/`.

### U2. Consolidate overlapping docs

- **Goal:** fold three groups into one survivor each.
- **Requirements:** R2 (KD2).
- **Dependencies:** U1.
- **Files:** survivors `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md`, `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`, `docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md`. The absorbed docs are deleted: `performance-issues/turbo-cache-never-warm.md`, `build-errors/stale-api-report-outlives-toolchain.md`, `build-errors/changeset-gate-transitive-build-hash.md`, `tooling-decisions/pnpm-registry-changelogs-persistence-and-synthesis.md`.
- **Approach:** each survivor keeps every unique fact from its inputs once. That includes fix commit references such as `f3c9982155` in the turbo survivor. Links to the absorbed docs are re-pointed to the survivor.
- **Test expectation:** none -- documentation consolidation.
- **Verification:** each survivor is shorter than the sum of its inputs, and a spot check of each absorbed doc's distinctive claims finds each one in its survivor.

### U3. Replace brittle citations

- **Goal:** make the remaining modified docs meet KD3.
- **Requirements:** R3, R4 (KD3).
- **Dependencies:** U1, U2.
- **Files:** the modified docs under `docs/solutions/` not covered by U2 or U5.
- **Approach:** compare each modified doc with `HEAD` and check five defects: an invented package name, a sentence ending mid-thought, added frontmatter keys, edited quoted evidence, and a `file:line` coordinate or repo-relative code path left in prose. Repair each by hand from the doc's own facts. A citation into a vendored `repos/` tree becomes the upstream package name plus the symbol (for example `effect`'s `TestClock`). Where no fact supports a repair of an introduced defect, restore the `HEAD` text.
- **Test expectation:** none -- documentation edits.
- **Verification:** every `@systemfsoftware/...` name in the added lines resolves to a workspace `package.json` name or a `pnpm-workspace.yaml` catalog entry. No added line ends in `...`. No frontmatter key was added. No prose line outside a code fence carries a `file:line` coordinate or a `packages/`, `repos/`, `scripts/`, or `apps/` code path. `./bin/dprint check` passes on the touched docs.

### U4. Add the problem_type stream rule

- **Goal:** stop an invalid `problem_type` at write time.
- **Requirements:** R5 (KD4, KTD1, KTD2).
- **Dependencies:** U5.
- **Files:** `.omp/rules/solution-problem-type-enum.md`, `.omp/rules-corpus/solution-problem-type-enum.json`.
- **Approach:** ship the rule and corpus as written, except the body's harm sentence, which states that a wrong value drops the doc from the researcher's `problem_type` search, not from every search. The commit contains only these two files.
- **Test scenarios:**
  - A `write` to `docs/solutions/architecture-patterns/x.md` whose frontmatter sets `problem_type: architecture-pattern` fires the rule.
  - The same write with `problem_type: architecture_pattern` does not fire.
  - An `edit` whose `old_string` holds the invalid value and whose `new_string` holds a valid one does not fire.
  - Prose or a code span naming `problem_type` without a frontmatter assignment does not fire.
- **Verification:** the `ttsr-rules` skill's `scripts/check_ttsr_rule.ts` passes the rule. Its `scripts/ttsr_precision_recall.ts` scores the corpus at precision ≥ 0.95 and recall ≥ 0.80 over ≥ 50 cases, with `exact-violation` recall 1.0. `omp ttsr list --json` run from the repo root lists the rule with its declared scope and condition unchanged.

### U5. Give every doc a valid problem_type

- **Goal:** make every solution doc reachable through the researcher's `problem_type` search.
- **Requirements:** R5.
- **Dependencies:** none.
- **Files:** the four hyphenated docs `docs/solutions/architecture-patterns/provenance-ritual-gates.md`, `docs/solutions/architecture-patterns/workflow-error-channel-gates.md`, `docs/solutions/architecture-patterns/workflow-success-channel-tagged-union.md`, `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`. Also the nine `docs/solutions/architecture-patterns/` docs with no `problem_type` key: `a-law-floor-must-be-structural.md`, `an-escape-hatch-is-an-unfalsified-hypothesis.md`, `an-exported-schema-costs-its-obligation-tree.md`, `cross-field-schema-invariants-and-arbitrary-derivation.md`, `exported-live-state-is-not-structurally-decidable.md`, `label-routed-rules-are-unfalsifiable.md`, `make-boundary-owns-a-decision.md`, `rename-branch-meets-upstream-refactor.md`, `repetition-cannot-observe-constant-io.md`.
- **Approach:** set `problem_type: architecture_pattern` on the four hyphenated docs. For each doc missing the key, add the enum value its content fits, using the compound-engineering category mapping; for these docs that is `architecture_pattern` unless the doc records a defect.
- **Test expectation:** none -- frontmatter value correction; covered by the U4 corpus.
- **Verification:** every `docs/solutions/**/*.md` except `README.md` declares a `problem_type`, and every declared value is in the enum.

## Verification Contract

| Check                                                                                                                                                    | Proves              | Units     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| Repo-wide search for each deleted doc's `<basename>.md`, excluding `docs/plans/`                                                                         | R1                  | U1, U2    |
| Each survivor shorter than the sum of its inputs; each absorbed doc's distinctive claims present in its survivor                                         | R2                  | U2        |
| Added-line audit of the `docs/solutions` diff: package names resolve, no trailing `...`, no added frontmatter keys, no `file:line` or code path in prose | R3, R4              | U3        |
| `./bin/dprint check` on every touched doc                                                                                                                | R3, R4              | U1-U3, U5 |
| `ttsr-rules` skill scripts `scripts/check_ttsr_rule.ts` and `scripts/ttsr_precision_recall.ts` on the rule and corpus                                    | R5                  | U4        |
| `omp ttsr list --json` from the repo root                                                                                                                | R5                  | U4        |
| Frontmatter scan: every doc declares a `problem_type` in the enum                                                                                        | R5                  | U5        |
| `pnpm check:local` exits 0                                                                                                                               | repo gate (REPO-D1) | all       |

No changeset: no publishable package's turbo build hash changes.

## Definition of Done

- Every unit's verification holds, and `pnpm check:local` exits 0 after the last edit.
- U5 lands before U4, and U4 lands alone in its own commit.
- `scripts/deno.lock` is not committed.
- No scratch files, probe fixtures, or abandoned edits remain in the diff.
