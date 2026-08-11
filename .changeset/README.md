# Changesets

This directory holds change-intent files consumed by pnpm-native workspace
versioning (`pnpm version -r`). One file per change, authored with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- Every change to a publishable package (`packages/**`) MUST ship with an intent
  here — the `changeset-check` workflow blocks a PR that touches a publishable
  package without one.
- `--bump none` records a change that needs no release. Use it only for
  genuinely non-releasable touches; a `none` on a behavior-visible change is the
  same silent non-release the gate exists to catch.
- Intents are consumed (deleted) by `pnpm version -r` when the Release PR lands.
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

See `docs/plans/2026-08-10-003-refactor-pnpm-native-release-migration-plan.md`
for the full release design.
