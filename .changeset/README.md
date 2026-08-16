# Changesets

This directory holds change-intent files consumed by pnpm-native workspace
versioning (`pnpm version -r`). One file per change, authored with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- A PR that changes a publishable package's turbo `build` hash MUST ship with
  an intent here — the `changeset-check` workflow compares each package's
  `build` task hash between the PR's pinned base and its head, and blocks the
  PR when a changed hash is not named. The hash is turbo's own verdict: source
  and config files, the manifest, the build command, and dependency-task
  changes all re-hash; a README or lockfile-only edit does not.
- `--bump none` records a change that needs no release. A devDependency-only
  or script-only bump is the canonical `none` class; a `none` on a
  behavior-visible change is the same silent non-release the gate exists to
  catch.
- Edits that re-hash every package at once (a shared `@systemfsoftware/tsconfig`
  file, `turbo.json`, the global `patch-tsgo-if-needed.mjs`, or a file inside a
  nested-workspace fixture under `testResources`) demand an intent per package.
- Catalog value flips in `pnpm-workspace.yaml` change no package hash and are
  outside this verdict — they are reviewed in the release pass instead.
- Intents are consumed (deleted) by `pnpm version -r` when the Release PR lands.
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

See `docs/plans/2026-08-10-003-refactor-pnpm-native-release-migration-plan.md`
for the full release design.
