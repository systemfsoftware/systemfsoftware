---
title: A check gets its own job only for a named machine, trust, or time reason; otherwise it is a step in an existing job
applies_when:
  - adding a job or matrix leg to a workflow, or splitting a step out into its own job
  - adding a small check such as a commit-message lint, a format check, a link check or a script to CI
  - consolidating jobs so a workflow uses fewer runners
tags: [ci, runners, jobs, spot, cost]
---

Ephemeral runners execute "exactly one job, and terminates", repeating launch, boot, checkout, and install. Steps in one job share that setup: "Since each step is executed on the same runner, you can share data from one step to another" (https://docs.github.com/en/actions/get-started/understand-github-actions).

A check added or moved in a diff must run as a step in an existing job unless the new job carries a YAML comment naming one of three reasons:

1. **Machine**: It requires runner labels the existing job lacks, such as architecture, kvm, or size. A missing tool is not a machine need; the step fetches pinned tools.
2. **Trust**: It requires secrets, write permissions, or environments the existing job must not hold ("make sure that the GITHUB_TOKEN is granted the minimum required permissions", https://docs.github.com/en/actions/reference/security/secure-use).
3. **Time**: Its steps take longer than runner wait plus setup, or folding it in pushes the job over ten minutes (Fowler: "the XP guideline of a ten minute build is perfectly within reason", https://martinfowler.com/articles/continuousIntegration.html). Before creating a separate runner, run concurrent steps in the existing job (`jobs.<job_id>.steps[*].parallel`: "Runs a group of steps concurrently, then waits for all of them to finish", https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) once runner image support is confirmed. Time comparisons must use measured repository wait and setup times, not guesses.

A different trigger event also justifies a separate job (`each-suite-runs-in-its-lane.md`). Failure isolation does not: a named step already reports which check failed. Tools for folded checks arrive via the existing job's frozen install or a pinned fetch (`pull-request-jobs-check-after-a-frozen-install.md`).

A diff that merges or renames jobs must update branch rulesets and merge-queue required checks in the same pull request. A skipped workflow leaves its checks "Pending" (https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions).

Decision test: for each job or matrix leg added or split out in the diff, find the YAML comment naming its reason. Reject the diff if:

- The job lacks a reason comment.
- Machine is cited for a missing tool rather than runner labels.
- Trust is cited without secrets or permissions the existing job lacks.
- Time is cited without measured repository wait and setup times.
- Jobs are merged or renamed without updating required checks and branch rulesets in the same pull request.

Defect prevented: every unneeded job adds a runner to every workflow run, draws on rate-limited runner-registration capacity, repeats checkout and install, and increases CI billing.

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
