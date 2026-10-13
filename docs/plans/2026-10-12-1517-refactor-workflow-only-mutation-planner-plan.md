---
title: Mutation mutates only workflow files, and the planner refuses anything else
type: refactor
date: 2026-10-12
topic: workflow-only-mutation-planner
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Mutation mutates only workflow files, and the planner refuses anything else

## Goal Capsule

- **Objective.** A Mutation run on main mutates exactly the repository's `*.workflow.ts` decision files. No package can widen that set, and a package that tries is refused before any Stryker run starts, with a reason that names what it did.
- **Means.** One shared glob in `@systemfsoftware/stryker-config`, which every enrolled config inherits (KTD1). The Mutation planner (`scripts/tools/test-timings.ts plan --task mutation`) checks each package against it (KTD3) and sizes shards from the mutants Stryker plans (KTD5).
- **Product authority.** The unit contract the supervisor set for this session, Done items 1 to 7. It also gives the standing rule "Stryker mutates ONLY `*.workflow.ts` files". It supersedes the 2026-09-26 directive "Do not UNENROLL" (`docs/plans/2026-09-26-2001-refactor-workflow-only-mutation-plan.md:20`) and the schema-file widening (`docs/plans/2026-09-27-0213-refactor-adt-operation-homes-plan.md` KTD7).
- **Stop conditions.** Stop if `stryker plan` or a config import needs a choice outside the unit contract. Stop if #737 or #733 lands a conflicting change to a line this plan edits. Ask the supervisor once, with a recommended answer.
- **Execution profile.** One session implements, verifies, opens the PR and watches CI. Root merges.
- **Open blockers.** None.

## Product Contract

### Summary

Stryker's mutated set becomes one glob, `src/**/*.workflow.ts` with test directories excluded, exported once from `@systemfsoftware/stryker-config`. A package with no workflow file leaves mutation entirely. The planner refuses a package that sets its own targets, targets a non-workflow or test file, or runs anything but `stryker run`. It sizes each package's shards from Stryker's own mutant count.

### Problem Frame

On main at `02bf9653b1`, 21 configs mutate `src/**/*.workflow.ts` and `src/**/*.schema.ts`, five oxlint plugins mutate `src/rules/**`, and the consumer fixture mutates `src/**/*.js`. Each config lists its own patterns through `shardMutate([...])`, so nothing stops the next package from widening its set again. In run 38115511598, which used the same globs, 18,939 mutants were planned across 26 packages and 2,400 of them sat in workflow files. The planner sizes shards from recorded seconds, and the record in effect for main has entries for only 7 packages.

### Key Decisions

- **The glob lives in one place and is inherited, never listed.** `sharedConfig` carries `mutate`, and `shardMutate` stops being public, so a config has no helper for listing its own patterns. Governs R1, R2.
- **Packages without a workflow file leave mutation.** Twelve packages lose their config, their mutation scripts and their Stryker devDependencies. The supervisor's Done item 2 overrules the 2026-09-26 "Do not UNENROLL" directive. Governs R3, R4.
- **The consumer fixture leaves mutation too.** Its only source file is not a workflow. It cannot take the shared glob until its flake pin names a systemfsoftware commit that exports it. Governs R5.
- **The planner resolves each config the way Stryker loads it.** It picks the config file in Stryker's own discovery order and imports it in the package's own Node. It accepts `mutate` only when it is `sharedConfig.mutate` by identity and equals the frozen exported glob. It expands both sets on disk, so it judges the real config value, not the config's source text. Governs R6, R7.
- **Mutant counts come from `stryker plan --full`.** This is the CLI's own discovery, which runs no tests. Seconds per mutant are measured: the package's own rate, then the slowest measured rate, then the caller's `unknown-mutant-seconds` input. No shard count is a literal. Governs R9, R10.

### Requirements

**One mutated set**

- R1. `@systemfsoftware/stryker-config` exports one glob, `src/**/*.workflow.ts` minus `src/**/__tests__/**`, and `sharedConfig.mutate` is that glob, sliced per shard when `STRYKER_SHARD` is set.
- R2. No `stryker.config.*` in the workspace sets `mutate`, and every enrolled package's resolved mutate set equals its files matching R1.

**Enrollment**

- R3. A workspace package has a `mutation` script, a `stryker.config.*` and Stryker devDependencies only when it has a file matching R1. The oxlint plugins fall under this rule as well.
- R4. The only mutation script any package carries is `"mutation": "stryker run"`, with no `mutation:*` variant.
- R5. The consumer fixture under `.github/consumer-fixture` has no `mutation` script and no `stryker.config.*`. It keeps its Stryker devDependencies, which are the `.sfs-deps` tarballs its install lanes prove. `consumer-fixture.yml` no longer calls `reusable-mutation.yml`, and the job that checks the pull-request refusal stays.

**Planner refusal**

- R6. Before any Stryker process starts, `test-timings plan --task mutation` gets every package's planned workflow-file list, taken from the package's installed shared glob. The plan fails if any package with a mutation script sets its own mutate targets, targets a non-workflow file or a test file, has a mutation script other than `stryker run`, has no workflow file, or has a config that will not load.
- R7. Each refusal carries its own reason name: `mutation-script`, `no-workflow-file`, `config-unloadable`, `own-mutate-targets`, `non-workflow-target` or `test-file-target`. It is printed as a GitHub `::error` annotation naming the package and the offending files or patterns, and one run reports every refusal, not only the first.
- R8. A test plants one violating fixture per refusal of R6 and a clean fixture. The plan exits non-zero naming the reason for each violation, and exits 0 for the clean fixture.

**Shard sizing**

- R9. A package's predicted seconds are its current mutant count, from `stryker plan --full`, times its seconds per mutant. Its shard count derives from that prediction against `target-seconds`, never from a literal.
- R10. Seconds per mutant are the package's measured rate from the record, which now stores each package's planned mutant count beside its seconds. With no measured rate for the package, the slowest measured rate in the record is used. With no measured rate anywhere, the rate is the caller's `unknown-mutant-seconds` input.

**Doctrine**

- R11. Every AGENTS.md, pack, solution doc, README or plan line that tells an agent to mutate a file other than a workflow file is corrected. A historical plan's directive gets a superseded note that cites this plan.

**Delivery evidence**

- R12. The PR body carries:
  - per-package mutated-file counts before and after;
  - the estimated change in main's mutation runner-minutes per day at the measured merge rate;
  - every code-review finding with its ruling;
  - the ce-compound call;
  - each CI job's wall time from the jobs API;
  - the overlap with #733.

**Release**

- R13. Every changed publishable package carries a `pnpm change` intent: `minor` for `@systemfsoftware/stryker-config`, whose public exports change, and `none` for every other package whose build hash moves. The changeset check exits 0.

### Acceptance Examples

- AE1. Covers R6, R7. Given `effect-memfs`'s config with `mutate: ['src/**/*.ts']`, the plan fails with `own-mutate-targets`, with `non-workflow-target` naming `src/driver-entry.schema.ts` and the other non-workflow files, and with `test-file-target` naming `src/schema-laws.test.ts` and the `src/__tests__/` files. No job is planned.
- AE2. Covers R6. Given a package whose `mutation` script is `stryker run --mutate src/x.ts`, the plan fails with `mutation-script`.
- AE3. Covers R3, R6. Given a package with a `mutation` script and no `src/**/*.workflow.ts`, the plan fails with `no-workflow-file`.
- AE4. Covers R9, R10. Given a package with 400 planned mutants whose record shows 1,800 s for 200 mutants, the plan predicts 3,600 s and plans 4 shards at a 900 s target.

### Scope Boundaries

- Mutating `*.schema.ts` for now, a per-package allow-list, and excluding workflow files to save time are all out of scope (supervisor: "DOES NOT COUNT").
- No local Stryker or mutation run. The CLI path (`stryker plan`, `stryker run`) is exercised in CI on main only.
- The lines #737 owns in `scripts/tools/mutation-job.ts` (its `timeout` wrapper, `strykerUnderCap`) and in `stryker-config`'s peer range stay untouched.
- A follow-up re-enrolls the consumer fixture once its flake pin can supply a `stryker-config` that exports the shared glob.

### Dependencies

- #733, which repairs main's mutation lane, edits every `stryker.config.ts`, `reusable-mutation.yml` and `.github/AGENTS.md`, and deletes `scripts/tools/mutation-job.ts`. This work lands from main, and #733's owner merges main up.
- #737 edits `mutation-job.ts`, `reusable-mutation.yml`, `sfs-tools/action.yml` and `stryker-config`'s manifest and README. Main is merged into this branch after #737 lands. Nothing is rebased.

### Sources

- `packages/toolchain/stryker-config/lib/base.js`: `sharedConfig` and `shardMutate`, the only shard slicer.
- `scripts/tools/test-timings.ts`: `planJobs`, `mergeRecord`, `workspacePackagesWith`; `scripts/tools/mutation-job.ts` runs `pnpm --filter <pkg> mutation` under `STRYKER_SHARD`.
- `.github/workflows/reusable-mutation.yml`: the `plan` job installs nothing today; the `mutation` jobs restore `.sfs-deps` and install.
- `@systemfsoftware/stryker-js` 17.0.2 `dist/main.mjs`: `stryker plan` takes `--target-seconds`, `--out` and `--full`, and "discover[s] mutants without running tests". Its `--out` file is the contract's `ShardPlan` (`version: 1`, `shards[].projects[].mutants`, `shards[].predictedSeconds`). `defineConfig` returns its argument, so a config's `mutate` array is the shared array by identity.
- `packages/oxlint-plugin/oxlint-plugin-dmmf-workflow/src/rules/make-file-location.ts` and `workflow-file-make-presence.ts`: `Workflow.make` appears only in a `*.workflow.ts`, and every `*.workflow.ts` holds one. The suffix therefore marks what the file is (CONST-T12; pack: mutation-discipline, README.md).
- `compound-packs/cell-architecture/service-and-layer-boundaries.md:25-26`: the `*.workflow.ts` row is the pure decision, and the `*.schema.ts` row is the line R11 corrects (pack: cell-architecture, service-and-layer-boundaries.md).
- Run 38115511598 (branch `fix/mutation-lane`, same globs as main): per-package mutant counts by file, the basis for the before and after estimate in R12.

## Planning Contract

### Key Technical Decisions

- **KTD1. `workflowMutate` is the exported glob, frozen; `sharedConfig.mutate` is `shardMutate(workflowMutate)`.** `shardMutate` stays a module-private function, so the slicing logic is unchanged and a config cannot call it. `workflowMutate` is `Object.freeze`d, so no config can push onto the pristine copy the planner compares against. The `.d.ts` drops `shardMutate` and adds `workflowMutate` and `mutate` to `SharedConfig`. This breaks the package API before 1.0 (REPO-R1, R13). Governs R1, R2.
- **KTD2. The planner reads facts through a Node probe run with `pnpm exec node` in each package directory.**
  - The probe picks the config file exactly as `@systemfsoftware/stryker-js` 17.0.2 discovers it. The candidates come in prefix `''` then `.`, suffix `.conf` then `.config`, extension `ts`, `mts`, `js`, then `mjs`, and the first existing file wins (`dist/main.mjs`, `DISCOVERABLE_CONFIG_FILE_NAMES`). So the probe judges the file Stryker would load.
  - It imports that file and the package's own `@systemfsoftware/stryker-config`. It reports the shared patterns (`workflowMutate`) and their expansion with `node:fs` `globSync`, the same expansion `shardMutate` uses.
  - It reports whether `config.mutate` is `sharedConfig.mutate` by identity and equals `workflowMutate`. When it is not, it reports the config's own patterns and their expansion.
  - A config with an `extends` key is reported as own targets, because an `extends` chain can carry a `mutate` the probe does not resolve. A throw is reported as its message.
  - `pnpm` is the only binary `test-timings` may run (`--allow-run=pnpm`), so no permission changes.
  - Governs R6.
- **KTD3. Admission is one pure function over those facts, returning every refusal.**
  - `mutation-script`: a `mutation` or `mutation:*` script whose text is not exactly `stryker run`.
  - `no-workflow-file`: the shared expansion is empty.
  - `config-unloadable`: the probe threw or found no config.
  - `own-mutate-targets`: the config's `mutate` is not the shared array, or the config has `extends`.
  - `non-workflow-target`: the own-pattern files outside the plan that are not test files.
  - `test-file-target`: the own-pattern files under `__tests__`, `__fixtures__` or `__mocks__`, or named `*.test.*`, `*.spec.*` or `*.tst.*`.
  - Each refusal prints `::error title=<reason>::<package>: <detail>` to stderr, and the plan exits 1 before any `stryker` process starts. Governs R6, R7.
- **KTD4. Counting runs only for admitted packages, as `pnpm exec stryker plan --full --target-seconds <target> --out <tmp>` in the package directory, at most four at a time (`@std/async/pool`).** `--full` counts every discovered mutant, regardless of the incremental cache, and the count is the total of `shards[].projects[].mutants` lengths. A plan file that fails to decode, or a non-zero exit, fails the plan and names the package. Governs R9.
- **KTD5. Rate chain, all measured or caller-supplied.**
  - First, `record.seconds / record.mutants` for the package.
  - Next, the highest such rate across the record.
  - Last, the reusable workflow's new `unknown-mutant-seconds` input, which defaults to 21. That default is main's slowest measured rate, effect-atom at 18,230 s over 898 mutants in run 37962737026, rounded up.
  - A record entry from before this change carries no `mutants`, so it gives no rate. The first run plans every package at the slowest-known rate, which over-shards once, on the safe side.
  - The prediction feeds the existing `planJobs` through an optional per-package override. The shard arithmetic (`ceil(predicted / target)`, the `--max-jobs` and `--max-seconds` caps) is unchanged.
  - Governs R9, R10.
- **KTD6. Jobs carry `mutants` per package; `merge --plan` records it.** Every shard job of a sharded package carries the package's total count, never its slice, so the recorded rate is the summed shard seconds over the total. `Measured` gains optional `mutants`, and `mergeRecord` writes it beside a complete measurement. The `timings` job writes `needs.plan.outputs.jobs` to a file and passes `--plan`. Governs R10.
- **KTD7. The `plan` job installs.** It now needs `sfs-deps`, runs the same `sfs-deps-restore` and `install-deps` steps as a mutation job, and its timeout rises from 5 to 30 minutes. Nothing is built, because discovery instruments source and runs no tests. Governs R6, R9.
- **KTD8. Unenrolled packages lose every Stryker trace.** That covers `stryker.config.ts`, `mutation` and `mutation:full`, `stryker.config.ts` in `tsconfig.node.json`, and the six Stryker devDependencies (DEL1). The consumer fixture loses only its config and script (R5), and `consumer-fixture.yml` loses the `mutation` job. Governs R3, R4, R5.
- **KTD9. Historical plans get one superseded note, not rewritten bodies.** Present-tense doctrine (AGENTS.md rows, packs, solution docs, READMEs) is rewritten in place. Governs R11.
- **KTD10. The reusable workflow's consumer contract changes.** A consumer's mutated package must depend on `@systemfsoftware/stryker-config`, spread `sharedConfig` and set no `mutate`. `.github/AGENTS.md` states this beside the other reusable prerequisites. Governs R6.

### Assumptions and Risks

- A1. Stryker loads a config to the same `mutate` value Node's own import yields. Node 24 strips the TypeScript types, and `defineConfig` returns its argument. If Stryker loaded the TypeScript differently, the values would still match, since the config has no conditional on the loader.
- A2. `stryker plan --full` runs from an installed but unbuilt workspace within the 30-minute plan job. This is unverified before merge, because no local Stryker run is allowed and mutation runs on main only. A failure is loud and names the package, and #733 replaces this lane anyway.
- A3. Mutation seconds scale with mutant count. Incremental reuse breaks that: a mostly reused run records a low rate, and a later run that invalidates many mutants is under-predicted. The job's `timeout-minutes` stays the backstop.
- A4. This lane runs only on main. Neither `mutation.yml` (dispatch only) nor the removed fixture job runs it before merge. The workflow wiring is checked by actionlint, and the planner by its CLI journeys. Its first live run is a post-merge dispatch on main. The fixture's consumer-side success path returns when the follow-up re-enrolls it (Scope Boundaries).
- A5. #733 rewrites `reusable-mutation.yml` and deletes `mutation-job.ts`. When its owner merges main up, the refusal and sizing here have to be carried into #733's planner. The PR body says so.
- Rejected alternative: adopt the CLI's own `run --plan --shard` mutant sharding. That is #733's redesign, and doing it here would duplicate it.

### Sequencing

Each unit lands as its own commit. U1 lands first, because U2 needs the export. U4 and U5 form the evaluator commit. Its gate is the planner test, observed red on a fixture before the change and green after. U6 and U7 follow, and R12's PR evidence is the closing step.

## Implementation Units

### U1. Shared glob in `@systemfsoftware/stryker-config`

- **Goal.** R1.
- **Files.** `packages/toolchain/stryker-config/lib/base.js`, `lib/base.d.ts`, `README.md`.
- **Approach.** KTD1. The README documents `workflowMutate` and says a config spreads `sharedConfig` and sets no `mutate`. The `^17.0.0` peer range line belongs to #737 and is left alone.
- **Test scenarios.** None of its own. U4's planner test imports this real package into its fixtures and asserts the planned files against literal fixture paths.
- **Verification.** `pnpm --filter @systemfsoftware/stryker-config typecheck attw`.

### U2. Enrolled configs inherit the glob

- **Goal.** R2, R4 for the 14 packages with workflow files: `effect-atom`, `effect-atom-react`, `effect-daemon-{conformance,microvm,process,socket,spec}`, `discern`, `effect-memfs`, `effect-microsandbox`, `effect-readiness`, `npm-package`, `differential-spec`, `trace-spec`.
- **Files.** Each package's `stryker.config.ts` (drop `mutate` and the `shardMutate` import) and `package.json` (drop `mutation:full`).
- **Test scenarios.** None. This is configuration whose behaviour U4 judges.
- **Verification.** A throwaway probe over every `stryker.config.*` prints resolved files equal to the workflow files.

### U3. Unenroll packages with no workflow file

- **Goal.** R3, R4, R5.
- **Files.** For `effect-spec-runtime`, `effect-gherkin-spec`, `storybook-gherkin`, `vitest`, `effect-schema-vite`, `hex-schema`, `conformance-spec` and the five `oxlint-plugin-*`: `stryker.config.ts` (delete), `package.json`, `tsconfig.node.json`. Also `pnpm-lock.yaml`, `.github/consumer-fixture/packages/answer/{package.json,stryker.config.mjs}` and `.github/workflows/consumer-fixture.yml`.
- **Approach.** KTD8. Then `pnpm install --lockfile-only`.
- **Test scenarios.** None.
- **Verification.** `git grep -l stryker -- 'packages/*/package.json'` lists only the 14 enrolled packages, plus the toolchain package and any non-mutation users. `pnpm install --frozen-lockfile` exits 0.

### U4. Planner admission and mutant-count sizing

- **Goal.** R6 to R10.
- **Files.** `scripts/tools/test-timings.ts`, `scripts/tools/test-timings.test.ts`.
- **Approach.** KTD2 to KTD6. Mutation-only code paths branch on `--task mutation`. The `test` task is unchanged.
- **Test scenarios.** The test admission gate admits two CLI journeys, for the top-level failure contract of a shipped tool, and one pure table.
  - J1, refusals. A planted workspace with one package per reason, plus a clean package. Each fixture links the real `stryker-config` into `node_modules`. It also includes a package with a clean `stryker.config.ts` beside a widened `stryker.conf.ts`, and one that pushes onto `sharedConfig.mutate`. `plan --task mutation` exits 1. Stderr has `::error title=<reason>::<package>` for every refusal and none for the clean package. `GITHUB_OUTPUT` gets no `jobs`. Before the change, the same workspace plans jobs and exits 0 (red observed).
  - J2, clean plan. A clean workspace whose packages carry a fake `node_modules/.bin/stryker` that writes a contract-shaped `ShardPlan` with a known mutant count. With a record of 1,800 s over 200 mutants for one package and 400 planned mutants, the plan writes 4 shard jobs at `--target 900` (AE4). Each job carries `mutants`.
  - P1, rate chain. A table over `{own rate, slowest measured rate, unknown-mutant-seconds}` with expected rates computed by hand from the inputs.
  - `merge --plan` stores `mutants` beside a complete measurement, as one added assertion in the existing merge test.
- **Verification.** `deno test --config=scripts/deno.jsonc --lock=scripts/deno.lock --frozen --allow-read --allow-write --allow-env --allow-run scripts/tools/`.

### U5. Reusable workflow wiring

- **Goal.** R6, R9, R10 in CI.
- **Files.** `.github/workflows/reusable-mutation.yml`.
- **Approach.** KTD7 and KTD6, plus the `unknown-mutant-seconds` input (KTD5). The `target-seconds` description and the `mutation-job run` line belong to #737 and are left alone.
- **Test scenarios.** None. This is wiring, and actionlint checks it.
- **Verification.** `nix run nixpkgs#actionlint -- .github/workflows/reusable-mutation.yml .github/workflows/consumer-fixture.yml`.

### U6. Doctrine

- **Goal.** R11.
- **Files.**
  - `.github/AGENTS.md:21`, which describes the mutation lane and `shardMutate`. Also the reusable-mutation prerequisites, per KTD10.
  - `packages/atom/AGENTS.md:8`, `packages/daemon/effect-daemon-microvm/AGENTS.md:16` and `packages/gherkin/storybook-gherkin/AGENTS.md:3`.
  - `compound-packs/cell-architecture/service-and-layer-boundaries.md:26` and `compound-packs/boundary-testing/no-mocks-on-internal-glue.md:14`.
  - `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md:7` and `one-cell-cannot-hold-a-port-and-its-implementation.md:89`.
  - The three oxlint plugin READMEs' "100% mutation coverage" lines.
  - Superseded notes on `docs/plans/2026-09-27-0213-refactor-adt-operation-homes-plan.md`, `2026-09-26-2001-refactor-workflow-only-mutation-plan.md` and `2026-10-10-1748-refactor-cell-service-layer-structure-plan.md`.
- **Test scenarios.** None.
- **Verification.** Grep `\.schema\.ts|src/rules` against `**/AGENTS.md`, `compound-packs/`, `docs/solutions/` and `**/README.md`. No line may tell an agent to mutate those files.

### U7. Changesets

- **Goal.** R13.
- **Approach.** `pnpm change --bump minor` for `stryker-config`, and `--bump none` for every other package whose turbo build hash moves.
- **Verification.** The changeset check exits 0.

## Verification Contract

- `deno test --config=scripts/deno.jsonc --lock=scripts/deno.lock --frozen --allow-read --allow-write --allow-env --allow-run scripts/tools/`
- `nix run nixpkgs#actionlint` over every changed workflow.
- `./bin/dprint check`.
- A throwaway resolved-set probe over every `stryker.config.*`. It is not committed.
- `pnpm check:local`, run once at the end. The `effect-daemon-microvm` KVM suite fails in this container (no `/dev/kvm`, OP27), and that failure is recorded, not fixed.
- The PR's CI is green on the head, watched with omp `run_watch`.

## Definition of Done

- Every R holds, and every unit's verification has been run and its output recorded in the PR body.
- `git grep -nI shardMutate -- . ':!*.lock' ':!.changeset/changelogs' ':!docs/plans'` matches only `packages/toolchain/stryker-config/lib/base.js`.
- No throwaway probe, scratch directory or abandoned code is left in the diff.
