---
title: "feat: Add CI workflow for bumping all packages by minor version"
date: 2026-07-19
type: plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

## Goal Capsule

- **Objective:** Add a `workflow_dispatch`-triggered CI workflow and companion script that bumps all publishable packages to the next minor version, commits, and publishes — independent of the existing semantic-release per-package flow.
- **Authority:** Single implementer; no external dependencies.
- **Stop conditions:** A GitHub Actions workflow file + script committed to `main` and functional on manual trigger.
- **Execution profile:** One-shot; implement, verify via dry-run or workflow_dispatch, done.
- **Tail ownership:** The script is committed alongside existing `scripts/`. Workflow lives alongside `release.yml`. No monitoring or rotation needed.

---

## Product Contract

### Summary

Add `scripts/bump-all-minor.mjs` — a Node.js script that iterates publishable packages under `packages/`, bumps each minor version, and updates the lockfile. Add a `pnpm bump:minor` script entry. Add `.github/workflows/release-bump-minor.yml` — a `workflow_dispatch` CI workflow that builds, runs the bump, commits, publishes, and pushes.

### Problem Frame

The existing `release.yml` uses `semantic-release` per package, which only releases packages with matching conventional commits since their last tag. There is no way to force-bump all packages to the next minor version — needed for coordinated releases, after major dependency upgrades, or when pre-release cycles require version alignment. The current workaround (cherry-picking through `npm version` on individual packages) is manual and error-prone.

### Requirements

- R1. A script bumps the minor version of every non-private package under `packages/` by incrementing the middle component and resetting patch to 0 (`0.1.0` → `0.2.0`, `1.0.0` → `1.1.0`).
- R2. Private packages (`private: true`) are excluded — neither bumped nor published.
- R3. The lockfile is updated after version changes so workspace cross-references remain consistent.
- R4. A `workflow_dispatch` workflow in CI runs the bump, builds, commits, publishes, and pushes.
- R5. The existing `release.yml` (semantic-release) is unaffected — the new workflow is additive.
- R6. The script logs each bumped package with old → new version.

### Scope Boundaries

- **In scope:** Script, npm script entry, CI workflow file.
- **Deferred to follow-up work:** CHANGELOG generation (no changeset files to consume; the existing semantic-release flow handles per-package changelogs). Auto-tagging per package (existing semantic-release tags `pkg@vX.Y.Z` are preserved; the forced-bump workflow uses a single collective tag).
- **Out of scope:** Touching the existing `scripts/release.mjs`, `scripts/release-monorepo-filter.mjs`, or `release.yml`.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Script, not pnpm built-in.** `pnpm -r version minor` is broken in recursive mode with a version argument (pnpm#11348), skips git commit/tag, and processes private packages. A custom script avoids all three problems and follows the existing `scripts/` pattern.
- **KTD2. Separate workflow file, not dispatch on existing release.yml.** A new file (`release-bump-minor.yml`) isolates the forced-bump concern. The existing `release.yml` stays unchanged and continues to run on every push to `main`.
- **KTD3. Bump separates from publish in the workflow, not in the script.** The script bumps and updates the lockfile. The workflow orchestrates the full pipeline: build → bump → commit → publish → push. This makes the script testable in isolation and lets the workflow drive git operations.
- **KTD4. Single collective tag to avoid collision.** The workflow creates one tag per run (e.g., `bump-minor-<YYYYMMDD>`) instead of per-package tags, avoiding collision with semantic-release's `<pkg>@v<version>` tag format.

### Assumptions

- All 10 publishable packages are at 0.1.0 except `@systemfsoftware/tsconfig` at 1.0.0 — minor bump logic (increment middle, reset patch) works for both.
- `workspace:` protocol in inter-package dependencies resolves correctly at publish time without manual range rewriting.
- The OIDC npm auth pattern from `release.yml` (`id-token: write` + `NPM_CONFIG_PROVENANCE`) is replicated in the new workflow.

### Sources / Research

- Project profile cache (HIT), project-grounding dossier, external-evidence dossier from prior ce-pov run — all covering pnpm version behavior, changesets fit, and the existing semantic-release setup.
- `scripts/release.mjs:79-80` — private-package skip pattern to follow.
- `.github/workflows/release.yml:33-35` — OIDC env vars to replicate.

---

## Implementation Units

### U1. `scripts/bump-all-minor.mjs` — Bump script

- **Goal:** Iterate publishable packages under `packages/`, bump minor version, update lockfile.
- **Requirements:** R1, R2, R3, R6
- **Dependencies:** None.
- **Files:**
  - Create: `scripts/bump-all-minor.mjs`
- **Approach:**
  - Use `readdirSync` + `statSync` to walk `packages/` directories (including nested dirs like `packages/stryker-js/`).
  - For each directory with `package.json`: read manifest, skip if `private: true`.
  - Parse version string: split on `.`, increment index 1 (minor), set index 2 (patch) to 0.
  - Write updated `package.json`.
  - After iterating all packages, `execSync('pnpm install', { cwd: repoRoot })` to update lockfile.
  - Print `name: old → new` per bumped package; exit 0 if any bumped, 0 with "nothing to bump" message if none.
- **Patterns to follow:** `scripts/release.mjs:56-95` (directory walk, private-skip, path handling). `scripts/release.mjs:79-80` (`manifest.private === true` continue).
- **Test scenarios:**
  - Happy path: all 10 publishable packages bumped; `pnpm install` succeeds; lockfile changes.
  - Private exclusion: `oxlint-config`, `vitest-config` unchanged.
  - Nested packages: `packages/stryker-js/` subdirectories discovered and bumped.
  - No packages to bump (hypothetical): exits 0 with message, no crash.
- **Verification:** Run `node scripts/bump-all-minor.mjs` and confirm all 10 publishable `package.json` files show +1 minor version. Run `git diff --stat` confirms lockfile updated.

### U2. Root npm script entry

- **Goal:** Add `"bump:minor": "node scripts/bump-all-minor.mjs"` to root `package.json`.
- **Requirements:** R4
- **Dependencies:** U1
- **Files:**
  - Modify: `package.json` (root)
- **Approach:** Add one line to the `"scripts"` block between existing `"release:dry"` and `"prepare"` entries.
- **Test scenarios:** `pnpm bump:minor` runs without throwing; produces expected output.
- **Verification:** `pnpm bump:minor --dry-run` (run with dry-run flag if added, or just run and inspect output). Revert test versions before committing.

### U3. `.github/workflows/release-bump-minor.yml` — CI workflow

- **Goal:** A `workflow_dispatch` workflow that builds, bumps, publishes, and pushes.
- **Requirements:** R4, R5
- **Dependencies:** U2
- **Files:**
  - Create: `.github/workflows/release-bump-minor.yml`
- **Approach:**
  - Trigger: `workflow_dispatch`.
  - Permissions: `contents: write`, `id-token: write`.
  - Steps:
    1. `actions/checkout@v4` with `fetch-depth: 0`.
    2. `pnpm/action-setup@v4` + `actions/setup-node@v4` (node 24, pnpm cache).
    3. `pnpm install --frozen-lockfile` — ensures clean deps before build.
    4. `pnpm build` — validates tree compiles before version bump.
    5. `pnpm bump:minor` — runs script, modifies package.json files + lockfile.
    6. `git add -A && git commit -m "chore(release): bump all packages to minor"` — single commit for all bumps.
    7. `git tag "bump-minor-$(date +%Y%m%d-%H%M%S)"` — single tag, no collision with semantic-release tags.
    8. `pnpm -r --filter='!@systemfsoftware/oxlint-config' --filter='!@systemfsoftware/vitest-config' publish --no-git-checks --access public` — publishes only non-private packages.
    9. `git push --follow-tags` — pushes commit + tag.
  - Environment: `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, `NPM_CONFIG_PROVENANCE: "true"`.
- **Patterns to follow:** `.github/workflows/release.yml` — same checkout, setup, pnpm install, build, and OIDC env setup.
- **Test scenarios:**
  - Happy path: trigger via workflow_dispatch; all 10 packages published; single commit on main; single tag.
  - Idempotent re-run: second trigger bumps from 0.2.0 to 0.3.0, etc.
  - No tag collision: `bump-minor-*` tags do not overlap with `*-@v*` semantic-release tags.
- **Verification:** After merge to main, trigger workflow_dispatch from GitHub UI. Confirm all packages publish, new commit appears, tag appears in tags list.

---

## Verification Contract

```bash
# 1. Script runs standalone (revert test changes before trying alternative methods below)
node scripts/bump-all-minor.mjs

# 2. npm script works (alternative to step 1 — same script, confirming npm entry)
#    Revert package.json and lockfile changes before running this step.
pnpm bump:minor

# 3. Lockfile regenerated (run after either step 1 or 2, before reverting)
git diff --stat -- pnpm-lock.yaml  # should show changes
```

After merging the workflow file, a live test via GitHub UI `workflow_dispatch` is the definitive check.

---

## Definition of Done

- `scripts/bump-all-minor.mjs` exists, bumps all 10 publishable packages, skips 2 private, updates lockfile.
- Root `package.json` has `"bump:minor": "node scripts/bump-all-minor.mjs"` script entry.
- `.github/workflows/release-bump-minor.yml` exists, triggers on `workflow_dispatch`, runs full build → bump → publish → push pipeline.
- Existing `release.yml`, `scripts/release.mjs`, and `scripts/release-monorepo-filter.mjs` are untouched.
- A manual `workflow_dispatch` on the merged workflow produces a successful run with all packages published and a single commit + tag on `main`.
