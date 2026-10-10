---
title: Get the Mutation workflow green on main and restore its push trigger
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan
execution: code
date: 2026-10-09
---

# Get the Mutation workflow green on main and restore its push trigger

PR-1 (#700, merged as `f9ebfc4f`) removed the `push` trigger from `mutation.yml` to stop the failing main runs. This plan is PR-2: fix the causes and restore `push`. PR-3 is the Dependabot configuration, on its own branch.

## Goal Capsule

- **Objective:** Maintainers get a mutation verdict on every push to main again. A `workflow_dispatch` run of `Mutation` on this branch's head finishes green: every coverage job, every shard and every merge/gate pass.
- **Means:** Use the installed CLI's plan, shard, merge and gate lane, per project (KTD1, KTD3). Produce one dry run per project and have every shard reuse it (KTD2). Fix the sandbox-only failures at their cause (KTD4, KTD5). Kill survivors, and baseline by id only mutants that are declaration-only (KTD7).
- **Authority:** operator rulings of 2026-10-09, then this plan, then `CONSTITUTION.md`, then the root `AGENTS.md` (defines REPO-D3 and REPO-R2), then `.github/AGENTS.md`.
- **Stop conditions:** stop and report before any of these:
  - a change inside `stryker-js-effect`;
  - a change to `TARGET_SECONDS` (900), the 1800 s per-package cap, a job timeout, or any per-mutant timeout setting (`timeoutMS`, `timeoutFactor`, `dryRunTimeoutMinutes`);
  - a skip, an exclusion of an enrolled package, `break: null`, a numeric per-package threshold, a retry, a new dependency or a new secret.

  A rise in the shard count (`--max-shards`) is allowed, sized as in DR1, with the jobs and runner-minutes stated.
- **Forbidden:** running stryker in any form, locally or in a container. Plain vitest runs in a sandbox-shaped copy are allowed. A force-push. Naming a private repository.
- **Ships:** branch `fix/mutation-causes` from `origin/main` at `cf6ab028e5` or later, PR to `main`, proven by one `workflow_dispatch` run on its head.

## Product Contract

### Summary

Main's Mutation run failed 61 times in a row (evidence run 37962737026, head `b1f96237`; second run 37980363240). Four independent causes:

- **A.** The report step calls a CLI command that doesn't exist.
- **B.** Shards hit the 1800 s cap.
- **C.** Dry runs fail only inside the Stryker sandbox.
- **D.** `gate` would refuse surviving mutants that no baseline accepts. (The old lane read a score against `thresholds.break`; the adopted lane reads none, see D below.)

Each cause fails the run on its own.

### Problem Frame

**A. Unknown command.** Job `113942136169` exits 2 with `Received unknown argument: 'merge-reports'`. The installed `@systemfsoftware/stryker-js@17.0.2` has the subcommands `run merge compare gate annotate plan serve survivors feedback mcp`. `merge` requires `--plan` and the shard directories (`dist/main.mjs:113475-113481`). Our shards come from repo-local file slicing (`shardMutate`, `packages/toolchain/stryker-config/lib/base.js:82-93`), so there is no plan for `merge` to read.

**B. Shards reach the cap.** Jobs `113929523099`, `113929523074` and `113929523334` (effect-atom 7/9, 8/9, 9/9) and `113929523102` (effect-daemon-spec 3/4) are SIGTERMed at 1800 s. Measured from all 14 shard logs of run 37962737026:

- **Every shard pays a full dry run.** Each log shows `dry-run coverage reuse refused (closureChanged)`. For effect-atom that is 577–640 s per shard, and 388–709 s for effect-daemon-spec, before the first mutant runs.
- **Why reuse was refused.** The only prior record each shard could read was its own per-shard incremental file from the previous main run (restored by the `stryker-incremental-` cache, `mutation.yml:70-76`; file name `stryker-incremental-<k>of<N>.json`, `scripts/tools/mutation-job.ts:32-35`). That run was on an older commit, so the source content in the closure digest differed. See KTD2 for the full answer.
- **Timeout mutants carry most of the measured mutant cost.** In the run 37980363240 incremental reports, 20 Timeout mutants account for 8393 s of effect-atom's 12254 s of measured cost. For effect-daemon-spec, 11 Timeouts account for 5154 of 5290 s. The largest single mutant is about 470 s.

**C. Sandbox-only failures.** Reproduced without stryker. Each package was copied into `<pkg>/.stryker-tmp/sandbox-x/`, with `node_modules` linked the way Stryker's sandbox links it, and the test file was run with plain vitest (output in the Appendix, C-repro). There are three causes:

- **C1a: library frames are matched by path text.** `packages/runner/vitest/src/internal/call-site.ts:28-45` treats a frame as a library frame when its path contains `/<lib>/src/` or `/<lib>/dist/`. A library copied into a sandbox is under `/<lib>/.stryker-tmp/sandbox-*/src/`, which doesn't match, so the library's own frames become the raising site.
  - Seen in runner/vitest: `raisedAt` is `…/sandbox-x/src/internal/call-site.ts:110` instead of the test line.
  - Seen in trace-spec: `firstLocationFile` is `…/sandbox-x/src/Contract.ts`.
- **C1b: corpus fixtures hard-code their own workspace path.** The fixtures declare `defectFile` as a literal (`packages/trace/trace-spec/tests/__fixtures__/failure-corpus/break.ts:8`, and the same in storybook-gherkin and effect-spec-runtime). In the sandbox the record correctly names `…/sandbox-x/tests/__fixtures__/…`, so `namesDefectFile` and `firstLocationFile` fail against the literal.
  - Seen in trace-spec, storybook-gherkin and effect-spec-runtime (`failure-corpus.kernel.runner.test.ts:26`; all three fixtures).
- **C2: a recursion budget hidden by instrumentation (discern only).** The discern dry run fails `src/schema-laws.test.ts` with `recursionBudget is declared on PatternAst but nothing materialized it — Budget_RequiresTransform`.
  - `PatternAst.schema.ts:43-48` declares `.annotate({ identifier, recursionBudget: {…} })`.
  - The ignorer leaves an annotation object unmutated only when it holds documentation keys (`stryker-ignorer-effect-schema-declarations@0.2.0` `dist/index.mjs:18-41,109-118`). `recursionBudget` isn't one of them, so the object is instrumented.
  - The instrumenter's expression placer emits `stryMutAct_9fa48(id) ? replacement : (stryCov_9fa48(id), original)` (`stryker-js-instrumenter@12.1.1` `dist/index.mjs`, `expressionMutantPlacer`).
  - `recursion-budget-transform.ts:106-107` requires `annotate`'s first argument to be an `ObjectExpression`. On that shape it injects nothing; a throwaway probe returned `instrumented -> UNTOUCHED` while `plain -> INJECTED` (Appendix, C2-probe).

**D. Survivors.** In the adopted lane, `merge` writes the merged report and never applies `thresholds.break` (`mergedReportOf`, `:113028`). A shard below break logs a soft line only (`:113235`). `gate` decides alone: it fails on any `Survived` or `NoCoverage` mutant whose id is absent from the committed baseline (`:97478`, `:97519-97553`). It never reads a score. Survivors (run 37980363240) are in the Appendix: 25 to kill in three small packages, 4 declaration-only brand ids to baseline (D2), and 676 in the two lint plugins. discern and effect-spec-runtime have no report until C is fixed. effect-schema-vite has no survivors.

### Requirements

- **R1.** Merge and gate run with commands the installed CLI has, per project.
- **R2.** No shard reaches 1800 s. Each shard's predicted load is planned from per-mutant `costs` so that predicted overhead plus load is at or under `TARGET_SECONDS` 900.
- **R3.** trace-spec, runner/vitest, storybook-gherkin, effect-spec-runtime and discern pass their dry run in the sandbox layout, and their assertions in the normal tree are unchanged in meaning.
- **R4.** `gate` passes for every enrolled project. Every survivor is killed, or baselined by id with a declaration-only or equivalence reason. `break: 100` stays in every config. There is no numeric override.
- **R5.** `mutation.yml` triggers on `push: branches: [main]` again (removed by PR-1), and `.github/AGENTS.md:21` describes the lane that ships.

### Scope Boundaries

- Every one of the 26 packages with a `mutation` script is enrolled; none is excluded:
  atom/effect-atom, atom/effect-atom-react, daemon/effect-daemon-conformance, daemon/effect-daemon-microvm, daemon/effect-daemon-process, daemon/effect-daemon-socket, daemon/effect-daemon-spec, discern, effect-memfs, effect-microsandbox, effect-readiness, effect-spec-runtime, gherkin/effect-gherkin-spec, gherkin/storybook-gherkin, npm-package, oxlint-plugin/oxlint-plugin-{cell-architecture,dmmf-workflow,effect-platform,effect-schema,test-discipline}, runner/vitest, schema/effect-schema-vite, schema/hex-schema, sim/conformance-spec, sim/differential-spec, trace/trace-spec (all under `packages/`).
- Root questions, recorded and not worked around here:
  - (Q1) the ignorer's handling of `recursionBudget`: ruled (b) for now; the ignorer fix at the root removes U9's directive;
  - (Q3) the `InstrumentationBrand` ignorer gap (Appendix D2).
- Not in scope: the Dependabot configuration (PR-3).

## Planning Contract

### Key Technical Decisions

- **KTD1: Adopt the installed `plan` → `run --plan --shard` → `merge --plan` → `gate` lane.** Ruled 2026-10-09. It replaces the repo-local file slicing, `STRYKER_SHARD`, `mutation-job.ts` and the `test-timings.ts --task mutation` planner.
- **KTD2: One dry run per project, produced by a coverage job and reused by every shard.** Answers to the V1 ruling, from the installed `dist/main.mjs`:
  1. **The record.** The reuse reads `dryRunCoverage` from the incremental report (`DryRunCoverageSchema`, `:105663-105672`: tests, mutant coverage, global inputs, overhead, flaky ids, `testClosureDigest`, `runInputsDigest`). It is written into the incremental file by `writeIncrementalReport` (`:89284-89296`, field at `:89294`) at the end of a run, and by every checkpoint (`slimIncrementalReport`, `:89333-89351`, via `checkpointIncremental` `:89381-89385`). The first checkpoint is written as soon as mutation testing starts (`makeCheckpointWriter`, `:109438`). A shard leaf writes it to `<out>/<project>/stryker-incremental.json` (`childArgsOf`, `:113222-113224`) and first seeds that path from the project's `reports/stryker-incremental.json` if one exists (`seedIncremental`, `:113227-113233`). It is read back by `priorCoveragesOf` (`:107060-107066`) from the incremental file plus `incrementalSources`. `--dryRunOnly` writes nothing (`writeMutationTestDryRunOnly`, `:110117-110123`), so it can't be the producer.
  2. **The key.** Reuse needs two equal digests (`matchesPrior`, `:105778`).
     - `testClosureDigest` (`closureDigestOf`, `:107073`) hashes, per test file, the import closure's file keys and content hashes (`closureDigestOf$1`, `:106303`), plus `projectDigest`. `projectDigest` hashes the key and content hash of every project file (`projectDigestOf`, `:106295`), and the project files are all of the config's file descriptions plus the test files (`closureAnalysisOf$1`, `:107067-107072`). It holds no mutate flag and no mutant id.
     - `runInputsDigest` (`runInputsDigestOfParts`, `:88871-88876`) hashes the options fingerprint, the package manifest without its version, the lockfile and the Node major. The fingerprint drops `mutate`, `since`, `mutantIds`, presentation keys and storage keys including `incrementalFile` (`:88832-88865`). `--plan`, `--shard` and `--project` never enter the options (`readStrykerOptions`, `:113743-113785`). `incremental`, `configFile` and `dryRunOnly` do.
  3. **Was it `shardMutate`?** No. `shardMutate` only negates other shards' files in `mutate`, which neither digest reads. The refusals came from the prior record being from an older commit (Problem Frame B). In the adopted lane a shard leaf restricts mutants only through `mutantIds` (`:113500-113502`), applied after the dry run (`restrictedToRequestedIds` in `mutationTestCell$1`, `:110277-110280`). So the dry run instruments the project's full mutate set in every shard, and a record produced on the same commit with the same CLI shape matches both digests.
  4. **One producer per project.** Yes, as a coverage job per project. It runs the same leaf command the shards run, `stryker run --plan <derived plan> --shard 1/1 --out coverage`. The derived plan is the project's real plan with one shard that lists the project with `mutants: []` (written with `jq` in the plan job; the `ShardProject.mutants` is a plain array with no minimum, `:65969-65972`, `ShardPlan` `:65984`). The leaf runs the full dry run, restricts to zero mutants, and its first checkpoint and final report write `dryRunCoverage`. The job uploads `coverage/<project>/stryker-incremental.json`. Each shard job downloads it to `<project>/reports/stryker-incremental.json` before `run --plan`, so `seedIncremental` hands it to the leaf, and `readDryRun` takes `DryRunCoverageReused` (`:107305-107330`).
  - **Risk, verified on dispatch:** a leaf with zero mutants must exit 0. If it doesn't, the plan job writes the coverage plan with `jq` the same way, but lists one mutant: `.shards = [{index:1,count:1,predictedSeconds:0,projects:[{project:<label>,mutants:[<id>]}]}]`, where `<id>` is the project's cheapest mutant in the seeded `costs` (`actualMs`, else `predictedMs`). It is chosen with `jq` over the restored incremental file, so the coverage job runs the dry run plus one cheap mutant.
  - **Proof:** no unit test is admissible. The decision lives in the installed CLI (`DryRunReuseCommand`, `:105761-105791`), and the repo side is workflow wiring, where a structure check is a new gate (GATE1). The proof is the dispatch run: every shard log shows `Reusing the persisted dry-run coverage; skipping the initial test run` (`:107316`) and no `dry-run coverage reuse refused`.
- **KTD3: One plan, one shard set and one merge/gate per project, sized so the 900 s target can't be under-provisioned.** No shard mixes projects. Small projects run one after another in shared jobs (V4 ruling), each with its own plan, shard and merge/gate.
  - **Units.** The planner sums per-mutant cost in milliseconds of test-runner time (`neededShardsOf`, `:111768`) and packs by LPT, costliest first (`assignLpt`, `:111789`). A shard's wall time is at most `O + load ÷ R`.
    - `O` is the per-shard overhead: 120 s with reused coverage. That is up to 76 s measured stryker start-up before the dry run in run 37962737026, plus instrumentation and sandbox (under 2 s), rounded up.
    - `R` = 2, the test runners per shard (`Creating 2 checker process(es) and 2 test runner process(es)` in every shard log).
  - **Bound.** LPT's largest bin is at most `C ÷ N + c_max`, where `C` is the project's total cost and `c_max` its costliest mutant. So `O + (C ÷ N + c_max) ÷ R ≤ 900` holds whenever `N ≥ C ÷ ((900 − O) × R − c_max)`.
  - **Formula (W8, X2).** `T_p = (900 − O) × R − c_max(p)`. The plan job passes only `--target-seconds T_p`, with no `--max-shards`, so the CLI's own cost model sets `N = ceil(C ÷ T_p)` (`:111768-111773`) and nothing can truncate it.
  - **Computing `c_max(p)`.** The plan job computes it with `jq` over the project's restored incremental `costs`, using KTD8's precedence: `actualMs`, else `predictedMs`. A mutant with neither costs at most its covering-test time or 1 s in the CLI (`costOf`, `:111893`). `jq` can't see those smaller fallbacks, and leaving them out of the maximum only lowers `T_p`, so it can't under-provision.
  - **Single shard.** A project runs as one shard, with no coverage job and its own dry run `D`, when `O + D + (C + c_max) ÷ R ≤ 900`. `D` comes from the seeded `dryRunCoverage.timeOverheadMs` plus the summed test times. Otherwise it gets a coverage job and `N ≥ 2` reused-coverage shards.
- **KTD4: Decide library frames by the library's resolved package root** (CONST-T12).
  - The roots of the libraries in `LIBRARY_DIRS` are resolved at runtime from their own package location.
  - A frame is a library frame when it lies under such a root's `src/` or `dist/`. Inside the sandbox, the copied library's root is the sandbox directory, so its frames resolve the same way.
  - `LIBRARY_DIRS` path text and `inOwnDir` are deleted.
  - The decision is a pure function of the roots and the path. Its regression case is the sandbox root, where the old matcher answers "user".
- **KTD5: A corpus fixture names its own location from its own module URL.** `defectFile` is the workspace-relative path of the fixture's `import.meta.url`. That is an independent oracle: the runtime's module location, not the renderer under test (CONST-T10). It is never a literal path.
- **KTD6: C2 is fixed by one Stryker disable directive (root ruling on Q1, option (b)).** The condition, generation-only reads, is shown with every read site below. The directive is temporary and comes out with the ignorer fix (Q1 stays open with the root for that).
- **KTD7: Rules for D.**
  - `break: 100` stays.
  - Each enrolled project commits `mutation-baseline.json` shaped `{ "schemaVersion": 1, "survivors": [<MutantId>…] }` (`Baseline`, `:97143-97147`). An empty list is valid. A missing file is a `ConfigError` (`:97535`), so every project ships one.
  - The four `InstrumentationBrand` survivors are never baselined (root ruling superseding D2): a brand map names span attributes, which is a telemetry contract. The runtime reader is `annotateFields` (`packages/effect-cell-types/src/Sandwich.ts:80-85`). It runs only when a workflow is the `.decide(…)` of a `Sandwich`; `Workflow.make` attaches schemas and emits no span (`Workflow.ts:222-228`). Two are killed by trace tests; the other two maps have no reader and are emptied (root ruling on Q4, option 2). See U10.
  - An id enters a baseline only with an equivalence proof, listed in the PR body. New survivors still fail.
- **KTD8: The planner is fed by the CLI's own records.** `stryker plan` reads the project's incremental texts (`planProject`, `:111919-111941`). A mutant's cost is its recorded `actualMs`, else `predictedMs` (`namedCostsOf`, `:111874`), else the summed time of its covering tests from dry-run coverage (`coveringCostOf`, `:111892`), else 1 s (`DEFAULT_MUTANT_COST_MS`, `:111872`). Mutants whose prior result still holds cost 0 and are not re-run (`:111942-111945`).
  - The source is the per-project incremental report `merge` writes (`writeProjectIncrementals`, `:113100-113105`). It is cached and restored as U1's path walk shows (step 5).
  - The first dispatch run has no merged record yet. It reads the old per-shard files the cache still holds through `incrementalSources: ['reports/stryker-incremental-*.json']`. That option is a storage key and outside the fingerprint (`:88850-88855`).
  - The timing record and `test-timings.ts --task mutation` have no consumer left. `git grep -n -e "--task mutation" -e mutation-timings` on `cf6ab028e5` finds only `.github/workflows/mutation.yml:37-129`, `scripts/tools/mutation-job.ts:223` and `.github/AGENTS.md:21`, which U1 and U8 rewrite. So U1 deletes the mutation task.

### DR1: whole-workflow sizing for all 26 projects

**Cost seed for the first run.** The failing main runs saved every shard's incremental file, including its `costs`, to the `stryker-incremental-<run_id>` cache (`mutation.yml:145-162`; shards ran mutants until they were killed). The plan job restores the newest one by prefix. Those files are named `stryker-incremental-<k>of<N>.json`, so U2's `incrementalSources: ['reports/stryker-incremental-*.json']` lets `stryker plan` read them (KTD8).

- In run 37980363240's records, 6,473 of the 18,745 mutants in its reports (34.5 %) have a measured `actualMs`, and another 10,669 (56.9 %) have only `predictedMs`. Together that is 91.4 % with a recorded cost.
- 8 projects have no report yet: discern, effect-spec-runtime, effect-gherkin-spec, storybook-gherkin, runner/vitest, conformance-spec, differential-spec, trace-spec. Their mutants fall back to coverage time or 1 s (`costOf`, `:111893`).
- The `predictedMs` values overstate. In effect-atom, 205 mutants that never ran (165 CompileErrors) carry 36,699 s, against 12,254 s for its 50 measured mutants. So the first run over-provisions shards and never under-provisions.

|                                                             | Jobs                                                                                    | Runner time             | Basis                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Today** (run 37962737026, failing)                        | 23                                                                                      | 25,366 s = **7.05 h**   | measured: sum of job durations                                                                                                                                     |
| **First run** (seeded costs, `actualMs` else `predictedMs`) | ≈ 194: 1 plan, 12 coverage, 154 shards, ≈ 15 small-project batches, 12 merge/gate       | ≈ 39,500 s ≈ **11.0 h** | inferred: 154 × 120 s overhead + 16,789 s measured mutant and dry-run work + 12 coverage jobs (1,922 s dry runs + 1,440 s setup) + 12 more batch jobs × 75 s setup |
| **Steady state** (merged `actualMs` from the previous run)  | ≈ 40: 1 plan, 3 coverage, 22 shards, ≈ 10 small-project batches, 3 merge/gate, 1 report | ≈ 21,700 s ≈ **6.0 h**  | measured work, inferred overhead and costs (below); 4 more batch jobs × 75 s setup than 4,500 s packing                                                            |

Per project, steady state (`T_p = 1560 − c_max`):

| Project                       | Measured dry run D (s) | Measured mutant wall (s)                | c_max (s, measured) | C (cost-s)                     | Shards N                                                                                                               | Runner s (shards × 120 + wall + coverage job) |
| ----------------------------- | ---------------------- | --------------------------------------- | ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| effect-atom                   | 640                    | 7,617                                   | 469                 | ≈ 15,234 [INFERENCE: R × wall] | 14                                                                                                                     | 10,057                                        |
| effect-daemon-spec            | 709                    | 2,939                                   | 474                 | ≈ 5,878 [INFERENCE]            | 6                                                                                                                      | 4,488                                         |
| oxlint-plugin-test-discipline | 33                     | 1,129                                   | 26                  | ≈ 2,258 [INFERENCE]            | 2                                                                                                                      | 1,522                                         |
| other 23 projects             | own                    | 5,104 s across the 6 batched jobs today | —                   | —                              | 1 each, batched first-fit to 900 s [INFERENCE: ≈ 7,900 s of estimates, 23 × 120 s overhead + 5,104 s, so ≈ 10 batches] | 5,104 (measured)                              |

Measured: today's job durations, dry runs, mutant wall and `c_max` (run 37962737026 shard logs and the run 37980363240 `costs`). Inferred: `O` = 120 s for a reused-coverage shard, `C` ≈ R × wall until the first full run records `actualMs` for every mutant, and about 250 s for the plan, merge/gate and report jobs.

- The first run costs more than today (≈ 11.0 h against 7.05 h) because `predictedMs` overstates the cost of mutants that never ran. From the second run on, every planned mutant has a measured `actualMs` and the lane drops to about 6.0 h.
- **Batch packing (root ruling).** A batch job is packed first-fit, costliest first, to `TARGET_SECONDS` (900 s of estimated work, each project's estimate being `O + D + (C + c_max) ÷ R`) and has the shard job's 30-minute timeout. There is no separate batch budget. The first-run batch count is inferred: the old 4,500 s packing gave 3 batches, so the same load needs at least 15 at 900 s.
- Stripping `predictedMs` from the seed would size the first run near steady state, but mutants the failing runs never reached would then count as 1 s. That could under-provision, which W8 forbids, so this plan doesn't strip it.

### Per-push cost on main (binding root addition)

**Choice: the CLI's own incremental reuse decides what runs, not turbo's affected filter.**

- Evidence against turbo: `turbo query 'affectedPackages(base: "HEAD~1", head: "HEAD")'` on `cf6ab028e5` (a CI-key change touching `turbo.json` and `.github/`) returned all 51 packages, each with reason `DefaultGlobalFileChanged`. Turbo maps files to packages; it doesn't know a mutant's test closure. Any root-file push would fan out to every project.
- Evidence for the CLI: `stryker plan` already prices a mutant whose prior result still holds at 0 and does not re-run it (`:111942-111945`, `readIncrementalReuse` `:111929`). The reuse is keyed per mutant on the test-closure digest (`:107073`, `:106303`) and the run-inputs digest (`:88871-88876`). That is a narrower set than any package filter.

**Lane shape for an unchanged project.**

- The plan job plans every enrolled project from the restored merged incrementals.
- A project whose plan has 0 mutants to run gets no coverage job, no shard job and no merge/gate job. The report job carries its merged incremental forward unchanged from the restored cache, and its last gate verdict stands.
- Only projects with planned mutants fan out, by KTD3.

**Estimate for a typical push that changes 1-2 packages** [INFERENCE: from measured parts]:

- Plan job: about 5 min. That is about 75 s measured job setup plus about 1-2 s of prepare and instrument per project (measured on effect-atom: 0.4 s and 0.7 s) across 26 projects, plus install.
- One or two single-shard projects: about 75 s setup plus their own dry run (measured 33-709 s) plus only the changed files' mutants, about 5-15 min each.
- Report job: about 2 min.
- **Total ≈ 15-35 runner-minutes (0.25-0.6 h)**, against today's 7.05 h.
- Worst case, a change to effect-atom's core that invalidates its whole closure: about the 2.8 h steady-state figure for that project alone.
- A no-op push: plan job plus report job, about 7 runner-minutes.

### `recursionBudget`: every read (evidence for the Q1 ruling)

Root ruling on Q1: option (b), on condition that `recursionBudget` is read only at generation (arbitrary) time. Every read in the repository (`git grep recursionBudget -- 'packages/**/src/**'`, test files excluded):

| Read site                                                                                                                           | When it runs                                                                                                                                                         | What it does                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/schema/effect-schema-recursion-budget/src/recursion-budget-transform.ts:112` (key `:16`, pre-check `:146`)                | Vite transform, registered only in vitest configs (`packages/schema/effect-schema-vite/src/mod.ts:128`, wired into discern by `packages/discern/vitest.config.ts:6`) | rewrites the annotation into `toCodecArbitrary: budgetToArbitrary(...)` (`:134`)                     |
| `packages/schema/effect-schema-recursion-budget/src/recursion-budget-runtime.ts:94`                                                 | inside the injected `toCodecArbitrary` hook                                                                                                                          | builds the depth-bounded arbitrary; `:15`, `:85`, `:89` are its error texts                          |
| `packages/schema/effect-schema-law/src/recursion-laws.ts:18`, `:31`                                                                 | law-suite property tests                                                                                                                                             | reads the budget's `maxDepth`; `:255` raises `Budget_RequiresTransform` when no hook materialized it |
| `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/schema-recursive-union-budget.ts:241` (`BUDGET_MEMBER`, config `:35`) | lint time, on source text                                                                                                                                            | checks that a recursion point declares a budget                                                      |
| `packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/prop-fixture-schema-origin.ts:188`                                  | lint time, on source text                                                                                                                                            | accepts a budget as a declared generation path                                                       |

The only declaration in shipped code is `packages/discern/src/PatternAst.schema.ts:47`. No decode, encode or validation path reads it: discern's build config registers no transform (`git grep recursion-budget packages/discern` finds none), and Effect's `Schema` decoding never looks at a custom annotation key. The condition holds, so option (b) is allowed.

### C2 fix (Q1 ruled: option (b))

One `// Stryker disable next-line ObjectLiteral` on the `annotate({...})` object in `packages/discern/src/PatternAst.schema.ts:43-48`, with a reason comment. The comment names the stryker-js-effect ignorer gap (`@systemfsoftware/stryker-ignorer-effect-schema-declarations@0.2.0` does not list `recursionBudget` among its generation keys, `dist/index.mjs:30-35`) and says the directive comes out once the ignorer fix lands. Nothing changes in stryker-js-effect. The rejected options stay rejected: excluding discern, and teaching our transform the mutant switch.

### Sequencing

U1 → U2 → U3 → U4 → U5 → U9 → U6 → U7 → U8. Each unit commits on its own and leaves `push` off until U8.

## Implementation Units

### U1. Per-project plan/shard/merge/gate lane

- **Goal:** R1 (KTD1, KTD3, KTD7, KTD8).
- **Files:** `.github/workflows/mutation.yml`. Delete `scripts/tools/mutation-job.ts` and the `--task mutation` planner in `scripts/tools/test-timings.ts`.
- **Path layout (W5).** All commands run from the repository root, which is the CLI's `basePath`. A project's label is relative to the plan file's directory: `labelBaseOf` is `dirname(resolve(basePath, --out))` (`:111989`, used at `:111993`), and `labelOf$1` is `relative(labelBase, project)` (`:111901-111903`). So plans are written **at the repository root**, and every label is workspace-relative (`packages/<…>`).

  Walk-through for effect-atom (`<slug>` = `atom-effect-atom`, label `packages/atom/effect-atom`):
  1. **Plan:** `stryker plan --projects packages/atom/effect-atom --target-seconds T_p --out mutation-plan-<slug>.json`. Label `packages/atom/effect-atom`; the plan directory is the root (`loadShardPlan`, `:113142-113150`).
  2. **Shard k:** `stryker run --plan mutation-plan-<slug>.json --shard k/N --out mutation-shards/<slug>/<k>`.
     - `outDir` = `<root>/mutation-shards/<slug>/<k>` (`:113249`).
     - `projectDir` = `<root>/packages/atom/effect-atom` (`:113251`). It is seeded from that directory's `reports/stryker-incremental.json` (`:113255`, `:113227-113233`), which is where U3 places the coverage record.
     - `projectOut` = `<outDir>/packages/atom/effect-atom` (`:113252`), holding `mutation-stream.jsonl` (`:113209`) and `stryker-incremental.json` (`:113210`, `:113224`).
     - Upload `mutation-shards/<slug>/<k>/` as artifact `mutation-shard-<slug>-<k>of<N>`.
  3. **Merge input:** download each `mutation-shard-<slug>-<k>of<N>` to `mutation-shards/<slug>/<k>/`, with `k` taken from the plan's `.shards[].index` and never from a glob (V5). Then run `stryker merge --plan mutation-plan-<slug>.json mutation-shards/<slug>/1 … mutation-shards/<slug>/N --out reports/mutation`. Merge reads `<root>/mutation-shards/<slug>/<k>/packages/atom/effect-atom/mutation-stream.jsonl` (`collectProject`, `:113056-113057`).
  4. **Merged outputs:**
     - The report is `<root>/reports/mutation/mutation.json` (`:113118-113124`, `REPORT_FILE` `:112975`).
     - The project incremental is `<root>/reports/mutation/packages/atom/effect-atom/stryker-incremental.json` (`writeProjectIncrementals`, `:113100-113105`).
     - `stryker gate --baseline packages/atom/effect-atom/mutation-baseline.json` runs from the root. It reads `reports/mutation/mutation.json` (`GATE_REPORT_FILE`, `:113368`, resolved at `:113416`) and resolves `--baseline` against the root (`:113420`).
     - Projects in a shared job run merge then gate one after another, so each gate reads only its own project's report.
  5. **Cache path (X1, single writer).**
     - Every merge/gate job and every batched job uploads `reports/mutation/packages/atom/effect-atom/stryker-incremental.json` as artifact `mutation-merged-<slug>`, at path `packages/atom/effect-atom/reports/stryker-incremental.json`. No job other than `report` writes the cache.
     - The one `report` job `needs` every merge/gate and batched job. It restores the previous cache, downloads `mutation-merged-*` with `merge-multiple` into `.stryker-incremental/` (so this run's records replace the restored ones project by project), and performs the only `actions/cache/save`, under the fresh key `stryker-incremental-<run_id>`.
     - The next run's plan job restores by prefix `stryker-incremental-` and runs `cp -a .stryker-incremental/. .`, which lands the record at `packages/atom/effect-atom/reports/stryker-incremental.json`. That is the file `stryker plan` reads (`incrementalFile`, `planProject` `:111919`) and the one shards seed from.
     - **Cache scope (cost ruling).** Actions looks up a restore key in the run's own branch first, then the default branch. Dispatch run N+1 on `fix/mutation-causes` therefore restores the merged records run N saved on that branch, and the first run on the branch falls back to main's newest. The ≈ 11.0 h first-run cost is paid once; every repeat dispatch plans from measured `actualMs`, at the steady-state ≈ 6.0 h.
- **Jobs.**
  - A plan job emits one matrix row per shard of every project with `N ≥ 2`.
  - Single-shard projects are batched into shared jobs, packed first-fit to 900 s of estimated work with a 30-minute timeout. Each runs plan → `run --plan … --shard 1/1` → merge → gate per project in sequence, with its own dry run.
  - If a project's costliest recorded mutant leaves no room under the target (`T_p < 1`), the plan job fails with an `::error::` naming the project, the mutant id, its cost, the target, and the next action (split the mutant's file or speed up its slowest covering test).
  - A merge/gate job runs per sharded project.
- **Pack:** `package-topology/one-access-path.md` (one sharding mechanism).
- **Test scenarios:** none. A workflow-structure check would be a new gate (GATE1). The dispatch run is the proof.
- **Verification:** the dispatch run reaches `merge` and `gate` for every project, with no `unknown argument` and no `ShardReportGap`. The `report` job's cache save is the run's only one. A second dispatch on the branch logs a cache restore hit on the first run's `stryker-incremental-<run_id>`, plans fewer shards than the first (from measured `actualMs`), and totals ≈ 6.0 runner-hours.

### U2. Delete `shardMutate`

- **Goal:** remove the second sharding mechanism (CONST-S4).
- **Files:** `packages/toolchain/stryker-config/lib/base.js`, `lib/base.d.ts`, and the 26 `stryker.config.ts` files, which go back to a plain `mutate: [...]`. Add `incrementalSources: ['reports/stryker-incremental-*.json']` to the shared config (KTD8).
- **Pack:** `package-topology/surface-changes-are-versioned.md`. Removing the `shardMutate` export is a surface removal. `@systemfsoftware/stryker-config` is `"private": true`, so no changeset applies, even though `lib/**` became a build input on main in #698 (`turbo.json`).
- **Test scenarios:** none. `git grep -n -e shardMutate -e STRYKER_SHARD` returns nothing (DEL1).
- **Verification:** `pnpm check:local`.

### U3. Coverage job per sharded project (KTD2)

- **Goal:** R2.
- **Files:** `.github/workflows/mutation.yml`.
- **Approach:** only projects whose plan has `N ≥ 2` get a coverage job; a single-shard project does its own dry run in its shard.
  1. The plan job writes `mutation-coverage-<slug>.json` at the root: the project's plan with `.shards = [{index:1,count:1,predictedSeconds:0,projects:[{project:<label>,mutants:[]}]}]` and `.matrix.include = [{shard:"1/1",predictedSeconds:0}]`. If the zero-mutant leaf fails on dispatch, it lists the one cheapest mutant instead (KTD2).
  2. The coverage job runs `stryker run --plan mutation-coverage-<slug>.json --shard 1/1 --out mutation-coverage/<slug>` and uploads `mutation-coverage/<slug>/<label>/stryker-incremental.json` as `mutation-coverage-<slug>`.
  3. Each shard job of that project `needs` the coverage job and downloads the artifact to `<label>/reports/stryker-incremental.json` before `run --plan`.
- **Pack:** `cell-architecture/pure-decision-workflows.md` (the reuse decision is the CLI's `DryRunReuseCommand`; no repo code changes).
- **Test scenarios:** none (KTD2, Proof).
- **Verification:** in the dispatch run, every shard of a sharded project logs `Reusing the persisted dry-run coverage; skipping the initial test run` and none logs `dry-run coverage reuse refused`. Every shard is at or under 900 s, and every coverage job exits 0. On a repeat dispatch, the plan job restores the previous run's merged record, so the coverage job is the only dry run per sharded project.

### U4. Library frames by package root (C1a)

- **Goal:** R3 for runner/vitest and trace-spec (KTD4).
- **Files:** `packages/runner/vitest/src/internal/call-site.ts`, plus a colocated regression test of its pure frame-owner decision.
- **Pack:** `boundary-testing/real-system-oracles.md` (the sandbox repro uses a real copied tree, not a faked path); `boundary-testing/no-mocks-on-internal-glue.md` (no mocked `path`/`fs`); `cell-architecture/pure-decision-workflows.md` (the owner decision is total and pure).
- **Test scenarios** (admitted as a known-bug regression on pure logic):
  - Library root `…/runner/vitest/.stryker-tmp/sandbox-x` with frame `…/sandbox-x/src/internal/call-site.ts:110` gives library. The old substring matcher gives user, so the test fails on it.
  - Frame `…/sandbox-x/tests/failure-location.runner.test.ts:42` gives user.
  - A path under `node_modules` gives vendored.
- **Changeset:** `patch` for `@systemfsoftware/vitest`.
- **Verification:**
  - `pnpm --filter @systemfsoftware/vitest test`, and `failure-location.runner.test.ts` passes in the sandbox layout (Appendix recipe).
  - trace-spec's `firstLocationFile` is no longer `src/Contract.ts` in that layout.

### U5. Corpus fixtures name themselves (C1b)

- **Goal:** R3 for trace-spec, storybook-gherkin and effect-spec-runtime (KTD5).
- **Files:**
  - `packages/trace/trace-spec/tests/__fixtures__/failure-corpus/break.ts`
  - `packages/gherkin/storybook-gherkin/tests/__fixtures__/failure-corpus/failing-story.ts`
  - `packages/effect-spec-runtime/tests/__fixtures__/failure-corpus/{baseline-failure,raised-in-user-code,seeded-schedule}.ts`
  - plus a shared workspace-relative helper if one already exists in `@systemfsoftware/vitest`. Otherwise derive the path from the workspace root the shared config provides (`@systemfsoftware/vitest:workspace-root`).
- **Pack:** `boundary-testing/real-system-oracles.md`.
- **Test scenarios:** the existing corpus tests, unchanged in assertions, pass in both the normal tree and the sandbox layout.
- **Verification:** the per-package `test` commands, plus the sandbox-layout recipe for all three packages' corpus tests.

### U9. discern: one disable directive (C2, Q1 ruling (b))

- **Goal:** R3 for discern (KTD6).
- **Files:** `packages/discern/src/PatternAst.schema.ts` (one `// Stryker disable next-line ObjectLiteral` with its reason comment above the `annotate({...})` argument).
- **Pack:** `schema-laws/recursive-schema-suspend.md` (the budget is the suspension's generation ceiling).
- **Test scenarios:** none. The directive changes no behaviour; the dispatch run's discern dry run is the proof.
- **Changeset:** `none` if `changeset-check` asks (a comment in `src/**`).
- **Verification:** `pnpm --filter @systemfsoftware/discern test`; in the dispatch run, discern's dry run passes with no `Budget_RequiresTransform`.

### U6. Kill the small-package survivors (D1)

- **Goal:** R4 for effect-daemon-socket, effect-microsandbox and effect-daemon-microvm.
- **Files:** each package's existing test beside the listed source (Appendix D1), plus an empty `mutation-baseline.json` per package (the D2 ids are killed in U10).
- **Pack:**
  - `schema-laws/refusals-beside-generated-laws.md` (regex and struct rejections);
  - `schema-laws/invariants-as-refinements.md` (the `MicroVMSpec` image pattern);
  - `schema-laws/data-only-schema-classes.md` (error message getters asserted through instances).
- **Test scenarios:** one per row of Appendix D1, each asserting the behaviour named there. Inputs come from the spec (the ECONNREFUSED/−111 literal, inputs the widened regex accepts), never from the schema's own arbitrary.
- **Verification:** each new test fails against its mutant's change applied by hand to a scratch copy and reverted (no stryker), then `pnpm check:local`.

### U10. Kill the `InstrumentationBrand` survivors by trace test (D2, root ruling)

- **Goal:** R4 for the four D2 ids, with no baseline entry and no Stryker disable.
- **Files:** the cell tests beside `await-job-completion.cell.ts` and `probe-virtualization.cell.ts` in effect-microsandbox; `src/classify-probe-observation.workflow.ts` (effect-microsandbox) and `src/MicroVMMedium/classify-workload-exit.workflow.ts` (effect-daemon-microvm).
- **Approach:** run the real cell, which `.decide`s the workflow, under an in-memory span exporter. Find the cell's span and assert the exact attribute name and value the brand declares. The expected name is a literal from the telemetry contract, never read back from the brand map (CONST-T10).
- **Test scenarios:**
  - `efa442ce130562fd`: `awaitJobCompletion` with a job that exits with code 3 emits a span carrying `microsandbox.job.exit.code = 3`.
  - `14ade17d5d1537f0`: the probe-virtualization cell on platform `linux` emits a span carrying `microsandbox.virtualization.platform = "linux"`.
  - `665dca69fe86b2dd` and `9abde07b09ad171e` (root ruling on Q4, option 2): the brand maps at `classify-probe-observation.workflow.ts:76` and `classify-workload-exit.workflow.ts:9` become `{}`, matching `resolve-wait-strategy.workflow.ts:32`. Neither workflow is decided by a `Sandwich` (called directly at `probe-virtualization.cell.ts:59` and `micro-vm.medium.ts:237`), so the names were never emitted: dead data. The mutants disappear with the data. If emptying a map raises a type or lint failure, it is not suppressed: the unit stops on those two and reports the failure with file:line.
- **Pack:** `boundary-testing/real-system-oracles.md`.
- **Verification:** each test fails with its mutant applied by hand to a scratch copy and reverted (no stryker); `pnpm check:local`.
- **Q4 ruled:** option 2 (empty the dead maps), not routing through a `Sandwich`.

### U7. Lint-plugin survivors (D3) and the remaining baselines

- **Goal:** R4 for oxlint-plugin-effect-schema (439) and oxlint-plugin-dmmf-workflow (237); an empty `mutation-baseline.json` for every other enrolled project.
- **Files:** each rule's RuleTester spec next to the rule file in Appendix D3; `mutation-baseline.json` per project.
- **Approach:** for each id, add the valid or invalid case whose outcome changes under that mutant. An id proven equivalent goes into the baseline with the proof (the two programs it can't tell apart). Nothing else is baselined.
- **Pack:** `boundary-testing/no-mocks-on-internal-glue.md` (cases run through the real oxlint RuleTester).
- **Changeset:** `pnpm change --bump none` (the specs sit in `src/**` build inputs).
- **Verification:** `pnpm --filter <plugin> test`; in the dispatch run, gate passes with the committed baselines.

### U8. Restore `push` and doctrine

- **Goal:** R5.
- **Files:** `.github/workflows/mutation.yml` (add back `push: branches: [main]`, which PR-1 removed), `.github/AGENTS.md:21` (per project: plan → coverage → shard → merge → gate; costs from the merged incremental).
- **Verification:** the `workflow_dispatch` run on the head is fully green.

## Test Admission (test-layer-selection gate, default refuse)

- **Admitted:**
  - U4: one known-bug regression on the pure frame-owner decision.
  - U6: one test per D1 row, through public schemas and workflows.
  - U7: RuleTester cases.
- **Refused:**
  - A workflow-structure check, and any test of the coverage reuse (it is the installed CLI's decision; GATE1).
  - A test pinning the transform's behaviour on Stryker's switch shape. It would pin Stryker internals; the C2 probe ran as a throwaway and was deleted.
  - Any test that only restates a literal it reads from the source.

## Verification Contract

- After each unit: `pnpm check:local`.
- For C fixes: the sandbox-layout recipe (Appendix) on the four affected test files (trace-spec, runner/vitest, storybook-gherkin, effect-spec-runtime corpus tests). discern is proven on the dispatch run only, because the sandbox recipe does not instrument code.
- Proof of R1–R4: one `workflow_dispatch` run on the PR head, watched with `xd://github` `run_watch`. Report the run id, each job's conclusion, each shard's wall time and its reuse log line.
- Never run stryker locally (REPO-D3).
- REPO-R2 changesets: U4 `patch`; U7 `none`; U2 none required. `changeset-check` decides on CI.

## PR body requirements

- **`recursionBudget` read sites:** cite every file:line from the "`recursionBudget`: every read" table, as the evidence that the root's condition for U9 holds.
- **`InstrumentationBrand` (D2):** `efa442ce130562fd` and `14ade17d5d1537f0` are killed by trace tests (U10). `665dca69fe86b2dd` and `9abde07b09ad171e` are removed by emptying dead brand maps to `{}` (root ruling on Q4, option 2): `classify-probe-observation.workflow.ts:76` and `classify-workload-exit.workflow.ts:9`, whose workflows are called directly (`probe-virtualization.cell.ts:59`, `micro-vm.medium.ts:237`) and never through `Sandwich` `annotateFields` (`Sandwich.ts:80-85`). No baseline entry, no Stryker disable.
- **`stryker-js-effect ignorer gaps`** (a heading of its own), listing:
  - the U9 directive `// Stryker disable next-line ObjectLiteral` at `packages/discern/src/PatternAst.schema.ts` (`stryker-ignorer-effect-schema-declarations@0.2.0` lacks `recursionBudget`). The directive is deleted once the ignorer covers `recursionBudget` and the catalog bump lands.
    That directive is the heading's only entry.
- No change to stryker-js-effect in this PR.
- Every other baseline id, with its reason.

## Definition of Done

- R1–R5 hold, and the dispatch run is green with every shard at or under 900 s and reuse accepted in every shard.
- **No-op dispatch:** after the green dispatch run N, push a no-op commit to the PR-2 branch and dispatch run N+1. Its plan job must show 0 mutants planned for every project (or only mutants the no-op invalidates, expected none), no coverage or shard jobs, and about 7 runner-minutes in total. Record N+1's run id in the PR body.
- The PR body lists every `recursionBudget` read with file:line (the table above) as the evidence for U9.
- Every baseline id is justified in the PR body. The D2 ids and Q1 and Q3 are listed for the root.
- `git grep -n -e shardMutate -e STRYKER_SHARD -e merge-reports -e "--task mutation" -e mutation-timings -e mutation-job` finds nothing (after U8 rewrites `.github/AGENTS.md:21`).
- No change to `TARGET_SECONDS`, the cap, a timeout or per-mutant timeout; no skip, exclusion, `break` change, numeric override, retry, new dependency or new secret.
- Scratch copies (`.stryker-tmp/sandbox-x`) and `/tmp/m2` are removed.

## Appendix

### C-repro: sandbox-layout recipe and output

Recipe:

1. Copy `<pkg>` (excluding `node_modules`, `.stryker-tmp`, `reports`) into `<pkg>/.stryker-tmp/sandbox-x/`.
2. Link `node_modules -> ../../node_modules`, as Stryker does.
3. From there, run `./node_modules/.bin/vitest run <file>`.

| File                                                             | Field                                                    | Expected                                                                                | Received                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| trace-spec `failure-corpus.trace.integration.test.ts`            | `firstLocationFile`                                      | `packages/trace/trace-spec/tests/__fixtures__/failure-corpus/break.ts`                  | `…/.stryker-tmp/sandbox-x/src/Contract.ts` (C1a)                            |
|                                                                  | `namesDefectFile`                                        | `true`                                                                                  | `false` (C1b)                                                               |
|                                                                  | `name`, `hasHeadline`, `breaches`                        | equal                                                                                   | equal                                                                       |
|                                                                  | `firstLocation`                                          | not asserted                                                                            | present (vitest's "…(5)" vs "…(4)": one extra key, not a mismatch)          |
| runner/vitest `failure-location.runner.test.ts`                  | `raisedAt`                                               | `…/sandbox-x/tests/failure-location.runner.test.ts:42`                                  | `…/sandbox-x/src/internal/call-site.ts:110` (C1a)                           |
| storybook-gherkin `failure-corpus.storybook.integration.test.ts` | `firstLocationFile`                                      | `packages/gherkin/storybook-gherkin/tests/__fixtures__/failure-corpus/failing-story.ts` | `…/sandbox-x/tests/__fixtures__/failure-corpus/failing-story.ts` (C1b only) |
|                                                                  | `namesDefectFile`                                        | `true`                                                                                  | `false` (C1b)                                                               |
| effect-spec-runtime `failure-corpus.kernel.runner.test.ts`       | `foundFirstLocationFile`, `namesDefectFile` × 3 fixtures | literal paths, `true`                                                                   | `…/sandbox-x/tests/__fixtures__/…`, `false` (C1b only)                      |

### C2-probe (throwaway, deleted)

The probe fed `recursionBudgetTransform().transform` three versions of `PatternAst`:

- `plain` → `INJECTED toCodecArbitrary: __esRecursionBudget(() => PatternAst, { maxDepth: 6, depthSize: 'small' })`
- `instrumented` (the outer options object under `stryMutAct_9fa48("a1") ? {} : (stryCov_9fa48("a1"), {…})`) → `UNTOUCHED`
- `innerOnly` (only the budget value switched) → `INJECTED`, with the switch text copied into the hook

### D1. Small packages: kill by test

| Package               | Mutant id          | Status     | Site                                               | Mutator       | Killing test (behaviour asserted)                                                                     |
| --------------------- | ------------------ | ---------- | -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| effect-daemon-socket  | `36517f6a2f6ececd` | Survived   | `src/SocketMedium/socket-failure.schema.ts:68`     | UnaryOperator | same property asserts decoded `errno` = -111 (`both`)                                                 |
| effect-daemon-socket  | `d82a4d5d0cdfb128` | Survived   | `src/SocketMedium/socket-failure.schema.ts:68`     | StringLiteral | round-trip property per NodeShapeByLabel label asserts decoded `code` = `ECONNREFUSED`                |
| effect-daemon-socket  | `a503c89a93184c8a` | Survived   | `src/SocketMedium/socket-failure.schema.ts:69`     | UnaryOperator | same property asserts decoded `errno` = -111 (`errno-only`)                                           |
| effect-daemon-socket  | `284c4b653a1b2939` | Survived   | `src/SocketMedium/socket-failure.schema.ts:70`     | StringLiteral | same property asserts decoded `code` (`code-only`)                                                    |
| effect-daemon-socket  | `a0763c35bf29319e` | Survived   | `src/SocketMedium/socket-failure.schema.ts:74`     | ObjectLiteral | `SocketOsError` decode keeps `code`/`errno` and rejects a non-string `code`                           |
| effect-daemon-socket  | `4491b0aecfd35325` | Survived   | `src/SocketMedium/socket-termination.schema.ts:29` | StringLiteral | `terminationReasonOf` on a defect termination yields signal `defect` (spec literal)                   |
| effect-daemon-socket  | `00a0a276e1b9c7a6` | Survived   | `src/SocketMedium/socket-termination.schema.ts:32` | StringLiteral | `terminationReasonOf` on an unreasoned close yields signal `closed`                                   |
| effect-microsandbox   | `9ec0584cacd15c4a` | Survived   | `src/JobCompletion.schema.ts:4`                    | ObjectLiteral | `JobCompletion` decode keeps `status`/`stdout` / rejects a missing field                              |
| effect-microsandbox   | `b837caa349e2c8ff` | NoCoverage | `src/MicroVMError.schema.ts:14`                    | StringLiteral | message names the platform and remediation                                                            |
| effect-microsandbox   | `8a6fe678c3e7c57e` | NoCoverage | `src/MicroVMError.schema.ts:24`                    | StringLiteral | boot-failure message names the sandbox                                                                |
| effect-microsandbox   | `818c9efef1bc4652` | NoCoverage | `src/MicroVMError.schema.ts:29`                    | StringLiteral | boot-failure message carries a string cause                                                           |
| effect-microsandbox   | `87df1b0fc0bace7a` | NoCoverage | `src/MicroVMError.schema.ts:30`                    | StringLiteral | boot-failure message carries an Error cause message                                                   |
| effect-microsandbox   | `ce61eb6bf430dc64` | NoCoverage | `src/MicroVMError.schema.ts:31`                    | StringLiteral | boot-failure message carries any other cause                                                          |
| effect-microsandbox   | `ce87557649da45c7` | NoCoverage | `src/MicroVMError.schema.ts:42`                    | StringLiteral | timeout message names timeoutMs and the wait                                                          |
| effect-microsandbox   | `2025f7c5cd7d4247` | NoCoverage | `src/MicroVMError.schema.ts:51`                    | StringLiteral | exec failure message joins argv with spaces                                                           |
| effect-microsandbox   | `446bf58c460a3781` | NoCoverage | `src/MicroVMError.schema.ts:51`                    | StringLiteral | exec failure message joins argv                                                                       |
| effect-microsandbox   | `a70034fab4f7258a` | NoCoverage | `src/MicroVMError.schema.ts:60`                    | StringLiteral | port-mapping message names the guest port                                                             |
| effect-microsandbox   | `e87c51a0b06684e0` | NoCoverage | `src/MicroVMError.schema.ts:73`                    | StringLiteral | network-binding refusal message names sandbox, host and port                                          |
| effect-microsandbox   | `13cc105876b69495` | Survived   | `src/MicroVMSpec.schema.ts:5`                      | Regex         | `MicroVMSpec` image decode rejects an input the widened pattern accepts (from the mutant replacement) |
| effect-microsandbox   | `7984492039bb95d5` | Survived   | `src/MicroVMSpec.schema.ts:5`                      | Regex         | same, second widened pattern                                                                          |
| effect-microsandbox   | `bf176fad419a2dae` | Survived   | `src/MicroVMSpec.schema.ts:31`                     | ObjectLiteral | `ExposedPort` decode keeps its fields / rejects a missing required field                              |
| effect-microsandbox   | `43c70ad8b45682f0` | Survived   | `src/resolve-wait-strategy.workflow.ts:45`         | StringLiteral | wait key of a Port strategy is `port:<n>`                                                             |
| effect-microsandbox   | `a00fa5648631dfb7` | Survived   | `src/resolve-wait-strategy.workflow.ts:46`         | StringLiteral | wait key of an Http strategy is `http:<path>@<n>`                                                     |
| effect-microsandbox   | `4464b8cef3a3cef9` | Survived   | `src/resolve-wait-strategy.workflow.ts:47`         | StringLiteral | wait key of a Log strategy is `log:<pattern>`                                                         |
| effect-daemon-microvm | `4a4bea2edde86adb` | Survived   | `src/MicroVMMedium/WorkloadExit.schema.ts:20`      | StringLiteral | `terminationReasonOf` on a signal-less exit yields `unreported`                                       |

### D2. `InstrumentationBrand` survivors: kill by trace test (U10)

| Package               | Mutant id          | Site                                                     | Runtime reader                                                                                 |
| --------------------- | ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| effect-microsandbox   | `efa442ce130562fd` | `src/classify-job-exit.workflow.ts:11`                   | `.decide(classifyJobExit)` in `src/await-job-completion.cell.ts:42-43`                         |
| effect-microsandbox   | `14ade17d5d1537f0` | `src/assess-virtualization.workflow.ts:34`               | `.decide(assessVirtualization)` in `src/probe-virtualization.cell.ts:72`                       |
| effect-microsandbox   | `665dca69fe86b2dd` | `src/classify-probe-observation.workflow.ts:76`          | none: called directly at `src/probe-virtualization.cell.ts:59`; map emptied (Q4 option 2)      |
| effect-daemon-microvm | `9abde07b09ad171e` | `src/MicroVMMedium/classify-workload-exit.workflow.ts:9` | none: called directly at `src/MicroVMMedium/micro-vm.medium.ts:237`; map emptied (Q4 option 2) |

### D3. oxlint-plugin-effect-schema: kill by RuleTester case (439 ids)

Each row is a branch or literal in the rule with no valid/invalid case whose outcome changes under the mutant. U7 adds that case. An id that U7 proves equivalent moves to the baseline with its proof. Nothing is baselined in advance.

| Rule file                                            | Line | Mutator               | Status     | Mutant ids                                                                                                             |
| ---------------------------------------------------- | ---- | --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/rules/schema-declaration-location.ts`           | 41   | ArithmeticOperator    | Survived   | `3018cb0f527c8494`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 125  | BooleanLiteral        | NoCoverage | `e4cf841dce74a2bd`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 127  | ConditionalExpression | Survived   | `6a29ac77b425f165`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 127  | StringLiteral         | Survived   | `0e60e0ff643e51da`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 141  | ConditionalExpression | Survived   | `18ad27c20339cb36`, `8f2931f3cf8389fe`, `c6a492aa6bf800f7`                                                             |
| `src/rules/schema-declaration-location.ts`           | 141  | LogicalOperator       | Survived   | `49db8f5cd7b3ffbc`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 152  | ConditionalExpression | Survived   | `dd9b6ec418eb4102`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 153  | ConditionalExpression | Survived   | `1b279eb783f6ef91`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 154  | ConditionalExpression | Survived   | `72473799ecb26b62`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 155  | ConditionalExpression | Survived   | `ed2de2048ce6e0c1`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 191  | ConditionalExpression | Survived   | `6536996065f9aa53`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 192  | ConditionalExpression | Survived   | `9c0ecbdabd362a89`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 194  | ArrowFunction         | Survived   | `9c75e817b2ea35c8`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 194  | ConditionalExpression | Survived   | `08f5365736137052`, `45dd37c17ca25a57`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 195  | ArrowFunction         | Survived   | `a57e7d4b8f8cf099`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 195  | ConditionalExpression | Survived   | `246bc039b229f210`, `a2127844e1310b04`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 195  | MethodExpression      | Survived   | `f4cf71382e9ac503`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 196  | ArrowFunction         | Survived   | `2ac1d7909bbfe7ec`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 196  | ConditionalExpression | Survived   | `0cb0601b4385a7e8`, `5f15ccef95441c49`, `8ba44c9f6bbf3ee7`, `a3d6a50195e94c5d`                                         |
| `src/rules/schema-declaration-location.ts`           | 197  | ArrowFunction         | Survived   | `be270d3c2e334018`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 197  | ConditionalExpression | Survived   | `00b9118203120db8`, `45ab1bb9a205dd1a`, `6c79ac72ee366797`, `a0ffa5752768852c`                                         |
| `src/rules/schema-declaration-location.ts`           | 197  | EqualityOperator      | Survived   | `ba2daebac90a7e6d`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 197  | MethodExpression      | Survived   | `ca249034a022b9db`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 198  | ArrowFunction         | Survived   | `f6d386cfbf925497`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 198  | ConditionalExpression | Survived   | `0da2d7f44206ee37`, `22ab3017d32aea58`, `296c237fa5dfd708`, `6f2ce7df674f8b69`, `705f2e5694969ee4`, `e33414bf1442a4fa` |
| `src/rules/schema-declaration-location.ts`           | 198  | EqualityOperator      | Survived   | `ac7df2acb0592b30`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 198  | MethodExpression      | Survived   | `d335e06a4095e857`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 221  | ArithmeticOperator    | Survived   | `eb70ed93f4f3b78b`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 222  | ConditionalExpression | Survived   | `fb1db1a5f891dd95`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 223  | ConditionalExpression | Survived   | `9552f9db97dc9815`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 241  | ArithmeticOperator    | Survived   | `a3be2c6bcc8a6284`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 244  | BlockStatement        | Survived   | `d3256c2c6ec29def`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 244  | ConditionalExpression | Survived   | `04d2b125ad8645d8`, `b9722368a7d2870c`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 252  | ConditionalExpression | Survived   | `763dab4b18278ffc`, `9a6039cf1c03d322`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 252  | EqualityOperator      | Survived   | `cdaea71ca0b4ed2e`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 253  | BlockStatement        | NoCoverage | `5e259681333ed196`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 253  | ConditionalExpression | NoCoverage | `e6be6c51af14c7df`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 253  | EqualityOperator      | NoCoverage | `9775f5bc87e1e400`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 254  | ArithmeticOperator    | NoCoverage | `70e4fb3976c7561c`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 272  | ConditionalExpression | Survived   | `a534ffc546626718`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 273  | ConditionalExpression | Survived   | `bb88342b703245fe`, `d4666f40acffc338`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 274  | ArithmeticOperator    | Survived   | `657777bf8ce17c17`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 275  | ConditionalExpression | Survived   | `544d7f01341b90af`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 287  | ConditionalExpression | Survived   | `4766683d8e080dd3`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 292  | ConditionalExpression | Survived   | `c52b272af545bd53`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 303  | ConditionalExpression | Survived   | `5deee7434aca5a4c`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 303  | EqualityOperator      | Survived   | `e8aac047bb72b9d8`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 331  | ConditionalExpression | Survived   | `c498015abcf964eb`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 331  | StringLiteral         | Survived   | `ed123a9b8eab7c37`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 332  | BlockStatement        | Survived   | `e23d80c029549083`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 332  | ConditionalExpression | Survived   | `45b0989fedb6a5e4`, `a5da02cf67142941`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 332  | EqualityOperator      | Survived   | `6157cd947134ff72`, `779350ba786ed458`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 332  | StringLiteral         | Survived   | `89bdd2100237916f`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 333  | ArithmeticOperator    | Survived   | `2a0f29cef29a0af5`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 340  | ConditionalExpression | Survived   | `d51308e1000ec299`, `e3ff26cd0a37bc37`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 341  | ArithmeticOperator    | Survived   | `b815e7eca25137d9`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 343  | ArithmeticOperator    | NoCoverage | `7e7b17de7ed52a1f`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 343  | ConditionalExpression | Survived   | `5e7b2e0bb7e1891e`, `b571dae1adc56060`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 343  | EqualityOperator      | Survived   | `0957a75871b10eb7`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 351  | ConditionalExpression | Survived   | `85fee59e57323b93`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 352  | ConditionalExpression | Survived   | `48bea1074aabb183`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 353  | ConditionalExpression | Survived   | `0d4c65564f164bc3`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 357  | ConditionalExpression | Survived   | `c11f18ed5af979c2`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 358  | ArithmeticOperator    | Survived   | `71c2ff8aa7dc093d`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 364  | ConditionalExpression | Survived   | `32b76d211a121949`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 367  | ConditionalExpression | Survived   | `92abf1da1db211d5`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 368  | ConditionalExpression | Survived   | `054e5aac581cbe82`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 368  | EqualityOperator      | Survived   | `b3af0c59e76efac6`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 390  | BlockStatement        | NoCoverage | `08de76a7b298702e`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 391  | ConditionalExpression | NoCoverage | `3344666b2cfb347b`, `3bb7287dba2032e6`, `3bfd4d9e60cc7076`                                                             |
| `src/rules/schema-declaration-location.ts`           | 391  | EqualityOperator      | NoCoverage | `23bd72f746ee3430`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 391  | LogicalOperator       | NoCoverage | `82d3f491eafd08a3`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 485  | ConditionalExpression | Survived   | `a1f330598603fb8d`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 492  | ConditionalExpression | NoCoverage | `5415801690230af9`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 495  | ConditionalExpression | Survived   | `b6575e4c0df84df6`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 496  | ArithmeticOperator    | Survived   | `88acf7b05474d514`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 522  | BlockStatement        | NoCoverage | `16eaa5339a180ee4`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 522  | StringLiteral         | Survived   | `a9d4b719c5b1814f`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 524  | ConditionalExpression | NoCoverage | `207d19aafcb0c917`, `562f2b3d725aa601`, `f06cf2a0bc54ebc8`                                                             |
| `src/rules/schema-declaration-location.ts`           | 524  | EqualityOperator      | NoCoverage | `afb472ede1acd2b1`, `d18f1c024a4cca7c`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 527  | ConditionalExpression | Survived   | `1a91736ef7578b13`, `23cc1ae9d9878f04`, `d75581173e23a2bc`                                                             |
| `src/rules/schema-declaration-location.ts`           | 527  | LogicalOperator       | Survived   | `f2610542e99f40de`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 534  | ConditionalExpression | Survived   | `fe662965875fd039`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 534  | StringLiteral         | Survived   | `360a603a6e5ec7ce`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 538  | BlockStatement        | Survived   | `8217987d8233b584`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 539  | ConditionalExpression | Survived   | `1693c6677a585f2c`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 544  | ArithmeticOperator    | Survived   | `5777d9de67ec20c2`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 560  | ConditionalExpression | Survived   | `19b6d87dc2c86ea3`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 560  | EqualityOperator      | Survived   | `2c20407fa0fb1d07`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 565  | ArithmeticOperator    | Survived   | `94190b73d385ec32`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 568  | ArithmeticOperator    | Survived   | `4465c25c20d9b65d`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 607  | ConditionalExpression | Survived   | `3eda72619e6a0ada`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 631  | ConditionalExpression | Survived   | `047635285e4dba0c`, `6babdb498369bc84`, `f9b52ccf9ef8b799`                                                             |
| `src/rules/schema-declaration-location.ts`           | 631  | LogicalOperator       | Survived   | `86561ada44004e22`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 632  | StringLiteral         | NoCoverage | `fb3382666c234356`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 645  | BlockStatement        | NoCoverage | `79d4ebc0201a0560`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 646  | BlockStatement        | NoCoverage | `ab0e52fcd90cc74b`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 673  | BlockStatement        | NoCoverage | `bce0ff44b4f00a05`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 673  | ConditionalExpression | NoCoverage | `1bc5d9254b996633`, `322355fed62f0c9e`, `5ff43433c2bd8626`, `b2d56bcb87299f46`                                         |
| `src/rules/schema-declaration-location.ts`           | 673  | EqualityOperator      | NoCoverage | `7092865fc2ada2da`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 677  | BlockStatement        | NoCoverage | `b27331bae531adce`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 678  | BlockStatement        | NoCoverage | `66b41b88c51997ff`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 680  | BlockStatement        | NoCoverage | `51a8d0e27e626589`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 681  | BlockStatement        | NoCoverage | `1beff2552d851660`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 684  | BlockStatement        | NoCoverage | `331a3a2b2b86523c`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 684  | ConditionalExpression | NoCoverage | `6ca67372473a77b9`, `96403657cad40639`, `bbccd498644c2eca`                                                             |
| `src/rules/schema-declaration-location.ts`           | 684  | EqualityOperator      | NoCoverage | `bdb5b30d208bd757`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 740  | ConditionalExpression | Survived   | `43987b7b3f5163a8`, `cf064d4eca5c4c28`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 753  | ConditionalExpression | Survived   | `400baf1548a5e7c1`, `4359863ae97eba40`                                                                                 |
| `src/rules/schema-declaration-location.ts`           | 753  | EqualityOperator      | Survived   | `1473d47922c7bd17`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 767  | ConditionalExpression | Survived   | `454c692921e8c29d`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 768  | ConditionalExpression | Survived   | `be17b03e8edeabf7`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 775  | ConditionalExpression | Survived   | `1943e7218511f48b`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 783  | ConditionalExpression | Survived   | `28a45cc9e47ce3f6`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 800  | ConditionalExpression | NoCoverage | `b4d34aed438daf07`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 801  | ConditionalExpression | NoCoverage | `0e9bf3e7cf0c71a1`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 801  | EqualityOperator      | NoCoverage | `d3e3a29678fff0c1`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 806  | ConditionalExpression | NoCoverage | `9896e703b223697f`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 806  | EqualityOperator      | NoCoverage | `c502c73e5a5b44fb`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 813  | ConditionalExpression | NoCoverage | `44d252aa5b2d1ade`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 815  | BlockStatement        | NoCoverage | `76786c5407c3f8d7`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 816  | BlockStatement        | NoCoverage | `e8234a5c46c70ced`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 823  | ConditionalExpression | NoCoverage | `52c41c9cf61e0665`                                                                                                     |
| `src/rules/schema-declaration-location.ts`           | 826  | ConditionalExpression | Survived   | `c6eae87198519aaa`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 54   | ConditionalExpression | Survived   | `1b81258d87bf1679`, `a82c81cc99bd9382`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 55   | ConditionalExpression | Survived   | `d7b55985f74a1586`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 62   | ConditionalExpression | Survived   | `bdc00eaa85d32d8d`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 71   | ConditionalExpression | Survived   | `d0be74ae9266deed`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 82   | ConditionalExpression | Survived   | `0ac3d69eb034eea9`, `9c1c944ba504d392`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 82   | EqualityOperator      | Survived   | `b4f1d89825274b5c`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 83   | ConditionalExpression | NoCoverage | `9847419b23dd32c0`, `b9e2693529dddeb6`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 83   | EqualityOperator      | NoCoverage | `1dc7b8f75ad68d1a`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 84   | ArrayDeclaration      | NoCoverage | `f2898da27f4d6c29`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 93   | ConditionalExpression | Survived   | `30c9a8f6a16aa6dc`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 132  | ConditionalExpression | Survived   | `bf79d3d9540c3d3f`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 156  | ArrayDeclaration      | Survived   | `416590280222c6ae`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 175  | BlockStatement        | Survived   | `0825693267b164f0`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 178  | ConditionalExpression | Survived   | `164231252cbc9848`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 185  | BlockStatement        | Survived   | `f90c62ba4ff23e8f`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 186  | ConditionalExpression | Survived   | `1a8c4a97702a282c`, `b4b587898630d1c8`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 186  | EqualityOperator      | Survived   | `57243ad124a7edc4`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 204  | BlockStatement        | Survived   | `1d71c1f230d95d6c`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 207  | ArrowFunction         | Survived   | `ca0903ffba58d59d`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 207  | ConditionalExpression | Survived   | `3a39ac3f282a05b1`, `f155a578a4502e92`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 207  | LogicalOperator       | Survived   | `aeaa2312e366c0b3`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 207  | MethodExpression      | Survived   | `5f8b0233a055f19e`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 211  | ConditionalExpression | Survived   | `adcae2471bd29b4b`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 212  | MethodExpression      | Survived   | `7f03387651bfd0b0`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 222  | ConditionalExpression | Survived   | `4d430ee496627b6a`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 236  | BooleanLiteral        | Survived   | `c138440caee519e3`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 240  | ConditionalExpression | Survived   | `116c090af2bf23a8`, `26b63416414cee68`, `6dbce432b80dcc56`                                                             |
| `src/rules/schema-file-exports-schemas-only.ts`      | 240  | EqualityOperator      | Survived   | `d019a0a2e5c58672`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 240  | LogicalOperator       | Survived   | `c085ba78cc10cf14`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 240  | StringLiteral         | Survived   | `315e3599eb57aa31`, `a6000dab7f3c04e0`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 242  | ConditionalExpression | Survived   | `276ccee600d9f74b`, `60115c953b7077fa`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 242  | LogicalOperator       | Survived   | `7b9ab5b480281e22`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 243  | ConditionalExpression | Survived   | `4f18610f4a1b4ed4`, `a098f24ac25c1d21`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 243  | EqualityOperator      | Survived   | `5c6e926cbde85571`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 243  | StringLiteral         | Survived   | `13be80d4d0f542df`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 246  | BooleanLiteral        | Survived   | `9e508ac551d978ca`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 261  | ConditionalExpression | Survived   | `540a7455db303e84`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 263  | ConditionalExpression | Survived   | `0101bd3c19385f71`, `d457dcfcd069484c`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 264  | ConditionalExpression | Survived   | `058578e67f218a59`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 266  | ConditionalExpression | Survived   | `2183a31082ed13d3`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 268  | ConditionalExpression | Survived   | `e476af9d3b1b3607`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 269  | ConditionalExpression | Survived   | `f9a133880c2e785a`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 273  | BooleanLiteral        | NoCoverage | `cb840b2f720e2e1f`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 273  | ConditionalExpression | Survived   | `d67622264d623780`, `de7af02da3b51fbf`, `ffcf03c81203fbf7`                                                             |
| `src/rules/schema-file-exports-schemas-only.ts`      | 273  | LogicalOperator       | Survived   | `b7a9a93a313a04f1`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 274  | BooleanLiteral        | NoCoverage | `fe0e5d460358e334`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 275  | MethodExpression      | Survived   | `4a5132e59739a601`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 280  | BooleanLiteral        | NoCoverage | `34d07330264ff868`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 283  | BlockStatement        | NoCoverage | `98ed9cea635b3b92`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 285  | ConditionalExpression | NoCoverage | `1758e56b40843d33`, `59e0193a612aa74b`, `ac9624499c67df36`, `da7973e7dd0d881f`                                         |
| `src/rules/schema-file-exports-schemas-only.ts`      | 285  | EqualityOperator      | NoCoverage | `c2aabd6e132cea06`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 285  | LogicalOperator       | NoCoverage | `421de0bb6ae02b82`, `bdbe437db2ac1b94`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 286  | ConditionalExpression | NoCoverage | `00e220b0f4d120d4`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 286  | EqualityOperator      | NoCoverage | `28c8e8dcaecbcb16`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 350  | BlockStatement        | Survived   | `6151717b41edd9e4`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 350  | ConditionalExpression | Survived   | `0e01d3fc9601c1cb`, `45ebf1f7f12d73c1`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 352  | ConditionalExpression | Survived   | `b8d28ff781867265`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 354  | BlockStatement        | NoCoverage | `606ec01381099b96`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 354  | ConditionalExpression | NoCoverage | `18426b04a083dca5`, `68d229b000cd1006`                                                                                 |
| `src/rules/schema-file-exports-schemas-only.ts`      | 393  | ConditionalExpression | Survived   | `9fa6199ca7d5cab5`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 401  | ConditionalExpression | Survived   | `2996545f7894d5e7`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 404  | ConditionalExpression | Survived   | `4a114e86a902cfb1`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 405  | BlockStatement        | Survived   | `7689703a0e51d680`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 434  | ConditionalExpression | Survived   | `513e95f49d6ea8e4`, `61feb96a20cd9b7a`, `6acc13ddbe62570f`                                                             |
| `src/rules/schema-file-exports-schemas-only.ts`      | 460  | MethodExpression      | Survived   | `b5cc232ade7c92c7`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 466  | MethodExpression      | Survived   | `8383f3d6fddc83b4`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 469  | ArrowFunction         | Survived   | `55c7b5787b4e2173`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 469  | MethodExpression      | Survived   | `f179cf55c97c39e2`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 482  | ConditionalExpression | Survived   | `116df769332bef87`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 501  | ConditionalExpression | Survived   | `8ed2fcece188d6f2`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 626  | BlockStatement        | Survived   | `a9e2a5c641090c59`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 628  | ConditionalExpression | NoCoverage | `2d9bd6301c9451ec`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 628  | ConditionalExpression | Survived   | `499253b3f9616eab`, `57dac8dd926e00a0`, `ee8a362442e90fbd`                                                             |
| `src/rules/schema-file-exports-schemas-only.ts`      | 628  | EqualityOperator      | NoCoverage | `f63a7c923958dcd1`                                                                                                     |
| `src/rules/schema-file-exports-schemas-only.ts`      | 654  | ConditionalExpression | Survived   | `b06624e62d191ffb`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 27   | ConditionalExpression | Survived   | `b08789a8f1829f52`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 29   | ConditionalExpression | Survived   | `31b03078af89f649`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 50   | StringLiteral         | Survived   | `f8d6a0850195e4b5`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 51   | StringLiteral         | Survived   | `22f10a25c2d21171`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 52   | StringLiteral         | Survived   | `16816763e5ca82cb`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 53   | StringLiteral         | Survived   | `24da748390e1ef5a`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 54   | StringLiteral         | Survived   | `a1972eb4718782de`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 55   | StringLiteral         | Survived   | `937f7b929ee30e87`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 56   | StringLiteral         | Survived   | `1a7eb38777312f7f`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 57   | StringLiteral         | Survived   | `2877ea2ab947f3a7`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 58   | StringLiteral         | Survived   | `ebe8301966d624cf`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 59   | StringLiteral         | Survived   | `5274001d902474a7`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 60   | StringLiteral         | Survived   | `80a7d67ced97bb0c`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 61   | StringLiteral         | Survived   | `2d3ec29e0b39320d`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 62   | StringLiteral         | Survived   | `b82791b570ceac2c`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 63   | StringLiteral         | Survived   | `db8f29b80cdb3559`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 68   | ConditionalExpression | Survived   | `54904604b50855d6`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 88   | BooleanLiteral        | NoCoverage | `45a663558c6d2c0f`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 88   | ConditionalExpression | Survived   | `16526ea79ea9c574`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 88   | EqualityOperator      | Survived   | `8442534e823a9a89`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 91   | ConditionalExpression | Survived   | `7a61412711f862c0`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 93   | ConditionalExpression | Survived   | `81521b164a3b5135`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 94   | ConditionalExpression | Survived   | `0586d0a1b1c2f2e9`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 96   | EqualityOperator      | Survived   | `f076de24a290cb10`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 97   | ConditionalExpression | Survived   | `50f2098adc4d740a`, `ad89d0c18b7fd2cf`                                                                                 |
| `src/rules/schema-filter-constructive-generation.ts` | 99   | ArithmeticOperator    | NoCoverage | `c080c405102ca9db`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 101  | ArithmeticOperator    | NoCoverage | `79ca993b07d57d2c`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 102  | BooleanLiteral        | NoCoverage | `567aaca6ac476422`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 112  | ConditionalExpression | Survived   | `7eda887de84a932b`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 112  | StringLiteral         | Survived   | `1c1d638e7c2e2451`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 113  | ConditionalExpression | Survived   | `1b1bea92ef829fd2`, `89cc91b712ca7262`                                                                                 |
| `src/rules/schema-filter-constructive-generation.ts` | 139  | ConditionalExpression | Survived   | `f53b419237556f19`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 139  | EqualityOperator      | Survived   | `e34bee86aa08662e`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 150  | ArithmeticOperator    | Survived   | `34c3c08760381e74`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 153  | BlockStatement        | Survived   | `c98da740fc52f053`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 155  | BlockStatement        | Survived   | `789a1dc0f533a7d4`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 156  | ConditionalExpression | Survived   | `a0d833abbbc13ea2`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 156  | EqualityOperator      | Survived   | `a29e7075a91847c5`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 156  | StringLiteral         | Survived   | `4816bee718566a6e`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 157  | ConditionalExpression | Survived   | `781cd0dd7d6fcc6b`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 160  | ArithmeticOperator    | NoCoverage | `9d6f7b8fdd25239a`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 162  | BlockStatement        | Survived   | `d76d5c867aa9d014`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 164  | BlockStatement        | NoCoverage | `d64834e8ed88eddf`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 165  | ConditionalExpression | NoCoverage | `9ddbd11a86256617`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 165  | EqualityOperator      | NoCoverage | `707fae09acf90bc0`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 165  | StringLiteral         | NoCoverage | `d0180ba42d478b84`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 166  | ConditionalExpression | NoCoverage | `59bf8c117de11903`, `e8e5b354740db512`                                                                                 |
| `src/rules/schema-filter-constructive-generation.ts` | 166  | EqualityOperator      | NoCoverage | `09319d6f99d85ec8`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 170  | ArithmeticOperator    | NoCoverage | `c356cc2f1aa98783`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 170  | ConditionalExpression | Survived   | `c7e5bf9e2ed07ada`, `e01409cfddfdc084`                                                                                 |
| `src/rules/schema-filter-constructive-generation.ts` | 170  | EqualityOperator      | Survived   | `c226ac2721995007`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 205  | BlockStatement        | Survived   | `878ab178400a831f`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 209  | ConditionalExpression | Survived   | `11ded459d65908a2`, `45c613582cafb31b`, `cd98cec54f1dd3da`                                                             |
| `src/rules/schema-filter-constructive-generation.ts` | 209  | StringLiteral         | Survived   | `ac5e58ddfef49cd2`, `edf9a292afd3a66a`                                                                                 |
| `src/rules/schema-filter-constructive-generation.ts` | 210  | ConditionalExpression | NoCoverage | `8b79512467c5b612`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 210  | EqualityOperator      | NoCoverage | `d94d093503915293`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 211  | BlockStatement        | NoCoverage | `a85d7dd1a4019c9b`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 218  | ConditionalExpression | Survived   | `a2f10ec2e2fb5a8f`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 251  | ConditionalExpression | Survived   | `0a1dcc22d15ea09f`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 253  | ConditionalExpression | NoCoverage | `e9ab00d05e674bf1`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 253  | ConditionalExpression | Survived   | `4df1d4456577a6d8`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 253  | EqualityOperator      | NoCoverage | `1d6db17f394f6965`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 253  | StringLiteral         | NoCoverage | `fe6b9795d58eccdf`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 260  | ConditionalExpression | Survived   | `01155f50e059638f`, `bc9948a23c5e63a6`, `d4c138c4f9f4caf5`                                                             |
| `src/rules/schema-filter-constructive-generation.ts` | 260  | LogicalOperator       | Survived   | `134ffdfd503a33f9`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 262  | BlockStatement        | Survived   | `b493a4558246bf85`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 262  | ConditionalExpression | Survived   | `bd114502fcb9fcba`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 263  | ConditionalExpression | Survived   | `f4ac691f8af23e97`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 264  | BlockStatement        | Survived   | `e888a97bc877a99e`                                                                                                     |
| `src/rules/schema-filter-constructive-generation.ts` | 273  | ConditionalExpression | Survived   | `c2797eeddf8faa0a`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 8    | ConditionalExpression | Survived   | `468aaecbb80622db`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 9    | ConditionalExpression | Survived   | `2b684b2ad29ec623`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 10   | ConditionalExpression | Survived   | `a33ba6602d6cd7b8`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 11   | ConditionalExpression | Survived   | `585b228e0f2029f0`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 12   | ConditionalExpression | Survived   | `46be24712fd28cd5`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 13   | ConditionalExpression | Survived   | `22e9f5d23ab0e3b8`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 16   | ConditionalExpression | Survived   | `42437243086cd226`, `5e304d9f7a993afa`, `7e4764ad8a4f2b81`                                                             |
| `src/rules/vitest-guard.ts`                          | 17   | ConditionalExpression | Survived   | `ff88e69b61cf77ee`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 18   | ConditionalExpression | NoCoverage | `169472e5c903ef27`, `af8e5fd774966e4b`, `cc16b779ebd2a56a`                                                             |
| `src/rules/vitest-guard.ts`                          | 18   | EqualityOperator      | NoCoverage | `30681b4241e4788f`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 19   | ConditionalExpression | NoCoverage | `674027414c7ea9c1`, `c20875ae44d7c38b`, `c4ebf6c75edb7b49`                                                             |
| `src/rules/vitest-guard.ts`                          | 19   | EqualityOperator      | NoCoverage | `c5503cb092f448d1`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 19   | StringLiteral         | NoCoverage | `8389ff84dc9e9e25`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 25   | BooleanLiteral        | NoCoverage | `e10b56cb8fbca116`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 25   | ConditionalExpression | NoCoverage | `c52fe0828899ff54`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 25   | ConditionalExpression | Survived   | `18a77e9f28db3f28`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 25   | EqualityOperator      | NoCoverage | `e1692e6a38041b85`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 27   | ConditionalExpression | Survived   | `e19917f976aa1c61`, `e3fc189ac1fe3aaa`                                                                                 |
| `src/rules/vitest-guard.ts`                          | 27   | LogicalOperator       | Survived   | `9ba25a9d00a20a67`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 28   | ConditionalExpression | NoCoverage | `7811335e7fda3044`, `ebbbd337daf67b16`                                                                                 |
| `src/rules/vitest-guard.ts`                          | 28   | LogicalOperator       | NoCoverage | `335e90b259a1d26b`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 39   | BooleanLiteral        | NoCoverage | `8493048bba3b2003`                                                                                                     |
| `src/rules/vitest-guard.ts`                          | 40   | EqualityOperator      | Survived   | `76f3c081a9904310`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 73   | ConditionalExpression | Survived   | `1971f9738566c0ee`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 102  | ConditionalExpression | Survived   | `931bc5214cf68469`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 126  | ArrayDeclaration      | Survived   | `caa1dbd5821d8499`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 137  | ArrayDeclaration      | Survived   | `21c52eb98de8ebc2`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 139  | ConditionalExpression | Survived   | `48e7a1dd1a6ac752`, `fb0b2ca36c54b785`                                                                                 |
| `src/rules/schema-recursive-union-budget.ts`         | 139  | LogicalOperator       | Survived   | `cee9a7ccef98752f`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 140  | ConditionalExpression | Survived   | `cb06f7066f54babc`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 156  | ConditionalExpression | Survived   | `659087d1d5aac95a`, `e28289a8d2734f79`                                                                                 |
| `src/rules/schema-recursive-union-budget.ts`         | 185  | ConditionalExpression | Survived   | `ffcc1738c3d9874d`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 186  | BlockStatement        | Survived   | `a06a8825e3fa6103`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 187  | BooleanLiteral        | Survived   | `6b9e31e7a748ec61`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 187  | ConditionalExpression | Survived   | `24ca7e35fd3d174f`, `45ec288201ccbb5f`                                                                                 |
| `src/rules/schema-recursive-union-budget.ts`         | 187  | EqualityOperator      | Survived   | `f7cecc8857cf73e3`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 197  | ConditionalExpression | Survived   | `db1fa5a405bdcc9f`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 199  | ConditionalExpression | Survived   | `1bf76b22c267e9b1`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 217  | ConditionalExpression | Survived   | `2f172d7206ff4256`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 219  | ConditionalExpression | Survived   | `889c1b092917ab2a`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 225  | ConditionalExpression | NoCoverage | `c352365d3cdb187f`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 229  | BlockStatement        | NoCoverage | `fabaef4f69df133e`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 230  | ConditionalExpression | NoCoverage | `4ef5e59965dde509`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 230  | EqualityOperator      | NoCoverage | `232ed944de99ee5b`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 246  | ConditionalExpression | Survived   | `22f26ec7507f807f`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 252  | ConditionalExpression | Survived   | `db7d20799d4339cc`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 283  | ArrowFunction         | Survived   | `e41e98f526dfe263`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 283  | ConditionalExpression | Survived   | `a003d5fa48d6e8de`                                                                                                     |
| `src/rules/schema-recursive-union-budget.ts`         | 283  | MethodExpression      | Survived   | `6ff6817893be8bf2`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 70   | ConditionalExpression | Survived   | `3d457c7507245be9`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 70   | EqualityOperator      | Survived   | `6b2abaeb21ee7984`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 75   | ArithmeticOperator    | Survived   | `c59cff7a0cb3d0e1`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 82   | ArithmeticOperator    | Survived   | `98e4ea2b37ae0781`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 89   | ArithmeticOperator    | Survived   | `8c6eab9d3e78c1f2`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 90   | ConditionalExpression | Survived   | `a51e666b89ecf8f4`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 98   | BlockStatement        | NoCoverage | `7527a5fdc16dbc35`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 99   | ArithmeticOperator    | NoCoverage | `7eca5c114665a56c`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 100  | ConditionalExpression | NoCoverage | `a2d2a06839431561`, `bbe9fa6b801f932b`                                                                                 |
| `src/rules/schema-checked-element-named.ts`          | 100  | EqualityOperator      | NoCoverage | `a5810c48eaed6650`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 103  | ArithmeticOperator    | Survived   | `f676f9b1d294718f`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 104  | ConditionalExpression | Survived   | `2d4c32c2f5de4a8a`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 106  | BlockStatement        | Survived   | `371b5f6389bbb1cd`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 107  | ArithmeticOperator    | Survived   | `a94e8f44a47d650a`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 149  | BlockStatement        | NoCoverage | `7f6e5a4835bafc81`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 149  | ConditionalExpression | Survived   | `3c20c1a5b2eeab6f`, `6fdb75b247b52c08`, `a6b727e82249172f`, `af9b62bd122c6893`                                         |
| `src/rules/schema-checked-element-named.ts`          | 149  | EqualityOperator      | Survived   | `2980b13cfe9f9b46`                                                                                                     |
| `src/rules/schema-checked-element-named.ts`          | 149  | StringLiteral         | Survived   | `4414f529ad223b5d`, `ea58e37cea296a9c`                                                                                 |
| `src/rules/schema-checked-element-named.ts`          | 150  | BlockStatement        | NoCoverage | `07d02db9c08a65d6`                                                                                                     |
| `src/rules/no-manual-tag-member.ts`                  | 18   | ConditionalExpression | Survived   | `656e7cfb20fa425d`                                                                                                     |
| `src/rules/no-manual-tag-member.ts`                  | 19   | BooleanLiteral        | NoCoverage | `48628101840862c2`                                                                                                     |
| `src/rules/no-manual-tag-member.ts`                  | 28   | ConditionalExpression | NoCoverage | `0a7b19bba98a5a67`                                                                                                     |
| `src/rules/no-manual-tag-member.ts`                  | 58   | StringLiteral         | Survived   | `21ffe384373e248e`, `b381ca48e1cad49c`                                                                                 |
| `src/rules/no-manual-tag-member.ts`                  | 61   | MethodExpression      | Survived   | `5e1a06312a1be4a4`                                                                                                     |
| `src/rules/tagged-error-requires-message.ts`         | 24   | BooleanLiteral        | NoCoverage | `e64a079be31b0a0a`                                                                                                     |
| `src/rules/tagged-error-requires-message.ts`         | 39   | ConditionalExpression | Survived   | `070c726b7ad443e9`                                                                                                     |
| `src/rules/tagged-error-requires-message.ts`         | 39   | MethodExpression      | Survived   | `a785b8b0976dcf21`                                                                                                     |
| `src/rules/tagged-error-requires-message.ts`         | 46   | ConditionalExpression | Survived   | `213f16ef51ea8182`                                                                                                     |
| `src/rules/tagged-error-requires-message.ts`         | 46   | MethodExpression      | Survived   | `7a05241c95391427`                                                                                                     |
| `src/rules/schema-file-imports-pure-modules-only.ts` | 24   | MethodExpression      | Survived   | `324318b38e0127fb`                                                                                                     |
| `src/rules/schema-file-imports-pure-modules-only.ts` | 63   | StringLiteral         | Survived   | `c500f74d0df0ca69`                                                                                                     |
| `src/rules/schema-file-imports-pure-modules-only.ts` | 93   | ConditionalExpression | Survived   | `8aa8f637975ae1a5`                                                                                                     |
| `src/rules/schema-file-imports-pure-modules-only.ts` | 108  | ConditionalExpression | Survived   | `a45177b8316555f0`                                                                                                     |
| `src/rules/SchemaVocabulary.ts`                      | 5    | ConditionalExpression | Survived   | `d390cb1c31e1da97`                                                                                                     |

### D3. oxlint-plugin-dmmf-workflow: kill by RuleTester case (237 ids)

Each row is a branch or literal in the rule with no valid/invalid case whose outcome changes under the mutant. U7 adds that case. An id that U7 proves equivalent moves to the baseline with its proof. Nothing is baselined in advance.

| Rule file                                   | Line | Mutator               | Status     | Mutant ids                                                                     |
| ------------------------------------------- | ---- | --------------------- | ---------- | ------------------------------------------------------------------------------ |
| `src/rules/ReferenceClassification.ts`      | 103  | ConditionalExpression | Survived   | `5236de69e954505b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 106  | ConditionalExpression | Survived   | `0ca17b2eefb47e70`, `61c9cf5b77a704f6`, `fc8954bd5d517654`                     |
| `src/rules/ReferenceClassification.ts`      | 109  | ConditionalExpression | Survived   | `0d4c93e100615cde`                                                             |
| `src/rules/ReferenceClassification.ts`      | 112  | ConditionalExpression | Survived   | `b7b4e479d7e56e0d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 115  | ConditionalExpression | Survived   | `108fdcce8af428e8`                                                             |
| `src/rules/ReferenceClassification.ts`      | 119  | ConditionalExpression | Survived   | `500b3c9c065c0934`                                                             |
| `src/rules/ReferenceClassification.ts`      | 125  | ObjectLiteral         | Survived   | `6271c1716de48bd1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 145  | BlockStatement        | Survived   | `b8b8524625daaacf`                                                             |
| `src/rules/ReferenceClassification.ts`      | 146  | StringLiteral         | Survived   | `9db5b7959305a908`                                                             |
| `src/rules/ReferenceClassification.ts`      | 147  | StringLiteral         | Survived   | `346630e7c3076c24`                                                             |
| `src/rules/ReferenceClassification.ts`      | 151  | ConditionalExpression | Survived   | `c55914d7f57a2de5`                                                             |
| `src/rules/ReferenceClassification.ts`      | 159  | ArrayDeclaration      | NoCoverage | `a1564c8e72d4917d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 176  | ConditionalExpression | Survived   | `02076d378a57df2f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 210  | ConditionalExpression | Survived   | `abaabeb064ddfdf3`                                                             |
| `src/rules/ReferenceClassification.ts`      | 216  | BlockStatement        | NoCoverage | `d8a70546803e1c73`                                                             |
| `src/rules/ReferenceClassification.ts`      | 216  | ConditionalExpression | Survived   | `0e703921f87fe024`, `b4b51c95d2e85c72`                                         |
| `src/rules/ReferenceClassification.ts`      | 216  | EqualityOperator      | Survived   | `20bc11a22b82d5fb`                                                             |
| `src/rules/ReferenceClassification.ts`      | 217  | StringLiteral         | NoCoverage | `bd0cdc9c12890fbb`                                                             |
| `src/rules/ReferenceClassification.ts`      | 220  | ConditionalExpression | Survived   | `c7c5ee54210ed354`                                                             |
| `src/rules/ReferenceClassification.ts`      | 220  | StringLiteral         | NoCoverage | `e87312696cf82737`                                                             |
| `src/rules/ReferenceClassification.ts`      | 221  | StringLiteral         | Survived   | `5d8f30edbed2e1ef`                                                             |
| `src/rules/ReferenceClassification.ts`      | 229  | ConditionalExpression | Survived   | `c485514b37ac725b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 240  | ConditionalExpression | Survived   | `c87df62ad0582089`                                                             |
| `src/rules/ReferenceClassification.ts`      | 240  | StringLiteral         | Survived   | `cc913b6143ab74b2`                                                             |
| `src/rules/ReferenceClassification.ts`      | 258  | ConditionalExpression | Survived   | `a21513c618d51caa`                                                             |
| `src/rules/ReferenceClassification.ts`      | 262  | ConditionalExpression | Survived   | `0a7e552b75f3a2b6`, `3cd1dfa618f6f929`                                         |
| `src/rules/ReferenceClassification.ts`      | 262  | EqualityOperator      | Survived   | `b8bc8f98e823ca2c`, `c7c4cafabd150029`, `e1bbb1deca7311a2`                     |
| `src/rules/ReferenceClassification.ts`      | 290  | BlockStatement        | Survived   | `ca86be1383720e4f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 300  | ConditionalExpression | Survived   | `e89f741062963751`                                                             |
| `src/rules/ReferenceClassification.ts`      | 302  | ConditionalExpression | Survived   | `b64c8182242945ac`, `be3c4888fe745ffc`                                         |
| `src/rules/ReferenceClassification.ts`      | 305  | ConditionalExpression | Survived   | `97a4be06ee264a2a`                                                             |
| `src/rules/ReferenceClassification.ts`      | 306  | ConditionalExpression | Survived   | `0380d0f73495563a`, `b39ac4eb937c681e`                                         |
| `src/rules/ReferenceClassification.ts`      | 306  | EqualityOperator      | Survived   | `7b3c54a7f39ad4e7`                                                             |
| `src/rules/ReferenceClassification.ts`      | 306  | StringLiteral         | Survived   | `b6dd4b2ed473ef9d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 309  | ConditionalExpression | Survived   | `339fcd256783ec3c`                                                             |
| `src/rules/ReferenceClassification.ts`      | 333  | ConditionalExpression | Survived   | `a6cb78418b26cae1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 335  | ConditionalExpression | Survived   | `f292e0fb4330e4a5`                                                             |
| `src/rules/ReferenceClassification.ts`      | 353  | ConditionalExpression | Survived   | `121fad7815e8a347`                                                             |
| `src/rules/ReferenceClassification.ts`      | 353  | EqualityOperator      | Survived   | `44772db7d57d101c`                                                             |
| `src/rules/ReferenceClassification.ts`      | 354  | BlockStatement        | Survived   | `cb11faf015a2c2f1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 355  | ArithmeticOperator    | Survived   | `5193d6c5e63f2fe1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 365  | EqualityOperator      | Survived   | `6ba1f8772f4328a1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 366  | BlockStatement        | Survived   | `66425dc1113eb962`                                                             |
| `src/rules/ReferenceClassification.ts`      | 367  | ConditionalExpression | Survived   | `66a1982b6441be5e`                                                             |
| `src/rules/ReferenceClassification.ts`      | 367  | EqualityOperator      | Survived   | `a8d0109154dcfc89`                                                             |
| `src/rules/ReferenceClassification.ts`      | 367  | StringLiteral         | Survived   | `c5acd1c2ec3c4957`                                                             |
| `src/rules/ReferenceClassification.ts`      | 369  | ConditionalExpression | NoCoverage | `7e35d6f2c80290ec`, `f1d7ce4d663ef2f0`                                         |
| `src/rules/ReferenceClassification.ts`      | 369  | EqualityOperator      | NoCoverage | `76bd73719ec5f6c5`                                                             |
| `src/rules/ReferenceClassification.ts`      | 373  | ArithmeticOperator    | NoCoverage | `3e0beb19c537d1de`                                                             |
| `src/rules/ReferenceClassification.ts`      | 398  | BooleanLiteral        | Survived   | `4b98ecee15ae154d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 401  | BlockStatement        | Survived   | `94d41696d93a2d3a`                                                             |
| `src/rules/ReferenceClassification.ts`      | 403  | ConditionalExpression | Survived   | `1de2d46d998776f3`, `511e79026fff38e5`                                         |
| `src/rules/ReferenceClassification.ts`      | 403  | EqualityOperator      | Survived   | `9c4640d9e954f3ec`                                                             |
| `src/rules/ReferenceClassification.ts`      | 410  | BlockStatement        | NoCoverage | `5b6d93a36996e501`                                                             |
| `src/rules/ReferenceClassification.ts`      | 411  | BooleanLiteral        | NoCoverage | `6a1cf437cf369ae8`                                                             |
| `src/rules/ReferenceClassification.ts`      | 413  | BlockStatement        | Survived   | `fc84437c6bfb118b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 414  | StringLiteral         | Survived   | `00f845e4a71762f9`                                                             |
| `src/rules/ReferenceClassification.ts`      | 417  | ArrayDeclaration      | NoCoverage | `b0a0c224bd001469`                                                             |
| `src/rules/ReferenceClassification.ts`      | 417  | BlockStatement        | Survived   | `a7aba6dbf3de14f9`                                                             |
| `src/rules/ReferenceClassification.ts`      | 419  | BlockStatement        | Survived   | `e05e48628190cdf8`                                                             |
| `src/rules/ReferenceClassification.ts`      | 420  | ConditionalExpression | Survived   | `95021c13b6fd0483`, `d4192b190ff37ba5`                                         |
| `src/rules/ReferenceClassification.ts`      | 420  | EqualityOperator      | Survived   | `fa8a33edd5061fc9`                                                             |
| `src/rules/ReferenceClassification.ts`      | 420  | StringLiteral         | Survived   | `b83db2ebf4a264b5`                                                             |
| `src/rules/ReferenceClassification.ts`      | 421  | BlockStatement        | Survived   | `3f05f3d76164e626`                                                             |
| `src/rules/ReferenceClassification.ts`      | 422  | ConditionalExpression | Survived   | `9869744b66f5529b`, `a3e8c631de466858`                                         |
| `src/rules/ReferenceClassification.ts`      | 422  | EqualityOperator      | Survived   | `bef59a98fe5fd45d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 422  | StringLiteral         | Survived   | `4e2759b11b5c35ad`                                                             |
| `src/rules/ReferenceClassification.ts`      | 427  | BlockStatement        | Survived   | `a603e19f209e4923`                                                             |
| `src/rules/ReferenceClassification.ts`      | 427  | ConditionalExpression | Survived   | `65d4100e33caee0f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 427  | EqualityOperator      | Survived   | `052b1dd5dcb0e14b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 429  | BlockStatement        | NoCoverage | `08f77218fc110aa1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 430  | BooleanLiteral        | NoCoverage | `a6f1729e7f3ef06d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 431  | BlockStatement        | Survived   | `4221272f8aa3b638`                                                             |
| `src/rules/ReferenceClassification.ts`      | 431  | ConditionalExpression | Survived   | `cb13b70a2d1ef7ca`                                                             |
| `src/rules/ReferenceClassification.ts`      | 431  | EqualityOperator      | Survived   | `13b6b97ffd511b90`, `c29da9406b0388a0`                                         |
| `src/rules/ReferenceClassification.ts`      | 433  | StringLiteral         | Survived   | `b8ad3543cba48a6c`                                                             |
| `src/rules/ReferenceClassification.ts`      | 437  | BlockStatement        | Survived   | `738762a869eca53b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 437  | BooleanLiteral        | Survived   | `f32a0d6797d14197`                                                             |
| `src/rules/ReferenceClassification.ts`      | 437  | ConditionalExpression | Survived   | `3f2219cc351cdf2c`, `56e4df138ed419d9`                                         |
| `src/rules/ReferenceClassification.ts`      | 437  | EqualityOperator      | Survived   | `ba412f0805bf37e7`                                                             |
| `src/rules/ReferenceClassification.ts`      | 437  | LogicalOperator       | Survived   | `8685eb3e7aa0fd3a`                                                             |
| `src/rules/ReferenceClassification.ts`      | 439  | BlockStatement        | NoCoverage | `7c7104c57aa03847`                                                             |
| `src/rules/ReferenceClassification.ts`      | 439  | ConditionalExpression | NoCoverage | `313ed00a42fe874c`                                                             |
| `src/rules/ReferenceClassification.ts`      | 439  | ConditionalExpression | Survived   | `080030e3bc166ee8`, `0e7d78e2688f4c3f`, `14fdfd5f5c7818c1`, `7af4556f6e6eb0e8` |
| `src/rules/ReferenceClassification.ts`      | 439  | EqualityOperator      | NoCoverage | `c8515d59a48d21fa`                                                             |
| `src/rules/ReferenceClassification.ts`      | 440  | BooleanLiteral        | NoCoverage | `7d1e3d2a20a8e9a0`                                                             |
| `src/rules/ReferenceClassification.ts`      | 443  | ArrayDeclaration      | NoCoverage | `bbf99bd7c83b7364`                                                             |
| `src/rules/ReferenceClassification.ts`      | 445  | BlockStatement        | Survived   | `70efc21c48d62f99`                                                             |
| `src/rules/ReferenceClassification.ts`      | 458  | BooleanLiteral        | NoCoverage | `16400da1c228988b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 458  | ConditionalExpression | Survived   | `3ed8a86753b77ecd`, `921253eaca161838`                                         |
| `src/rules/ReferenceClassification.ts`      | 459  | StringLiteral         | Survived   | `4fdcaac91a57e9cf`                                                             |
| `src/rules/ReferenceClassification.ts`      | 462  | ConditionalExpression | Survived   | `28acf9d4455366bb`                                                             |
| `src/rules/ReferenceClassification.ts`      | 462  | MethodExpression      | NoCoverage | `4039ef1b979d47ca`                                                             |
| `src/rules/ReferenceClassification.ts`      | 462  | StringLiteral         | NoCoverage | `0e90fb600842ac13`                                                             |
| `src/rules/ReferenceClassification.ts`      | 464  | BooleanLiteral        | NoCoverage | `6edd840cd026dafd`                                                             |
| `src/rules/ReferenceClassification.ts`      | 506  | BooleanLiteral        | NoCoverage | `c871402b4ad15a7f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 508  | BooleanLiteral        | NoCoverage | `337652b8ff5b7849`                                                             |
| `src/rules/ReferenceClassification.ts`      | 509  | BlockStatement        | Survived   | `5d27d0902b940cf4`                                                             |
| `src/rules/ReferenceClassification.ts`      | 510  | BooleanLiteral        | NoCoverage | `af94164d94838c24`                                                             |
| `src/rules/ReferenceClassification.ts`      | 510  | ConditionalExpression | Survived   | `8b515e0713b7bcea`                                                             |
| `src/rules/ReferenceClassification.ts`      | 510  | StringLiteral         | Survived   | `233b27f9e61a2172`                                                             |
| `src/rules/ReferenceClassification.ts`      | 513  | BooleanLiteral        | NoCoverage | `8af87f9547acdddd`                                                             |
| `src/rules/ReferenceClassification.ts`      | 513  | ConditionalExpression | Survived   | `517ebc7bb9d5543a`                                                             |
| `src/rules/ReferenceClassification.ts`      | 515  | BooleanLiteral        | NoCoverage | `c0c208e7035f9062`                                                             |
| `src/rules/ReferenceClassification.ts`      | 515  | ConditionalExpression | Survived   | `4c0f673e057ca993`, `d460fdb9fd5fa873`                                         |
| `src/rules/ReferenceClassification.ts`      | 516  | BooleanLiteral        | NoCoverage | `f56b6eb6d3bcffc2`                                                             |
| `src/rules/ReferenceClassification.ts`      | 516  | ConditionalExpression | Survived   | `05333f47db88306b`                                                             |
| `src/rules/ReferenceClassification.ts`      | 517  | ConditionalExpression | Survived   | `e45fcafc5e564198`                                                             |
| `src/rules/ReferenceClassification.ts`      | 518  | ConditionalExpression | NoCoverage | `0454298a001a1c27`                                                             |
| `src/rules/ReferenceClassification.ts`      | 518  | ConditionalExpression | Survived   | `df017c636aa07b98`                                                             |
| `src/rules/ReferenceClassification.ts`      | 518  | EqualityOperator      | NoCoverage | `5ee40fb75c2120cd`                                                             |
| `src/rules/ReferenceClassification.ts`      | 518  | StringLiteral         | NoCoverage | `ae5a794f8073e4ae`                                                             |
| `src/rules/ReferenceClassification.ts`      | 552  | ConditionalExpression | Survived   | `b32f15ce0903836d`                                                             |
| `src/rules/ReferenceClassification.ts`      | 565  | ConditionalExpression | Survived   | `a9b20e0fcb3e0d31`                                                             |
| `src/rules/ReferenceClassification.ts`      | 571  | ConditionalExpression | Survived   | `5005e3c0fdeeae88`                                                             |
| `src/rules/ReferenceClassification.ts`      | 573  | ConditionalExpression | Survived   | `03d20a1d64b0c77f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 574  | ConditionalExpression | Survived   | `506b5791ed3b0304`                                                             |
| `src/rules/ReferenceClassification.ts`      | 580  | ArrayDeclaration      | NoCoverage | `dbfbca115e8ddf5f`                                                             |
| `src/rules/ReferenceClassification.ts`      | 598  | ConditionalExpression | Survived   | `7f1e0bd51b081cb6`                                                             |
| `src/rules/ReferenceClassification.ts`      | 598  | EqualityOperator      | Survived   | `fc6d675046d81dc1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 598  | StringLiteral         | Survived   | `38ed6d163656b5af`                                                             |
| `src/rules/ReferenceClassification.ts`      | 599  | ConditionalExpression | Survived   | `0efba1f9b1544adf`                                                             |
| `src/rules/ReferenceClassification.ts`      | 601  | ConditionalExpression | Survived   | `92f7ee7ec831e77c`, `c48422abc43b1182`                                         |
| `src/rules/ReferenceClassification.ts`      | 610  | ConditionalExpression | Survived   | `e810aeaa13f436d1`                                                             |
| `src/rules/ReferenceClassification.ts`      | 610  | StringLiteral         | Survived   | `6a7b1bb59fca6b10`                                                             |
| `src/rules/ReferenceClassification.ts`      | 624  | ConditionalExpression | Survived   | `26efdf19ce838209`                                                             |
| `src/rules/ReferenceClassification.ts`      | 659  | ConditionalExpression | Survived   | `0f3d737fd71348f4`, `e73a28c2a7441627`                                         |
| `src/rules/ReferenceClassification.ts`      | 659  | StringLiteral         | Survived   | `1c5c57c52951665c`                                                             |
| `src/rules/ReferenceClassification.ts`      | 663  | ConditionalExpression | Survived   | `fb979213e1fcf609`                                                             |
| `src/rules/ReferenceClassification.ts`      | 668  | ConditionalExpression | Survived   | `f78d8ee964df7378`                                                             |
| `src/rules/make-body-purity.ts`             | 57   | ConditionalExpression | Survived   | `88e4d7ebaa28bc59`                                                             |
| `src/rules/make-body-purity.ts`             | 57   | StringLiteral         | Survived   | `e665d1a3e0beb8bb`                                                             |
| `src/rules/make-body-purity.ts`             | 64   | ConditionalExpression | Survived   | `360cd255a0f7aa6b`, `a9773696eb6026a0`, `fe58a810f329a3a5`                     |
| `src/rules/make-body-purity.ts`             | 71   | BooleanLiteral        | NoCoverage | `96e4a421e2f265ec`                                                             |
| `src/rules/make-body-purity.ts`             | 74   | ConditionalExpression | Survived   | `797ac9d9698417a7`                                                             |
| `src/rules/make-body-purity.ts`             | 84   | BooleanLiteral        | NoCoverage | `920fde54b6a94d17`                                                             |
| `src/rules/make-body-purity.ts`             | 84   | ConditionalExpression | Survived   | `6042ff30b9d0a5a0`                                                             |
| `src/rules/make-body-purity.ts`             | 86   | ConditionalExpression | Survived   | `ea994c8f7912ad0a`                                                             |
| `src/rules/make-body-purity.ts`             | 195  | BooleanLiteral        | NoCoverage | `2349c97fda41f3ab`                                                             |
| `src/rules/make-body-purity.ts`             | 195  | ConditionalExpression | Survived   | `d4cca5f7d77e7951`                                                             |
| `src/rules/make-body-purity.ts`             | 215  | ConditionalExpression | Survived   | `22405c6a01a12223`                                                             |
| `src/rules/make-body-purity.ts`             | 220  | StringLiteral         | NoCoverage | `34a715419bff8bc9`                                                             |
| `src/rules/make-body-purity.ts`             | 229  | ConditionalExpression | Survived   | `849399b452f2866d`                                                             |
| `src/rules/make-body-purity.ts`             | 251  | ConditionalExpression | Survived   | `3808a6e3c40b158b`, `af4d65258935bd89`                                         |
| `src/rules/make-body-purity.ts`             | 251  | EqualityOperator      | Survived   | `462ddd7f2445901b`                                                             |
| `src/rules/make-body-purity.ts`             | 251  | StringLiteral         | Survived   | `ae82427bfde86a8f`                                                             |
| `src/rules/make-body-purity.ts`             | 255  | ConditionalExpression | Survived   | `6b037f68d4c7e5da`, `f54baf4af790f761`                                         |
| `src/rules/make-body-purity.ts`             | 255  | LogicalOperator       | Survived   | `5a2b027bb32b38ec`                                                             |
| `src/rules/make-body-purity.ts`             | 258  | StringLiteral         | Survived   | `7c8779fcbf91d357`                                                             |
| `src/rules/make-body-purity.ts`             | 259  | BooleanLiteral        | Survived   | `5a8270b618d7eb74`                                                             |
| `src/rules/make-body-purity.ts`             | 259  | StringLiteral         | Survived   | `a9e0f3b79a11f07e`                                                             |
| `src/rules/make-body-purity.ts`             | 260  | BooleanLiteral        | Survived   | `5948486afcd5d01c`                                                             |
| `src/rules/make-body-purity.ts`             | 260  | StringLiteral         | Survived   | `537b194845ca5bc3`                                                             |
| `src/rules/make-body-purity.ts`             | 266  | ArrayDeclaration      | NoCoverage | `42ca79be08c9f5e0`                                                             |
| `src/rules/make-body-purity.ts`             | 281  | ConditionalExpression | Survived   | `4f888ed77c131e3b`                                                             |
| `src/rules/ValueExports.ts`                 | 31   | ConditionalExpression | Survived   | `7ee4bf63c80a9018`                                                             |
| `src/rules/ValueExports.ts`                 | 33   | ConditionalExpression | Survived   | `4f740bb9e4b70402`                                                             |
| `src/rules/ValueExports.ts`                 | 33   | StringLiteral         | Survived   | `5008a48688894e1d`                                                             |
| `src/rules/ValueExports.ts`                 | 42   | ConditionalExpression | Survived   | `98f2328df6088df1`                                                             |
| `src/rules/ValueExports.ts`                 | 47   | ConditionalExpression | Survived   | `038ee687319f3499`                                                             |
| `src/rules/ValueExports.ts`                 | 82   | BlockStatement        | Survived   | `740f40476ed38b51`                                                             |
| `src/rules/ValueExports.ts`                 | 86   | BooleanLiteral        | Survived   | `cc257b68d12f0675`                                                             |
| `src/rules/ValueExports.ts`                 | 86   | ConditionalExpression | Survived   | `76feb1b2d1acefcd`                                                             |
| `src/rules/ValueExports.ts`                 | 90   | ConditionalExpression | NoCoverage | `337bebcc877dc97e`                                                             |
| `src/rules/ValueExports.ts`                 | 98   | ConditionalExpression | Survived   | `53947be712211efd`                                                             |
| `src/rules/ValueExports.ts`                 | 110  | BlockStatement        | NoCoverage | `1045de45901aa68b`                                                             |
| `src/rules/ValueExports.ts`                 | 114  | ConditionalExpression | Survived   | `f63b8606340e63f3`                                                             |
| `src/rules/ValueExports.ts`                 | 137  | ConditionalExpression | NoCoverage | `0ac01135948364dd`                                                             |
| `src/rules/ValueExports.ts`                 | 145  | BlockStatement        | Survived   | `7b8c00375a780925`                                                             |
| `src/rules/ValueExports.ts`                 | 147  | ConditionalExpression | Survived   | `9b66333a3a1881c4`, `9d71e0f6a919f6ed`, `c725bb7826af68c3`                     |
| `src/rules/ValueExports.ts`                 | 151  | ConditionalExpression | Survived   | `61e8e2d77197a84f`                                                             |
| `src/rules/ValueExports.ts`                 | 170  | ConditionalExpression | Survived   | `d44bb318541ef032`                                                             |
| `src/rules/ValueExports.ts`                 | 172  | ConditionalExpression | Survived   | `383aac67c7c64f0e`                                                             |
| `src/rules/ValueExports.ts`                 | 173  | ConditionalExpression | Survived   | `3608d01112cbe44f`                                                             |
| `src/rules/ValueExports.ts`                 | 177  | ConditionalExpression | NoCoverage | `1960f12b0df0038e`                                                             |
| `src/rules/ValueExports.ts`                 | 177  | EqualityOperator      | NoCoverage | `d6c9c7a928271634`                                                             |
| `src/rules/ValueExports.ts`                 | 187  | ConditionalExpression | Survived   | `e7c41d485c4cb470`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 56   | ConditionalExpression | Survived   | `05fdbce4ff3a11af`, `0cc24a0d14835955`, `3520e8a0e01ba60e`                     |
| `src/rules/workflow-variant-constructed.ts` | 56   | LogicalOperator       | Survived   | `ce8641ac10813a0a`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 62   | ConditionalExpression | Survived   | `1c331fd2dabd0c92`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 65   | ConditionalExpression | Survived   | `eafbf60d9306db29`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 80   | ConditionalExpression | Survived   | `581f62dc11ae6b83`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 118  | ConditionalExpression | Survived   | `dda2cff375bc8ee6`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 128  | EqualityOperator      | Survived   | `5b90f65d99a5ebde`, `8ca86db0fcad35a7`                                         |
| `src/rules/workflow-variant-constructed.ts` | 131  | ConditionalExpression | Survived   | `37f0e5c91e57876d`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 133  | ArithmeticOperator    | Survived   | `108d4bbf00bff144`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 149  | EqualityOperator      | Survived   | `24eef66d24ce2f67`, `70c45d1a0ff3e84f`                                         |
| `src/rules/workflow-variant-constructed.ts` | 152  | ArithmeticOperator    | Survived   | `fb73f6e27a24846a`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 155  | ArithmeticOperator    | Survived   | `5458be358a3bd87a`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 164  | ConditionalExpression | Survived   | `238e7ee837f42e7c`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 198  | ConditionalExpression | Survived   | `f4f99e3ba8e87262`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 209  | StringLiteral         | Survived   | `4fcedc64daaa8019`                                                             |
| `src/rules/workflow-variant-constructed.ts` | 210  | ConditionalExpression | Survived   | `965477a52e71476b`                                                             |
| `src/rules/make-command-schema.ts`          | 54   | ConditionalExpression | Survived   | `bcc972c4776cdfe9`                                                             |
| `src/rules/make-command-schema.ts`          | 59   | ConditionalExpression | Survived   | `744dd3182fb680db`                                                             |
| `src/rules/make-command-schema.ts`          | 86   | ConditionalExpression | Survived   | `d5ede7caa3a71341`                                                             |
| `src/rules/make-command-schema.ts`          | 99   | ConditionalExpression | Survived   | `49b9b283ddf4f075`                                                             |
| `src/rules/make-command-schema.ts`          | 139  | MethodExpression      | Survived   | `c7cf5dd33955bc9c`                                                             |
| `src/rules/make-command-schema.ts`          | 141  | BooleanLiteral        | NoCoverage | `2bd35a9a8a9f258d`                                                             |
| `src/rules/make-command-schema.ts`          | 141  | ConditionalExpression | Survived   | `85c3ecebb0331327`                                                             |
| `src/rules/damp-workflow-stem.ts`           | 39   | StringLiteral         | NoCoverage | `7f4c7a1925f98088`                                                             |
| `src/rules/damp-workflow-stem.ts`           | 76   | StringLiteral         | NoCoverage | `b759652fbb33cf5d`                                                             |
| `src/rules/workflow-match-exhaustive.ts`    | 49   | ConditionalExpression | Survived   | `611d4c989ad469f0`                                                             |
| `src/rules/workflow-match-exhaustive.ts`    | 53   | ConditionalExpression | Survived   | `60f2fca3d0d970e1`                                                             |
| `src/rules/make-file-location.ts`           | 32   | ConditionalExpression | Survived   | `47da5dfda3b0f4f2`                                                             |
| `src/rules/workflow-file-make-presence.ts`  | 19   | ConditionalExpression | Survived   | `acbf5e77f9ac7743`                                                             |
