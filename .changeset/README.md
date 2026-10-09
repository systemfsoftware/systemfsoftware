# Changesets

This directory holds change-intent files consumed by the shared release tooling
([`pnpm-release-management`](https://github.com/systemfsoftware/pnpm-release-management)),
configured in [`release.jsonc`](../release.jsonc). One file per change, authored
with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- An intent's frontmatter names each package and its bump,
  `"<pkg>": <none|patch|minor|major>`. Its body is the changelog entry, published
  verbatim in the release notes.
- A PR that changes a publishable package's turbo `build` hash MUST ship with
  an intent here. The Changeset Check workflow runs
  `changeset-management check` against the PR's base and blocks the PR when a
  changed hash is not named (`release.jsonc` `gate`). The hash is turbo's own
  verdict: source and config files, the manifest, the build command, and
  dependency-task changes all re-hash; a README or lockfile-only edit does not.
- `--bump none` records a change that needs no release. A devDependency-only
  or script-only bump is the canonical `none` class; a `none` on a
  behavior-visible change is the same silent non-release the gate exists to
  catch.
- Edits that re-hash every package at once (a shared `@systemfsoftware/tsconfig`
  file, `turbo.json`, the global `patch-tsgo-if-needed.mjs`, or a file inside a
  nested-workspace fixture under `testResources`) demand an intent per package.
- Catalog value flips in `pnpm-workspace.yaml` change no package hash and are
  outside this verdict. They are reviewed in the release pass instead.
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

## Versioning

`release.jsonc` uses `changesets` versioning: every package versions on its own,
from the intents that name it. The gritlint launcher (`npm/gritlint`) is one of
them, and its `cargo` surface carries its version into `Cargo.toml`
`[workspace.package]` and the workspace members in `Cargo.lock`. Private
packages are versioned but never tagged or released.

## Release workflow

Every push to `main` runs `.github/workflows/release.yml`, which calls the shared
Release workflow at a pinned commit. Its `plan` step derives the phase from
repository state, never from a pull-request event:

- **release** — some publishable package's current version has no
  `<pkg>@v<version>` git tag. `release tag` writes an annotated tag for each
  such version, recording the integrity and file digests of the tarball the
  flake builds at that commit. `release release` then cuts a GitHub Release
  whose body is `.changeset/changelogs/<pkg>@<version>.md`.
- **version** — no version is owed and intents are pending. `version bump`
  consumes every intent, moves each named package's version, and writes
  `.changeset/changelogs/<pkg>@<version>.md` for each moved package.
  `release pr` commits that tree to `changeset-release/main` and opens or
  refreshes `chore(release): version packages`, and the workflow dispatches
  `ci.yml` on that branch.
- **none** — nothing is owed and no intent is pending.

Owed versions come first: a push that leaves a version untagged releases it
before any pending intent is versioned. Merging the release PR therefore makes
the next push release the versions it moved.

A tagged package that no pending intent names is checked against its tag: the
tarball the flake builds now must match the digests the tag's annotation
recorded. Tags made before the shared tooling are lightweight and record
nothing, so a package whose current version carries one moves on only through
an intent.

## Changelog files

`.changeset/changelogs/` must stay tracked in git. `version bump` writes one file
per moved package, and the release phase reads it as the GitHub Release body.
When a version the release phase owes has no file there, the release refuses
with `ReleaseChangelogMissing` after its tag is already pushed, and later runs
do not retry it (see below). Never delete a changelog file before its version
has a GitHub Release.

## Interruption safety

The Release workflow concurrency group is `release-${{ github.ref }}` with
`cancel-in-progress: false`. Pushes to `main` queue; they never cancel an
in-flight release run.

- An interrupted **version** job is safe: it only commits on the isolated
  `changeset-release/main` branch and opens or updates a PR; `main` is
  untouched.
- An interrupted **release** job resumes only before its tags are pushed: the
  release phase owes exactly the versions with no tag, so a version with no tag
  is still owed on the next run. Once `release tag` has pushed a version's tag,
  that version leaves the cycle, and a GitHub Release the run did not cut is
  never retried. Cut it by hand from the version's changelog file.

Distribution is this repository's Nix flake outputs consumed from a git ref
(pinned by `flake.lock` rev + narHash, run in a bubblewrap sandbox), not an npm
registry. The release path writes a git tag and a GitHub Release for each
unreleased version and nothing more. There is no npm token, no OIDC trusted
publishing, and no registry to bootstrap.
