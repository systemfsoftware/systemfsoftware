---
title: A claim that a test can fail names an observed red by its id, never a mutant applied by hand
applies_when:
  - a PR body, plan or review claims that a new or changed test can fail
  - a gate, rule or plan prescribes editing the code under test by hand to show that a test goes red
  - a review asks for proof that a test fails when the behaviour it names breaks
tags: [test-evidence, can-fail, mutation-testing, review, test-discipline]
---

CONST-T3 asks that every test be able to fail when the behaviour it names breaks (`CONSTITUTION.md:90-95`). A claim that a test can fail is evidence, and a reviewer has to be able to check it. Breaking the code by hand while writing a test is a sound way for the author to learn whether the test can fail. Seemann's advice is to run each new test "and see it fail" ("Tautological assertion", https://blog.ploeh.dk/2019/10/14/tautological-assertion/). It is not evidence for anyone else. The red happened on a working tree nobody else saw, after an edit the author chose, and the edit was reverted before the commit. Mutation itself runs only in CI (root `AGENTS.md` REPO-D3, `AGENTS.md:68`). `compound-packs/schema-laws/refusal-properties-cover-unobservable-boundaries.md:41` names the same routes for a refusal property. This rule names them for every test.

## Rule

A change that claims a test can fail names the observed red through one of four routes. In every route, the red is the claimed test failing, not another test of the same behaviour:

1. **A generated-input property run that failed**, named by its CI run id.
2. **A mutant the claimed test kills in a Mutation run on main** (a nightly run or a dispatch on main), named by the mutant id, the run id, and the test id that run's report records in the mutant's `killedBy` (the runner names a test `<file>#<test name>`). A report part rebuilt from a shard's event stream records no `killedBy`. For such a mutant, the route names two main runs instead, the last before the test merged showing the mutant surviving and a later one showing it killed, and it holds only when no other test of that file merged between them. The report artifact is kept for 14 days (`.github/workflows/reusable-mutation.yml:394`), so the route holds only while the report a reviewer would open still exists. It exists only for a test already on main and a file the lane mutates (today, the workflow files the planner admits).
3. **A throwaway deliberate-red CI change**: a commit or draft pull request that breaks the code holding the behaviour, the id of the CI run in which the claimed test failed, and the change closed unmerged.
4. **The new test run red on the real pre-fix commit**, named by its CI run id, or by a pushed commit whose tree holds the new test over the pre-fix code, with the command and the failing output.

When no route applies, the change states `red not shown`, and the review weighs the test without that evidence.

- **No hand-applied mutant as evidence.** Editing the code under test by hand to show a red is never evidence, whether the edit was reverted before the commit or is described in the PR body. While working, the author may still break the code to see a test fail; the evidence is the red it then shows through one of the four routes. The inversion loop in `docs/solutions/architecture-patterns/extraction-strands-the-origins-gate.md:63-70` (inject a negated predicate, observe red, restore) is that working aid. That solution doc now says so: pushed as a throwaway CI change, the loop's red is route 3 evidence. A gate, rule or plan that a change adds or edits and that asks for can-fail evidence names one of the four routes, never a hand-applied mutant. A dated plan nobody edits stays as the record it is.
- **The vendored constitution says otherwise until upstream changes.** Its CONST-T10 criterion "Sabotage after green: break one core law and one published field; at least one test goes red" (`repos/constitution/ENFORCEMENT.md:214`) prescribes the hand-applied route. That file is read-only here (root `AGENTS.md` REPO-S3), and this repository has already decided to delete the sentence (`docs/plans/2026-10-13-0612-refactor-retire-generated-schema-laws-plan.md:147`). Until the deletion lands upstream, this rule governs changes in this repository.

```text
# WRONG: systemfsoftware/systemfsoftware #56 body (merged 5645a62eed, 2026-08-05)
In place of a Stryker run, each of the seven kernel mutants below was applied by hand and the suite re-run:
killed  maxDepth 2 -> 3 (cap raised)              -> ∀e_ExprNesting_≤DepthCap

# RIGHT: neutral shape, no citation
Can fail: ∀e_ExprNesting_≤DepthCap ran red on the pre-fix commit <sha> in CI run <run id> and is green on this head.
Can fail: draft change <sha> raised the cap to 3; ∀e_ExprNesting_≤DepthCap failed in its CI run <run id>, and the change was closed unmerged.
```

Incidents. On 2026-08-05, #56 (`5645a62eed`) offered seven hand-applied kernel mutants as the evidence that its new kernel laws can fail, in place of a Stryker run. On 2026-10-13, #761 (`0923912eed`) deleted a pack gate that prescribed the same route. `schema-laws` had asked a reviewer to "check it by widening the refinement locally once" (`5965b034b5:compound-packs/schema-laws/refusals-beside-generated-laws.md:52`). The repository deleted that gate because widening by hand is a hand-applied mutant (`docs/plans/2026-10-13-0612-refactor-retire-generated-schema-laws-plan.md:135`).

Gate: `review` — Does the diff, its plan or its PR body claim that a test can fail on the strength of a mutant applied by hand, or of an edit made and reverted outside CI? Does a gate, rule or plan the diff adds or changes prescribe editing the code under test by hand to show a red? Does a can-fail claim lack a failed run's id, a mutant id with the main Mutation run whose report records the claimed test in its `killedBy` (or, with no `killedBy`, the two runs that show it surviving before the test merged and killed after), a closed deliberate-red CI change or a pre-fix-commit run, without saying `red not shown`?
