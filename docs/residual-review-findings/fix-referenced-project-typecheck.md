# Residual findings — fix/referenced-project-typecheck

Source: repairing the TS6307 defect in sixteen `tsconfig.node.json` files
(`276191ff21`) and gating it (`d45a8920d8`).

Finding 1 remains open — it is a scope decision, not a defect I can close
unilaterally. Finding 2 was real and is fixed. Finding 3 was wrong: I proposed
it on an unverified number, the user challenged it, and the investigation
cleared the thing I had accused. It is kept here in full rather than deleted,
because a withdrawn finding is the one most worth writing down.

## 1. Nine packages fail the mutation gate — 243 unkilled mutants (High)

Resurrecting the gate revealed what it was hiding. These were **dead, not
failing**: on `origin/main` the checker aborted during init and tested zero
mutants. Control, run this session on `packages/oxlint-plugins/effect-workflow`
with its manifest byte-identical to `origin/main`: `StrykerError` during
typescript-checker init, 0 mutants tested. With the fix: 2193 instrumented and
scored. Nothing here is a regression — it is pre-existing debt becoming
measurable for the first time.

| package           | mutants | unkilled |
| ----------------- | ------- | -------- |
| effect-workflow   | 2193    | 92       |
| cell-imports      | 175     | 44       |
| effect-policy     | 309     | 34       |
| effect-store      | 481     | 27       |
| effect-executor   | 914     | 20       |
| test-placement    | 490     | 16       |
| effect-middleware | 587     | 4        |
| effect-state      | 368     | 4        |
| effect-observer   | 180     | 2        |

Seven affected packages score 100.00 clean: effect-acl, effect-adapter,
effect-entrypoint, effect-handler, effect-kernel, effect-shape,
property-testing.

Not all of it is weak assertions. Much of `workflow-declaration-form.ts` and
`workflow-single-function-export.ts` reports `NoCoverage` — whole rule bodies no
test reaches. A smaller set is `Timeout`, which is a different problem again
(`store-no-domain-branch.ts:34`, `executor-no-io-in-filling.ts:27`).

Closing this is writing tests for nine lint-rule packages. It needs its own
scope and your call on ordering; it is not a tail on a config fix.

## 2. Five of six root guards never ran in CI (Medium — RESOLVED)

`.github/workflows/reusable-checks.yml` ran `build`, `typecheck`, `test`,
`lint:ci`, `api:check`, and — directly, not via its npm script —
`node scripts/validate-publish-config.mjs`. It did not run `pnpm check` or
`pnpm check:ci`, so `check:exports`, `check:mutate-scope`,
`check:lint-coverage`, `check:no-hand-rolled-jsonc`, and the new
`check:project-references` fired only in local `pnpm check` and the `pre-push`
hook.

Consequence: the gate added in `d45a8920d8` did not protect `main` against a
contributor who pushes without the hook.

Resolved with the user's approval — the Locked-surface restriction was lifted
for this edit. The five guards are now explicit steps at the end of the `check`
job, placed after `api:check` because the referenced projects' tooling files
import `@systemfsoftware/vitest-config`, a workspace package. The existing
publish-config step also now calls `corepack pnpm check:publish-config` so its
selftest runs, which CI was skipping. Verified: `actionlint` exits 0, and all
six step commands run green in 18s against this tree.

## 3. The stryker-incremental cache is sound — my deletion of it was wrong (WITHDRAWN)

I removed both `actions/cache` steps from `.github/workflows/mutation.yml`,
citing this line in `AGENTS.md`: "measured reporting mutants as `Killed` that a
clean run shows `Survived` — `hex-schema` on 2026-07-31 scored 78.13% cached
against 46.88% clean on the same tree. A gate that can report a stale pass is
not a gate."

I never verified that number. Challenged on it, I tried to, and it does not
reproduce. Four experiments on `packages/hex-schema`, each comparing a cached
run against a clean run of the same tree:

| experiment                                             | cached    | clean     |
| ------------------------------------------------------ | --------- | --------- |
| cache matching the tree                                | 100.00    | 100.00    |
| cache + a deleted property test                        | 100.00    | 100.00    |
| cache + `ruleOfSchemas` encode law made vacuous        | 100.00    | 100.00    |
| cache + law generator emitting nothing (25 tests → 13) | **58.33** | **58.33** |

The last one is the decisive one. It breaks the hardest case for the differ:
twelve tests vanish while every file the differ can read stays byte-identical
(the regression is in `@systemfsoftware/effect-schema-vite`, not in
`packages/hex-schema/`). The cached run caught it and scored identically to the
clean run. `incremental-differ.ts` in our fork is unmodified upstream code —
two commits, the fork import and a formatting pass.

So the cache steps are restored, byte-identical to what they were. Both `main`
and pull requests get a full first run per package; the cache only ever skips
work whose inputs the differ has proven unchanged.

One structural hazard is real but did not produce a wrong score. The differ
decides a test file's tests are unchanged by diffing that file's on-disk source.
`src/schema-laws.test.ts` breaks that premise: the incremental report attributes
12 tests to it while its recorded source is the 321-byte generated stub, because
the plugin injects the law bodies through Vite's `transform` hook and never
writes them to disk. Experiment 3 targeted exactly this and still came out
correct — the laws are redundant enough that removing one killer leaves another.
If a future change makes a law the only killer of some mutant, this is where a
stale verdict would hide. The fix, if it is ever needed, is in our plugin: write
the generated body to disk so the differ can diff it.

Only three packages set `incremental: true` — `hex-schema`, `effect-daemon-spec`
and `oxlint-plugins/effect-schema`. For the other twenty the cache path never
existed and the steps were a no-op.

Follow-up on a Locked surface: the `AGENTS.md` sentence quoted above states a
measurement I cannot reproduce, and it is load-bearing — it is what persuaded me
to delete a working cache. It should be corrected or dated, otherwise it will
persuade the next reader too.
