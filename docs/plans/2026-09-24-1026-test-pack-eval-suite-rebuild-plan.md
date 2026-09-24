---
title: pack-eval Test Suite Rebuild - Plan
type: test
date: 2026-09-24
topic: pack-eval-suite-rebuild
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# pack-eval Test Suite Rebuild - Plan

## Goal Capsule

- **Objective:** The owner can trust that pack-eval's routing scores, contradiction verdicts, and exit codes are right across the whole range of possible inputs. Every expected value traces to the evaluation method, never to a number typed into a test.
- **Product authority:** The owner decides. Only `evals/pack-eval` is in scope. Other packages, and gates that would hold them to this bar, are not active scope.
- **Means:** One world description drives two test levels. Generated worlds run the real evaluate cell in process, against an in-memory filesystem and world-scripted selector and judge ports, and are compared with a reference oracle through `@systemfsoftware/differential-spec` (KTD1, KTD2). Named outline rows run the real cells against temp folders and the loopback provider (KTD6).
- **Stop conditions:** Stop and report when the oracle and the product disagree on a point the method sources do not settle, or when a lint rule blocks a planned file (never weaken the rule: CONST-E9).
- **Finishes and ships:** The commits go to PR #504, which is watched until CI passes (R19).
- **Open blockers:** None.

---

## Product Contract

### Summary

Rebuild pack-eval's tests around a single description of a test world. A world is plain data: packs, dataset files, and scripted provider answers. Generated worlds exercise evaluate's decisions with no disk or network I/O. Named outline rows exercise the real commands against real folders and the loopback provider. An independent reference oracle derives every expected value at both levels. The exceptions are a few anchor rows worked out by hand, and the seeded intervals, which are checked by relations between runs.

### Problem Frame

Before the rebuild the suite passed (433 tests across 24 files) but proved less than it appeared to:

- Expected counts and verdicts were written out by hand in `tests/__fixtures__/evaluate-pack.fixture.ts` (585 lines), so a test compared the product with numbers someone once typed, not with the method.
- Worlds were switched by boolean flags (`renamedRule`, `malformedRule`) and fixed plan constants.
- The eight evaluate scenarios shared one Given/When skeleton, while `scenarioOutline` went unused.
- The evaluate suite declared local copies of the cell's type and computed judge calls by subtraction.
- The path-escape scenario appeared in two files.
- Tests and fixtures totalled 6,131 lines, and each scenario checked exactly one hand-picked world.

### Key Decisions

- **pack-eval only.** (session-settled: user-directed — chosen over pack rules plus lint or CI gates forcing every package.)
- **Hand-checked anchor rows guard the oracle.** (session-settled: user-directed — chosen over trusting the oracle alone, and over hand-written expected columns in every table.) Governs R6, R7.
- **One world description serves both generated worlds and outline rows.** (session-settled: user-directed — chosen over separate outline and property suites, and over an oracle that also recomputes bootstrap intervals.) Governs R1, R8, R10, R11.
- **Generated worlds run the real evaluate cell with doubles at its ports.** The filesystem, rule selector, and contradiction judge are replaced; the cell and every workflow it composes run unchanged. Governs R9, R20. This replaces the earlier decision to extract evaluate's decisions into published pure workflows. `make-body-purity` forbids a `Workflow.make` body from calling sibling workflows, and `effect-cell-types` has no `Workflow.andThen`, so a decision composed of about eight workflows cannot be one workflow. The attempted extraction split the orchestration between the cell and a workflow, and it changed observable behaviour: provider refusals became input refusals, and each validity judge request was asked twice.
- **No in-process smoke boot of `main.ts`.** (session-settled: user-approved — chosen over moving the command tree out of `main.ts` and over loosening the entrypoint lint.) `entrypoint-no-exports` and `entrypoint-not-imported` make `main.ts` unimportable, including through a published `/main` subpath, and `skill://test-layer-selection` exempts composition roots. The built binary's `--help` exit 0 and bad-subcommand exit 2 are checked by hand. This removes the earlier R13.
- **The rebuild lands in PR #504 before it merges.** (session-settled: user-directed — chosen over a follow-up PR after merge.) Governs R19.
- **Mutation score is not a success criterion.** (session-settled: user-directed.) The repo runs mutation only as the advisory CI workflow, and local runs stay banned (REPO-D3).

### Requirements

**World description**

- R1. A test world is plain data: pack rule files, the dataset files (selector instruction, tasks, routing labels, pair labels, judge prompt), and scripted answers per provider role. Refusal cases are world data, not flags: a renamed or malformed rule, labels naming a missing rule, a provider refusal, pair labels without a judge prompt, a pair label on an unwitnessed pair, and a few-shot pair outside `train`.
- R2. Each test area has one world builder: evaluate, discovery, review, fingerprint, rule selector, contradiction judge, and tune-judge. A builder starts from an admissible default, and its typed modifiers change only what they name.
- R3. The world generator is itself tested. Every generated world is admissible or fails with the refusal it was built to hold, and the generated population includes sparse labels and packs with few witnessed pairs. A world holds at most one routing entry per task and pack, and a scripted judge answer for every judge question it can raise, because real datasets always do.

**Expectations**

- R4. A reference oracle derives these from a world alone: routing counts per rule and split, rule verdicts, TPR and TNR, witnessed pairs, judge validity, the corrected contradiction rate, the run outcome and exit code, and the distinct selector and judge questions the run asks. It is written from the method sources and imports only `effect` and the world fixture. (pack: boundary-testing, refusals-beside-generated-laws.md)
- R5. No assertion holds a hand-written expected value except through an anchor (R6). Call counts come from the oracle's questions, never from subtraction.
- R6. Anchors carry expected values worked out by hand from the method sources (the pack-evaluator plan, `ai-evals-course/evals-skills`, judgy). The oracle and the product must both match every anchor.
- R7. Seeded bootstrap intervals are checked by relations plus one pinned anchor. The same world and seed give the same report. Every interval lies within [0, 1] and contains its point estimate. The pinned interval is a product characterization pin, because the bootstrap stream cannot be derived by hand.

**Decision level (generated worlds)**

- R8. The generator draws worlds from the R1 description, covering admissible worlds and every refusal kind.
- R9. Evaluate's decisions are observed through the real cell run in process with an in-memory filesystem and scripted ports: the exit code, the written report, and the recorded questions.
- R20. The run asks every selector question (one per task and pack) and one judge request per validity or witness target, and only when selection has no fault and routing does not refuse. The distinct judge questions equal the oracle's; the answer cache serves a repeated question.
- R10. Differential and metamorphic checks run generated worlds and compare the results with the oracle (R4) and the interval relations (R7). Each check declares its run budget and wall-clock bound.

**Command level (named rows)**

- R11. Integration scenarios that share a Given/When skeleton become one `scenarioOutline` whose rows are named worlds: the anchors, one row per refusal kind, and representative admissible worlds. Each row runs the real command against real temp directories and the loopback OpenRouter listener, with no mocked internal glue and no spawned process. (pack: boundary-testing, real-system-oracles.md) (pack: boundary-testing, no-mocks-on-internal-glue.md)
- R12. On an empty answer cache, the requests the loopback listener receives equal the distinct questions the oracle derives for that row.
- R14. Each behaviour is tested in one place.

**Test hygiene**

- R15. Tests call the published `PackEval` exports as a consumer would, with no local copy of a cell's or service's type and no casts. (pack: cell-architecture, decode-never-cast.md)
- R16. Every assertion reads output a consumer can observe: the exit code, the JSON report, the card, files written, requests reaching the loopback or a port double, or a published workflow's result.
- R17. The workflow property tests under `src/__tests__` draw generators from the schemas, respect filter floors, and contain no unexplained literal values. (pack: boundary-testing, arbitrary-filter-floors.md)

**Product and delivery**

- R18. pack-eval's behaviour does not change. When the oracle and the product disagree, the method sources decide. A product defect is fixed in `src/` in its own `fix` commit, and the oracle is never bent to match the product.
- R19. The rebuilt suite is committed on PR #504, with `pnpm check:local` and CI green, before #504 merges.

### Acceptance Examples

- AE1. **Covers R1, R11, R4.** A row whose labels name a renamed rule exits 2, and the loopback receives no request. Both expectations come from the oracle.
- AE2. **Covers R6, R4.** An anchor with hand-worked TP, FN, FP, and TN counts: the oracle and the product both match the hand values.
- AE3. **Covers R7.** The same world and seed give an identical report, and every interval lies within [0, 1] and contains the point estimate.
- AE4. **Covers R10, R20, R4.** A generated world holding a pair no labelled task needs together: the judge questions the cell asks equal the oracle's, and none concerns the unwitnessed pair.
- AE5. **Covers R12.** A row with a witnessed and an unwitnessed pair on an empty cache: the loopback receives exactly the oracle's selector and judge questions.

### Success Criteria

- Tests and fixtures total fewer lines than the 6,131 before the rebuild, while covering at least every behaviour the earlier suite covered.
- The full `pnpm --filter @systemfsoftware/pack-eval test` run stays under about 30 seconds locally.
- A one-line fault in scoring, witnessed-pair finding, judge validity, or exit-code mapping turns at least one differential check and one outline row red.

### Scope Boundaries

- Other packages' suites, and any pack rule, lint rule, or CI gate that would hold them to this bar.
- Mutation score as a gate.
- New product behaviour, flags, or report fields.
- A live OpenRouter run.

---

## Planning Contract

### Method readings settled by the anchors

The anchors caught these misreadings in the first oracle. Each is settled by the pack-evaluator plan (`docs/plans/2026-09-24-0049-feat-pack-evaluator-plan.md`):

- A deferred stem is the owner abstaining, not a negative. The review page has separate governs, does-not-govern, and defer controls (lines 453-454). Every other rule of a labelled task and pack that is not governing is a negative.
- The evidence floor applies per class: 3 positives and 3 negatives (lines 382, 391).
- A loaded rule the labels leave ungoverned is a false positive (line 389, AE2).
- A pair label needs one routing entry that governs both rules (line 330). A few-shot pair must be a `train` pair (line 341).
- The report gives the corrected contradiction rate, the Fail side, 1 − θ of judgy's Rogan-Gladen success rate (R12). A judge with TPR + TNR ≤ 1 is refused (line 365).

### Key Technical Decisions

- KTD1. **Generated worlds run in `tests/*.differential.test.ts` through `@systemfsoftware/differential-spec`.** The reference side is the oracle and the candidate side is the evaluate cell. Each check declares `runBudget` and `interruptAfterTimeLimit`.
- KTD2. **Ports, not internals, are doubled.** `tests/__fixtures__/pack-eval-memory.fixture.ts` provides an in-memory `FileSystem` (effect's `FileSystem.layerNoop` with map-backed overrides) and world-scripted `RuleSelector` and `ContradictionJudge` services that record every question asked. No generated world reaches disk or network.
- KTD3. **The world is one plain-data type with three readers.** The oracle reads it directly, the memory fixture turns it into port doubles, and the disk fixture writes it to a scoped temp directory and scripts the loopback. The world fixture does not import pack-eval.
- KTD4. **The oracle is `tests/__fixtures__/pack-eval-oracle.fixture.ts`** and imports only `effect` and the world fixture.
- KTD5. **Interval checks are relations** plus one product-pinned anchor.
- KTD6. **Command-level rows use `scenarioOutline` under `withScenarioLayer(openRouterLoopback)`,** so each row gets a fresh scope, temp directories, and loopback.
- KTD7. **The loopback answers by request content.** It finds a request's question by locating the world's own strings (task text, pack id, rule stems) in the judged section of the prompt. Worlds keep those strings unique and non-overlapping (`hasDistinctMatchableStrings`). A request matching no question or several fails the row.
- KTD8. **Anchors are data with written derivations** in `tests/__fixtures__/pack-eval-anchors.fixture.ts`: a scored rule, an insufficient-evidence rule, a validated judge's corrected contradiction rate, and one pinned interval.

---

## Implementation Units

Each unit landed as its own commit on `feat/pack-eval`.

- U2. World description, builders, and generator: `tests/__fixtures__/pack-eval-world.fixture.ts`, `pack-eval-world-arbitrary.fixture.ts`.
- U3. Disk interpreter and content-keyed loopback: `tests/__fixtures__/pack-eval-disk.fixture.ts`, `openrouter-loopback.fixture.ts`.
- U4. Oracle, anchors, in-memory ports, and differential checks: `tests/__fixtures__/pack-eval-oracle.fixture.ts`, `pack-eval-anchors.fixture.ts`, `pack-eval-memory.fixture.ts`, `tests/evaluate-decision.differential.test.ts`.
- U5. Evaluate suite as outline rows: `tests/evaluate-packs.integration.test.ts`.
- U6. Discovery and review suites: `tests/discovery.integration.test.ts`, `review-server.integration.test.ts`, `review-pairs.integration.test.ts` and their fixtures.
- U7. Provider-driver, fingerprint, and tune-judge suites: `tests/rule-selector.integration.test.ts`, `contradiction-judge.integration.test.ts`, `task-generator.integration.test.ts`, `compute-fingerprint.integration.test.ts`, `tune-judge.integration.test.ts` and their fixtures.
- U9. Workflow property tests: `src/__tests__/*.workflow.property.test.ts`, `src/__tests__/schema-refusals.test.ts`.
- U10. Delete `tests/__fixtures__/evaluate-pack.fixture.ts` and measure.

U1 (workflow extraction) and U8 (smoke boot) were dropped by the Key Decisions above.

---

## Verification Contract

| Gate                | Command or check                                                                                                                                                                                         | Proves                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Package tests       | `pnpm --filter @systemfsoftware/pack-eval test`                                                                                                                                                          | R1-R12, R14-R17, R20; AE1-AE5 |
| Package lint        | `pnpm --filter @systemfsoftware/pack-eval exec oxlint .`                                                                                                                                                 | Lane placement, R11, R15      |
| Package types       | `pnpm --filter @systemfsoftware/pack-eval exec tsc -p tsconfig.test.json --noEmit`                                                                                                                       | R15                           |
| Oracle independence | grep the oracle fixture's imports for `src/` and `@systemfsoftware/pack-eval`; expect no match                                                                                                           | R4                            |
| Fault detection     | A one-line sabotage in each of score-rule-routing, find-witnessed-pairs, assess-judge-validity, resolve-run-outcome turns a differential check and an outline row red, and restoring it turns them green | Success Criteria              |
| Size and time       | Line count of `tests/` plus `src/__tests__/`; wall time of the package test run                                                                                                                          | Success Criteria              |
| Repo gate           | `pnpm check:local` exits 0                                                                                                                                                                               | R19                           |
| CI                  | `gh pr checks 504 --watch --fail-fast`                                                                                                                                                                   | R19                           |

---

## Definition of Done

- Every gate in the Verification Contract passes on the final commit.
- Every behaviour the earlier suite covered maps to a row, scenario, or check in the rebuilt suite.
- No abandoned-attempt code remains.
- PR #504's description names the rebuild and states the measured lines and run time.

## Sources

- `docs/plans/2026-09-24-0049-feat-pack-evaluator-plan.md`: the product plan whose behaviour this suite proves, and the method source for gating and admission.
- [ai-evals-course/evals-skills](https://github.com/ai-evals-course/evals-skills) `validate-evaluator` and [judgy](https://github.com/ai-evals-course/judgy): the method sources for rates and the corrected rate.
- Hughes, [How to Specify It!](https://research.chalmers.se/publication/517894/file/517894_Fulltext.pdf): model-based properties, metamorphic properties where a model is expensive, and testing the generators.
- `packages/differential-spec/README.md`; `packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md`.
