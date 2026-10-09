# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Reproduce locally

```bash
pnpm check:ci         # everything reusable-checks.yml runs: check:static plus every package's tests
pnpm check:static     # the static-checks job alone (format, lint, typecheck, type tests, attw, build)
pnpm --filter <pkg> test --shard=<i>/<n>   # one shard of a test job
```

## Standing facts

- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-<lane>-<sha>`). actions/cache keys are immutable: lanes sharing a key race, and the faster lane's partial save silently drops the slower lane's entries.
- **Test jobs are planned from recorded timings.** The `plan` job reads the newest `test-timings-<profile>` artifact from main, or from any branch when main has none, and balances packages over the fewest free `ubuntu-latest` jobs whose loads fit 5 minutes (`scripts/tools/test-timings.ts`). Each job builds first, then runs its packages' tests one at a time (`--only --concurrency=1`), so its wall time is the sum it was planned from and each recorded duration is uncontended. A package over 5 minutes runs as vitest shards. The `timings` job records every measured package into this run's `test-timings-<profile>` artifact, so the next run of the same profile re-packs automatically.
- **`reusable-checks.yml` is shared with other repositories.** Consumers call it pinned by commit SHA. Everything specific to this repository is in its inputs (set in `ci.yml`) and in `.github/actions/checks-lane`, the composite action every job calls once per phase (`plan`, a lint lane's id, `test`, `test-after`, `timings`, `gate`). To change this repository's steps, edit that action; to change the shape, edit the workflow and keep its inputs backward compatible for pinned callers.
- **A lane picks its conformance profile.** A pull request runs `reusable-checks.yml` with `profile: local`, which also exports `VITEST_LANE=pr`: the shared vitest config then leaves out every package's `conformance` project. The merge queue and pushes to main run the default `per-change` with every project; `release.yml` gates at `per-change`. `local` runs 25 seeds and one preemption, `per-change` keeps what each check asks for. A local run measures different durations than a per-change one, so timing records are keyed by profile (`test-timings-local` / `test-timings-per-change`) and each lane plans from its own measurements.
- **Mutation jobs are planned from recorded timings, on main only.** `mutation.yml` triggers on a push to main and on `workflow_dispatch`; pull requests never run mutation. Its `plan` job reads main's newest `mutation-timings` artifact and packs every package with a `mutation` script into free `ubuntu-latest` jobs whose loads fit 15 minutes (`scripts/tools/test-timings.ts --task mutation`). A package over 15 minutes splits into shards: `STRYKER_SHARD=<k>/<n>` makes its `shardMutate` (`@systemfsoftware/stryker-config`) negate every file another shard owns. `scripts/tools/mutation-job.ts run` runs a job's packages one at a time, each capped at 30 minutes and all within a 60-minute job budget that stays under the runner timeout, and records each duration as it finishes. A capped or failed run records only a lower bound: it can raise a package's duration, so the next plan splits it further, but never lower it, so a run that crashes in its first second cannot pack every package into one job; a package the budget no longer covers is skipped and fails the job. `mutation-job.ts combine` folds a package's shard reports into one merge part and refuses two shards that mutated the same file. Stryker's incremental files travel between runs in one shared `stryker-incremental-*` cache; turbo does not cache mutation.
- **The merge queue is enabled in the `main` ruleset only after this shape is on main.** Every workflow that reports a required check needs the `merge_group` trigger first — `ci.yml` carries it, so the gate reports on the queue ref. Enable the queue with strict up-to-date policy off; strict would need a queue whose required checks already run on `merge_group`.
- **Never re-trigger a release by hand.** `scripts/tools/plan-release.ts` derives the phase from repository state, so a killed release leaves untagged versions the next push re-plans. Tagging and GitHub Releases are idempotent — a version whose `<pkg>@vX.Y.Z` git tag already exists is skipped (`scripts/tools/cycle.ts`, `scripts/tools/tag-released-packages.ts`).
- **There is no registry.** These packages are distributed as this repo's Nix flake outputs consumed from a git ref (pinned by `flake.lock` rev + narHash, bwrap-sandboxed), not published to npm. The release path writes a git tag and a GitHub Release per unreleased version — no npm token, no OIDC, no trusted publisher to configure.

## Failure runbook

| Failure                     | Root cause                                                      | Remedy                                                                                                |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `api:check` fails           | Public API surface changed in a package with a committed golden | `pnpm --filter <pkg> api:update` and commit `etc/*.api.md`                                            |
| Git step exits 128          | Dirty workspace cascading from a prior step                     | Inspect the first failing step, not the git step                                                      |
| Log download gives HTTP 403 | The GitHub API refuses log download without push access         | Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>` and read the step log |
