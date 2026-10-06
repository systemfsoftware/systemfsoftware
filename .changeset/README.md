# Changesets

This directory holds change-intent files consumed by pnpm-native workspace
versioning (`pnpm version -r`). One file per change, authored with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- A PR that changes a publishable package's turbo `build` hash MUST ship with
  an intent here — the `changeset-check` workflow compares each package's
  `build` task hash between the PR's pinned base and the run's checked-out
  head tree, and blocks the PR when a changed hash is not named. The hash is
  turbo's own verdict: source and config files, the manifest, the build
  command, and dependency-task changes all re-hash; a README or lockfile-only
  edit does not.
- `--bump none` records a change that needs no release. A devDependency-only
  or script-only bump is the canonical `none` class; a `none` on a
  behavior-visible change is the same silent non-release the gate exists to
  catch.
- Edits that re-hash every package at once (a shared `@systemfsoftware/tsconfig`
  file, `turbo.json`, the global `patch-tsgo-if-needed.mjs`, or a file inside a
  nested-workspace fixture under `testResources`) demand an intent per package.
- Catalog value flips in `pnpm-workspace.yaml` change no package hash and are
  outside this verdict — they are reviewed in the release pass instead.
- Intents are consumed by `pnpm version -r` when the Release PR lands:
  consumption is recorded in `ledger.yaml`. A present intent file alone never
  implies a pending release — count only stems absent from the ledger
  (`scripts/tools/pending-intents.ts`).
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

## Two-stage intent deletion

pnpm unlinks a consumed intent only once the version it produced is released
(its `<pkg>@vX.Y.Z` git tag exists). The cycle is:

1. **Version PR.** `pnpm version -r` consumes pending intents, writes
   `.changeset/changelogs/<pkg>@<ver>.md`, and records stems in `ledger.yaml`.
   The new versions carry no git tag yet, so the intent `.md` files stay on disk.
2. **Release.** The Version PR merges; CI builds, writes the git tags, and cuts
   the GitHub Releases.
3. **Next version PR.** The next `pnpm version -r` scans
   `.changeset/changelogs/`, deletes the changelog files for versions that are
   now tagged, and unlinks the intent `.md` files whose releases are all tagged.

If `.changeset/changelogs/` is deleted out of band before that confirmation,
the matching intent files become permanent orphans: there is nothing left to
reconcile, so they are never unlinked. Remove those stems by hand only after the
ledger already records them and the versions are already tagged + released.

`.changeset/changelogs/` must stay tracked in git. It is the release notes'
source: adding it to `.gitignore` leaves the release checkout without a body
and the GitHub Release assert fails. When the file is missing there,
`scripts/tools/cycle.ts#ensureChangelog` rebuilds the section from `ledger.yaml`
and the intent bodies it names.

## Release planning

`scripts/tools/plan-release.ts` derives the phase for every push to `main` from two
numbers, never from a `pull_request: closed` event:

- `owed` — workspace versions that carry no `<pkg>@vX.Y.Z` git tag yet. Git
  truth: the tag is written when a version is tagged and its GitHub Release is
  cut (`scripts/tools/cycle.ts`).
- `pending` — intent stems `ledger.yaml` does not record as consumed.

`scripts/tools/release-phase.ts` decides: pending intents win (`version`), then
untagged versions (`release`), then `none`. A merge that adds an intent must
open the Version PR; releasing first would tag and cut a release under the
previous changelog.

## Interruption safety

The Release workflow concurrency group is `release-${{ github.ref }}` with
`cancel-in-progress: false`. Pushes to `main` queue; they never cancel an
in-flight release run.

- An interrupted **version** job is safe: it only commits on the isolated
  `changeset-release/main` branch and opens or updates a PR; `main` is
  untouched.
- An interrupted **release** job is safe: a version with no tag reads as still
  owed, so a killed release remains in `owed` on the next run, and tagging +
  GitHub Releases skip any version already tagged.

Distribution is this repository's Nix flake outputs consumed from a git ref
(pinned by `flake.lock` rev + narHash, run in a bubblewrap sandbox), not an npm
registry. The release path writes a git tag and a GitHub Release for each
unreleased version and nothing more — there is no npm token, no OIDC trusted
publishing, and no registry to bootstrap.
