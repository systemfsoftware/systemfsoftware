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
- **Open blockers:** None.

---

## Product Contract

### Summary

Rebuild pack-eval's tests around a single description of a test world. A world is plain data: packs, dataset files, and scripted provider answers. Generated worlds exercise pack-eval's decision logic directly, with no I/O. Named outline rows exercise the real commands against real folders and the loopback provider. An independent reference oracle derives every expected value at both levels, except for a few anchor rows worked out by hand and the seeded intervals, which are checked by relations between runs.

### Problem Frame

The suite passes (433 tests across 24 files), but it proves less than it appears to.

- Expected counts and verdicts are written out by hand in `tests/__fixtures__/evaluate-pack.fixture.ts` (585 lines). A test therefore compares the product with numbers someone once typed, not with the method.
- Worlds are switched by boolean flags (`renamedRule`, `malformedRule`) and fixed plan constants, so each new case needs another flag or another constant.
- The eight scenarios in `tests/evaluate-packs.integration.test.ts` share one Given/When skeleton and differ only in data, while the library's `scenarioOutline` goes unused.
- The same file declares local copies of the cell's type and computes judge calls by subtraction.
- The path-escape scenario appears in two files.
- Tests and fixtures total 6,131 lines, and each scenario checks exactly one hand-picked world.
- Evaluate's decisions (scoring, gating, verdicts, outcome) are private helpers inside the 1,323-line `evaluate-packs.cell.ts`. Nothing can exercise them over many worlds without disk and network I/O.
- The in-process `--help` smoke boot of `main.ts` that the pack-evaluator plan requires (U7) was deleted when the command tree moved into `main.ts`.

### Key Decisions

- **pack-eval only.** The rebuild sets the bar for one package and does not enforce it anywhere else. (session-settled: user-directed — chosen over pack rules plus lint or CI gates forcing every package: the owner chose the narrower rebuild.)
- **Hand-checked anchor rows guard the oracle.** Without them, a misreading of the method shared by the oracle and the product would go unnoticed. (session-settled: user-directed — chosen over trusting the oracle alone, and over hand-written expected columns in every table: anchors catch a shared misreading while every other value stays derived.) Governs R6, R7.
- **One world description serves both generated worlds and outline rows.** Worlds are described once, and refusal cases become data. (session-settled: user-directed — chosen over separate outline and property suites, and over an oracle that also recomputes bootstrap intervals: one description avoids drift, and interval relations avoid a second copy of judgy.) Governs R1, R8, R10, R11. Conflict call-out: the test-layer admission gate (`skill://test-layer-selection`, "Randomness vs I/O") refuses generated inputs that reach disk or network. Generated worlds therefore drive the pure decision logic (R10), and outline rows are the only worlds that reach the real commands (R11). Both levels still read the same world description and the same oracle.
- **Evaluate's decision logic becomes one published pure workflow.** The code moves but pack-eval's behaviour stays the same. Generated worlds reach the decision through the published surface instead of private helpers. Governs R9.
- **The rebuild lands in PR #504 before it merges.** The suite ships with the code it tests. (session-settled: user-directed — chosen over a follow-up PR after merge: main never carries the current suite.) Governs R19.
- **Mutation score is not a success criterion.** (session-settled: user-directed — the owner left mutation evidence out of the bar when choosing its parts.) Conflict call-out: `skill://test-layer-selection` calls a full mutation score non-negotiable for property and composition tests. The repo runs mutation only as the advisory CI workflow, and local runs stay banned (REPO-D3). The advisory report on #504 is read but does not gate this work.

### Requirements

**World description**

- R1. A test world is plain data: pack rule files, the dataset files (selector instruction, tasks, routing labels, pair labels, judge prompt), and scripted answers per provider role. Refusal cases are world data, not flags or one-off constants: a renamed or malformed rule, labels naming a missing rule, a provider refusal, pair labels without a judge prompt, and an unwitnessed pair.
- R2. Each test area has exactly one world builder: evaluate, discovery, review, fingerprint, rule selector, contradiction judge, and tune-judge. A builder starts from defaults that produce an admissible world, and its typed modifiers change only what they name.
- R3. The world generator is itself tested. A property confirms that every generated world is admissible or fails with the refusal it was built to hold, and the generator reports how its worlds are distributed across refusal kinds, label sparsity, and pair counts. Real datasets have sparse labels and few witnessed pairs, and the generated population must include both.

**Expectations**

- R4. A reference oracle derives these from a world alone: routing counts per rule and split, rule verdicts, TPR and TNR, witnessed pairs, judge validity, the run outcome and exit code, and which selector and judge questions the run asks. It is written from the method sources and never imports pack-eval's `src/`. (pack: boundary-testing, refusals-beside-generated-laws.md)
- R5. No assertion holds a hand-written expected value except on an anchor row (R6). Call counts come from the oracle's list of questions, never from subtraction.
- R6. A small set of anchor rows carries expected values worked out by hand from the method sources: `ai-evals-course/evals-skills` and judgy's Rogan-Gladen correction and bootstrap. Both the oracle and the product must match every anchor.
- R7. Seeded bootstrap intervals are checked by relations plus anchors, not by the oracle. The same world and seed give the same interval. Every interval lies within [0, 1] and contains its point estimate. At least one anchor row pins an exact interval.

**Decision level (generated worlds)**

- R8. The generator draws worlds from the R1 description, covering admissible worlds and every refusal kind.
- R9. Evaluate's decisions are reachable as one published pure workflow. Given an admitted dataset plus the selector and judge answers, it returns the report and the run outcome. pack-eval's commands keep their current observable behaviour. (pack: cell-architecture, pure-decision-workflows.md)
- R10. Model-based properties run generated worlds through that workflow and through the other decision workflows, and compare the results with the oracle (R4) and the interval relations (R7). Each property declares its draw budget and a wall-clock bound, so an overrun fails as a budget breach rather than as a runner timeout.

**Command level (named rows)**

- R11. Integration scenarios that share a Given/When skeleton become one `scenarioOutline`. Its Examples rows are named worlds: the anchor rows, one row per refusal kind, and representative admissible rows. Each row runs the real command against real temp directories and the loopback OpenRouter listener, with no mocked internal glue and no spawned process. (pack: boundary-testing, real-system-oracles.md) (pack: boundary-testing, no-mocks-on-internal-glue.md)
- R12. On an empty answer cache, the requests the loopback listener receives equal the questions the oracle derives for that row.
- R13. `main.ts` has exactly one in-process smoke boot. `--help` lists every command, and a rejected command line exits 2.
- R14. Each behaviour is tested in one place. For example, the path-escape scenario now duplicated between discovery and review-pairs collapses to one.

**Test hygiene**

- R15. Tests call the published `PackEval` exports as a consumer would. They hold no local copy of a cell's or service's type and no casts. (pack: cell-architecture, decode-never-cast.md)
- R16. Every assertion reads output a consumer can observe: the exit code, the JSON report, the card on stdout, files written, requests reaching the loopback listener, or a published workflow's result.
- R17. The workflow property tests under `src/__tests__` follow the same rules: generators come from the schemas and respect declared filter floors, and assertions contain no unexplained literal values. (pack: boundary-testing, arbitrary-filter-floors.md)

**Product and delivery**

- R18. pack-eval's behaviour does not change. If the oracle and the product disagree because of a product defect, the fix goes into `src/` in its own `fix` commit, and the oracle is never bent to match. Changes stay inside `evals/pack-eval`, except an owned test library such as `@systemfsoftware/effect-gherkin-spec` when an outline cannot express a world row without a change there.
- R19. The rebuilt suite is committed on PR #504, with `pnpm check:local` and CI green, before #504 merges.

### Acceptance Examples

- AE1. **Covers R1, R11, R4.** **Given** the evaluate outline, **when** a row describes a pack whose labels name a rule file that was renamed, **then** the run exits 2, the loopback receives no request, and those expectations come from the oracle rather than from the row.
- AE2. **Covers R6, R4.** **Given** an anchor row with hand-worked TP, FN, FP, and TN counts, **when** both the oracle and the product evaluate it, **then** both match the hand values. An oracle that disagrees with an anchor fails the test even when the product agrees with the oracle.
- AE3. **Covers R7.** **Given** one world, **when** it is evaluated twice with the same seed, **then** the intervals are identical. With a different seed the interval may move, but it stays within [0, 1] and contains the point estimate.
- AE4. **Covers R10, R4.** **Given** a generated world holding a rule pair that no labelled task needs together, **when** the evaluation workflow decides it with a validated judge, **then** the judge questions it asks equal the oracle's, and none concerns the unwitnessed pair.
- AE5. **Covers R12.** **Given** an outline row with a witnessed and an unwitnessed pair, **when** evaluate runs on an empty cache, **then** the loopback receives exactly the oracle's selector and judge questions.
- AE6. **Covers R18.** **Given** a generated world on which the oracle and the product disagree, **when** the cause is a product defect, **then** the fix lands in `src/` as its own commit, and the oracle stays as the method source states it.

### Success Criteria

- Tests and fixtures total fewer lines than the current 6,131, while covering at least every behaviour the current suite covers.
- The full `pnpm --filter @systemfsoftware/pack-eval test` run stays under about 30 seconds locally (about 8 seconds today).
- A deliberate one-line fault in scoring, witnessed-pair finding, judge validity, or exit-code mapping turns at least one generated property and one outline row red.

### Scope Boundaries

- Other packages' suites, and any pack rule, lint rule, or CI gate that would hold them to this bar.
- Mutation score as a gate (see Key Decisions).
- New product behaviour, flags, or report fields. R9 moves code without changing what any command does.
- A live OpenRouter run. Every world uses the loopback listener.

### Dependencies / Assumptions

- `@systemfsoftware/effect-gherkin-spec` exposes `scenarioOutline` with Examples rows and `<tag>` expansion (`packages/effect-gherkin-spec/src/Feature.ts:143`, `packages/effect-gherkin-spec/src/FeatureRuntime.ts:163`).
- The bootstrap is deterministic for a given seed (`evals/pack-eval/src/bootstrap-rate-interval.workflow.ts`), which makes R7's relations checkable.
- The loopback fixture (`evals/pack-eval/tests/__fixtures__/openrouter-loopback.fixture.ts`) can script answers per role and count requests.

### Outstanding Questions

**Deferred to Planning**

- The boundary of the R9 workflow: which parts of `evaluate-packs.cell.ts`'s read phase stay I/O, and which decisions move into it.
- The draw budget per property, and how the 30-second budget is split between the decision level and the command level.
- Whether the outline's per-row scope gives each row fresh temp directories and a fresh loopback, or whether `effect-gherkin-spec` needs an extension (R18).
- Which anchor rows cover the method with the fewest rows: counts, TPR and TNR, the corrected rate, and one interval.
- Where the oracle lives, so that R4's independence from `src/` can be checked mechanically.

### Sources / Research

- `docs/plans/2026-09-24-0049-feat-pack-evaluator-plan.md`: the product plan whose behaviour this suite proves (U1-U15, AE1-AE7; U7's smoke boot).
- `evals/pack-eval/tests/__fixtures__/evaluate-pack.fixture.ts:133` (`evaluateWorld` flags), `:192-209` (hand-written `expectedCounts` and `expectedVerdict`).
- `evals/pack-eval/tests/evaluate-packs.integration.test.ts:30-68` (local cell interfaces, judge calls computed by subtraction), `:106-282` (eight scenarios on one skeleton).
- `evals/pack-eval/tests/discovery.integration.test.ts:240` and `evals/pack-eval/tests/review-pairs.integration.test.ts:317` (the duplicated path-escape scenario).
- Hughes, [How to Specify It!](https://research.chalmers.se/publication/517894/file/517894_Fulltext.pdf): model-based properties find the most bugs fastest. Metamorphic properties are the alternative where a model is expensive, which is the case for the bootstrap. "Avoid replicating your code in your tests." Test your generators.
- Software wiki `wiki/concepts/property-test-admissibility.md` (a verdict comes from an independent model or a relation; generated population matches the real one; declared per-case budget) and `wiki/concepts/oracle-independence.md` (the oracle comes from the specification, not the implementation under test).
- `skill://test-layer-selection`: decisions get property tests only, cells get sociable integration, and the composition root gets a smoke boot only. Random inputs must not reach I/O.
- [ai-evals-course/evals-skills](https://github.com/ai-evals-course/evals-skills) `validate-evaluator` and [judgy](https://github.com/ai-evals-course/judgy): the method sources for the oracle and the anchors.
