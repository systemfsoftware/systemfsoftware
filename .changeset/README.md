# Changesets

Pending change intents live here: one Markdown file per change, whose
frontmatter names a package and its bump, and whose body is the release note.

```bash
changeset-management new @systemfsoftware/<package> --bump <none|patch|minor|major> \
  --summary "<consumer-observable release note>"
```

A pull request that changes a publishable package's turbo `build` hash must name
it in an intent. `.github/workflows/changeset-check.yml` runs
`changeset-management check` against the pull request's pinned base and blocks
the PR when a changed hash is unnamed; `--bump none` records a change that ships
nothing.

`pnpm-release-management`'s reusable release workflow owns the lifecycle. On a
push to `main` it consumes the intents into a `changeset-release/main` pull
request, bumping every release surface and writing
`.changeset/changelogs/<package>@<version>.md`. Merging that pull request tags
each released version and creates its GitHub Release from that changelog; the
tarballs ship through the flake, so nothing is published to a registry. The bump
deletes every intent it consumes, so the release PR diff is the set of notes
that shipped.
