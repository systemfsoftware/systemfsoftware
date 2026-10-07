---
title: Workflow-Only Mutation for Every Production Package - Plan
type: refactor
date: 2026-09-26
topic: workflow-only-mutation
artifact_contract: ce-unified-plan/v1
product_contract_source: session
execution: code
supersedes: docs/plans/2026-09-26-1929-refactor-workflow-only-mutation-plan.md
---

# Workflow-Only Mutation for Every Production Package - Plan

## Goal Capsule

- **Objective.** Every production package that makes a decision is enrolled in CI mutation testing, and every enrolled package's mutated set is exactly `shardMutate(['src/**/*.workflow.ts'])`. A file that makes no decision is not mutated. A package that makes no decision is not enrolled.
- **Means.** Move each decision out of shells, drivers, engines and lint-rule visitors into a `*.workflow.ts` built with `Workflow.make`, called by the code that used to hold it. Then narrow each glob.
- **Product authority (session-settled, user directives 2026-09-26).**
  - "All production packages need to be enrolled with mutation testing and the mutation test glob must only hit workflows." Rejected alternative: whole-package `src/**/*.ts` aim (memory #5057, rejected by the user in the #556 brainstorm).
  - "Do not UNENROLL." Rejected alternative: unenrol the ten packages whose mutated files are not workflows (offered as fork B; refused).
  - "If it doesn't make a decision it should not be mutation tested." Rejected alternative: keep mutating shells and drivers under a declared deviation (fork C; refused).
- **Stop conditions.** Stop if a decision cannot pass `Workflow.make`'s type law without changing a published signature a consumer relies on; record it and continue with the rest.

## Sources

- Research dossiers (this session): `agent://WorkflowContract` (every gate a `*.workflow.ts` must pass, with citations), `agent://DaemonDecisions`, `agent://AtomDecisions`, `agent://PluginDecisions`.
- Workflow API: `packages/effect-cell-types/src/Workflow.ts` (`make`, `Inhabited`, `DecisionLaw`). `make` does not decode at runtime. It attaches the schemas to the decide function and returns it (`Workflow.ts:240-249`).
- Reference workflows: `packages/effect-memfs/src/plan-read-slice.workflow.ts`, `packages/effect-readiness/src/resolve-probe.workflow.ts`, `packages/discern/src/select-case.workflow.ts`.
- Shared stryker base: `packages/toolchain/stryker-config/lib/base.js` (`perTest` coverage, break 100, `shardMutate`).
- CI: `.github/workflows/mutation.yml` (plans jobs from each package's `mutation` script).

## Inventory

| State                                          | Packages                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enrolled, already workflow-only                | `effect-daemon-conformance`, `effect-daemon-spec`, `discern`, `effect-memfs`, `effect-microsandbox`, `effect-readiness`                                                                                                                                                                                            |
| Enrolled, glob not workflow-only (convert)     | `effect-atom`, `effect-daemon-{cluster,microvm,process,socket}`                                                                                                                                                                                                                                                    |
| Enrolled, circular (unchanged, KTD7)           | `oxlint-plugin-{cell-architecture,dmmf-workflow,effect-platform,effect-schema,test-discipline}`                                                                                                                                                                                                                    |
| Not enrolled, no cycle (audit, extract, enrol) | `effect-atom-react`, `effect-cell-types`, `storybook-gherkin`, `npm-package`, `rx-effect`, `effect-schema-extensions`, `hex-schema`, `differential-spec`, `trace-spec`, `trace-taxonomy`                                                                                                                           |
| Not enrolled, circular (unchanged, KTD7)       | `vitest` (runner), `effect-spec-runtime`, `effect-sim-kernel`, `effect-gherkin-spec`, `conformance-spec`, `effect-schema-{vite,discovery,recursion-budget,law}`, `import-origin`, `make-boundary`                                                                                                                  |
| No decisions (not enrolled)                    | `oxlint-config-*` presets (configuration data), `toolchain/*`, `tsconfig`, `npm/gritlint` (launcher, no `src`), `omp-typescript-discipline` (no `src`), `vitest-conformance` and `effect-sim-kernel-tests` (private test harnesses), https://github.com/systemfsoftware/effect-endgame-starter-kit (not published) |

## Key Technical Decisions

- **KTD1. What counts as a decision.** A decision is any branch on domain state: a choice among two or more outcomes that can be named as a tagged union over plain data, the shape `Workflow.make`'s `DecisionLaw` accepts. A shell branches on no domain state (software-wiki `two-regimes-core-shell` A7; CONST-P2 scope). These stay unmutated in the shell as mechanism: iteration, AST and graph traversal that only projects facts, a guard on a mechanical slot that says nothing about the domain (an unset optional handle, an empty worklist, a reentrancy latch), and a one-to-one interpretation of a decision tag into an effect (the write phase). A guard on domain state, such as a node phase, a batch depth or a shutdown mode, is a decision, even with one condition. Its outcomes become two named variants. Rejected alternative: treat every single-condition `if` as mechanism, which would leave domain branches in shells unmutated. Challenge recorded: a bug in a fact projector is no longer caught by mutation. Mitigation: each command carries the smallest plain-data projection the decision needs, so the logic that can be wrong moves into the workflow and the projector only reads fields.
- **KTD2. Glob.** Every enrolled `stryker.config.ts` sets `mutate: shardMutate(['src/**/*.workflow.ts'])`. No negations and no per-package variants. The thresholds stay at the shared break of 100.
- **KTD3. Consumers keep the workflow's typed channel.** Effectful shells call `Effect.fromResult(workflow(new Command({...})))`. Sync shells call `Result.match(workflow(new Command({...})), { onFailure, onSuccess })`, using `absurd` from `effect/Function` on a `Schema.Never` error arm and turning a real error into its typed refusal. `Result.getOrThrow` on a workflow result is banned (user ruling, 2026-09-26): it turns the typed error channel into a throw (CONST-P1, CONST-D2). Property tests match the `Result` too, so a failure is a false verdict. A package is not rebuilt into Sandwich cells as part of this work.
- **KTD4. Commands are always checked.** Every command is built with `new Command({...})`, so its schema checks run. `disableChecks` is banned (user ruling, 2026-09-26): it hands the decision a command nothing validated, the unchecked cast CONST-B5 forbids. Where a command's fields come from a small closed domain, such as atom's node phase in `NodeImpl.value()`, the shell looks up a checked command built once at module load, keyed by that closed value, rather than constructing one per read. The branch still runs through the workflow (KTD1). Rejected alternative: keep the state-bit test in the shell for speed, which leaves a domain branch outside the mutated set.
- **KTD5. One copy of a shared decision.** The `Exit -> TerminationReason` classification is currently written three times (`effect-daemon-spec/src/Supervisor/FiberMedium.ts:58-62`, `effect-daemon-cluster/src/ClusterMedium/medium.ts:51-55`, `effect-daemon-socket/src/SocketMedium/socket-termination.ts:96-110`). It becomes one workflow in `effect-daemon-spec`, which every medium package already depends on, where its input and output types already live. `ShutdownMode` teardown selection stays per package, because each medium's variants differ (signals, VM stop, socket close).
- **KTD7. No workflow where the dependency would be circular (user directive, 2026-09-26).** `turbo run build --dry` rejects the graph once `oxlint-plugin-test-discipline` depends on `effect-cell-types`. The cycle runs through `oxlint-config-recommended` and `effect-cell-types`'s own devDependencies. A package that cannot depend on `effect-cell-types` without closing a cycle gets no workflow and no glob change in this work. Those packages are the five plugins, `import-origin`, `make-boundary`, `vitest`, `effect-spec-runtime`, `effect-sim-kernel`, `effect-gherkin-spec`, `conformance-spec`, `effect-schema-vite`, `effect-schema-discovery`, `effect-schema-recursion-budget` and `effect-schema-law`. The plugins stay enrolled on their current globs. Rejected alternatives: move `Workflow` to a new package, or move `effect-cell-types`'s tests out. The user refused both.
- **KTD11. Actual decision logic only.** Extract a workflow only where the code chooses between named outcomes that matter to the domain. Do not mint workflows for trivia, such as a one-line constant mapping or a helper that exists only to satisfy the glob. If a package's only candidates are trivia, it is not enrolled, and the PR body says so.
- **KTD8. Tests follow CONST-T14 and CONST-T15.** The suites that already kill mutants in each package (RuleTester, contract, conformance, differential, integration) reach the workflows through `related: true` and per-test coverage once a shell imports a workflow. A `src/__tests__/<stem>.workflow.property.test.ts` is added only for a universal that the public surface cannot reach. No test is written to cover a wrapper.
- **KTD10. Evaluator surfaces are unchanged (CONST-E9).** No change to oxlint presets, rule lists, thresholds, `mutation.yml`, or guard scripts.

## Implementation Units

Units run in parallel except where a dependency is named. Every unit ends with the package's `lint`, `typecheck` and `test` passing, and its glob at KTD2.

### U1. effect-daemon-spec: shared exit classifier and stray decisions

Move `FiberMedium` termination classification into one workflow (KTD5), exported for the medium packages. Audit `src/` for other non-workflow decisions, such as supervisor-policy or report shaping outside `kernel/*.workflow.ts`, and move them. **Blocks U3 and U4.**

### U2. effect-daemon-process

Workflows for `ProcessExit -> TerminationReason`, including the exit-code split and signal-name extraction, and for `ShutdownMode -> KillOptions` (DaemonDecisions §3, P1-P5). Remove `platformDetailOf`'s `instanceof` branch where the error schema makes it data. `conformance-driver.ts` step routing is interpretation (KTD1).

### U3. effect-daemon-socket (after U1)

Workflows: socket failure -> `FailureReport` (S1, S2), peer close (S3), connection termination (S6, using U1 where the shape matches), readiness verdict (S7), and teardown per `ShutdownMode` (S8). The codec round-trip in `socket-failure.schema.ts` stays in the schema file. Delete the KTD13 comment in `stryker.config.ts`, and fix the `DSK-M3` path in `AGENTS.md` if the report builder moves.

### U4. effect-daemon-cluster (after U1)

Termination uses U1. Add a workflow for choosing the child start branch (C2). Add `@systemfsoftware/effect-cell-types` if the package calls `Workflow` itself.

### U5. effect-daemon-microvm

Workflows: exit code -> termination (M2), `ShutdownMode` -> teardown (M1), and resource sizing (M3), if it survives KTD1. Add the `effect-cell-types` dependency.

### U6. effect-atom

Workflows (AtomDecisions §A-E): node fate (reuse `NodeFate` and fold in `internal/node-lifetime.ts`), node-state transition on the non-valid path (KTD4), invalidation and propagation (C1-C3, C6-C10), batch phase (D1, D2), and one async-read verdict that replaces the overlapping `shouldSuspendResult`, `isReadyResult` and `shouldWaitForResult` family (CONST-S4). Decisions in `registry-engine.ts`, such as TTL bucket and disposal choices, move too. Single-condition guards stay (§F). Rewrite `AT4` in `packages/atom/AGENTS.md`. The mutated set is now the workflows, not `atom-node.ts`. The registry-engine CI-budget note no longer applies to a workflow-sized set.

### U12. Already workflow-only packages

Audit `effect-daemon-conformance`, `discern`, `effect-memfs`, `effect-microsandbox` and `effect-readiness` for decisions outside `*.workflow.ts`, and move them.

### U13. Not-yet-enrolled packages without a cycle (one unit per package)

`effect-atom-react`, `effect-cell-types`, `storybook-gherkin`, `npm-package`, `rx-effect`, `effect-schema-extensions`, `hex-schema`, `differential-spec`, `trace-spec`, `trace-taxonomy`. For each: audit for actual decision logic (KTD11), extract it into workflows, then enrol. Enrolling means a `stryker.config.ts` at KTD2 on the shared base, `mutation` and `mutation:full` scripts, the stryker devDependencies from the `stryker` catalog, `stryker.config.ts` in the node tsconfig project, and the lockfile. A package whose audit finds no decision is not enrolled, and the PR body states why.

### U14. Doctrine and release intents (after all)

Update every `AGENTS.md` row and comment that names a pre-change mutated set. Add one `docs/solutions/` entry covering the KTD1 line and the KTD7 cycle. Add changesets: `none` for internal refactors whose build hash changed, and `patch` for any package whose published surface changed.

## Verification

- Per unit: `pnpm --filter <pkg> lint`, `typecheck`, `test` pass.
- Whole tree: `pnpm check:local` exits 0 after the last edit.
- Every enrolled `stryker.config.ts` matches KTD2, checked with one grep over `packages/**/stryker.config.ts`.
- No local mutation run (REPO-D3). Scores come from the CI Mutation workflow.

## Risks

- **Surviving mutants appear only in CI.** A workflow whose only killer is a contract test may survive until CI reports it. The CI report is the evidence, and a survivor is killed with a sharper test or by deleting the dead variant (CONST-T3).
- **microvm contract tests need `/dev/kvm`.** A workflow killed only by those tests survives on a runner without KVM. This is unchanged from today.
- **Scale.** About 20 packages. Units are package-scoped, so failures stay local.

## Challenge (CONST-W2)

A destructive review with the Inversion lens was run before execution. It tested three assumptions:

1. "A single-condition guard is mechanism." Refuted by doctrine (`two-regimes-core-shell` A7). A guard on domain state is a decision. KTD1 now draws the line at domain state, not at the number of conditions.
2. "The hot path must keep its branch in the shell." Replaced by a precomputed command table (KTD4). The branch moves into the mutated set with no per-read construction.
3. "Existing suites reach the new workflows." They do only through the import graph (`related: true`). So every workflow must be imported by the code that used to hold the decision (KTD3), never left beside it unused. A workflow that no test reaches yields no mutants, and CI reports that as an empty set.
