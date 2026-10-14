---
title: Can-fail evidence and shipped test subjects - Plan
type: docs
date: 2026-10-14
topic: boundary-testing-test-evidence
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-14-0045-docs-boundary-testing-test-evidence-plan.md
---

# Can-fail evidence and shipped test subjects - Plan

## Goal Capsule

- **Objective:** `boundary-testing` judges two kinds of test evidence that no rule judges today. A claim that a test can fail names an observed red through one of four routes, or states `red not shown`, and never rests on a mutant applied by hand. A test's subject is code the package ships, never a function, table or literal the test file declares.
- **Means:** two new rules, `can-fail-evidence-is-an-observed-red` (R1-R3) and `the-subject-is-shipped-code` (R4-R6), indexed in the pack README (R7).
- **Product authority:** the root's intent of 2026-10-13, items (4) and (6). This plan settles the rule ids, the scope and the lint hypothesis.
- **Stop conditions:** stop and report before editing `repos/` (REPO-S3), before running any mutation (REPO-D3), and before adding a lint rule, lane or CI job (GATE1).

## Product Contract

### Summary

Two new `boundary-testing` rules. One governs what counts as evidence that a test can fail. The other governs what a test may take as its subject. The intent's item (5) and item (7) go elsewhere (Scope Boundaries).

### Problem Frame

- **Hand-applied mutants have stood in for can-fail evidence.** #56 (`5645a62eed`, 2026-08-05) offered seven kernel mutants "applied by hand and the suite re-run" as its proof, in place of a Stryker run. #761 (`0923912eed`, 2026-10-13) deleted a `schema-laws` gate that asked the reviewer to "check it by widening the refinement locally once" (`5965b034b5:compound-packs/schema-laws/refusals-beside-generated-laws.md:52`), because widening by hand is a hand-applied mutant (`docs/plans/2026-10-13-0612-refactor-retire-generated-schema-laws-plan.md:135`). These are two changes two months apart: one PR's evidence, and one pack's gate text.
- **Tests have asserted on what their own file declared.** `3f59d516ba` (2026-08-17) deleted a test whose subjects `wrap` and `half` the test declared (`3f59d516ba^:packages/effect-purity-law/src/__tests__/rule-of-purity.kernel.test.ts:5,8,24-39`). #747 (`4ae7e9e17c`, 2026-10-13) merged a matcher and its case table in one test file (`scripts/tools/mutation-probe.contract.test.ts:20-23,43-64`). The owner rejected it as "completely tautological", and open #767 deletes it. These are two packages, a Vitest suite and a Deno suite, two months apart.

### Ownership (what already exists and is not restated)

- CONST-T3 and CONST-T8 are the laws (`CONSTITUTION.md:78-83,90-95`). CONST-T10 owns where an expected value comes from, and `boundary-testing/expected-values-never-come-from-the-subjects-output.md` applies it to generated and golden output. `schema-laws/tests-own-no-schemas.md` refuses a schema a test declares for itself. None of the three names a function, matcher, table or literal that a test file or a test-tree helper declares, so R4 is new; it extends the schema-only refusal to every kind of subject.
- REPO-D3 forbids local mutation runs (`AGENTS.md:68`), and `mutation-discipline` reads a kill off the CI report (`kill-survivors-with-contract-properties.md:44`). Neither names a hand-applied mutant as evidence, or the other routes.
- `schema-laws/refusal-properties-cover-unobservable-boundaries.md:41` already names the four routes and `red not shown` for refusal properties. R1 generalises them to every test. That file stays as it is in this change because open #769 edits it. Re-pointing `:41` at R1 is the follow-up (Scope Boundaries).
- **Contradiction.** The vendored `repos/constitution/ENFORCEMENT.md:214` prescribes "Sabotage after green", a hand-applied route. It is read-only (REPO-S3), and the retire plan already rules that the sentence is deleted upstream (`...-retire-generated-schema-laws-plan.md:147`). R3 names the conflict and says which text governs here until the deletion lands.

### Key Decisions

- **Two rules in `boundary-testing`, not amendments.** Both rules govern what a test may claim as evidence and what it may take as its subject. That is test verification, the remit `boundary-testing` already holds for oracles and parity. The oracle rule's subject is the expected value, and both new subjects differ from it. Their ids are `boundary-testing/can-fail-evidence-is-an-observed-red` and `boundary-testing/the-subject-is-shipped-code`.
- **A route a reviewer can re-run.** All four routes leave an artifact that someone other than the author can check: a run id, a mutant id, a closed red CI change, or a pre-fix commit to check out. A hand edit that was reverted leaves none.
- **The structural lint was tested as a hypothesis and is not built.** The hypothesis: a test-discipline oxlint rule could flag a test whose subject its own file declares. A sampled census of test files under `packages/**` at `de684e25d6` (the first 200 the glob returned) found no live instance, and local fixtures, arbitraries and wrappers make up its false-positive classes. The #747 instance sits in `scripts/tools/`, a Deno tree that oxlint does not lint. A new gate needs the operator's sign-off (GATE1) and an earned defect. The gate stays `review`, and the root may revisit the lint with these facts.
- **Item (5) is its own change.** The `tests-import-public-api` fix text (`packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/tests-import-public-api.config.ts:5-6`) offers only "public" or "internal". A third branch, never exporting a binding only so a test can reach it, changes a published package's message and needs a changeset. It is a different review from pack text, so it is the next pull request.
- **Item (7) gets a solution entry.** Only one short-ref enrolment incident was found (pnpm-release-management#57). Without a second incident, a pack rule is not earned, so a `docs/solutions/` entry records it, in its own change.

### Requirements

- R1. A new rule `compound-packs/boundary-testing/can-fail-evidence-is-an-observed-red.md` in the pack format: frontmatter `title`, `applies_when`, `tags`; the why from the two independent public incidents; `## Rule`; WRONG/RIGHT; a closing `Gate: review` question answered from the diff and the PR body.
- R2. Routes, in each of which the red is the claimed test failing: a generated-input property run that failed (run id); a mutant id in the latest main CI Mutation report, which attests a test only once that run ran with the test on main; a throwaway deliberate-red CI change that breaks the code holding the behaviour (run id, closed unmerged); the new test run red on the real pre-fix commit. Otherwise the change says `red not shown`.
- R3. A hand-applied mutant is never evidence, whether reverted or described. A gate, rule or plan that a change adds or edits names one of the four routes, never a hand-applied mutant; a dated plan nobody edits stays as a record. The author may still break the code while working; the evidence is the red one of the four routes then shows. The rule names the vendored `ENFORCEMENT.md:214` conflict and how it resolves.
- R4. A new rule `compound-packs/boundary-testing/the-subject-is-shipped-code.md` in the same format. The subject a test asserts on is declared in a shipped module, never in a test file or a test-tree helper. A test file (one the runner collects that ships nothing) imports it through the route the test-placement lint allows (in a tree no such lint covers, from the module that ships it) and declares inputs only (fixtures, arbitraries, builders, fakes). An in-source block in a shipped module may assert on that module's own declarations. A binding a shipped module exports only so a test can reach it does not count as shipped.
- R5. No assertion on the language's, the runtime's or a dependency's semantics as a stand-in for the package. Dependency semantics the package relies on go to `pin-dependency-semantics`, and the reason for a choice goes to the chosen code's doc comment.
- R6. A case table checks a shipped predicate. A table in a test file whose predicate the test file or a test-tree helper declares is deleted with it, or the predicate moves to the module that uses it. An in-source table in a shipped module stays.
- R7. The pack README lists both rules with their slugs, and the subject rule's `applies_when` names each case its Gate asks about, including a binding exported only so a test can reach it.

### Acceptance Examples

- AE1. **Covers R2, R3.** A PR body says "applied the mutant by hand, the test went red, reverted": refused. It says "red on pre-fix commit `<sha>`, CI run `<id>`": holds. It says `red not shown`: holds, and the review weighs the test without that evidence.
- AE2. **Covers R3.** A pack gate the diff adds reads "check it by breaking the code locally once": refused.
- AE3. **Covers R4, R6.** A test file declares `const isAllowed = (x) => ...` and asserts a case table against it: refused. It imports `isAllowed` through the package's published name, from the module that ships it: holds.
- AE4. **Covers R4.** A test file declares an arbitrary and a fake store, and asserts on a decider it imports: holds, because those declarations are inputs.
- AE5. **Covers R5.** A test asserts `Object.is(NaN, NaN)` to explain a comparison choice: refused. A parity test pins a dependency's parse result that the package relies on: holds under `pin-dependency-semantics`.
- AE6. **Covers R4.** An in-source property block in `src/decide.ts` asserts on `decide`, which that module declares and ships: holds.

### Scope Boundaries

- `schema-laws`, `mutation-discipline` and `repos/` are untouched. `refusal-properties-cover-unobservable-boundaries.md:41` is re-pointed at R1 after #769 lands, because #769 edits that file.
- The `tests-import-public-api` fix text (item 5) is the next pull request. The short-ref enrolment entry (item 7) is a `docs/solutions/` change after it.
- No lint, lane or CI job is added (Key Decisions).

### Sources / Research

- Mark Seemann, "Tautological assertion" (https://blog.ploeh.dk/2019/10/14/tautological-assertion/): "the red-green-refactor process encourages you to run each new test and see it fail. If you haven't seen it fail, you don't know if you've avoided a tautology." The same post breaks the code on purpose ("Devil's advocate"), which is why R3 forbids a hand edit only as evidence.

- #56 body (`5645a62eed`); #761 (`0923912eed`); `5965b034b5:compound-packs/schema-laws/refusals-beside-generated-laws.md:52`; `docs/plans/2026-10-13-0612-refactor-retire-generated-schema-laws-plan.md:135,147`.
- `3f59d516ba` (commit message; `3f59d516ba^:packages/effect-purity-law/src/__tests__/rule-of-purity.kernel.test.ts:5-39`); `4ae7e9e17c:scripts/tools/mutation-probe.contract.test.ts:20-64`; #767 body ("completely tautological").
- `CONSTITUTION.md:78-95`; `repos/constitution/ENFORCEMENT.md:207-233`; root `AGENTS.md:59,68`; `compound-packs/schema-laws/refusal-properties-cover-unobservable-boundaries.md:41`.

### Assumptions challenged (destructive review)

- **"A hand edit is a local mutation run, so REPO-D3 already forbids it."** Broken: REPO-D3 forbids starting local mutation runs, and a one-off manual edit is not a Stryker run. Seemann uses a deliberate defect as an ordinary TDD aid. R1's reason is that the red cannot be checked, not REPO-D3. R3 forbids the hand edit only as evidence.
- **"A test never asserts on a declaration in its own file."** Broken for in-source blocks: a property block inside `src/decide.ts` asserts on `decide`, declared in the same file, and that module ships. R4 scopes the refusal to test files, files the runner collects that ship nothing (AE6).
- **"The RIGHT example imports the subject from `../src`."** Broken: `tests-import-public-api` refuses a package-level test that relative-imports `src`. The RIGHT example imports the published name, and R4 says "through the route the test-placement lint allows".
- **"A structural lint can enforce R4."** Tested and not built (Key Decisions): no live instance under oxlint's reach at `de684e25d6`, one incident outside it, and GATE1.

## Planning Contract

### Key Technical Decisions

- KTD1. **Pack text only.** Every change is in `compound-packs/boundary-testing/` plus this plan. Nothing executes it, so no test is admitted.
- KTD2. **Citations resolve at public SHAs.** `5645a62eed`, `5965b034b5`, `0923912eed`, `3f59d516ba` and `4ae7e9e17c` are on main in this public repository.

## Implementation Units

### U1. The two rules and the README index

- **Goal:** R1-R7.
- **Files:** `compound-packs/boundary-testing/can-fail-evidence-is-an-observed-red.md` (new), `compound-packs/boundary-testing/the-subject-is-shipped-code.md` (new), `compound-packs/boundary-testing/README.md`.

## Verification Contract

- Every new `<sha>:<path>:<line>` and `path:line` resolves to the quoted text.
- The CE pack resolver loads every declared pack with empty `errors` and `warnings`.
- `pnpm check:local` passes after the last edit, apart from the `/dev/kvm` microVM suite, which runs in CI.
- A full-path `ce-code-review` receipt on the final head lists every matched pack and constitution rule with its disposition and `file:line`, and records a blind DeepSeek or MiniMax peer, overfit evidence for each new rule, and a ruling for every finding. A privacy grep (every private repository name in the organisation, local paths, private run ids) covers the diff, the commits and the PR body. The receipt also records the ce-compound result, and CI is green on the final head.

## Definition of Done

- U1 and this plan landed in one pull request, with CI green on its final head and the review receipt in its body.
