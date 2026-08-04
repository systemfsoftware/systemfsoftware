# Residual findings — fix/referenced-project-typecheck

Source: repairing the TS6307 defect in sixteen `tsconfig.node.json` files
(`276191ff21`) and gating it (`d45a8920d8`). Each item below is out of that
change's scope, or lands on a Locked surface I may not edit.

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

## 2. Five of six root guards never run in CI (Medium — Locked surface)

`.github/workflows/reusable-checks.yml` runs `build`, `typecheck`, `test`,
`lint:ci`, `api:check`, and — directly, not via its npm script —
`node scripts/validate-publish-config.mjs`. It does not run `pnpm check` or
`pnpm check:ci`, so `check:exports`, `check:mutate-scope`,
`check:lint-coverage`, `check:no-hand-rolled-jsonc`, and the new
`check:project-references` fire only in local `pnpm check` and the `pre-push`
hook.

Consequence, stated plainly: the gate added in `d45a8920d8` does not protect
`main` against a contributor who pushes without the hook. Grep confirming the
absence: no match for `check:ci|check:exports|check:no-hand-rolled|check:mutate-scope|check:lint-coverage|pnpm check`
anywhere under `.github/workflows/`.

Proposed: add `- run: corepack pnpm check:ci` to the `check` job, or add the
five guards as explicit steps beside the publish-config one that is already
there. I did not make this edit — `.github/workflows/` is Locked.

## 3. CI mutation restores a stryker-incremental cache the repo's own rules reject (Medium — Locked surface)

`.github/workflows/mutation.yml:52-57` restores
`<package>/reports/stryker-incremental.json` from cache before each run and
saves it after runs on `main`.

`AGENTS.md` says of that file: "Delete the package's
`reports/stryker-incremental.json` before any run you will cite as evidence. It
is a regenerable cache keyed on source hashes, never a baseline... measured
reporting mutants as `Killed` that a clean run shows `Survived` — `hex-schema`
on 2026-07-31 scored 78.13% cached against 46.88% clean on the same tree. A
gate that can report a stale pass is not a gate."

The CI mutation job is exactly such a gate. Every local run cited in this
session deleted the file first; CI does the opposite. Given finding 1, this
matters more than it did yesterday: nine packages are about to start reporting
real survivors, and a restored cache can mask them.

Proposed: drop the cache steps, or key them so a changed source tree cannot
restore a prior verdict. Locked surface — not edited.
