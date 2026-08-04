# Residual findings — fix/referenced-project-typecheck

Source: repairing the TS6307 defect in sixteen `tsconfig.node.json` files
(`276191ff21`) and gating it (`d45a8920d8`).

Finding 1 remains open — it is a scope decision, not a defect I can close
unilaterally. Findings 2 and 3 landed on `.github/workflows/`, a Locked
surface; the user approved editing it, and both are now resolved. They are kept
here rather than deleted so the record shows what the fix exposed.

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

## 3. CI mutation restored a stryker-incremental cache the repo's own rules reject (Medium — RESOLVED)

`.github/workflows/mutation.yml:52-57` restored
`<package>/reports/stryker-incremental.json` from cache before each run and
saved it after runs on `main`. Its `restore-keys` fallback accepted any prior
cache for the package regardless of tree state.

`AGENTS.md` says of that file: "Delete the package's
`reports/stryker-incremental.json` before any run you will cite as evidence. It
is a regenerable cache keyed on source hashes, never a baseline... measured
reporting mutants as `Killed` that a clean run shows `Survived` — `hex-schema`
on 2026-07-31 scored 78.13% cached against 46.88% clean on the same tree. A
gate that can report a stale pass is not a gate."

The CI mutation job was exactly such a gate. Every local run cited in this
session deleted the file first; CI did the opposite. Given finding 1, this
matters more than it did yesterday: nine packages are about to start reporting
real survivors, and a restored cache can mask them.

Resolved with the user's approval: both the restore and save steps are deleted,
so every mutation run is clean. No `actions/cache` reference remains anywhere
under `.github/workflows/`. Keying the cache differently was rejected — the
measured 78.13%-vs-46.88% divergence happened despite Stryker keying the file
on source hashes internally, so the staleness is Stryker's, not the cache key's.
