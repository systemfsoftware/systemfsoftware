---
title: A failing CI job names its gate, the failing step and a reproduce command, local or, for a step that runs Stryker, a dispatch on main, and no verdict step's failure is swallowed
applies_when:
  - adding or changing a CI job or a step whose result is a verdict
  - adding `continue-on-error`, `|| true`, or an `if:` that can let a verdict step's failure pass
  - changing a failure summary, its reason table or its reproduce command
tags: [ci, failures, diagnostics, reproduce, workflows, wall-clock]
---

A red job is read by a coding agent that has to decide what to run next. If the job says only that it failed, the agent downloads logs and guesses; if it says nothing at all, nobody acts. This repo has had both. Every Mutation matrix job once failed at `stryker: not found` "while the run shows green because the step has `continue-on-error: true`" (`docs/plans/2026-08-10-001-fix-attw-cli-verification-merge-integration-plan.md:70`), so the lane reported health it did not have. And the #519 gate log "had no lines at all from 20:42:31 to 21:04:54" before the job hit its timeout (`docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md:43`).

## Rule

A failing CI job ends by writing which gate failed, as a reason code from a closed set, where it failed, and a command that reproduces it from the workspace root, or for a step that runs Stryker the lane's dispatch on main; no verdict step's failure is swallowed.

- **Gate:** one reason code from a closed set the job declares, chosen by the first failed step it lists. Every step that can fail carries an `id`, and every verdict step is in the table; a setup step left out of it (checkout, a toolchain) ends as an unclassified failure that names its step id, which a step with no `id` cannot do.
- **Location:** the failing step, by its reason code or, for an unlisted step, its id; two steps share a code only where one reproduce command covers both. The package or shard where the job runs per package is in the job id or the reproduce command. A job that only reports other jobs' results names those jobs instead.
- **Reproduce:** a command run from the workspace root (`pnpm --filter <pkg> test --shard=<i>/<n>`, `pnpm check:ci`, `nix build -L <installable>`), except for a step that runs Stryker (next bullet). A job that only reports other jobs' results gives the whole gate's local command. "Read the log" (`gh run view --log-failed`, a link) is a pointer to evidence, never the reproduce command.
- **Stryker steps:** a step that runs Stryker (planning mutants, a mutation job's run) reproduces through the lane's dispatch on main, never a local Stryker command, because mutation runs only on main (`mutation-runs-nightly-on-main`; root `AGENTS.md` REPO-D3): `gh workflow run <lane> --ref main -f sha=<the run's commit> -f packages='<the job's packages as a JSON array>'`, with the job-minutes the plan predicted for those packages. The summary shows it as a dispatch, never under a "reproduce locally" label or after a `cd`. A step that only reads Stryker's output, such as merging the jobs' parts into one report, keeps its local command. Any reproduce that dispatches a mutation lane dispatches on main, and the agent finds the run it started by its title, `Mutation <sha>`. A guard's refusal is not reproduced by a dispatch, which the guard admits: its reproduce runs the guard's own check on the refused event or ref, written as a literal its reason code names. No reproduce splices in a value a pull request's author chooses (a branch name, a title): the agent that reads the red job runs the command as written.
- **Nothing swallowed:** a verdict step never carries `continue-on-error: true`, `|| true`, or an `if:` that lets its failure pass. An advisory step that is not a verdict says so in its name, and the job's verdict is decided elsewhere.
- **Timed out:** a job the 60-minute backstop (`one-stuck-job-backstop`) or a cancellation ends is a failure too. Its summary step runs on `failure() || cancelled()` and gives a step whose outcome is `cancelled` a timeout code; because GitHub does not document whether a cancelled job's remaining steps run (github/docs#45403), the job that reports the other jobs' results also names each one whose result is `cancelled`.
- In this repo the shared `failure-summary` action writes the reason code, the reproduce command and the job id (`.github/AGENTS.md:42`; `.github/actions/failure-summary/action.yml:3-4,15-16,72-78,84`). It prints failed step ids only in its catch-all line (`:69-70`) and matches only steps whose outcome is `failure` (`:41,44`): until it also matches `cancelled`, a change to the action rather than to a job, a step the backstop cancels is reported as `unclassified`, "a step with no id". This rule extends the contract to every CI-facing job and to the timed-out case.

```yaml
# WRONG: systemfsoftware/systemfsoftware e73c526331:.github/workflows/mutation.yml:57-64
# The verdict step's failure never fails the job, so a lane whose every job could not find
# its tool read green.
      # Advisory: a mutation failure or timeout never fails this job. The merged
      # report in the `report` job carries the verdict. Infrastructure steps above
      # still fail red.
      - name: Mutation
        id: mutation
        continue-on-error: true
        timeout-minutes: 60
        run: corepack pnpm turbo mutation --filter=./${{ matrix.package }}

# WRONG: systemfsoftware/systemfsoftware 8d07118079:.github/workflows/reusable-checks.yml:209-214
# The classify job's reproduce is a log link, though the step it reports runs a local script.
          job: classify
          reasons: |
            diff classify-failed
            lanes classify-failed
          steps: ${{ toJSON(steps) }}
          reproduce: gh run view ${{ github.run_id }} --log-failed

# RIGHT: systemfsoftware/systemfsoftware 8d07118079:.github/workflows/reusable-checks.yml:562-575
# A closed reason table, and a reproduce command naming the package filter or the exact shard.
# `test` and `shard` share a code because they are exclusive (`matrix.job.shard == null` / `!= null`)
# and the one reproduce covers whichever ran. Its `if: failure()` names no `cancelled()` case,
# which the "Timed out" bullet adds.
      - if: failure()
        uses: $/.github/actions/failure-summary
        with:
          job: test-${{ matrix.job.id }}
          reasons: |
            hook hook-failed
            sfs-deps sfs-deps-missing
            builtin build-failed
            test test-failed
            shard test-failed
            hook-after hook-failed
          steps: ${{ toJSON(steps) }}
          reproduce: ${{ matrix.job.shard == null && format('{0} {1} test', inputs.pnpm, matrix.job.filters) || format('{0} --filter {1} test --shard={2}/{3}', inputs.pnpm, matrix.job.shard.package, matrix.job.shard.index, matrix.job.shard.count) }}
          working-directory: ${{ inputs.working-directory }}

# RIGHT: systemfsoftware/stryker-js-effect 33c6175f:.github/workflows/ci.yml:175-176
# Another repository's gate names the failed turbo tasks and the command that reruns them.
          elif [ -n "$failed" ]; then
            reason=TURBO_TASK_FAILED next="Turbo task failed: ${failed}. Reproduce with: pnpm exec turbo run ${failed}"
```

The same log-link reproduce sits at `8d07118079:.github/workflows/reusable-nix.yml:68` and in the reusable checks' final `gate` job (`reusable-checks.yml:706-712`), which only reports the other jobs' results; its reproduce would be the gate's own local command.

A local Stryker command reproduces nothing. This repo's mutation job gives `corepack pnpm ${{ matrix.job.filters }} mutation` as its reproduce (`0923912eed:.github/workflows/reusable-mutation.yml:282`, from #710, `9154691d4b`), a local run REPO-D3 forbids. In the public stryker-js-effect, #168 (`cec87480`, 2026-10-05) made the engine refuse such a run: it was asked for "a more sustainable way to block stryker mutations on dev machines", and `stryker run` now "refuses to start unless `GITHUB_ACTIONS` is `true`" (`33c6175f:packages/stryker-js/README.md:189`). The same lane breaks the clause twice more at `0923912eed`: the plan job's reproduce (`reusable-mutation.yml:158`) runs `stryker plan` in every package (`scripts/tools/test-timings.ts:791-810`), and the guard's (`:73`) dispatches on the run's own ref, which is a pull request's branch, spliced in unquoted, when the guard refuses one; `.github/AGENTS.md:36` still documents that guard as admitting a push. The lane has no `sha` or `packages` input to dispatch with, and the shared `failure-summary` action prints every reproduce as "reproduce locally" after a `cd` into the working directory (`.github/actions/failure-summary/action.yml:72,75`), a change to the action. Its report job's reproduce (`:412-417`) only merges the parts, since `scripts/tools/mutation-job.ts` starts a process only for a job's run (`:98`), and complies.

Gate: `review`. Does a job the diff adds or changes end, on failure, without a reason code from a closed set, the failing step (and the package or shard where it runs per package, or the failed jobs where it only reports them), and a reproduce command run from the workspace root (the whole gate's local command for a job that only reports others), or, for a step that runs Stryker, the lane's dispatch on main? Does a step that runs Stryker give a local command, or a dispatch on a ref other than main or without its `sha`, its packages and its predicted job-minutes, as its reproduce? Does any reproduce dispatch a mutation lane off main, reproduce a guard's refusal by a dispatch, or splice in a branch name, title or other value a pull request's author chooses? Does a step it adds lack an `id`, or a verdict step it adds go unlisted in the job's reason table? Does its summary step skip a cancelled or timed-out job, or does a job that reports other jobs' results omit one whose result is `cancelled`? Does a verdict step it adds or touches carry `continue-on-error: true`, `|| true`, or an `if:` that lets its failure pass?
