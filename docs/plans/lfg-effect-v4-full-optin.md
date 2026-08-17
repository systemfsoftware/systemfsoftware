# LFG: Full Effect v4 opt-in — cell architecture and all oxlint rules ON, no exceptions

Slug: `lfg-effect-v4-full-optin`
Date: 2026-08-17
Status: implementation-ready. The worktree carries the evaluator commit plus an in-flight migration; every remaining unit below is measured against that state (see §4).

## 1. Goal

Every workspace package — except `packages/oxlint-plugins/**`, `packages/oxlint-config`, and vitest-config support — must fully opt into **Effect v4**, the **cell architecture** (kernel / executor / workflow / schema / policy / observer taxonomy), and **all oxlint rules at `error`**, no exceptions, no suppressions.

Conformance is decided by gates, not intent: the restored workflow/schema/test-placement rule set (committed at `a85457ec56`), the `check-workflow-test-adjacency` guard, and `check:lint-coverage` define the production/tooling boundary. Nothing in this plan relaxes any gate; every verdict is recomputed from `git ls-files` or the linted file's AST (CHK1), never self-reported.

## 2. Settled decisions (preserved from the approved restoration plan and this session)

1. **Workflow location**: `Workflow.make` only in `<stem>.workflow.ts` with a single-segment stem (`^[^.]+\.workflow\.ts$`), at most one make per file. Rule: `make-file-location` (registered + recommended in `a85457ec56`).
2. **Schema location**: schema declarations only in `*.schema.ts` (any stem, several per file) or the owning `<stem>.workflow.ts`. Rule: `schema-declaration-location`.
3. **Test placement**: under `src/`, the only legal test file is `src/**/__tests__/<stem>.workflow.property.test.ts` beside its workflow (adjacency enforced by the guard, since rules cannot stat the disk). Every other src test file is banned: kernel/policy/schema/property suites become **in-source `import.meta.vitest` blocks** in the module they cover. Outside `src/`: tests live under `tests/` as `*.integration.test.ts`; non-test helpers/fixtures under `tests/__fixtures__/`. Rules: `no-test-file-in-src`, `src-property-test-cell` (its presence arm is this package's OX-OB1 obligation — keep), `test-file-outside-tests-dir`, `test-suffix-outside-src`, `tests-dir-helpers-in-fixtures`. `in-source-test-targets-private` keeps only its placement arm (the private-binding ban is out: in-source blocks are the only legal home of kernel/policy/schema suites, and several exercise exported bindings).
4. **Tolerances**: no casts/`as`-assertions, pure make bodies (`make-body-purity`), exhaustive `Match` (`workflow-match-exhaustive`), property-testing conventions (`pbt` naming), hygiene rules, adjacency. Zero `// oxlint-disable`; per-package `oxlint.config.ts` may only escalate a rule to `error` or carry the sanctioned test-file relaxation block — never demote.
5. **Boundary**: `scripts/guards/check-lint-coverage.mjs` defines production vs tooling. TOOLING-exempt packages (stryker-js fork packages except `cli`, effect-atom, storybook-gherkin, stryker-plugins, arethetypeswrong, the plugin packages themselves) keep their own oxlint baselines — their baseline is the sanctioned whitelist. `packages/stryker-js/cli` is enrolled and chartered for full compliance.
6. **Evaluator discipline (CONST-E4 / REPO-D1)**: the rule surface ships in its own commit with observed red before and green after — done at `a85457ec56` (red list in the commit body); guard scripts carry `--selftest` (CHK1).
7. **Shipping**: changeset gates REPO-R2/R3 (`none` for move-only packages), commit rules REPO-C1/C2, PR pushed and watched to green (REPO-D2), no agent-started mutation runs (REPO-D3), merge human-controlled (REPO-P1).
8. **Corpus grounding**: before authoring, the local software-wiki corpus was queried (typed sub-queries: lex "in-source import.meta.vitest block workflow property test placement", vec "where do kernel property tests live when test files under src are banned", hyde restating the placement rationale; intent "cell architecture migration: test placement under the restored oxlint rules"). The corpus settles the test doctrine this plan reads: pure behavior gets property tests, declarations get codec laws, middle/shell cells get NO colocated unit tests (coverage runs at composition altitude), journeys live outside `src/` — the conversion recipe below implements exactly that mapping (kernel/policy/schema property suites become in-source blocks in their subject module; executors get no colocated tests; journeys stay in `tests/`). Specific corpus paths are not cited — the corpus does not ship with the clone.

## 3. Scope — derived from the workspace

### 3.1 Workspace members

`pnpm-workspace.yaml` globs (`packages/*`, `packages/oxlint-plugins/*`, `packages/stryker-js/*`, `packages/arethetypeswrong/*`, `packages/effect-atom/*`, `omp/packages/*`, `omp/plugins/*`) resolve to **40 package dirs** (measured from `git ls-files`).

### 3.2 Excluded (user-specified)

| Exclusion                                 | Reason                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `packages/oxlint-plugins/*` (10 packages) | They ARE the rules; never extend the config (TP2/TS1); CO4 cycle |
| `packages/oxlint-config`                  | Cannot extend itself                                             |
| `packages/vitest-config`                  | Vitest config support (user exclusion)                           |

### 3.3 Eligible packages — disposition tiers

Recomputed this session from the guard's own logic (`node scripts/guards/check-lint-coverage.mjs` → `15 production package(s) linted`, see §9 for the re-derivation; do not hand-invent this list).

**Tier A — enforced production packages (15): full conformance required.** All already extend `@systemfsoftware/oxlint-config`.

```
omp/packages/omp-utils                  omp/plugins/omp-agent-discipline
omp/plugins/omp-claude-compat           packages/effect-cell-gen
packages/effect-cell-types              packages/effect-daemon-spec
packages/effect-gherkin-spec            packages/effect-memfs
packages/effect-purity-law              packages/effect-schema-extensions
packages/effect-schema-law              packages/effect-schema-vite
packages/hex-schema                     packages/rx-effect
packages/stryker-js/cli
```

**Tier B — tooling-exempt (10): in scope for the Effect-v4/cell audit only; own baselines untouched.** `packages/effect-atom/{atom,atom-react}`, `packages/storybook-gherkin`, `packages/stryker-plugins`, `packages/stryker-js/{mutation-run,mutation-report,plugin-api,typescript-checker,vitest-runner}`, `packages/arethetypeswrong/{cli,core}`. Obligations: all `effect`/`@effect/*` deps at `catalog:` v4-rc (verified), own baseline green with zero new suppressions, dprint/typecheck/tests green. Their `__tests__`/testResources layout is out of the renames' reach.

**Tier C — no-op (3):** `packages/tsconfig`, `packages/effect-cell-type-tests` (type-test-only, no `src/`), `packages/vitest-config` (excluded). Verify existing gates only.

### 3.4 Effect v4 adoption

Every eligible package with an `effect`/`@effect/*` dependency resolves the `catalog:` (`effect` `^4.0.0-rc.108`, `@effect/vitest` `^4.0.0-rc.108`, `@effect/platform-node*`). A tree-wide manifest scan found **no v1–v3 `effect` / `@effect/*` leftover**. The work is conformance, not version plumbing.

## 4. Current state (measured this session)

### 4.1 Committed — evaluator surface (HEAD `a85457ec56`)

- `make-file-location` (effect-workflow), `schema-declaration-location` (effect-schema), `tests-dir-helpers-in-fixtures` (test-placement) — registered + recommended; retargeted `no-test-file-in-src` / `src-property-test-cell` / `test-file-outside-tests-dir` / `test-suffix-outside-src`; taxonomy in `test-placement/src/rules/path.config.ts` (`WORKFLOW_TEST_BASENAME`, `SANCTIONED_TEST_DIRS = {tests}`, `NESTED_TEST_DIR = '__tests__'`).
- `scripts/guards/check-workflow-test-adjacency.mjs` (+ `--selftest`) and `.changeset/workflow-convention-restoration.md` (rule minors); READMEs and api-reports refreshed.
- Observed red recorded in the commit body: `make-file-location` on `Gen.ts`, `stryker-cli.executor.ts`, `interpreter.integration.test.ts`; `schema-declaration-location` on `step-error.kernel.ts`; `test-file-outside-tests-dir` on package-root `__tests__/`.
- **Uncommitted tail**: `turbo.json` needs the `//#check:workflow-test-adjacency` task block (already drafted in the worktree, fold into the first migration commit).

### 4.2 In-flight worktree delta (161+ paths)

Already moved in the worktree (verify, do not redo):

- `__tests__/` → `tests/` + `tests/__fixtures__/` renames: omp-claude-compat (24 integration tests, `hook-dispatcher-fixture.observer.ts`, `loaded.observer.ts`), effect-daemon-spec (27 + helpers + `simulated-failure.schema.ts`), effect-gherkin-spec (5 + `test-domain-error.schema.ts`), effect-cell-types (`interpreter.integration.test.ts` + 2 workflow fixtures), effect-schema-vite (1), rx-effect (1), stryker-js/cli (fixtures + `cli-contract.integration.test.ts`).
- `step-error.kernel.ts` → `step-error.schema.ts` with kernel re-export; new omp schemas `hook-output.schema.ts`, `hook-settings.schema.ts`, `internal/hook-payload.schema.ts` (schema rule widened in the same session — in-flight `schema-declaration-location.ts` refinement).
- Workflow extractions: `cli/src/admission-adapter.workflow.ts` (+ property test), `omp/…/internal/submit-verdict-adapter.workflow.ts` (+ property test), `effect-cell-gen/src/drawn-decision.workflow.ts` (+ property test). **`effect-cell-types/src/Cell.ts:468` canonical decider NOT yet extracted.**
- 14 of the 29 src test-file deletions staged; in-source blocks so far: hex-schema (6 files), effect-daemon-spec (`daemon-health.schema`, `daemon-policy.schema`, `internal/intensity-window.kernel` — see O/I3 below, `internal/restart-decision.workflow` partial), gherkin-spec (2 pre-existing), omp/cli/purity-law/schema-law/cell-gen: none yet.
- Config tails in flight: vitest `include` and tsconfig `include` switched to `tests/` (7 packages), oxlint configs simplified (daemon-spec 112→11 lines, gherkin-spec 98→7), `turbo.json` task drafted, AGENTS.md leaf updates (cell-gen, cell-types).

### 4.3 Remaining work at a glance

| Unit                                                         | Where                                                   | State   |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------- |
| `canonical-decide.workflow.ts` extraction + adjacency test   | effect-cell-types                                       | pending |
| 21 remaining in-source conversions (§6.2)                    | cli, daemon-spec, purity-law, schema-law, cell-gen, omp | pending |
| `intensity.kernel.test` host verification + block relocation | daemon-spec internal                                    | verify  |
| `turbo.json` guard task commit                               | root                                                    | drafted |
| `includeSource` in omp standalone vitest config              | omp-claude-compat                                       | pending |
| `requireTestContribution: null`                              | hex-schema only (see O2)                                | pending |
| Stale `__tests__` references audit (configs, docs)           | several                                                 | pending |
| Full-tree `check:local` + PR                                 | root                                                    | pending |

## 5. Phase 1 — Inventory (method, reproducible)

The inventory below was executed this session (eval over `git ls-files` + working-tree walk + `git show HEAD:` recoveries + per-package `package.json`/config reads). Treat the tables as the baseline; recompute rather than trust if a package changed.

```
pnpm map                                        # authoritative workspace listing, derived each run
node scripts/guards/check-lint-coverage.mjs     # must stay 15 production / 0 uncovered
```

Per-package dimensions measured: `src/` ts count; workflow/kernel/executor/schema/policy/observer file counts; `src/__tests__` test files (excluding the workflow property-test exception); `tests/` integration tests; `import.meta.vitest` occurrences; `Workflow.make` sites; module-scope schema declarations outside `.schema.ts`/`.workflow.ts`; oxlint config shape; vitest/stryker config presence; `oxlint-disable` count.

| Package                  | src ts | wf           | kernel | executor | schema | src tests | tests/ integ. | in-source        | makes in src                             |
| ------------------------ | ------ | ------------ | ------ | -------- | ------ | --------- | ------------- | ---------------- | ---------------------------------------- |
| effect-cell-types        | 5      | 0            | 0      | 0        | 0      | 0         | 1             | 0                | 2 (Cell.ts:468 + comment site)           |
| effect-cell-gen          | 4      | 1            | 0      | 0        | 0      | 0         | 0             | 0                | 1 (workflow file; Gen.ts: comments only) |
| effect-daemon-spec       | 44     | 1            | 22     | 5        | 8      | 0         | 28            | 4                | 1                                        |
| effect-gherkin-spec      | 7      | 0            | 5      | 0        | 1      | 0         | 5             | 2 (pre-existing) | 0                                        |
| hex-schema               | 9      | 0            | 1      | 0        | 6      | 0         | 0             | 6                | 0                                        |
| stryker-js/cli           | 15     | 2            | 5      | 1        | 0      | 0         | 1             | 0                | 1                                        |
| effect-purity-law        | 3      | 0            | 2      | 0        | 0      | 0         | 0             | 0                | 0                                        |
| effect-schema-law        | 6      | 0            | 5      | 0        | 0      | 0         | 0             | 0                | 0                                        |
| effect-schema-vite       | 1      | 0            | 0      | 0        | 0      | 0         | 1             | 0                | 0                                        |
| rx-effect                | 2      | 0            | 1      | 0        | 0      | 0         | 1             | 0                | 0                                        |
| effect-memfs             | 3      | 0            | 0      | 0        | 0      | 0         | 0             | 0                | 0                                        |
| effect-schema-extensions | 2      | 0            | 0      | 0        | 0      | 0         | 0             | 0                | 0                                        |
| omp-claude-compat        | 41     | 2            | 7      | 16       | 4      | 0         | 24            | 0                | 2 (both workflow files)                  |
| omp-agent-discipline     | 10     | 0            | 3      | 2        | 0      | 0         | 0             | 0                | 0                                        |
| omp-utils                | 13     | 0            | 8      | 0        | 1      | 0         | 0             | 0                | 0                                        |
| (Tier B for reference)   | —      | 0 everywhere | —      | —        | —      | 0         | 0             | ≤2               | 0                                        |

(A full per-package row set, incl. Tier B/whitelists, is in `/tmp/lfg-census.jsonl` if needed; re-derive on execution.)

## 6. Phase 2 — Finish the cell-architecture migration

Root for all commands; `pnpm`-prefixed always (REPO-S6).

### 6.1 Unit U-A — canonical decider extraction (effect-cell-types)

`packages/effect-cell-types/src/Cell.ts:468` still holds an inline canonical default decider:

```ts
Workflow.make((_decoded: unknown): Result.Result<undefined, Workflow.Tagged> => Result.succeed(undefined)),
```

and `make-file-location` fires on the file. Extract:

1. New `packages/effect-cell-types/src/canonical-decide.workflow.ts` exporting `canonicalDecide = Workflow.make(…)` with the same body; import the `Result`/`Workflow` set the file needs (no casts anywhere).
2. In `Cell.ts`, `import { canonicalDecide } from './canonical-decide.workflow.js'` and bind it at the default-decider position; the `Cell`/`Workflow` types stay identical.
3. New `src/__tests__/canonical-decide.workflow.property.test.ts`: `describe`/`it` + `FastCheck as fc` (either '@effect/vitest' or the package's surviving gherkin style — mirror `survivors.workflow.property.test.ts`), laws: (a) every decodable input maps to `Result.succeed(undefined)` — constant-output law; (b) the make returns the `Workflow.Tagged` phantom channel — assert via assignment, not cast.
4. **Acceptance**: `pnpm --filter @systemfsoftware/effect-cell-types lint` → 0 `make-file-location`; guard lists `canonical-decide.workflow.ts` as covered; `pnpm --filter @systemfsoftware/effect-cell-types test` runs the new suite (existing `interpreter` suite keeps targeting the two fixtures in `tests/__fixtures__/`).

### 6.2 The 21 remaining in-source conversions

Recipe for each row (this is the sanctioned conversion form):

a. `git show HEAD:<deleted-test>` — the deletions are already in the worktree; content exists only in HEAD.
b. Append to the **host module**:

```ts
if (import.meta.vitest !== void 0) {
  const { describe, it, expect } = await import('@effect/vitest') // or 'vitest' matching the suite's original runner
  // the whole suite, block-scoped; fixture schemas/fakes stay inside the block so they
  // never reach schema-declaration-location's module-scope arm
}
```

c. Preserve suite/test **names** (`'∀…'`, `Should_*`) and case counts; `FastCheck as fc` from `'effect/testing'`; `output-mode.kernel.test.ts` converts its `vitest` imports to the dynamic form.
d. Ensure `import.meta.vitest` types resolve in the host's tsconfig the way `effect-purity-law`/`effect-gherkin-spec` do (their existing in-source blocks are the live example; if a host's tsconfig lacks it, add the same `/// <reference types="vitest/importMeta" />` convention — copy from `packages/effect-purity-law`).
e. Multi-subject suites (refutation style): host each `refutes(...)` in ONE covered module, preferring one without a block yet; the block may import sibling subjects via the same relative `.js` specifiers used today.
f. Exclude-io boundary: keep `test-hygiene` and `property-testing` rules satisfied inside blocks identically to file suites; no `no-io-boundary-tests` on shells.

| #  | Package            | Deleted suite (recover via `git show HEAD:<path>`)                                                     | Host module                                                                                                                                                                      |
| -- | ------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | omp-claude-compat  | `src/__tests__/deadline.policy.property.test.ts`                                                       | `src/deadline.policy.ts`                                                                                                                                                         |
| 2  | omp-claude-compat  | `src/__tests__/hook-verdict.kernel.property.test.ts`                                                   | `src/hook-verdict.kernel.ts`                                                                                                                                                     |
| 3  | effect-cell-gen    | `src/__tests__/interpreter.kernel.property.test.ts`                                                    | `src/Gen.ts`                                                                                                                                                                     |
| 4  | effect-daemon-spec | `src/__tests__/backoff.kernel.property.test.ts`                                                        | `src/backoff.kernel.ts`                                                                                                                                                          |
| 5  | effect-daemon-spec | `src/__tests__/leader-lock.kernel.property.test.ts`                                                    | `src/leader-lock.kernel.ts`                                                                                                                                                      |
| 6  | effect-daemon-spec | `src/__tests__/refutation.kernel.test.ts` (subjects: health,policy — already blocked, leader-lock not) | `src/leader-lock.schema.ts`                                                                                                                                                      |
| 7  | effect-daemon-spec | `src/internal/__tests__/intensity.kernel.test.ts`                                                      | verify: block in `internal/intensity-window.kernel.ts` may be mis-homed — recover imports; host is `internal/intensity.kernel.ts` if that module was the true subject, else keep |
| 8  | effect-daemon-spec | `src/internal/__tests__/restart-decision.kernel.property.test.ts`                                      | `src/internal/restart-decision.kernel.ts`                                                                                                                                        |
| 9  | effect-daemon-spec | `src/internal/__tests__/restart-decision.schema.property.test.ts`                                      | `src/internal/restart-decision.schema.ts`                                                                                                                                        |
| 10 | effect-purity-law  | `src/__tests__/rule-of-purity.kernel.property.test.ts`                                                 | `src/rule-of-purity.kernel.ts`                                                                                                                                                   |
| 11 | effect-purity-law  | `src/__tests__/rule-of-purity.kernel.test.ts` (uses `./ambient-source.kernel.ts` sibling)              | `src/rule-of-purity.kernel.ts` — inline ambient helper into the block's scope; the sibling `src/__tests__/ambient-source.kernel.ts` becomes deletable                            |
| 12 | effect-schema-law  | `src/__tests__/bounded-union.kernel.property.test.ts`                                                  | `src/bounded-union.kernel.ts`                                                                                                                                                    |
| 13 | effect-schema-law  | `src/__tests__/refutation.kernel.property.test.ts`                                                     | `src/refutation.kernel.ts`                                                                                                                                                       |
| 14 | effect-schema-law  | `src/__tests__/refutes.kernel.property.test.ts` (mixes refutation.kernel + rule-of-schemas.kernel)     | `src/refutes.kernel.ts`                                                                                                                                                          |
| 15 | effect-schema-law  | `src/__tests__/weaken.kernel.property.test.ts`                                                         | `src/weaken.kernel.ts`                                                                                                                                                           |
| 16 | stryker-js/cli     | `src/__tests__/llms-manifest.kernel.property.test.ts`                                                  | `src/llms-manifest.kernel.ts`                                                                                                                                                    |
| 17 | stryker-js/cli     | `src/__tests__/output-mode.kernel.property.test.ts`                                                    | `src/output-mode.kernel.ts`                                                                                                                                                      |
| 18 | stryker-js/cli     | `src/__tests__/output-mode.kernel.test.ts`                                                             | `src/output-mode.kernel.ts`                                                                                                                                                      |
| 19 | stryker-js/cli     | `src/__tests__/stream-protocol.kernel.property.test.ts`                                                | `src/stream-protocol.kernel.ts`                                                                                                                                                  |
| 20 | stryker-js/cli     | `src/__tests__/survivors-exit.kernel.property.test.ts`                                                 | `src/survivors-exit.kernel.ts`                                                                                                                                                   |
| 21 | stryker-js/cli     | `src/__tests__/survivors.kernel.property.test.ts`                                                      | `src/survivors.kernel.ts`                                                                                                                                                        |

**Acceptance per package**: `pnpm --filter <pkg> test` runs every moved suite (case count equals the deleted file's cases — verify by name, not just green); `pnpm --filter <pkg> lint` green; the only `src/**` files matching `/\.(test|spec)\.ts$/` across the tree are the four sanctioned workflow property tests + the generated `schema-laws.test.ts` entry points.

### 6.3 Config tail

| File                                               | Change                                                                                                                                                                    | Why                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turbo.json`                                       | commit the drafted `//#check:workflow-test-adjacency` task (inputs: guard script + `packages/**/src/**/*.workflow.ts` + `omp/**/src/**/*.workflow.ts`)                    | task referenced from root `package.json` `gate:tasks` already; without the task block turbo errors                                                                                                                                                                          |
| `omp/plugins/omp-claude-compat/vitest.config.ts`   | `test.includeSource: ['src/**/*.ts']`                                                                                                                                     | standalone config does not spread `sharedConfig` — in-source blocks in `deadline.policy.ts`/`hook-verdict.kernel.ts` would never run; every other package inherits `includeSource` from `@systemfsoftware/vitest-config` (verified in `packages/vitest-config/lib/base.js`) |
| `packages/hex-schema/stryker.config.json`          | add `"requireTestContribution": null`                                                                                                                                     | hex-schema loses its only file-based property tests; the mutation gate must not fail on empty contribution. **Only hex has a stryker config among the four affected packages — purity-law/schema-law/cell-gen have none; do not create configs for them** (see O2)          |
| `packages/oxlint-plugins/test-placement/AGENTS.md` | TP4 names `<name>.schema.property.test.ts` as the sanctioned refusal home — stale under the new taxonomy (refusals live in in-source blocks in the schema module); reword | keep leaf doctrine in agreement with its own lost rule suite                                                                                                                                                                                                                |
| all 15 `oxlint.config.ts`                          | §7 audit pass                                                                                                                                                             | see Phase 3                                                                                                                                                                                                                                                                 |

### 6.4 oxlint config simplification audit (Phase 3 fold-in)

Baseline today: minimal configs in 8 packages (`extends: [base]`, ≤5 lines), 7 with content: cli (30 ln), cell-types (15), gherkin-spec (30), daemon-spec (29 — already simplified in-flight), omp-utils (15), omp-claude-compat (45), omp-agent-discipline (6, strict). For each:

1. extends `@systemfsoftware/oxlint-config/base` or `strict` — already true for all 15 [guard: `check:lint-coverage` 0 uncovered].
2. No `'off'`, no `'warn'`, no `files:` pattern naming `__tests__` — the in-flight diffs already converted the two offenders to `tests/`; re-grep.
3. The only sanctioned rules block is the test-file relaxation block (mirror `packages/effect-daemon-spec/oxlint.config.ts`: `files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**']`, with the listed `no-empty-function`/`no-shadow`/… relaxations and `typescript/*` offs).
4. Anything else must be an escalation (`no-ternary: error` on `src/**` etc.).

Accepted form example (post simplification, daemon-spec):

```ts
import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'
export default defineConfig({
  extends: [base],
  rules: { '@systemfsoftware/oxlint-plugin/no-io-boundary-tests': 'error' },
  overrides: [
    { files: ['src/**'], rules: { 'no-ternary': 'error' } },
    { files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**'], rules: {/* sanctioned block */} },
  ],
})
```

## 7. Phase 3 — “all oxlint rules on” (enforcement readout; no new code beyond Phase 2)

Definition of “all rules”: the union of recommended sets delivered by `extends: [base]` — `cell-vocabulary` (`no-io-in-phase-bodies`), `effect-entrypoint` (3), `effect-schema` (incl. `schema-declaration-location`), `effect-workflow` (`make-file-location`, `workflow-match-exhaustive`, `make-body-purity`, + remaining), `property-testing` (4), `test-hygiene` (4), `test-placement` (8, incl. the retargeted taxonomies), plus `recommended` core (oxc + `typescript/*` strict at error) — all at `error` for every Tier-A package via the `effect-dmmf` aggregate. Nothing ships at `warn`.

Work products: (1) zero `oxlint-disable` comments in any Tier-A src (measured today: 0 files — keep it), (2) zero rule demotions in the 15 configs, (3) README/CHANGELOG rows current (the commit did the plugin READMEs), (4) Tier-B baselines untouched and green.

## 8. Phase 4 — Verification commands (run in order, repo root)

1. Rule suites — read case counts, not just exit codes: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow test` (`make-file-location`), `…-effect-schema test` (`schema-declaration-location`, incl. the in-flight widening), `…-test-placement test` (all 8, incl. `tests-dir-helpers-in-fixtures`).
2. End-to-end rule fires after P2: `pnpm --filter @systemfsoftware/effect-cell-types lint`, `…effect-gherkin-spec lint`, `…effect-daemon-spec lint`, `…omp-claude-compat lint`, `…stryker-js-cli lint`, `…effect-purity-law lint`, `…effect-schema-law lint`, `…effect-cell-gen lint` — all exit 0 with the new rule ids named.
3. Guard: `node scripts/guards/check-workflow-test-adjacency.mjs --selftest` then bare run — green exactly when all 7 src workflow files (survivors, admission-adapter, hook-verdict, submit-verdict-adapter, restart-decision, drawn-decision, canonical-decide) have adjacent property tests; kill-test: temporarily move one adjacent test away → red → restore.
4. `pnpm check:lint-coverage` → 15 production, 0 uncovered.
5. `pnpm test` — moved/reborn suites run (vitest includes updated); spot-check an in-source block actually executed (e.g. a `refutes` case from hex-schema or any cli kernel suite name in the vitest output).
6. `pnpm --filter @systemfsoftware/effect-gherkin-spec build` + `api:check` (if the package has an api report; step-error rename should be surface-neutral — re-export); then `pnpm build` (whole tree).
7. `pnpm check:local` exit 0 — includes `gate:tasks` (lint, tsgo, typecheck, tests, attw, api, ALL root guards incl. the new adjacency guard) and `gate:dist` (build, project-references, exports, runtime-deps) and format.
8. PR: `pnpm exec commitlint` per commit (REPO-C1/C2), `gh pr checks --watch --fail-fast` (REPO-D2; re-poll on `no checks reported`, only re-push for a named failing check).

## 9. Invariant scenarios (must hold)

1. `make-file-location`: `src/foo.bar.workflow.ts` → fires with `makeOutsideWorkflowFile` naming actual+fix; a second `Workflow.make` in a conforming file fires only on the second node.
2. `schema-declaration-location`: `class E extends Schema.TaggedError<E>()(…)` in `step-error.kernel.ts` → fires; in `step-error.schema.ts` → silent; wildcard/`S.` alias arms covered by suite cases (guarantees: no module-scope schema in any non-`.schema.ts`/non-workflow src file of the 15).
3. `no-test-file-in-src`: `*.kernel.property.test.ts` under `src/` → `propertyTestOutsideTestsDir` with the in-source move fix; an invalid `<stem>.workflow.test.ts` under `src/__tests__/` (old characterization) is now rejected with the rework.
4. Adjacency guard: `--selftest` fixtures present/missing/extra-period verdicts; live run red on rename, green after.
5. In-source: all suites still run; names preserved; no `.test.ts` left in any Tier-A `src/` except the sanctioned workflow property tests + `schema-laws.test.ts`.
6. `requireTestContribution` appears only in hex-schema's stryker config (tree grep) — any second occurrence is drift.
7. Zero `oxlint-disable` across the tree (root grep).

## 10. Sequence & commits

1. **Evaluator commit — DONE** (`a85457ec56`): rules, guard, changeset; observed red. (turbo task folds into commit 2.)
2. Migration commits (per-package `refactor(<scope>): …`):
   - `refactor(effect-cell-types): extract canonical decider into canonical-decide.workflow.ts`
   - `refactor(effect-daemon-spec): convert remaining suites to in-source blocks`
   - `refactor(effect-purity-law): convert rule-of-purity suites in-source`
   - `refactor(effect-schema-law): convert four suites in-source`
   - `refactor(effect-cell-gen): convert interpreter law in-source`
   - `refactor(stryker-js/cli): convert six kernel suites in-source`
   - `refactor(omp-claude-compat): finish in-source conversions and includeSource`
   - `refactor(hex-schema): mutation gate opt-out` (config only)
   - `chore(global): wire adjacency guard into turbo`
   - `docs(test-placement): refusal home reworded for in-source blocks` (if approved)
3. **Changesets**: `.changeset/workflow-convention-restoration.md` already covers the rule minors. For migration commits: `pnpm change --bump none` per package whose observable surface is unchanged (expected: all — moves and in-source blocks are internal; nothing exports a new name or type — verify with `api:check`; any real export change upgrades to the matching bump).
4. Push branch, open PR via the commit-push-PR session skill; REPO-D2 watch to green; merge stays human (REPO-P1).

## 11. Assumptions & contingencies

- **A1 (load-bearing)**: "all other test files in src are completely banned" read literally — in-source blocks are the only file-legal home, and the private-target arm is retired with them. If overruled: restore `COLOCATABLE_CELLS` and keep the file-based suites — one-line switch, decided before P2 starts.
- **A2**: `src/schema-laws.test.ts` entry points remain name-exempt.
- **A3**: fixtures under `tests/__fixtures__/` are outside the adjacency guard (its glob is `src/**`) — the two cell-types workflow fixtures need no property test.
- **A4**: `.mts`/`.cts` workflow names are violations.
- **A5**: root test dir is literally `tests/`, in-src dir stays `__tests__` (user's example) — hence the rename convention.
- **C1**: if a committed `schema-laws.test.ts` grows a module-scope schema definition and trips `schema-declaration-location`, extend its basename exemption — never edit the generated file.
- **C2**: if the `Cell.ts` extraction fights the `DecidePhase` brand, keep the factory in the workflow file and return the made value directly typed as the branded phase — construction site moves, value type unchanged.
- **C3**: if lint-check exposes another enrolled package outside the census, migrate it identically — never add a TOOLING exemption to pass.
- **C4**: if a conversion trips a filename-keyed rule, narrow the rule's key — never delete or weaken the converted block.
- **O1 (new)**: `sharedConfig` already injects `includeSource` — only omp's standalone config lacks it.
- **O2 (new)**: only `hex-schema` among the "four" has a stryker config; other three need no `requireTestContribution` work.
- **O3 (new)**: the intensity-kernel block may be homed wrongly (`intensity-window.kernel.ts` vs `intensity.kernel.ts`) — verify subject via `git show HEAD:` and relocate if needed.
- **O4 (new)**: nothing of the 29 deleted suites exists in the working tree — recover only via `git show HEAD:<file>`.

## 12. Deepening & confidence

- **Deepening found while planning**: the worktree was mid-migration (evaluator commit + staged renames + untouched conversions), so the plan splits _done / in-flight / remaining_ rather than assuming a pristine tree; `includeSource` is shared infra (one gap, not seven); `requireTestContribution` is one config not four; the 29 suites decompose to 21 unconverted hosts with two multi-subject refusals needing a single-block choice; Tier-B Effect-v4 posture already clean.
- **Confidence**: HIGH on inventory (git-derived this session, guard re-run); HIGH on the conversion recipe (14 conversions already green as live evidence in hex-schema/gherkin blocks); MEDIUM on `Cell.ts` brand extraction (C2's fallback is one-line); MEDIUM on final rule-set case counts until the in-flight widening settles.
- **Raising certainty**: a single green `pnpm check:local` at root after the last edit, and reading the vitest output case counts (§8 step 5).

## 13. Human open items

1. Merge to main (REPO-P1).
2. Tier-B "no exceptions" reading: this plan preserves the settled boundary (tooling = own baseline = sanctioned whitelist). If the goal means mandatory cell-rule enrollment for the stryker fork / effect-atom / storybook benches, that's a follow-on (would require per-package reasoned TOOLING changes and a separate compliance migration — the guard semantics exist for exactly that decision).
3. Whether the three config-less packages (purity-law, schema-law, cell-gen) should re-gain mutation gates after conversion — out of scope here; note on the PR.
