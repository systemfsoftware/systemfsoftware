---
title: Public Tree Naming - Plan
type: docs
date: 2026-10-08
topic: public-tree-naming
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Public Tree Naming - Plan

## Goal Capsule

- **Objective:** no tracked file outside `repos/` names a private repository.
- **Means:** reword one line of `.github/AGENTS.md` and one fixture string in `scripts/tools/test-timings.test.ts`. Nothing else changes.
- **Authority:** conductor rulings 01, 02 and 03 on the 2026-10-08 harness brainstorm. This is layer 1 of three independent pull requests, cut from `main` and not stacked on the others.
- **Stop conditions:** stop and report if a third tracked occurrence of the private name turns up outside `repos/`, or if the reworded fixture changes what `honoursShard` returns for it.
- **Execution profile:** one maker, inline. No subagent, no corpus run.
- **Ships as:** one pull request with this plan as its only plan file (`REPO-D2`).

---

## Product Contract

### Summary

The repository is public, and two tracked files still name a private consumer. The CI runbook line keeps its meaning with a neutral subject, and the test fixture keeps exercising the same shard case under the tree's existing fixture organisation, `acme`.

### Problem Frame

`.github/AGENTS.md:17` names the private repository that calls `reusable-checks.yml`. `scripts/tools/test-timings.test.ts:268` uses that repository's package scope inside a shard-detection fixture. A word-bounded, case-insensitive search of every tracked file outside `repos/` found no third occurrence on 2026-10-08.

### Key Decisions

- **Neutral subject in the runbook.** The sentence becomes "Consumers call it pinned by commit SHA." Governs R12. (session-settled: user-directed — chosen over naming the consumer or dropping the sentence: the pinning fact is what a maintainer needs, the consumer's name is not)
- **`acme` as the fixture scope.** The fixture becomes `pnpm --filter @acme/web build && vitest run`. Governs R13. (session-settled: user-directed — chosen over inventing a new placeholder: `acme` is already the fixture organisation in `crates/gritlint_core/tests/fixtures/` and `packages/npm-package/tests/`)
- **History stays.** The private name remains in past commits. Removing it would need a history rewrite and a force-push, which are out of scope.

### Requirements

- R12. No tracked file outside `repos/` names a private repository.
- R13. The reworded `honoursShard` fixture still exercises a `pnpm --filter <scope> build && vitest run` script and still expects `true`.

### Scope Boundaries

- No guard, CI grep or lint rule for private names. The cleanup is a one-time edit.
- No history rewrite.

### Sources / Research

- `.github/AGENTS.md:17`, `scripts/tools/test-timings.test.ts:261-289`.
- Fixture organisation precedent: `crates/gritlint_core/tests/fixtures/engine/single/package.json`, `packages/npm-package/tests/package-tree-memfs.integration.test.ts`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **No changeset.** Neither file is a build input of a publishable package: turbo's `build` inputs are `src/**` and the tsconfig files (`turbo.json:15-18`), and `globalDependencies` lists only `scripts/tools/patch-tsgo-if-needed.mjs`. The `changeset-check` workflow decides; if it asks for one, the intent is `pnpm change --bump none`.

### Assumptions

- The conductor named every private repository the tree mentions. Every `github.com/systemfsoftware/*` URL in the tree resolved to a public repository on 2026-10-08.

---

## Implementation Units

### U1. Reword the runbook line and the shard fixture

- **Goal:** R12 and R13 hold.
- **Requirements:** R12, R13.
- **Files:** `.github/AGENTS.md`, `scripts/tools/test-timings.test.ts`.
- **Approach:** replace the whole sentence at `.github/AGENTS.md:17` that names the private repository with "Consumers call it pinned by commit SHA." and leave the rest of the bullet unchanged. Replace the package scope in the fixture string at `scripts/tools/test-timings.test.ts:268` with `@acme/web`.
- **Test scenarios:**
  - The `Deno.test` "a script shards only when its last command is a vitest run with flags" passes, with the reworded string in the `true` list.
- **Verification:** the planner test passes, and the private-name search below returns nothing.

---

## Verification Contract

- `deno test --config=scripts/deno.jsonc --lock=scripts/deno.lock --frozen --allow-read --allow-write --allow-env --allow-run scripts/tools/test-timings.test.ts` exits 0. This is the command the `plan` lane runs (`.github/actions/checks-lane/action.yml:26`).
- A word-bounded, case-insensitive `git grep` for the private name over tracked files, excluding `repos/`, returns no match. The scope matches R12 exactly; no lockfile names it. Run it in the session and do not commit it (scope boundary: no gate).
- `pnpm check:local` exits 0 after the last edit (`REPO-D1`).
- The pull request is watched to green.

## Definition of Done

- R12 and R13 hold, and every Verification Contract command passed after the last edit.
- The commit message, branch name and pull request body do not name the private repository.
- No scratch files are left in the tree.
