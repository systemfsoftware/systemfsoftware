# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

You are editing an enforcement instrument. Read the vendored `ENFORCEMENT.md` before this lands.

## Reproduce locally

```bash
pnpm check:ci         # everything reusable-checks.yml runs: check:static plus every package's tests
pnpm check:static     # the static-checks job alone (format, lint, typecheck, type tests, attw, build)
pnpm --filter <pkg> test --shard=<i>/<n>   # one shard of a test job
```

## Standing facts

- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-<lane>-<sha>`). actions/cache keys are immutable: lanes sharing a key race, and the faster lane's partial save silently drops the slower lane's entries.
- **Test jobs are planned from recorded timings.** The `plan` job reads the newest `test-timings-<profile>` artifact from main, or from any branch when main has none, and balances packages over the fewest free `ubuntu-latest` jobs whose loads fit 5 minutes (`scripts/tools/test-timings.ts`). Each job builds first, then runs its packages' tests one at a time (`turbo run test --concurrency=1`), so its wall time is the sum it was planned from and each recorded duration is uncontended. The test run keeps the builds in its graph, never `--only`, so each test key carries every dependency's build hash; the builds are cache hits after the build step. A package over 5 minutes runs as vitest shards. The `timings` job records every measured package into this run's `test-timings-<profile>` artifact, so the next run of the same profile re-packs automatically.
- **`reusable-checks.yml` is shared with other repositories.** Consumers call it pinned by commit SHA. Everything specific to this repository is in its inputs (set in `ci.yml`) and in `.github/actions/checks-lane`, the composite action every job calls once per phase (`plan`, a lint lane's id, `test`, `test-after`, `timings`, `gate`). To change this repository's steps, edit that action; to change the shape, edit the workflow and keep its inputs backward compatible for pinned callers.
- **A lane picks its conformance profile.** A pull request runs `reusable-checks.yml` with `profile: local`; the merge queue and pushes to main run the default `per-change`; `release.yml` gates at `per-change`. Every lane runs every test file of every package: no lane leaves a test out by its name or location (`CONST-T12`). `local` runs 25 seeds and one preemption, `per-change` keeps what each check asks for. A local run measures different durations than a per-change one, so timing records are keyed by profile (`test-timings-local` / `test-timings-per-change`) and each lane plans from its own measurements.
- **Mutation runs per project with the installed `stryker` CLI, on main only.** `mutation.yml` triggers on a push to main and on `workflow_dispatch`; pull requests never run mutation. Per project: `stryker plan` sized to 900 s shards from recorded per-mutant `costs`, or, for a project with no incremental record, from main's measured seconds per mutant in `.github/mutation-seed-costs.json` (main's slowest rate when main never measured it). The plan job fails before any batch starts when a planned shard exceeds 900 s, naming the project and its cost source. Then one `coverage` dry run reused by every shard, `shard` jobs, then `merge` and `gate --baseline mutation-baseline.json`; single-shard projects run in `batch` jobs. Only the `report` job saves the `stryker-incremental-<run_id>` cache the next plan reads. Source of truth: `.github/workflows/mutation.yml`.
- **The merge queue is enabled in the `main` ruleset only after this shape is on main.** Every workflow that reports a required check needs the `merge_group` trigger first — `ci.yml` carries it, so the gate reports on the queue ref. Enable the queue with strict up-to-date policy off; strict would need a queue whose required checks already run on `merge_group`.
- **Never re-trigger a release by hand.** `scripts/tools/plan-release.ts` derives the phase from repository state, so a killed release leaves untagged versions the next push re-plans. Tagging and GitHub Releases are idempotent — a version whose `<pkg>@vX.Y.Z` git tag already exists is skipped (`scripts/tools/cycle.ts`, `scripts/tools/tag-released-packages.ts`).
- **There is no registry.** These packages are distributed as this repo's Nix flake outputs consumed from a git ref (pinned by `flake.lock` rev + narHash, bwrap-sandboxed), not published to npm. The release path writes a git tag and a GitHub Release per unreleased version — no npm token, no OIDC, no trusted publisher to configure.

## Failure runbook

| Failure                     | Root cause                                                      | Remedy                                                                                                |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `api:check` fails           | Public API surface changed in a package with a committed golden | `pnpm --filter <pkg> api:update` and commit `etc/*.api.md`                                            |
| Git step exits 128          | Dirty workspace cascading from a prior step                     | Inspect the first failing step, not the git step                                                      |
| Log download gives HTTP 403 | The GitHub API refuses log download without push access         | Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>` and read the step log |
