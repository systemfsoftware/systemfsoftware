# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Reproduce locally

```bash
pnpm check:ci         # everything reusable-checks.yml runs: check:static plus every package's tests
pnpm check:static     # the static-checks job alone (format, lint, typecheck, type tests, attw, build)
pnpm --filter <pkg> test --shard=<i>/<n> --reporter=blob   # one shard of a test job; `test --merge-reports` judges the merged shards
pnpm check:contract   # the contract lane (reusable-contract.yml); needs a container runtime
```

## Standing facts

- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-<lane>-<sha>`). actions/cache keys are immutable: lanes sharing a key race, and the faster lane's partial save silently drops the slower lane's entries.
- **Test jobs are planned from recorded timings.** The `plan` job reads the newest `test-timings-<profile>` artifact from main, or from any branch when main has none, and balances packages over the fewest free `ubuntu-latest` jobs whose loads fit 5 minutes (`scripts/tools/test-timings.ts`). Each job builds first, then runs its packages' tests one at a time (`--only --concurrency=1`), so its wall time is the sum it was planned from and each recorded duration is uncontended. A package over 5 minutes runs as vitest shards, and its `merge` job judges conformance coverage once over the merged shards, failing if a shard's files are missing. The `timings` job records every measured package into this run's `test-timings-<profile>` artifact, so the next run of the same profile re-packs automatically.
- **A lane picks its conformance profile.** A pull request runs `reusable-checks.yml` with `profile: local`; the merge queue and pushes to main run the default `per-change`; `release.yml` gates at `per-change`. `local` runs 25 seeds and one preemption, `per-change` keeps what each check asks for. A local run measures different durations than a per-change one, so timing records are keyed by profile (`test-timings-local` / `test-timings-per-change`) and each lane plans from its own measurements.
- **Mutation runs on main only.** `mutation.yml` triggers on a push to main and on `workflow_dispatch`; a dispatch has no base to diff, so it mutates every target. Pull requests never run mutation.
- **The merge queue is enabled in the `main` ruleset only after this shape is on main.** Every workflow that reports a required check needs the `merge_group` trigger first — `ci.yml` carries it, so the gate and the contract lane report on the queue ref. Enable the queue with strict up-to-date policy off; strict would need a queue whose required checks already run on `merge_group`.
- **Never re-trigger a release by hand.** `scripts/tools/plan-release.ts` derives the phase from registry state, so a killed publish leaves 404s the next push re-plans. npm's 409 "previously staged version" / 403 "previously published versions" means `held`, not failed (`scripts/tools/publish-set.test.ts`).
- **CI cannot debut a package** (OIDC cannot publish a first version): a maintainer runs `pnpm publish:unpublished` and registers the trusted publisher.

## Failure runbook

| Failure                                           | Root cause                                                                                                                                        | Remedy                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api:check` fails                                 | Public API surface changed in a package with a committed golden                                                                                   | `pnpm --filter <pkg> api:update` and commit `etc/*.api.md`                                                                                             |
| `nightly-gate` fails (missing, stale, or failed)  | Publishing needs a green nightly on main under 48h old (`scripts/guards/check-nightly-freshness.ts`)                                              | Fix any nightly failure, then `gh workflow run nightly-conformance.yml`, wait for green, re-run release                                                |
| Git step exits 128                                | Dirty workspace cascading from a prior step                                                                                                       | Inspect the first failing step, not the git step                                                                                                       |
| Log download gives HTTP 403                       | The GitHub API refuses log download without push access                                                                                           | Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>` and read the step log                                                  |
| `guard:projects` fails (`CONFORMANCE-ENROLLMENT`) | A package that forks fibers, holds Queue/Deferred/Ref/Semaphore state, or acquires scoped resources does not run vitest through the shared config | Give it a vitest test script and a config using `defineConfig` from `@systemfsoftware/vitest-config`; its run then reports unexercised primitive sites |
