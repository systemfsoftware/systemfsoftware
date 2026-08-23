# .github/AGENTS.md — CI-failure runbook

Read this file when a check fails, not before.

## Architecture

- **`check:ci` is the single definition of the gate.** `package.json#scripts.check:ci` defines what runs; `.github/workflows/reusable-checks.yml` invokes it. CI workflows enumerate no check steps.
- **`Release` is two-phase pnpm-native.**
  1. `push` to `main`: `pnpm version -r` consumes `.changeset/` intents and opens a Release PR (`changeset-release/main`). The job dispatches CI for the branch via `gh workflow run ci.yml --ref changeset-release/main` so required checks start automatically.
  2. Merge of Release PR: runs `the gate (pnpm check:ci)`, builds, publishes via npm OIDC trusted publishing with provenance, tags `name@v<version>`, and creates a GitHub Release per package from `.changeset/changelogs/`.
- **`changeset-check.yml` enforces release intent.** Fails any PR changing a publishable package's turbo `build` hash without a `.changeset/` intent.

## Local Reproduction

```bash
pnpm check:local   # uncommitted diffs: turbo gate + dprint check + commitlint
pnpm check:ci      # exactly what CI runs (--continue reports all failing tasks)
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
