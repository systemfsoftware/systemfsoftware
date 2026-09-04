# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Architecture

- **`check:ci` and `check:contract` are the two definitions of the gate.** `package.json#scripts.check:ci` defines the container-free gate, `package.json#scripts.check:contract` defines the integration/contract gate; `.github/workflows/reusable-checks.yml` invokes the former, `.github/workflows/reusable-contract.yml` invokes the latter. CI workflows enumerate no check steps. Gate: `pnpm check:ci` / `pnpm check:contract` exit codes.
- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-checks-<sha>`, `turbo-<os>-contract-<sha>`, `turbo-<os>-release-<sha>`). actions/cache keys are immutable: lanes sharing a primary key race, and the faster lane's partial save silently drops the slower lane's entries.
- **`Release` is push-triggered; phase is derived from repository state** by `scripts/tools/plan-release.mjs` (`phase=`):
  1. `publish` — some `name@v<version>` tag is absent from `origin`. Runs both gates, builds, publishes via npm OIDC trusted publishing, tags, creates GitHub Releases.
  2. `version` — pending `.changeset/` intents exist. `pnpm version -r` consumes them and opens the Release PR (`changeset-release/main`), dispatching CI for that branch.
  3. `none` — neither.
- **Owed publishes drain before intents are consumed.** Consuming intents first bumps over an owed version and makes it unreachable with its changelog orphaned. A failed publish leaves tags absent, so the next push re-plans into `publish` and retries only what is owed — never re-trigger a release by hand.
- **A never-published package is deferred, never released** (OIDC cannot debut a package); the remedy is a maintainer's `pnpm publish:unpublished` plus trusted-publisher registration, never CI's.
- **`changeset-check.yml` enforces release intent** via `scripts/guards/check-changeset.ts`: fails if a publishable package's turbo `build` hash changed without an intent, or if any pending intent names a non-live workspace member.

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
