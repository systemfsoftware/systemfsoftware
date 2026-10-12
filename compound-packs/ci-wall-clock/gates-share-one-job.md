---
title: A workflow's pull-request gates run in parallel inside one job, with one checkout and one install
applies_when:
  - adding a pull-request job that runs format, lint, typecheck, test or build
  - splitting a pull-request gate into more jobs or a matrix
  - adding a checkout, install or Nix setup to a pull-request gate job
tags: [ci, presubmit, jobs, setup, matrix, wall-clock]
---

A coding agent or reviewer can make a gate look parallel by giving format, lint, typecheck, test and build a job each, or an N-leg matrix. Each leg then repeats the checkout, the install and the Nix setup before its own short task, so the pull request waits on setup and pays it N times. GitHub bills each job separately: "GitHub rounds the minutes and partial minutes each job uses up to the nearest whole minute." Unnamed private-repo patterns, dated 2026-10-12: seven hosted runners each repeated checkout, `pnpm install` and Nix for a gate of 45-70 seconds, and 46-68 jobs per push each spent about 109 seconds in setup and 0 seconds in tests.

## Rule

A workflow's pull-request gates (format, lint, typecheck, test, build) run in parallel inside one job, with one checkout and one install. A split into more jobs is kept only with jobs-API numbers showing it lowers the gate's wall time, with each split job's task time above its setup time.

- One job checks out once, installs once, and runs the gates in parallel inside it (for example one task runner invocation over every gate with `--continue`).
- A split names its evidence in a header comment on the split jobs: the run ids, the one-job wall time against the split wall time, and each split job's setup time against its task time, all read from the Actions jobs API.
- The commit-message, changeset and PR-title checks of `light-checks-run-the-pinned-tool` are not gates here: they stay install-free jobs of their own. Heavy suites never run on a pull request (`heavy-suites-judge-every-main-commit`), so their shards are out of scope.

```yaml
# WRONG: neutral shape of an unnamed pattern (2026-10-12): seven jobs, each repeating
# checkout, pnpm install and Nix, for a 45-70 s gate.
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: cachix/install-nix-action@v31
      - run: corepack pnpm install --frozen-lockfile
      - run: corepack pnpm lint
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: cachix/install-nix-action@v31
      - run: corepack pnpm install --frozen-lockfile
      - run: corepack pnpm typecheck
  # ... five more jobs of the same shape: format, test, build ...

# RIGHT: neutral shape, no citation. One checkout and one install, then every gate in
# parallel; --continue reports every failing gate, not only the first.
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: corepack pnpm install --frozen-lockfile
      - run: corepack pnpm exec turbo run format lint typecheck test build --continue
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

Grounds: GitHub, "Actions runner pricing" (https://docs.github.com/en/billing/reference/actions-runner-pricing): "GitHub rounds the minutes and partial minutes each job uses up to the nearest whole minute." A per-job rounding and a per-job setup are both paid once per job, so a split costs more unless its parallelism removes more wall time than its legs add in setup. That is why the split's evidence is per job: setup against task, read from the jobs API.

Gate: `review`. Does the diff run a workflow's pull-request gates (format, lint, typecheck, test, build) in more than one job, or as a matrix of legs, each repeating checkout or install, without a header comment citing jobs-API run ids that show the split's wall time below the one-job form's and each split job's task time above its setup time? Does the one gate job run its gates one after another where one parallel invocation would do?
