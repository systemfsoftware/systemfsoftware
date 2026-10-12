---
title: Every job that runs steps has the one 60-minute stuck-job backstop and writes its wall time to the step summary
applies_when:
  - adding or editing a job in .github/workflows that runs steps (has `runs-on`)
  - changing a job's `timeout-minutes`
  - wrapping a step or tool invocation in a wall-clock timeout, or handing a tool a wall-clock cap
  - adding or editing a job that calls a reusable workflow
tags: [ci, timeout, jobs, wall-clock, backstop]
---

A job with no `timeout-minutes` is cancelled by GitHub only after 360 minutes, so a stuck job holds a runner for six hours. A cap below 60 minutes does the opposite harm: it kills jobs that are doing real work. On 2026-09-23 and 2026-09-24 this repo's Mutation lane killed 13 jobs at 30 minutes across five push runs on main (35887715884, 35938446772, 35991344744, 36010116451, 36070566247), each annotated "The job has exceeded the maximum execution time of 30m0s". Each killed job held one whole package's mutants. The kills threw away the runner minutes those jobs had already spent, left those commits with no mutation verdict, and hid the cause behind a timeout. The cause was fixed where it lived: #534 (`2dd2d41112`) sliced each package's mutate files into shards and packed jobs from recorded timings.

The 60-minute backstop exists only to free a stuck job. A budget is measured and reported in the step summary, never enforced; an overrun is fixed at its cause.

## Rule

Every job that runs steps sets `timeout-minutes: 60`, no job, step or tool invocation gets a shorter wall-clock kill, and each such job writes its wall time to the step summary. A job that calls a reusable workflow carries no `timeout-minutes` and passes no shorter cap through `with:`; the callee's jobs carry the backstop and the summary.

- Every job with `runs-on` sets `timeout-minutes: 60`, never another value.
- No step runs a command under a wall-clock kill below 60 minutes (a `timeout N` wrapper, a runner's whole-run timeout flag).
- No lane hands a tool a wall-clock cap below 60 minutes (for example a planner's `max-seconds`, or a mutation runner's per-package `--cap-seconds`). A cap that bounds one unit of work inside the job is still a wall-clock kill below the backstop; there is no per-unit exemption. A per-test timeout inside a test framework is not a wall-clock kill of the job and is out of scope.
- A job that calls a reusable workflow passes no wall-clock cap below 60 minutes through `with:`: no `timeout-minutes`, `plan-timeout-minutes`, `gate-timeout-minutes` or `max-seconds` input, and no such field inside a structured input (a lane list's `"timeout-minutes"`), that the callee turns into a job, step or tool cap.
- Every such job writes its wall time to the step summary.

```yaml
# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:91
# Killed 13 jobs at 30 minutes in runs 35887715884, 35938446772, 35991344744,
# 36010116451 and 36070566247; the real cause, one job per whole package, stayed hidden.
    timeout-minutes: 30

# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/checks-lane/action.yml:124-125
# A step kills its command at 300 seconds.
        out="$(env -u GITHUB_ACTIONS -u ALLOW_LOCAL_MUTATION STRYKER_MODE=machine NO_COLOR=1 \
          timeout 300 corepack pnpm --filter @systemfsoftware/effect-readiness run mutation)" || status=$?

# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/ci.yml:70-73
# A caller hands its callee's lane jobs 45- and 30-minute kills through `with:`;
# reusable-checks.yml:408 applies them as `timeout-minutes: ${{ matrix.lane.timeout-minutes }}`.
      lanes: >-
        [{"id": "static", "name": "static checks (pnpm check:static)", "timeout-minutes": 45, "fetch-depth": 2, "node-options": "--max-old-space-size=4096", "run": "corepack pnpm check:static",
          "docs-run": "./bin/dprint check && nix run --no-write-lock-file .#repo-checks -- single-plan --plans docs/plans --base origin/main"},
        {"id": "gritlint", "name": "gritlint · sandboxed journey, pnpm lint:conventions", "timeout-minutes": 30}]

# RIGHT: systemfsoftware/systemfsoftware e9543bae65:.github/workflows/reusable-checks.yml:381
# Raised from 10 by e9543bae65, "give every job this branch adds the 60-minute stuck-job backstop".
    timeout-minutes: 60

# RIGHT: neutral shape, no citation
# The first step records the start; the last step writes the wall time even when a step failed.
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      # ... the job's own steps ...
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

Grounds: GitHub, "Workflow syntax for GitHub Actions", `jobs.<job_id>.timeout-minutes` (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): "The maximum number of minutes to let a job run before GitHub automatically cancels it. Default: 360". GitHub, "Reusing workflow configurations", section "Supported keywords for jobs that call a reusable workflow" (https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations): "When you call a reusable workflow, you can only use the following keywords in the job containing the call", a list of `name`, `uses`, `with`, `secrets`, `strategy`, `needs`, `if`, `concurrency`, `permissions` and `cache-mode`. `timeout-minutes` is not in it, so a caller job cannot carry the backstop.

Gate: `review`. Does any non-caller job in the diff (a job with `runs-on`) set `timeout-minutes` to anything other than 60, or omit it? Does any step set one below 60, does any command run under a wall-clock kill below 60 minutes (a `timeout N` wrapper, a runner's whole-run timeout flag, a lane-level cap handed to a tool such as a planner's `max-seconds` or a per-package `--cap-seconds`), or does any such job leave its wall time out of the step summary? For a `uses:` caller job, does its `with:` block pass a value below 60 minutes into an input the callee turns into a job, step or tool wall-clock cap (`timeout-minutes`, `plan-timeout-minutes`, `gate-timeout-minutes`, `max-seconds` or an equivalent, including a field inside a structured input such as a lane list's `"timeout-minutes"`)? Resolve each such input to the callee's `timeout-minutes:`, step `timeout` or tool flag that consumes it, read at the ref the caller pins, and judge that cap by the questions above. A caller job that only omits its own `timeout-minutes`, which GitHub does not allow on it, passes. A per-test timeout inside a test framework is out of scope.
