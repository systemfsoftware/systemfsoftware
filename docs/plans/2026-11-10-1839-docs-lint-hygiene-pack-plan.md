---
title: The lint-hygiene compound pack - Plan
type: docs
date: 2026-11-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# The lint-hygiene compound pack - Plan

## Goal Capsule

- **Objective:** an agent about to write "add a lint rule to prevent this" — in a plan, a review finding or a learning — holds one short, self-contained rule and proposes lint only when its points hold; every other case stays review's.
- **Means:** one new pack `compound-packs/lint-hygiene/` (a README and a single rule file), the four overlapping `docs/solutions` learnings slimmed, enrolment in the packs table and CE config.
- **Authority:** the owner's `CURRENT CONTRACT` ruling supersedes the issue's history and every comment; this plan carries exactly its items 1–7 and adds no clause, edge case or appendix the contract does not ask for. Where the contract is silent, the smaller option is chosen.
- **Stop conditions:** the pack, the enrolment lines, the four slimmed learnings, the PR body and this plan. Nothing else moves.
- **Execution profile:** docs-only, branch `docs/sys-1264-lint-hygiene-pack`, gated by `pnpm check:local`.
- **Finishes and ships:** the ce-work executor commits the pack with this plan, pushes, and opens the PR; the conductor runs the independent review and the unseen-cases acceptance at the exact head.

## Product Contract

### Summary

Add the `lint-hygiene` compound pack: one rule file that states, in its own words, the eight points the contract lists — lint encodes a decision made once that holds for every case, and a case-by-case decision is review's; a type that makes the bad state unconstructable comes first, and a rule may only close a hole the compiler leaves open in such a type; one occurrence earns a fix, not a rule; no escape hatch; no selection by file name or location; on at error over a clean tree or off; adding, weakening or removing a rule is the owner's call, landing apart from the work it grades; and "add a lint rule to prevent this" is written only when the above hold. Enrol the pack, slim the four learnings that duplicate it, and state its reach plainly in the PR body.

### Problem Frame

Three plan rounds grew this pack's plan to 423 lines whose clauses disagreed; the owner ruled to cut it to the contract's items 1–7. The pack stays as short as the rule it teaches.

### Requirements

- R1. `compound-packs/lint-hygiene/` holds a README and one rule file, `a-lint-rule-enforces-a-decision-it-never-makes-one.md`. The rule body is no longer than the average rule in `compound-packs/` (about 2,300 characters) and a reader can apply it with only that file: no pointer outside the pack, no incident narrative. (Contract items 1, 3)
- R2. The rule states item 2's eight points and nothing more, in its own words. The conductor's constructor ruling folds into the type point: a rule closing a compiler hole reports the bypass, the definition owning the invariant is not a bypass, and the rule identifies it from the code, never by a path. A case the rule does not decide is review's; no clause is added for it. (Contract item 2)
- R3. The rule carries `title` and situational `applies_when` frontmatter (one situation per line, in the words a task would use), prescriptive always/never prose, and at most one short WRONG/RIGHT example. The README describes the pack and carries nothing a reader needs. (Contract item 3)
- R4. `compound-packs/README.md`'s table and `.compound-engineering/config.yaml` list the pack. (Contract item 4)
- R5. The four learnings stating what the rule now states — `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`, `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`, `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`, `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — are slimmed to their story plus a citation of the rule, and every line prescribing a baseline or a hatch is removed. No other `docs/solutions` file changes. (Contract item 5)
- R6. The PR body says plainly where the pack is loaded — plan, brainstorm, review of a diff that touches lint rules or config, learning capture — and where it is not. (Contract item 6)
- R7. `pnpm check:local` exits 0 on the head; the PR merges through the queue after a clean independent review at its exact head and the conductor's unseen-cases run. (Contract item 7)

### Scope Boundaries

- No change to any existing lint rule, preset, `AGENTS.md` or `CODING_STANDARDS.md`; existing rules and their options (including `void` on a promise) are not re-graded.
- No new lint rule, test, check, hook or CI job.
- Nothing in pack text quotes, names or points to `repos/constitution/ENFORCEMENT.md`.
- No grader edit, `--no-verify` or force-push.

## Planning Contract

### Key Technical Decisions

- KTD1. One rule file, not two. The owner's cut replaces the prior two-rule design (proposal plus prune); the eight points fit one body, and a second file is a clause the contract does not ask for. Governs R1, R2.
- KTD2. The old plan file is overwritten in place. (session-settled: user-directed — overwrite chosen over a superseding new file: smaller diff, git history keeps the rest.) Governs R7.

## Implementation Units

### U1. Write the pack

- **Goal:** `compound-packs/lint-hygiene/` exists with its README and the one rule file (R1–R3).
- **Files:** `compound-packs/lint-hygiene/README.md`, `compound-packs/lint-hygiene/a-lint-rule-enforces-a-decision-it-never-makes-one.md`.
- **Approach:** the body carries R2's points as always/never prose in the rule's own words; frontmatter per R3; at most one WRONG/RIGHT example; body at or under 2,300 characters. Mirror the shape of an existing rule, e.g. `compound-packs/testing/configuration-gets-no-test-and-no-gate.md`.
- **Test expectation:** none -- docs-only; verification is the resolver and length check.

### U2. Enrol the pack

- **Goal:** the resolver loads the pack (R4).
- **Depends on:** U1.
- **Files:** `compound-packs/README.md`, `.compound-engineering/config.yaml`.
- **Approach:** table row after `ci-workflows`; `- source: compound-packs/lint-hygiene` at the same position in `packs:`.
- **Test expectation:** none -- config-only.

### U3. Slim the four learnings

- **Goal:** no unlinked duplicate stays and no learning prescribes a baseline or a hatch (R5).
- **Files:** the four paths named in R5.
- **Approach:** per learning, keep the incident story, delete what the rule now states, cite `(pack: lint-hygiene, a-lint-rule-enforces-a-decision-it-never-makes-one.md)`; remove every baseline/hatch-prescribing line.
- **Test expectation:** none -- docs-only.

### U4. Ship the PR

- **Goal:** the pack lands with its reach statement (R6, R7).
- **Depends on:** U1–U3.
- **Files:** the PR body of branch `docs/sys-1264-lint-hygiene-pack`.
- **Approach:** commit the pack, the enrolment, the slimmed learnings and this plan; push with a plain literal command naming the branch; open the PR whose body states where the pack loads and where it does not.
- **Test expectation:** none -- delivery.

## Verification Contract

- `pnpm check:local` exits 0 on the head (R7).
- The pack resolver resolves `lint-hygiene` with one rule and no warnings (R1, R4).
- `wc -c` on the rule file shows a body at or under 2,300 characters (R1).
- Each slimmed learning cites the rule and keeps no baseline/hatch prescription (R5).
- `grep -rn ENFORCEMENT compound-packs/lint-hygiene/` finds nothing (Scope Boundaries).

## Definition of Done

- Contract items 1–7 hold: pack written and enrolled, the four learnings slimmed, the PR body states the reach, the gate is green at the head, and merge follows a clean review at the exact head plus the conductor's unseen-cases run.
- The diff holds nothing outside R1–R7; abandoned drafting attempts are deleted before landing.
