---
title: A check gets its own job, and so its own runner, only for a named machine, trust or time reason; otherwise it is a step in an existing job
applies_when:
  - adding a job or matrix leg to a workflow, or splitting a step out into its own job
  - adding a small check such as a commit-message lint, a format check, a link check or a script to CI
  - consolidating jobs so a workflow uses fewer runners
tags: [ci, runners, jobs, spot, cost]
---

Every job is a fresh runner. Where runners are ephemeral, each one "executes exactly one job, and terminates". So each job pays a launch, a boot, its own checkout and its own install. Steps on one runner share that setup: "Since each step is executed on the same runner, you can share data from one step to another" (https://docs.github.com/en/actions/get-started/understand-github-actions).

A mechanical check that the diff adds or moves gets its own job only when one of these reasons holds, and the job carries the reason as a YAML comment:

1. Machine. It needs `runs-on` labels the existing job's runner lacks: architecture, kvm or size. A missing tool is not a machine need; the step fetches the tool pinned, because no tools are baked into the runner image.
2. Trust. It needs a secret, write permission or environment that the other job must not hold ("make sure that the GITHUB_TOKEN is granted the minimum required permissions", https://docs.github.com/en/actions/reference/security/secure-use).
3. Time. Its steps take longer than a fresh runner's wait plus setup, or folding it in would push the job past ten minutes. Before a separate runner, the work runs as parallel steps in the existing job (`jobs.<job_id>.steps[*].parallel`: "Runs a group of steps concurrently, then waits for all of them to finish", https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), once the runner image's actions/runner version is confirmed to support it. The comparison uses measured wait and setup times for the repository, not a guessed wait. Fowler: "the XP guideline of a ten minute build is perfectly within reason" (https://martinfowler.com/articles/continuousIntegration.html).

A different event is a reason too, and each-suite-runs-in-its-lane.md decides it.

Failure isolation alone is not a reason: a separate named step already reports which check failed.

A check folded into an existing job has its tool arrive with that job's frozen install or its one pinned tool fetch, as pull-request-jobs-check-after-a-frozen-install.md requires.

Merging jobs renames their checks. A diff that merges or renames a job changes the merge-queue required conditions and the branch ruleset in the same pull request, or every queue run waits on a check that never reports: a skipped workflow leaves its checks "Pending" (https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions).

Decision test: for each job or matrix leg the diff adds or splits out, find the YAML comment naming its reason and check the reason against the three above or against its event. The diff fails when a job has no reason comment, when the named reason does not hold (the "machine" is a missing tool, the "trust" holds no secret the other job lacks, the "time" is unmeasured), or when a merge or rename of jobs leaves the required-check list unchanged.

Defect prevented: every unneeded job adds a runner to every run of its workflow and draws on runner-registration capacity, which is rate limited. It repeats checkout and install and is billed separately.

```yaml
# WRONG: a commit-message lint in its own job, with no reason
commitlint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<sha>
    - run: pnpm dlx @commitlint/cli@19.8.1 --from "$BASE" --to "$HEAD"
```

```yaml
# RIGHT: a step in the lint-and-typecheck job, whose frozen install brought the tool
lint-typecheck:
  steps:
    - run: pnpm install --frozen-lockfile
    - run: pnpm lint
    - run: pnpm typecheck
    - run: pnpm commitlint --from "$BASE" --to "$HEAD"
```

```yaml
# RIGHT: a VM test that needs kvm
vm-test:
  # machine: needs kvm, which the lint runner lacks
  runs-on: [self-hosted, kvm]
```

Source: GitHub, "Understanding GitHub Actions" and "Secure use reference", quoted above. Fowler, "Continuous Integration" (2024), quoted above. The three reasons are this pack's ruling.

Gate: judge
