# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Architecture

- **`check:ci` and `check:contract` are the two definitions of the gate.** `package.json#scripts.check:ci` defines the container-free gate, `package.json#scripts.check:contract` defines the integration/contract gate; `.github/workflows/reusable-checks.yml` invokes the former, `.github/workflows/reusable-contract.yml` invokes the latter. CI workflows enumerate no check steps. Gate: `pnpm check:ci` / `pnpm check:contract` exit codes.
- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-checks-<sha>` in `reusable-checks.yml`, `turbo-<os>-contract-<sha>` in `reusable-contract.yml`). actions/cache keys are immutable, so lanes sharing a primary key race: the faster contract lane's partial save claims the key and the gate's lint/test entries are silently dropped — every non-build task then misses on every run.
- **`Release` is push-triggered and phase is derived from repository state.** Every phase hangs off `push` to `main`; nothing hangs off a pull-request event, because merging the Release PR with branch deletion destroys `refs/pull/<n>/merge` and GitHub cancels the queued run with zero jobs. `scripts/tools/plan-release.mjs` reads durable state instead and prints `phase=`:
  1. `publish` — some `name@v<version>` tag is absent from `origin`. Runs both gates (`pnpm check:ci` + `pnpm check:contract`), builds, publishes via npm OIDC trusted publishing with provenance, tags, and creates a GitHub Release per package from `.changeset/changelogs/`.
  2. `version` — nothing owed, but pending `.changeset/` intents exist. `pnpm version -r` consumes them and opens a Release PR (`changeset-release/main`). The job dispatches CI for the branch via `gh workflow run ci.yml --ref changeset-release/main` so required checks start automatically.
  3. `none` — neither.

  Owed publishes drain first, deliberately. Both conditions can hold at once, and consuming intents first destroys the owed release: `pnpm version -r` bumps over it, so the owed version stops being any package's local version, drops out of the this-cycle set, and becomes unreachable with its authored changelog orphaned. Draining only delays intent consumption to the next push.

  Merging the Release PR is itself a push to `main`, so it re-plans into `publish`. A publish that fails leaves the tags absent, so the next push re-plans into `publish` and retries only what is still owed. Never re-trigger a release by hand.
- **A never-published package is deferred, never released.** OIDC cannot debut a package, so the publish job excludes it from publish, tag and release — and the `plan` job subtracts it from the owed set, because counting a package this pipeline can never release would pin the phase at `publish` forever and starve every pending intent. The run still ends red naming it; the remedy is a maintainer's (`pnpm publish:unpublished`, then register the trusted publisher), never CI's.
- **`changeset-check.yml` enforces release intent.** Fails any PR changing a publishable package's turbo `build` hash without a `.changeset/` intent.

## Local Reproduction

```bash
pnpm check:local      # uncommitted diffs: turbo gate + dprint check + commitlint
pnpm check:ci         # exactly what CI's fast runner runs
pnpm check:contract   # exactly what CI's contract runner runs (needs container runtime)
```

## Failure Runbook

| Failure                                         | Root Cause                                                      | Remedy                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `install-deps` fails (`specifiers don't match`) | `package.json` changed without lockfile update                  | `pnpm install` and commit `pnpm-lock.yaml`                                                                     |
| `api:check` fails                               | Public API surface changed in package with committed golden     | `pnpm --filter <pkg> api:update` and commit `etc/*.api.md`                                                     |
| `format:check` fails                            | Unformatted files in commit                                     | `pnpm format`                                                                                                  |
| `Failed to find tsgolint executable`            | Missing `oxlint-tsgolint` peer in package using type-aware lint | Ensure `@systemfsoftware/oxlint-config` provides it transitively                                               |
| `//#check:*` guard fails                        | Guard invariant violated                                        | Run the named script directly; stderr prints the remedy                                                        |
| Git step exits 128                              | Dirty workspace cascade from prior step                         | Inspect the first failing step, not the git step                                                               |
| Log download gives HTTP 403                     | GitHub API restricts log download without push access           | Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>` and read the step log directly |
