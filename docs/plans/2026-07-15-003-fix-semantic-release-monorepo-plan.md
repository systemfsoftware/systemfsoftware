---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "fix: Repair semantic-release for nested and scoped packages"
date: 2026-07-15
---

# fix: Repair semantic-release for nested and scoped packages

## Summary

The repository already has a semantic-release router (`scripts/release.mjs`), but it only discovers top-level packages under `packages/` and crashes on `packages/stryker-js/` because that directory has no `package.json`. Additionally, `@systemfsoftware/stryker-js-core` and `@systemfsoftware/stryker-js-typescript-checker` were manually published to npm at `0.1.0` without the corresponding `<package>@v0.1.0` git tags, so semantic-release cannot determine their next version. This plan fixes package discovery, backfills the missing tags, verifies with a dry run, and executes the release.

## Problem Frame

- `pnpm release:dry` currently fails with `ENOENT: .../packages/stryker-js/package.json`.
- The workspace declares nested packages via `pnpm-workspace.yaml`: `packages/stryker-js/*`.
- Two published packages lack git tags, breaking semantic-release's version baseline.
- `@systemfsoftware/stryker-plugins` has unreleased commits since `stryker-plugins@v0.1.0` and needs a bump.

## Requirements

1. `scripts/release.mjs` discovers packages at any depth under `packages/` that contain a `package.json` with `private !== true`.
2. Tag format for nested packages is unambiguous (e.g. `stryker-js/core@vX.Y.Z`).
3. Missing tags `stryker-js/core@v0.1.0` and `stryker-js/typescript-checker@v0.1.0` are created at the commit that was published.
4. `pnpm release:dry` completes without errors and reports expected next versions.
5. `pnpm release` (or CI) publishes the bumped packages.

## Key Technical Decisions

- **Nested tag format:** Use the repo-relative path under `packages/` as the tag prefix (`stryker-js/core@vX.Y.Z`). This is unambiguous and consistent with top-level tags like `effect-daemon-spec@v0.1.0`.
- **Tag backfill target:** The published npm tarballs for `stryker-js-core` and `stryker-js-typescript-checker` were created at `2026-07-15 21:42Z` and `21:44Z`; the matching workspace commit is `e85a7b47c chore: make stryker-js-core publishable with public access` (`2026-07-15 21:43:10Z`). Tags will point there.
- **Release execution:** Run locally with `pnpm release` after `npm login` verification, or push tags and let `.github/workflows/release.yml` publish over OIDC.

## Scope Boundaries

### In Scope

- Fix `scripts/release.mjs` nested package discovery.
- Backfill missing git tags.
- Verify with `pnpm release:dry`.
- Execute release for `@systemfsoftware/stryker-plugins` and any packages with releasing commits.

### Out of Scope

- Rewriting the release workflow to match paritytech/identity-backend-community exactly (only scoped-package discovery/tagging is borrowed).
- Changing commitlint or conventional-commit rules.
- First-time npm package bootstrap (packages already exist on npm).

### Deferred to Follow-Up Work

- Adopting a third-party monorepo release tool if the owned router proves insufficient.

## Implementation Units

### U1. Fix package discovery in `scripts/release.mjs`

**Goal:** Make the release script traverse nested package directories and use path-based tag formats.

**Files:**

- `scripts/release.mjs`

**Approach:**

- Replace the single-level `readdirSync` scan with a recursive walk that collects every `package.json` under `packages/`.
- For each package, derive `relativePath` from `packages/` (e.g. `stryker-js/core`).
- Filter out `private: true` packages.
- Use `relativePath` as the `cwd` and as the `tagFormat` prefix (`${relativePath}@v${version}`).

**Test scenarios:**

- `pnpm release:dry` no longer throws `ENOENT` for `packages/stryker-js/package.json`.
- Output lists all publishable packages including `stryker-js/core` and `stryker-js/typescript-checker`.

**Verification:** `pnpm release:dry` runs to completion.

### U2. Backfill missing git tags for published Stryker packages

**Goal:** Create the git tags that semantic-release expects for the already-published `0.1.0` versions.

**Files:**

- Git tags (no source file change)

**Approach:**

- Create `stryker-js/core@v0.1.0` and `stryker-js/typescript-checker@v0.1.0` pointing to `e85a7b47c`.
- Push tags to origin.

**Test scenarios:**

- `git tag -l 'stryker-js/*@v*'` shows both tags.
- `pnpm release:dry` now reports "no release" for these two packages (no commits since the tag).

**Verification:** Dry run recognizes the tags and does not attempt a `0.1.0` release.

### U3. Verify release outcomes with dry run

**Goal:** Confirm semantic-release computes the expected next versions before publishing.

**Files:**

- None (verification step)

**Approach:**

- Run `pnpm release:dry`.
- Inspect output for each package; expect `stryker-plugins` to bump (likely `0.2.0` because of `feat(stryker-js): wire consumer packages to forked core`).

**Test scenarios:**

- No package fails to load or analyze.
- `stryker-plugins` shows a version bump.

**Verification:** Dry run output is clean and shows intended versions.

### U4. Execute the release

**Goal:** Publish the bumped packages to npm and create GitHub releases.

**Files:**

- `package.json` files (version fields updated by semantic-release)
- Git tags created by semantic-release

**Approach:**

- Ensure npm authentication (`npm login` or `NPM_TOKEN`).
- Run `pnpm release`.
- Alternatively, push the backfilled tags and the script fix to `main` and let `.github/workflows/release.yml` run.

**Test scenarios:**

- New versions appear on npm for bumped packages.
- New tags appear on GitHub.

**Verification:** `npm view @systemfsoftware/stryker-plugins` shows the new version.

## Verification Contract

1. `pnpm release:dry` exits 0 with no ENOENT errors.
2. `git tag -l 'stryker-js/*@v0.1.0'` returns two tags.
3. `pnpm release` (or CI) publishes new versions and creates GitHub releases.

## Definition of Done

- `scripts/release.mjs` supports nested packages.
- Missing `v0.1.0` tags exist for `stryker-js/core` and `stryker-js/typescript-checker`.
- `pnpm release:dry` is clean.
- `@systemfsoftware/stryker-plugins` is bumped and published.
- New git tags and GitHub releases are created.

## Open Questions

- Should releases run locally now, or should the fix be pushed to `main` and published by CI? (Default: push to `main` unless local npm auth is confirmed.)

## Sources & Research

- `pnpm-workspace.yaml` — defines `packages/stryker-js/*` as workspace members.
- `scripts/release.mjs` — current release router with single-level discovery.
- `scripts/release-monorepo-filter.mjs` — commit filtering uses `context.cwd`, so nested `cwd` is compatible.
- `CONTRIBUTING.md` — describes OIDC publishing and one-time bootstrap.
- `git tag -l '*@v*'` — showed missing tags for `stryker-js-core` and `stryker-js-typescript-checker`.
- npm registry metadata confirmed `stryker-js-core@0.1.0` and `stryker-js-typescript-checker@0.1.0` exist.
