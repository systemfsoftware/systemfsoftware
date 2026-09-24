# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Architecture

- **`check:ci` and `check:contract` are the two definitions of the gate.** `package.json#scripts.check:ci` defines the container-free gate, `package.json#scripts.check:contract` defines the integration/contract gate; `.github/workflows/reusable-checks.yml` invokes the former, `.github/workflows/reusable-contract.yml` invokes the latter. CI workflows enumerate no check steps. Gate: `pnpm check:ci` / `pnpm check:contract` exit codes.
- **Each CI lane owns its turbo cache key prefix** (`turbo-<os>-checks-<sha>`, `turbo-<os>-contract-<sha>`, `turbo-<os>-release-<sha>`). actions/cache keys are immutable: lanes sharing a primary key race, and the faster lane's partial save silently drops the slower lane's entries.
- **`Release` is push-triggered; phase is derived from repository state** by `scripts/tools/plan-release.ts` (`phase=`):
  1. `version` — change-intent stems `.changeset/ledger.yaml` does not record as consumed exist. `pnpm version -r` consumes them and opens the Release PR (`changeset-release/main`), dispatching CI for that branch.
  2. `publish` — workspace versions the npm registry does not yet serve exist. Runs both gates, builds, publishes via npm OIDC trusted publishing, tags, creates GitHub Releases.
  3. `none` — neither.
- **Pending intents win over unpublished versions.** A merge that adds an intent must open the Version PR; publishing first ships it under the previous changelog. An unpublished version number bumped past was never on the registry, so abandoning it costs nothing installable.
- **The release set is a registry fact, not a tag fact.** A package leaves it when its version is published (`scripts/tools/cycle.ts`), never when a tag is written. A killed publish therefore leaves registry 404s that the next push re-plans into `publish` — never re-trigger a release by hand.
- **npm refusing a re-PUT of a version it holds is not a failed release.** npm 404s an accepted upload for minutes while it scans it, so an overlapping run re-publishes; the publish step publishes one package at a time, reads 409 "previously staged version" / 403 "previously published versions" as `held`, and skips tags already at HEAD. Gate: `scripts/tools/publish-set.test.ts`.
- **An intent file is not a pending release.** pnpm unlinks a consumed intent only after the registry confirms its version; `scripts/tools/pending-intents.ts` counts stems absent from `ledger.yaml`, so a surviving `.md` file alone never pins the version phase.
- **A never-published package cannot be released by CI** (OIDC cannot debut one); the remedy is a maintainer's `pnpm publish:unpublished` plus trusted-publisher registration, never CI's.
- **`changeset-check.yml` enforces release intent** via `scripts/guards/check-changeset.ts`: fails if a publishable package's turbo `build` hash changed without an intent, or if any pending intent names a non-live workspace member.
- **`nightly-conformance.yml` explores the nightly budget on a schedule (plus `workflow_dispatch`).** It builds once, then runs the workspace tests with `CONFORMANCE_PROFILE=nightly`; it owns its turbo cache key prefix (`turbo-<os>-nightly-<sha>`).
- **Publishing needs a fresh green nightly on main.** The `nightly-gate` job in `release.yml` runs `scripts/guards/check-nightly-freshness.ts` against the GitHub API and fails when the latest completed nightly run on main is missing, failed, or 48h or older; `publish` sits behind it. With no nightly run yet, publishing stays blocked until a manually started run passes: `gh workflow run nightly-conformance.yml`.

## Local Reproduction

```bash
pnpm check:local      # uncommitted diffs: turbo gate + dprint check + commitlint
pnpm check:ci         # exactly what CI's fast runner runs
pnpm check:contract   # exactly what CI's contract runner runs (needs container runtime)
```

## Failure Runbook

| Failure                                          | Root Cause                                                                                                                | Remedy                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install-deps` fails (`specifiers don't match`)  | `package.json` changed without lockfile update                                                                            | `pnpm install` and commit `pnpm-lock.yaml`                                                                                                                        |
| `api:check` fails                                | Public API surface changed in package with committed golden                                                               | `pnpm --filter <pkg> api:update` and commit `etc/*.api.md`                                                                                                        |
| `format:check` fails                             | Unformatted files in commit                                                                                               | `pnpm format`                                                                                                                                                     |
| `nightly-gate` fails (missing)                   | No nightly run on main yet; publishing has no evidence at the nightly bound                                               | `gh workflow run nightly-conformance.yml`, wait for green, re-run release                                                                                         |
| `nightly-gate` fails (stale)                     | Latest green nightly on main is 48h or older                                                                              | `gh workflow run nightly-conformance.yml`, wait for green, re-run release                                                                                         |
| `nightly-gate` fails (failed)                    | Latest nightly run on main did not pass                                                                                   | Fix the failure, re-run the nightly workflow, then re-run release                                                                                                 |
| Git step exits 128                               | Dirty workspace cascade from prior step                                                                                   | Inspect the first failing step, not the git step                                                                                                                  |
| Log download gives HTTP 403                      | GitHub API restricts log download without push access                                                                     | Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>` and read the step log directly                                                    |
| `guard:projects` fails (`CONFORMANCE-INVENTORY`) | Package owns concurrent/stateful behaviour but is not inventoried, under-declares its primitives, or has no adopted check | Add or fix the entry in `scripts/guards/conformance-inventory.json`, then add the named `*.conformance.test.ts`, smoke-journey `journey`, or `harness` self-suite |
