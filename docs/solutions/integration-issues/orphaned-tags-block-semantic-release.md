---
title: "Orphaned git tags from force-push crash semantic-release"
date: 2026-07-20
category: docs/solutions/integration-issues/
module: release
problem_type: integration_issue
component: tooling
symptoms:
  - "semantic-release crashes with `fatal: tag 'effect-schema-extensions@v0.4.0' already exists`"
  - "CI publish step fails with HTTP 409 Conflict when npm already has the version published"
  - "Three packages silently skip their intended release after a force-push to main"
root_cause: missing_tooling
resolution_type: tooling_addition
severity: high
tags:
  - semantic-release
  - git-tags
  - force-push
  - monorepo
  - ci-pipeline
---

# Orphaned git tags from force-push crash semantic-release

## Problem

After a force-push to `main`, three packages in the monorepo — `effect-schema-extensions`, `hex-schema`, and `effect-schema-law` — had their release tags point at commits that were no longer in `main`'s ancestry. semantic-release's per-package loop ran without detecting this, computed the same version numbers as the orphaned tags, and crashed when `@semantic-release/git` tried to create tags that already existed (just not in the reachable history).

The user-visible impact was a broken CI release pipeline: no packages were released that cycle, and the CI job exited with a non-zero code, blocking the release entirely.

- The filter plugin (`scripts/release-monorepo-filter.mjs`, lines 9–17) uses `git diff-tree --name-only` to scope commits to a package's path prefix — this correctly filters commits per package but has no awareness of tag reachability

- CI job fails with `fatal: tag 'effect-schema-extensions@v0.4.0' already exists` (or `hex-schema@v1.1.1`, `effect-schema-law@v0.3.1` depending on package order)
- The release loop runs in `scripts/release.mjs` (lines 117–131), calling `semanticRelease()` in a `try/catch` per package, but when `@semantic-release/git` throws at the tag-creation step, the error propagates and the whole script fails
- The filter plugin (`scripts/release-monorepo-filter.mjs`, lines 9–17) uses `git diff-tree --name-only` to scope commits to a package's path prefix — this correctly filters commits per package but has no awareness of tag reachability
- `git tag --merged main` correctly returns only reachable tags, so the orphaned tags are invisible to semantic-release's tag-discovery step
- semantic-release falls back to the last _reachable_ tag (e.g. `effect-schema-extensions@v0.3.0`), sees new `feat` or `fix` commits since then, and computes `v0.4.0` — the same version as the orphaned tag
- `pnpm version v0.4.0` succeeds with `--allow-same-version`, `@semantic-release/git` commits the version bump, and then the tag-creation step fails because a tag with that name already exists at a different commit

## What Didn't Work

**Deleting the orphaned remote tags.** Removing `effect-schema-extensions@v0.4.0` from the remote would let semantic-release recreate it — but `v0.4.0` has already been published to npm. The `publishCmd` in `release.mjs` (`pnpm publish --no-git-checks --access public`) would then fail with a 409 Conflict because npm already has an `effect-schema-extensions@0.4.0` tarball. Deleting the remote tag alone does not un-publish the npm artifact.

**Moving the orphaned tags to reachable commits.** You can `git tag -f` to relocate a tag, but that requires a force-push of the tag to the remote. Tag force-pushes are destructive and can confuse other CI systems, other developers' local repos, and any downstream consumer that has pinned to a specific commit. It also requires coordinating the tag force-push with a re-publish step — and `pnpm publish` would still fail since the version is already on npm.

**Rerunning the release pipeline without changes.** Without any fix, the same tag-exists error reproduces exactly because the underlying reachability problem is unchanged.

## Solution

For the three affected packages, we bumped the patch version so the next release tag would be a fresh version number not yet present on npm:

| Package                    | Old orphaned tag                  | New reachable tag                 | New version |
| -------------------------- | --------------------------------- | --------------------------------- | ----------- |
| `effect-schema-extensions` | `effect-schema-extensions@v0.4.0` | `effect-schema-extensions@v0.4.1` | `0.4.1`     |
| `effect-schema-law`        | `effect-schema-law@v0.3.1`        | `effect-schema-law@v0.3.2`        | `0.3.2`     |
| `hex-schema`               | `hex-schema@v1.1.1`               | `hex-schema@v1.1.2`               | `1.1.2`     |

We ran `pnpm version` in each package's directory with `--no-git-tag-version` (so it would not attempt to tag, which would fail since the tag name already exists under a different commit) and committed the result. The single commit `29c01e161 chore(release): bump past orphaned tags` carries all three version bumps. The new patch tags were then pushed to the remote normally:

```bash
git tag effect-schema-extensions@v0.4.1 29c01e161
git tag effect-schema-law@v0.3.2 29c01e161
git tag hex-schema@v1.1.2 29c01e161
git push origin effect-schema-extensions@v0.4.1 effect-schema-law@v0.3.2 hex-schema@v1.1.2
```

This was verified by confirming that all three new tags are now reachable via `main`:

```bash
$ git tag --merged main -l 'effect-schema-extensions@v0.4.1'
effect-schema-extensions@v0.4.1
$ git tag --merged main -l 'effect-schema-law@v0.3.2'
effect-schema-law@v0.3.2
$ git tag --merged main -l 'hex-schema@v1.1.2'
hex-schema@v1.1.2
```

And that the package.json files reflect the new versions:

```bash
$ node -p "require('./packages/effect-schema-extensions/package.json').version"
0.4.1
$ node -p "require('./packages/effect-schema-law/package.json').version"
0.3.2
$ node -p "require('./packages/hex-schema/package.json').version"
1.1.2
```

The orphaned tags (`effect-schema-extensions@v0.4.0`, `effect-schema-law@v0.3.1`, `hex-schema@v1.1.1`) still exist locally and on the remote but point at commits outside `main`'s history. They are harmless as long as no one tries to re-release those versions — npm already holds the published artifacts.

## Why This Works

semantic-release uses `git tag --merged <branch>` to find the latest reachable tag before analyzing commits. When a tag is orphaned (its commit is not an ancestor of `main`), it is invisible to this query. semantic-release then falls back to the last _reachable_ tag and analyzes all commits since then. If those commits warrant a version bump to the same number as the orphaned tag, `@semantic-release/git` tries to create a tag with the same name and crashes.

Bumping the patch version sidesteps this entirely: the new tag name (`v0.4.1`) is distinct from the orphaned tag name (`v0.4.0`), so there is no name collision. npm accepts the publish because `0.4.1` has never been published before. The orphaned tags remain but are harmless — they are unreachable from any branch ref, so future `git tag --merged` queries will never surface them.

## Prevention

**Do not force-push `main` after release tags have been created.** A force-push rewrites history and orphans any tags whose commits are in the rewritten portion. This is the root cause of the problem. Coordinate release windows so that main is stable (no force-push) from the time a release tag is created until the release pipeline has fully completed.

**If a force-push is unavoidable, also force-delete the orphaned remote tags.** Run `git push origin --delete <tag>` for every orphaned tag _before_ the next release pipeline runs. This is safe because the npm artifact already exists for those versions — deleting the _git tag_ does not delete the npm artifact. Without the orphaned git tag, semantic-release will see no prior tag, analyze all commits since the start of the repo, and correctly compute the next version. It will recreate the tags at new commits.

**Harden the release loop to handle tag-exists errors gracefully (future improvement).** In `scripts/release.mjs`, the `catch` block increments a `failed` counter but does not distinguish between a transient error (like tag-exists) and a real release failure. The loop could be extended to detect `"already exists"` in `error.message`, skip the package with a warning, and continue to the next package so that one orphaned-tag package does not crash the entire monorepo release.

**Consider a pre-flight check in CI.** Before running semantic-release, CI could verify that all existing tags for the current branch are reachable via that branch, and fail loudly if any are orphaned:

```bash
for tag in $(git tag --merged main); do
  git merge-base --is-ancestor $(git rev-parse "$tag") main || {
    echo "ERROR: tag $tag is not reachable from main — force-push detected"
    exit 1
  }
done
```

This would catch the problem earlier, before semantic-release has done any work.

## Related Issues

- Commit `29c01e161` — the fix commit: `chore(release): bump past orphaned tags`
- `scripts/release.mjs` — the release loop that invokes semantic-release per package
- `scripts/release-monorepo-filter.mjs` — the filter plugin that scopes commits per package
- npm registry: `effect-schema-extensions@0.4.0`, `hex-schema@1.1.1`, `effect-schema-law@0.3.1` — already published; these versions cannot be re-released without a version bump
