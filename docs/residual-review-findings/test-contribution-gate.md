# Residual Review Findings — test-contribution gate (`c6592a5fdd..8990f7614d`)

**Run context.** Four reviewers dispatched against the 16-commit range
`c6592a5fdd..HEAD`: `GateAdversarial` (adversarial-reviewer, "can the gate
report a pass it has not earned"), `GateCorrectness` (correctness-reviewer),
`DeletionAudit` (correctness-reviewer, every non-test source deletion in
`packages/oxlint-plugins/**`), and `DiffReview` (generalist-reviewer,
whole-diff sweep). Sixteen findings: 1 P0, 2 P1, 6 P2, 7 P3. The set applied in
`8990f7614d` is tabled below; one is partially applied and the rest are
recorded as residual.

No tracker sink was used: this repository has no issue-tracker convention for
review residuals, so this committed file is the durable record.

## Applied in `8990f7614d`

| Severity | Finding                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| P0       | Stale-pass: the gate certified whatever report was on disk, with no freshness or identity check |
| P1       | Empty in-scope set was an unconditional reassuring pass                                         |
| P2       | Report entries for deleted test files kept their stale sole-kill credit (read-side of the P0)   |
| P2       | Precision (`disableBail`) was read from the live config, so a toggle relabelled old data        |
| P2       | Unknown `killedBy` test ids were dropped silently, inflating sole-kill credits                  |
| P2       | `NOT_SOURCE` regex was unanchored and over-excluded mid-path directory names                    |

Each is pinned by a scenario in `__tests__/test-contribution/` that was proven
to go red without its fix (nine source mutations, each killed by its own
named scenario), and every refusal was exercised against real reports in this
repo before the commit landed.

**Partially applied.** _P2 — adversarial — lock relocation._ The gate moved
from a conspicuous top-level `scripts/` file into a neutrally-named
subdirectory of an otherwise-Editable package. Added
`packages/stryker-plugins/src/test-contribution/AGENTS.md` so an agent working
from the leaf delta sees the lock without re-deriving it from the root Surface
Classes table. The mechanical half is still residual — see below.

## Residual

- **P1 — adversarial — not wired into any automated check.** Nothing in
  `pnpm check`, `turbo.json`, or `.github/workflows/reusable-checks.yml`
  invokes the gate; the sole reference is prose at `AGENTS.md:127`. A task can
  satisfy REPO-D1 without the gate ever executing. **Not fixed here because
  both available wirings are decisions for the author, not a review-fix
  edit.** (a) Adding a `check:test-contribution` step to the `pnpm check`
  chain fails immediately: `pnpm check` does not run mutation, so every
  package would be judged on a stale or absent report — the gate would refuse
  repo-wide and the baseline would go red on arrival. (b) Appending the gate
  to each package's `mutation` script is the correct home — the report is then
  seconds old and the gate is structurally unskippable — but it needs a
  `@systemfsoftware/stryker-plugins` devDependency and a script change in each
  of the 23 packages carrying a `stryker.config.json`, and it makes
  `pnpm --filter <pkg> mutation` fail today for every package with a real
  finding (see "Findings the gate surfaced" below). That is the gate working,
  but it changes the DoD command's behaviour repo-wide and should be a
  deliberate choice. **Honest scope note:** the deleted
  `scripts/test-contribution.mjs` was also prose-only, so on the automation
  axis this is parity, not a regression introduced by the replacement.

- **P2 — adversarial — Locked-surface enforcement is prose-only.** No lint
  rule, guard script, or hook rejects an edit to a Locked path — true equally
  of `scripts/guard-mutate-scope.mjs` and `scripts/check-lint-coverage.mjs`,
  so this is parity with the siblings rather than a new hole. The leaf
  `AGENTS.md` added above closes the noticeability half only. **Proposal:** a
  `scripts/guard-locked-surfaces.mjs` mirroring `guard-mutate-scope.mjs` that
  fails when a commit touches a Locked path without an accompanying
  declaration. Not written here: a guard that gates every future commit is an
  author decision, and writing it during a review-fix pass on a Locked surface
  is the self-authorising edit the class forbids.

- **P2 — generalist — two incompatible causal accounts of hex-schema's 75.00
  ship in the same range.** `94de41f3c0`'s message diagnoses the drop as the
  differ reusing stale verdicts because `schema-laws.test.ts` bodies are
  injected at runtime by `packages/effect-schema-vite/src/mod.ts:250-256`;
  `e4957f206b`'s fix restores 100.00 by re-running non-killed **static**
  mutants, so the operative cause was the static-verdict freeze. The
  test-body-blindness mechanism is real and verified but unrefuted, and
  re-enabling `incremental` re-exposes the package to it: a reused `Killed`
  verdict whose killer test changed body could mask a regression. The window
  is narrow — law bodies derive from schema sources, and a source change moves
  the mutants — so this is a latent risk, not a live defect. **Proposal:**
  correct `94de41f3c0`'s account in a follow-up note, or set
  `hex-schema`'s `incremental: false` until the injected-body case has a guard
  of its own.

- **P3 (raised to P2 here) — generalist — `packages/stryker-plugins` declares
  a dev `bin` that cannot execute.** The reviewer rated the type-stripping
  dependency P3; running it confirms the entry does not work at all, so it is
  recorded at P2. `package.json:30` maps `stryker-plugins` to
  `./src/test-contribution/main.ts`; running it under Node 24.14 fails with
  `ERR_MODULE_NOT_FOUND`, because type-stripping does not rewrite the
  `./gate.kernel.js` specifier onto `gate.kernel.ts`. `publishConfig.bin`
  correctly points at `./dist/test-contribution-gate.mjs`, so published
  consumers are fine; only the local `pnpm exec stryker-plugins` path is
  broken. **Not fixed here under REPO-S4:** tsdown generates both entries from
  `tsdown.config.ts`, hand-editing `package.json` is prohibited, and the
  dev-entry-points-at-source split is the repo-wide convention for every other
  package — it only misfires here because this entry is an executable rather
  than an importable module. `AGENTS.md:127` now documents the build-then-run
  invocation so the working path is the documented one. **Proposal:** drop the
  dev `bin` from `tsdown.config.ts` so no unrunnable entry is advertised.

- **P2 — correctness — `DeletionAudit`, one vanishingly unlikely trigger** plus
  two P3 structural-fragility notes across the 25 examined deletions in
  `packages/oxlint-plugins/**`. The audit's verdict was that no deletion
  removed reachable behaviour that could fire on real-world inputs: every
  removed guard was traced to an oxc production rule that cannot produce it.
  Recorded for completeness; no action proposed.

- **P3 — adversarial — failure messages name a repo-root report path.** Run
  with no argument from the repo root, refusals point at
  `<root>/reports/mutation-report.json` rather than a package-relative path,
  which confuses rather than misleads. Cosmetic; no unearned-pass vector.

- **P3 — generalist — three commit-message inaccuracies.** `eb7c9acc11`
  describes the before-state of `packages/oxlint-plugins/cell-imports` as a
  "raw jsr specifier" when it was a phantom dependency; `94de41f3c0` says
  `disableBail: false` "matches the twenty other packages that already set it"
  when the count was 19; `packages/stryker-js/core/src/mutants/incremental-differ.ts:46-50`
  overstates its guard ("would freeze it permanently"). Correcting any of them
  is a history rewrite of already-made commits, which needs the author's
  approval (USER-H1); the docstring is the one that can be fixed forward.

- **P3 — carried from `fix/jsonc-tsconfig-parsing`, now partially resolved.**
  That record asked for the Surface Classes evaluation-script exemplar to
  cover the sibling guards. `AGENTS.md:59` now names
  `packages/stryker-plugins/src/test-contribution/`,
  `scripts/guard-mutate-scope.mjs`, and `scripts/check-lint-coverage.mjs`, but
  still omits `scripts/guard-no-hand-rolled-jsonc.mjs` and
  `packages/oxlint-plugins/recommended/scripts/guard-no-behavior.mjs`. The
  original proposal — replace the enumeration with the patterns
  `scripts/guard-*.mjs` and `scripts/check-*.mjs` — still stands.

## Findings the gate surfaced (repo defects, not review findings)

These are real accusations the hardened gate makes against the current tree.
They are not defects in the gate and were left for the author, since fixing
them means deleting or rewriting tests in packages outside this change:

- `packages/hex-schema` — all three `*.property.test.ts` files kill no mutant
  that anything else does not also kill. Its 24 attributed kills all go to
  in-source tests and `schema-laws.test.ts`.
- `packages/effect-daemon-spec` — the run attributes **zero** kills to any
  test, so contribution cannot be measured at all; the gate refuses rather
  than accusing its test files. Separately, this package is the only one of 23
  with `break: 0`, meaning its mutation gate cannot fail (it scores 33.33 and
  exits 0).
- 21 of the 23 packages carrying a `stryker.config.json` do not depend on
  `@systemfsoftware/stryker-plugins`, which is the practical obstacle to
  wiring option (b) in the P1 above.
