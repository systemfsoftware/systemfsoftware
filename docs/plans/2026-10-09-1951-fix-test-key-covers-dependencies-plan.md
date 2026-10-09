---
title: Key CI Test Tasks on Their Dependencies - Plan
type: fix
date: 2026-10-09
topic: test-key-covers-dependencies
artifact_contract: ce-unified-plan/v1
product_contract_source: operator brief (unit T)
execution: code
supersedes: docs/plans/2026-10-09-1831-fix-test-key-covers-dependencies-plan.md
---

# Key CI Test Tasks on Their Dependencies - Plan

## Goal Capsule

- **Objective:** a source change to a workspace package moves the CI test-task cache key of every package that depends on it, directly or transitively, so no dependent's test verdict is replayed from cache. Unaffected packages may still hit.
- **Where:** the `Test` step of `.github/workflows/reusable-checks.yml` (`turbo run test --only --concurrency=1 …`), and the `build` task's inputs in `turbo.json`, which carry a dependency's source into its dependents' keys.
- **Supersedes** the 1831 plan after review: C1-C5 ran under it; KTD5, U4 and C6-C8 are new.
- **Ships as:** one PR off `main`; the CI proof runs on that PR's own commits.

## Findings that change the brief's picture

- F1. This repository's `ci.yml` passes no `dry-run`, so its planner skips nothing: `skippedOf` returns `[]` when the dry run is empty (`scripts/tools/test-timings.ts:286-288`). The skip logic is live only in a consumer that passes `dry-run`, so predicate 3 has no CI evidence in this repository.
- F2. Of the organisation's repositories the token can read, one calls this workflow: a private one, pinned by commit SHA to `ea2037df` (#679), whose workflow file is identical to `main`'s. It passes `test-flags: --force` (as the `dry-run` input's description tells it to) and a dry run of `turbo run test --dry=json`, without `--only`. Two other private repositories carry their own `reusable-checks.yml` and do not call this one. 32 of 63 live repositories have no `.github/workflows` the token can read; they are a known blind spot, not a checked absence.
- F3. Local probe at `b1f96237` (turbo 2.11.5): a unique line appended to `packages/runner/vitest/src/failure.ts` moves the `test` hash of 33 of 50 test tasks without `--only` (the fork plus exactly its pnpm dependents) and of 1 with `--only` (the fork). Every dependent of the fork depends on it directly. `@systemfsoftware/oxlint-import-origin` has 42 test tasks that move with it (itself plus its dependents), and the edit moves exactly those 42.
- F4. Every workspace `build` is cached (no package `turbo.json` sets `cache: false` on `build`). `turbo run build --filter=@systemfsoftware/effect-atom --dry=json` lists the same 27 build tasks, at the same hashes, as the non-test tasks of `turbo run test --filter=@systemfsoftware/effect-atom --dry=json`: the job's Build step builds every dependency the Test step's graph holds.
- F5. A package with no `build` script still has a `build` node (`<NONEXISTENT>`) that hashes its `build.inputs`, so its `src/**` reaches its dependents' keys. Files outside those inputs reach them only by another route: `tsconfig`'s JSON is in every package's `build.inputs`; `tsdown-config` reaches the global hash through the root's dependency on `oxlint-config-rule-authoring` (an edit moves all 50). Two packages ship hand-written `lib/` with dependents and no source in `build.inputs`: `vitest-config` (39 dependents, patched by a `test.inputs` glob in the root and both sim packages) and `stryker-config` (26 dependents; an edit moved no dependent's test key).
- F6. The token cannot dispatch or re-run workflows (`gh workflow run` answers HTTP 403). Every CI run comes from a push to the PR, so a "no-change rerun" is a commit that moves no test key.

## Key Decisions

- KTD1. **Drop `--only` from the `Test` step.** The test task's key then folds in its own `build` hash and every `^build` hash, which fold in their dependencies' in turn. The Build step before it already ran those builds in parallel (F4), so in the Test step they are cache hits that restore `dist/**`, under the same `--concurrency=1`. Keep the Build step: without it, `--concurrency=1` would run the builds one at a time.
  - Rejected: an env fingerprint of the dependencies' sources fed into `test.env` (a second, hand-built key beside turbo's own); `$TURBO_ROOT$` globs of dependency sources in `test.inputs` (per-package, rots on every new edge); dropping the Build step (serial builds); `--force` (no warm-rerun hits).
- KTD2. **The planner stays as is.** `test-timings.ts` reads only `test` tasks from the summary (`entriesFromTurboSummary`, `task.task !== taskName`), so build tasks in the summary are ignored. Its skip compares the dry-run hash of `turbo run test --dry=json`, which already includes the dependency hashes (F3). After KTD1 the test job's own key covers dependencies too, so the `dry-run` input's advice to pass `--force` in `test-flags` is obsolete: the description is rewritten to require a dry run without `--only` and drops the `--force` advice.
- KTD3. **Consumers.** This repository's `ci.yml` calls the workflow by path and gets the change with the PR. The pinned consumer gets nothing until it bumps its pin; when it does, it should drop `--force` from `test-flags`: with `--only` gone, `--force` would also re-execute every dependency build one at a time inside the Test step.
- KTD4. **Docs.** `.github/AGENTS.md`'s test-jobs fact drops `--only` and says the key covers dependencies. The solution doc's paragraph says the hole is closed and how; the uncached-local-run workaround goes, with no tombstone. The `applies_when` entry about `--only` stays: it is still the condition under which the lesson applies.
- KTD5. **Hash `lib/**` in `build.inputs`; delete the three `vitest-config/lib/**` test-input globs.** Only those two packages track a `lib/` (`git ls-files '*/lib/*'`), and no package generates one. Every importer of either declares it (39 and 26), so after KTD1 each dependent's test key folds the package's `build` hash, which now covers `lib/**`. The globs become redundant and go. Every publishable build hash moves once with the task definition, so a `none` intent names the 39.

## Assumptions Challenged (edge-first)

- A1. _The Test step's builds are cache hits._ Holds while every `build` is cacheable and the Build and Test steps hash the same env (same job, same `env`) (F4). Checked on C3 and later: every `build` task in the Test step's summary must be HIT; a MISS is a cost regression to fix before merge.
- A2. _The dry-run hash equals the test job's key._ False in general: the test lane sets `CONFORMANCE_PROFILE`, the plan job does not. The planner never needs equality: it compares a dry-run hash with a recorded dry-run hash, and both include the dependency hashes.
- A3. _A HIT/MISS split proves the key._ Only on a warm cache. Each test job restores `turbo-<os>-test-<job id>-*`; a job id the plan did not reuse, or an evicted entry, starts cold, and a cold job turns the negative's HIT into a MISS. Every comparison therefore reads each job's restore line first: a job that restored nothing is reported as inconclusive, never as a result.
- A4. _The proof can end on a reverted head._ It cannot also leave a head whose test tasks ran: reverting a plant restores a tree whose keys the fix's run already cached. The sequence below introduces the plant before the fix and reverts it after, so the revert is the head and is the first commit under the new key whose dependents' keys were never stored.
- A5. _The planted packages' dependents are seen in the summaries._ A package over 5 minutes runs as vitest shards, which never call turbo and so always execute; their artifacts hold `{package, shard, seconds, exit}`, not a `cache.status`. They count as executed from their shard records.

## Tests

No permanent test. The planner does not change; the workflow's behaviour is proven by the CI runs below; a check that greps for `--only` is out of scope by the brief. The planner smoke is throwaway, outside the repository, deleted after the run.

## Implementation Units

- U1. `.github/workflows/reusable-checks.yml`: `Test` step without `--only`; `dry-run` description rewritten (KTD2).
- U2. `.github/AGENTS.md` line 18 (KTD4).
- U3. `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md`: the `--only` paragraph and point 4 of the guidance (KTD4).
- U4. `turbo.json` `build.inputs` gains `lib/**`; the `vitest-config/lib/**` glob leaves root `test.inputs` and both `packages/sim/*/turbo.json`; `.changeset/` `none` intent (KTD5).

## Verification

Local:

- The plant probe on the plant set below: without `--only` the moved test hashes equal the planted packages plus their pnpm dependents; with `--only`, only the planted packages that have tests.
- Planner smoke (predicate 3), dry runs generated locally before and after a plant: a record saying every package passed on the pre-plant hash plans exactly the planted package's dependents and skips the rest; the same record against `--only` dry runs plans only the planted package (the negative).
- `lib/**` probe (KTD5): a unique line appended to `stryker-config/lib/base.js` moves exactly that package's test key plus its 41 transitive dependents' (42); on the pre-U4 config it moves only its own (the negative). The same edit to `vitest-config/lib/files.js` moves its 46 plus 4 non-dependents through the global hash (over-invalidation, not a hole).
- `pnpm check:local`.

Plant set: one unique comment line in a source file of `@systemfsoftware/oxlint-import-origin` (33 of its dependents depend on it only transitively) and of `@systemfsoftware/oxlint-plugin-test-discipline`. Neither reaches the global hash. Together they move 38 of the 39 CI test tasks; the 39th, `tsdown-config`, depends on neither.

CI, on the PR, one run per push, each finished before the next push (`ci.yml` cancels in progress); every run uses the `local` profile:

1. C1, the plan only (old workflow): no test key moves from `main`, so this is the old no-change run.
2. C2, the plant (old workflow): the negative; dependents replay.
3. C3, U1 with the plant still in: every test key moves once, with the new key's composition.
4. C4, U2-U3 (docs): no test key moves; the new no-change run.
5. C5, revert the plant: every dependent's key moves to a value never stored; they execute, `tsdown-config` may hit.
6. C6, U4 with the review dispositions: every test key moves once with the new `build` definition.
7. C7, a plant in `stryker-config/lib/base.js`: the C6-to-C7 test-hash delta equals that package's dependents, and they execute. This isolates the plant: no workflow or key-definition change rides with it (C3 carried the workflow change as well).
8. C8, revert the C7 plant (the head): the same dependents execute under keys never stored.

Evidence per run: each test job's `test-timings-part-*` artifact (the turbo run summary, or a shard record, A5) gives each `test` task's `cache.status`, compared against the set the local probe computes; each job's log gives its cache-restore line (A3). Wall time: the jobs API's start and end of each `test · …` job and of its `Test` step. Jobs per run: the jobs API count.

## Acceptance

| Check                                                                                                          | Predicate |
| -------------------------------------------------------------------------------------------------------------- | --------- |
| C5: every dependent's `test` task executed (MISS or shard), on warm-restored jobs                              | 1, 2      |
| C7: test-hash delta from C6 equals `stryker-config`'s dependents, all executed; local `lib/**` probe negative  | 1, 2      |
| C2: the same dependents HIT on warm-restored jobs (old workflow); C5 reverts C2's plant                        | 2         |
| Planner smoke on local dry runs; consumer's dry run has no `--only` (F2)                                       | 3         |
| Jobs per run equal across C1-C8; C1 vs C4 (no-change) and C2 vs C5 (planted) wall times in the PR body         | 4         |
| PR body: how this repo and the pinned consumer get the change, the `--force` drop, the unreadable repositories | 5         |
| Solution doc paragraph rewritten, workaround gone                                                              | 6         |
| C8 (head) green, its dependents' test tasks executed                                                           | 7         |
