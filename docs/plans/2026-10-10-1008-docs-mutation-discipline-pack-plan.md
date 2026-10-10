---
title: Mutation-discipline compound pack - Plan
type: docs
date: 2026-10-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-10-0813-docs-mutation-discipline-pack-plan.md
---

# Mutation-discipline compound pack - Plan

## Goal Capsule

- **Objective:** An agent or maintainer who meets a surviving mutant in a systemfsoftware repo knows which of three responses it calls for (a contract property, deleting the code, or a shape-keyed ignorer) and does not answer it with a mirror test, a baseline row over live dead code, or an inline disable.
- **Means:** A new judgement-only pack `compound-packs/mutation-discipline/` with three rules, declared in `.compound-engineering/config.yaml`.
- **Product authority:** `.omp-input/brief.md` (the unit brief), then `CONSTITUTION.md`, then the root `AGENTS.md`.
- **Open blockers:** none.
- **Stop conditions:** stop and report before any edit to `compound-packs/cell-architecture/*`, any Stryker config, ignorer, workflow, or baseline file, any new dependency or gate, any local mutation run (hand-applied mutants included), or any citation of a repository whose visibility is not `PUBLIC`.
- **Execution profile:** documentation only; four new markdown files and one config line, no code.
- **Finisher:** the executor writes the files and runs the Verification Contract; this plan does not commit, push, or open a pull request.

---

## Product Contract

### Summary

The pack holds three rules on how to respond to mutation output: kill a survivor with a property whose expected value comes from the contract; treat a survivor no input can kill as dead code to delete, with a baseline row only as the last resort for an equivalent mutant on live code; and exclude mutants no test should observe through a shared ignorer keyed on syntactic shape, never through inline comments or excluded mutators.
Everything else a mutation pack could say is already owned by the constitution, the root `AGENTS.md`, a solution doc, or a sibling pack, and the pack cross-references it.

### Problem Frame

This repo grades mutation at the strictest setting and still accumulates the wrong kind of residue.
Every enrolled package breaks below a full score, so each survivor must be killed, deleted, or written into a per-id baseline (the open PR #706 introduces `mutation-baseline.json` plus a reasons table per package).
Three public incidents show the three ways that goes wrong:

- `@systemfsoftware/hex-schema` scored 55.95% with every `S.pattern` mutant surviving in all five pattern files, because its round-trip laws drew inputs from the schema's own arbitrary (`docs/solutions/design-patterns/generated-schema-laws-are-tautological.md`, origin/main).
- Commit `87bcba5f57` of PR #706 baselines mutant `ae5a794f8073e4ae` on `packages/oxlint-plugin/oxlint-plugin-dmmf-workflow/src/rules/ReferenceClassification.ts:518` with the reason "a scope of type `global` cannot occur, so this `'global'`/`'module'` operand is dead", while the operand stays at lines 518 and 610.
- `systemfsoftware/stryker-js-effect` PR #259 (merged `8df6ee9ca7`): the schema-declarations ignorer missed a `recursionBudget` annotation, Stryker instrumented it, and a consumer's main mutation run failed its dry run with `Budget_RequiresTransform`.

No pack names these responses today. `compound-packs/schema-laws/refusals-beside-generated-laws.md` covers the schema-specific instance of the first, and nothing covers the other two.

### Key Decisions

- KD1. **Three rules, each answering one survivor disposition.** The Stryker states page reduces a survivor to "You're missing a test for it"; the sources show three distinct correct answers (missing property, dead code, unobservable shape) and one wrong answer per incident. Governs R1-R3.
- KD2. **Ignorers are allowed; inline disables and excluded mutators are not.** The constitution's CONST-T3 mutation check fails suppression comments and kills a survivor "with a sharper property or by deleting the dead branch it exploits" (`repos/constitution/ENFORCEMENT.md:226`). A shape-keyed ignorer is not that suppression: it excludes mutants from the score with a reported reason (Stryker's `ignored` status), decided once by declaration shape for every package that uses it, never as an after-the-fact disable of a survivor someone has seen. Google's arid-node analysis is the analogy, not the mechanism: there, mutants in arid nodes "are never created in the first place" (TSE 2021, arXiv:2102.11378v2, §2.2 "Mutagenesis"); in Stryker, ignorer-matched mutants are created and reported `ignored`. Governs R3.
- KD3. **Judgement only, review-gated.** No lint or tool enforces any of the three properties on origin/main; OX-MG2's `grep 'Stryker disable'` gate was dropped in `53e77d54a7`. Each rule's `Gate:` line says `review`, and the pack names no tool as enforcing a semantic property. Governs R4.
- KD4. **Cite PR #706 by number and commit, not by main path.** The PR is OPEN and its head has moved (now `6e8abcc856`); every pin reads "commit `87bcba5f57` of PR #706", never "head". Its baseline files do not exist on main. Governs R2.

### Requirements

**Rules**

- R1. `kill-survivors-with-contract-properties`: a survivor is killed by a property whose expected value comes from the domain contract the mutant breaks, never by a test that restates the mutated expression; a survivor cluster recurring across files is read as a circular oracle, not as missing cases.
- R2. `unkillable-survivors-are-dead-code`: a survivor no reachable input can kill is deleted when nothing reads the code at runtime, or its state is made unconstructable; when something reads it, the survivor is a missing test (R1), never a map to empty; when it is declaration text, it goes to R3. A baseline row is the last resort, allowed only for an equivalent mutant on live code that no rewrite removes, whose written reason shows no reachable input can tell it from the original and no declaration shape exists to key an ignorer on.
- R3. `suppress-by-shape-in-an-ignorer`: mutants that no test should observe are excluded from the score by a shared ignorer that recognises the declaration shape, reports a reason (Stryker's `ignored` status), and refuses near-miss shapes; never by a `// Stryker disable` comment on a survivor or by excluding a mutator.

**Pack shape**

- R4. Each rule file uses the sibling packs' format: frontmatter `title`/`applies_when`/`tags`, a one-sentence law, why/harm, one WRONG/RIGHT pair from the incident named for it in the Sources table, and a `Gate:` line.
- R5. The README follows the sibling README shape and lists every cross-referenced owner by file path from the Overlaps table.
- R6. The pack contains no value copied from tool config: no globs, thresholds, shard sizes, timeouts, ignorer names lists, or trigger definitions.
- R7. The pack is declared in `.compound-engineering/config.yaml`; a changeset is added only if the repo's Changeset Check requires one.

### Sources per rule

| Rule | Primary sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | WRONG / RIGHT incident                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | TSE 2021 §1 (change-detector tests, "testing the current implementation rather than the specification", cause "brittle tests and false alarms"); Stryker mutant-states page ("Survived ... You're missing a test for it"); `CONSTITUTION.md` CONST-T3, CONST-T10. ICSE 2021 (arXiv:2103.07189) is not harm evidence: §III-D rejects the minimal-test hypothesis and finds developers write more and stronger tests                                                                                                | hex-schema: WRONG round-trip laws fed by the schema's own arbitrary left every `S.pattern` mutant alive at 55.95%; RIGHT rejection properties drawn from the domain contract (`docs/solutions/design-patterns/generated-schema-laws-are-tautological.md`, origin/main)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R2   | Stryker `equivalent-mutants.md` ("rewrite the code so it won't occur, or accept that you won't make 100%"); CONST-T3 mutation check (`repos/constitution/ENFORCEMENT.md:226`: "A survivor is killed with a sharper property or by deleting the dead branch it exploits"); CONST-S4, CONST-D1; PR #166 (`ca2bb6e286`: "delete what cannot fire")                                                                                                                                                                   | Commit `87bcba5f57` of PR #706: WRONG baseline row `ae5a794f8073e4ae` whose own reason calls the `'global'` operand in `ReferenceClassification.ts:518` dead, which obliges deletion (or, if the reason is wrong, a killing test), so the row is wrong either way; RIGHT per PR #706 Appendix D2, only `665dca69fe86b2dd` (`packages/effect-microsandbox/src/classify-probe-observation.workflow.ts:76`) and `9abde07b09ad171e` (`packages/daemon/effect-daemon-microvm/src/MicroVMMedium/classify-workload-exit.workflow.ts:9`) are emptied, because their workflows are called directly with no Sandwich, so nothing reads the brand at runtime; `efa442ce130562fd` and `14ade17d5d1537f0` have a Sandwich reader and are killed by trace tests |
| R3   | Stryker `disable-mutants.md` (disabled mutants become `ignored` and leave the score; excluding a mutator is "a shotgun approach"; an ignore-plugin returns a reason that lands in the report); SEIP 2018 §4 "Arid Node Detection via Abstract Syntax Tree Traversal" and TSE 2021 §3.1 "Detecting Arid Nodes" (the arid-node expert function grows from "Not useful" developer feedback); history `67adc33536`/`53e77d54a7` (OX-MG2 banned disable comments; origin/main holds none in `packages/` or `scripts/`) | WRONG `systemfsoftware/systemfsoftware` `732f66a0c8:packages/discern/src/PatternAst.schema.ts:43-48`: the shared ignorer at the time, before `stryker-js-effect` `8df6ee9ca7` (PR #259), did not recognise this annotate object, so it was instrumented and the dry run failed with `Budget_RequiresTransform` (record: `.changeset/schema-ignorer-recursion-budget.md` in that commit); RIGHT `stryker-js-effect` `8df6ee9ca7`: the ignorer recognises the holder and value shapes and its tests refuse near misses (key outside `annotate`, computed key, behaviour hook beside the budget)                                                                                                                                                     |

### Overlaps cross-referenced, not restated

| Topic                                                      | Owner                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expected values from an independent oracle                 | `CONSTITUTION.md` CONST-T10; `repos/constitution/docs/solutions/architecture-patterns/a-test-never-takes-its-expected-value-from-the-code-under-test.md` |
| Schema refusal properties beside generated laws            | `compound-packs/schema-laws/refusals-beside-generated-laws.md`                                                                                           |
| Choosing what is mutated by what code is, not its path     | `CONSTITUTION.md` CONST-T12; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`                                              |
| Never weakening the grader (thresholds, timeouts, `break`) | `CONSTITUTION.md` CONST-E7; `repos/constitution/ENFORCEMENT.md`                                                                                          |
| No local mutation runs                                     | root `AGENTS.md` REPO-D3                                                                                                                                 |
| Splitting a package whose mutants exceed a job budget      | `docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md`                                                        |
| Mocks on internal glue                                     | `compound-packs/boundary-testing/no-mocks-on-internal-glue.md`                                                                                           |

### Considered and rejected

- **Read the survivor, not the score.** Google computes no codebase score (TSE 2021 §1: "infeasibly expensive to compute the absolute mutation score for the codebase"). Rejected as a rule: a full-score break plus a per-id baseline already makes the repo's score binary, and no verified incident shows score-chasing.
- **A timeout is not a kill.** Stryker counts a timeout as detected; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` says I/O mutants hang. Rejected: no verified public incident yet, and the remedy (move the decision into the pure core) is CONST-B1's and `compound-packs/cell-architecture/pure-decision-workflows.md`'s.
- **Diff-scoped mutation, one mutant per line.** Google's core scaling choices (SEIP 2018: "Only lines affected by the diff under review that are covered and are not arid are mutated"; ICSE 2021 RQ4 mutant redundancy). Rejected: it is workflow configuration, which R6 bars from the pack.
- **Rules on aiming, timeouts, thresholds, local runs, budgets.** Each has an owner in the Overlaps table.

### Scope Boundaries

- No change to any Stryker config, ignorer package, workflow, or baseline file.
- No edit to `compound-packs/cell-architecture/*`.
- No new dependency, lint rule, or gate.
- No local mutation run of any kind.

Product Contract preservation: restructured, no scope change (KD4 now governs R2 only, the one rule whose incident it covers; the cell-architecture overlap row moved into the timeout rejection it supports).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **File names are the R-ID slugs.** `kill-survivors-with-contract-properties.md`, `unkillable-survivors-are-dead-code.md`, `suppress-by-shape-in-an-ignorer.md`; the README names each by slug, the way `compound-packs/schema-laws/README.md` does. Covers R1-R5.
- KTD2. **Rule-file shape mirrors `compound-packs/boundary-testing/fake-and-real-store-laws.md`.** Frontmatter, an opening context paragraph, the rule and its why/harm, a fenced block whose lines begin `// WRONG:` and `// RIGHT:`, then the `Gate:` line. Covers R4. (pack: boundary-testing, fake-and-real-store-laws.md)
- KTD3. **WRONG/RIGHT excerpts quote real code at a pinned ref.** R1 quotes the hex-schema `S.pattern`/`arbitrary` pair at commit `cca5f66e8e` (`packages/hex-schema/src/hex-string.schema.ts:10-12`; origin/main no longer holds it) and points to the solution doc on origin/main; R2 quotes `ReferenceClassification.ts:518` at commit `87bcba5f57` of PR #706, and the two emptied `InstrumentationBrand` lines with their full paths, before at origin/main `732f66a0c8` and after at commit `87bcba5f57` of PR #706; R3's WRONG quotes the `PatternAst` annotate object at `systemfsoftware/systemfsoftware` `732f66a0c8:packages/discern/src/PatternAst.schema.ts:43-48`, which the shared ignorer before `stryker-js-effect` `8df6ee9ca7` (PR #259) did not recognise (record: that commit's `.changeset/schema-ignorer-recursion-budget.md`), and its RIGHT quotes the ignorer tests at `stryker-js-effect` `8df6ee9ca7`. The `maxDepth`/`depthSize` literals stay: they are incident code quoted verbatim, not a threshold restated as guidance. Every excerpt carries its repo, path, and ref in a comment, so a reader can fetch it.
- KTD4. **Each `Gate:` line reads `review` and names a check that needs no local mutation.** R1: the killing test's expected value traces to a contract source, not to the mutated expression. R2: a deletion removes only code nothing reads at runtime, declaration text goes to a shape-keyed ignorer, and a new baseline row's reason shows an equivalent mutant on live code with no declaration shape to key on. R3: the change adds no `// Stryker disable` and no `excludedMutations`, and an ignorer change carries a near-miss refusal test. Evidence for a kill is the mutant id read from the next CI Mutation report (REPO-D3, `AGENTS.md:73`). Covers R4.
- KTD5. **No tests.** The `test-layer-selection` admission gate admits none: the pack is prose with no runtime behaviour for a consumer to observe, and a test asserting file presence or frontmatter keys would only restate the files it reads. Verification is the Verification Contract below.
- KTD6. **Changeset decided by the check, not by guess.** `compound-packs/` belongs to no publishable package, so no `turbo build` hash should move and REPO-R2 should not fire; the PR's Changeset Check result settles it. Covers R7.

### Assumptions

- PR #706 may merge or change before this pack lands (its head is already `6e8abcc856`). The citations stay valid because they pin commit `87bcba5f57` of PR #706 (KD4); if #706 deletes the `'global'` operand before merge, the WRONG excerpt still stands at that commit.
- The `'global'` operand may in fact be reachable. The rule file does not assert it is dead: the row's own reason says it is, and under R2 that reason obliges deletion; if the reason is wrong, it obliges a killing test (R1). The baseline row is wrong either way. No mutation run settles it.
- R1's incident is schema-domain. The rule text stays domain-general and points to `compound-packs/schema-laws/refusals-beside-generated-laws.md` for the schema mechanism instead of restating it (R5).

---

## Implementation Units

### U1. Rule: kill survivors with contract properties

- **Goal:** Write the rule file that tells a reader how to kill a survivor and how to read a survivor cluster.
- **Requirements:** R1, R4, R6
- **Dependencies:** none
- **Files:** `compound-packs/mutation-discipline/kill-survivors-with-contract-properties.md`
- **Approach:**
  1. Law: kill with a property whose expected value comes from the contract the mutant breaks; a cluster across files means a circular oracle.
  2. Why/harm from TSE 2021 §1 (change-detector tests) and the Stryker mutant-states page (Sources row R1); ICSE 2021 is not cited as harm evidence.
  3. WRONG/RIGHT from the hex-schema incident per KTD3, with a one-line pointer to `compound-packs/schema-laws/refusals-beside-generated-laws.md` and CONST-T10 for the oracle law.
  4. `Gate:` per KTD4.
- **Patterns to follow:** `compound-packs/boundary-testing/fake-and-real-store-laws.md`
- **Test scenarios:** Test expectation: none -- prose rule file; KTD5.
- **Verification:**
  - Frontmatter holds `title`, `applies_when`, `tags` and parses as YAML.
  - `git show cca5f66e8e:packages/hex-schema/src/hex-string.schema.ts` serves the quoted `S.pattern`/`arbitrary` lines, and the cited solution doc exists on origin/main.
  - No ICSE 2021 citation appears as harm evidence.
  - The file states no schema refusal mechanism that `refusals-beside-generated-laws.md` already states.

### U2. Rule: unkillable survivors are dead code

- **Goal:** Write the rule file that sends an unkillable survivor to deletion, a reader to R1, and declaration text to R3, with a baseline row only as the last resort.
- **Requirements:** R2, R4, R6
- **Dependencies:** none
- **Files:** `compound-packs/mutation-discipline/unkillable-survivors-are-dead-code.md`
- **Approach:**
  1. Law per R2; why/harm from the Stryker equivalent-mutants page, the CONST-T3 mutation check (`repos/constitution/ENFORCEMENT.md:226`), CONST-S4, CONST-D1.
  2. WRONG: baseline row `ae5a794f8073e4ae` and the operand at `ReferenceClassification.ts:518`, at commit `87bcba5f57` of PR #706 (KD4), worded as: the row's own reason calls the operand dead, which obliges deletion, or a killing test if the reason is wrong; the row is wrong either way.
  3. RIGHT, from PR #706 Appendix D2: only `665dca69fe86b2dd` (`packages/effect-microsandbox/src/classify-probe-observation.workflow.ts:76`) and `9abde07b09ad171e` (`packages/daemon/effect-daemon-microvm/src/MicroVMMedium/classify-workload-exit.workflow.ts:9`) were emptied, because their workflows are called directly with no Sandwich and nothing reads the brand at runtime; `efa442ce130562fd` and `14ade17d5d1537f0` have a Sandwich reader, so trace tests kill them. Quote the before line at origin/main `732f66a0c8` and the after line at commit `87bcba5f57` of PR #706. The rule never says to empty a brand map that something reads.
  4. `Gate:` per KTD4.
- **Patterns to follow:** `compound-packs/boundary-testing/fake-and-real-store-laws.md` for shape
- **Test scenarios:** Test expectation: none -- prose rule file; KTD5. Review walk-through: a reader holding a survivor on a brand map that a Sandwich reads is sent to R1 (write the trace test), not told to empty the map.
- **Verification:**
  - `git show 87bcba5f57:<path>` serves the quoted lines and the quoted reasons-table row; PR #706 Appendix D2 (`docs/plans/2026-10-09-mutation-main-green.md`) lists the four ids with their readers. No Mutation run id is cited.
  - The file names no baseline file path on main (none exists there) and copies no baseline ids beyond the one cited.
  - The file names both emptied sites by full path and states that the two Sandwich-read brands were killed by trace tests, not emptied.

### U3. Rule: suppress by shape in an ignorer

- **Goal:** Write the rule file that routes unobservable mutants to a shape-keyed ignorer and away from inline disables and excluded mutators.
- **Requirements:** R3, R4, R6
- **Dependencies:** none
- **Files:** `compound-packs/mutation-discipline/suppress-by-shape-in-an-ignorer.md`
- **Approach:**
  1. Law per R3; why/harm from Stryker `disable-mutants.md` and the arid-node sections of SEIP 2018 §4 and TSE 2021 §3.1; KD2 reconciles it with the CONST-T3 mutation check and states that ignorer-matched mutants are reported `ignored`.
  2. WRONG/RIGHT per KTD3: WRONG the `PatternAst` annotate object at `systemfsoftware/systemfsoftware` `732f66a0c8:packages/discern/src/PatternAst.schema.ts:43-48`, which the shared ignorer before `stryker-js-effect` PR #259 missed, with the dry-run failure and the changeset record; RIGHT the shape-keyed holder recognition at `8df6ee9ca7` with its near-miss refusals.
  3. Name no ignorer list and no `ignorers` config value (R6); refer to "the shared ignorer packages" generically.
  4. `Gate:` per KTD4.
- **Patterns to follow:** `compound-packs/boundary-testing/fake-and-real-store-laws.md` for shape
- **Test scenarios:** Test expectation: none -- prose rule file; KTD5.
- **Verification:**
  - `gh repo view systemfsoftware/stryker-js-effect --json visibility` returns `PUBLIC` at write time.
  - `git show 732f66a0c8:packages/discern/src/PatternAst.schema.ts` serves the quoted WRONG lines 43-48; PR #259 merge commit `8df6ee9ca7` serves the quoted ignorer test excerpts and `.changeset/schema-ignorer-recursion-budget.md`.
  - `git grep -n 'Stryker disable' origin/main -- packages scripts` still returns nothing, or the README bullet "Excluding mutants no test should observe through a shared ignorer keyed on declaration shape, never through a disable comment or an excluded mutator (`suppress-by-shape-in-an-ignorer`)." is reworded.
  - The file says ignorer-matched mutants are reported `ignored` and does not claim they are never created; the Google "never created" phrase appears only as the arid-node analogy.
  - No private source and no knowledge-base handle appears in any pack file.

### U4. Pack README and config declaration

- **Goal:** Make the pack discoverable: a README in the sibling shape and a `packs:` entry.
- **Requirements:** R5, R7
- **Dependencies:** U1, U2, U3
- **Files:** `compound-packs/mutation-discipline/README.md`, `.compound-engineering/config.yaml`
- **Approach:**
  1. README: one paragraph on what the pack judges, one paragraph listing what other owners cover (the Overlaps table, by path), then "Rules in this pack govern:" with one bullet per rule slug (KTD1).
  2. Append `- source: compound-packs/mutation-discipline` to `packs:` in `.compound-engineering/config.yaml`.
- **Patterns to follow:** `compound-packs/schema-laws/README.md`, `compound-packs/boundary-testing/README.md`
- **Test scenarios:** Test expectation: none -- README and one config line; KTD5.
- **Verification:**
  - The CE pack resolver (`skills/ce-plan/scripts/packs-resolve.py`) lists five roots including `mutation-discipline`, with empty `warnings` and `errors`.
  - Every path in the README resolves on origin/main or in this branch.

---

## Verification Contract

| Check                     | Command or method                                                    | Units | Done signal                                                                                      |
| ------------------------- | -------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Formatting                | `./bin/dprint check`                                                 | U1-U4 | exit 0                                                                                           |
| Repo gate                 | `pnpm check:local` (REPO-D1); no mutation runs in it                 | U1-U4 | exit 0                                                                                           |
| Single plan               | `pnpm gate:repo` (REPO-D2 `single-plan`)                             | all   | exit 0; this plan is the PR's only `docs/plans/` file                                            |
| Pack resolution           | CE `packs-resolve.py`                                                | U4    | five roots, no warnings or errors                                                                |
| No config values          | review each rule file against R6                                     | U1-U3 | no glob, threshold, shard size, timeout, ignorer list, or trigger                                |
| No tool enforcement claim | review each `Gate:` line against KD3                                 | U1-U3 | every gate reads `review`                                                                        |
| Public citations only     | `gh repo view <repo> --json visibility` for each non-this repo cited | U3    | `PUBLIC`                                                                                         |
| Protected paths           | `git diff --name-only origin/main`                                   | all   | nothing under `compound-packs/cell-architecture/`, no Stryker config, workflow, or baseline file |
| Changeset                 | Changeset Check on the PR (KTD6)                                     | U4    | green, with or without a `.changeset/` file                                                      |

---

## Definition of Done

- U1-U4 written; each rule file passes its unit Verification.
- Every row of the Verification Contract shows its done signal.
- No draft or scratch file remains in `compound-packs/mutation-discipline/`.
- No commit made by this plan's execution unless the operator asks for one.
