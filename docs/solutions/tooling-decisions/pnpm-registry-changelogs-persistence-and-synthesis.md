---
title: pnpm Registry Changelogs Must Be Committed or Synthesized from the Ledger
date: "2026-09-19"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Configuring pnpm native monorepo versioning with GitHub Releases
  - Asserting or creating GitHub Releases from .changeset/changelogs/
  - Debugging "Missing changelog" in a CI publish or release job
root_cause: design_gap
resolution_type: design_change
related_components:
  - changelog resolution (cycle.ensureChangelog)
  - GitHub Release creation (create-github-releases)
  - pnpm-native workspace versioning
tags:
  - pnpm
  - changeset
  - changelog
  - ledger
  - release-notes
  - github-release
---

# pnpm Registry Changelogs Must Be Committed or Synthesized from the Ledger

## Problem

In pnpm native workspace versioning (pnpm 11+), `versioning.changelog.storage`
defaults to `registry`. Under this mode, `pnpm version -r` writes temporary
changelog sections into `.changeset/changelogs/<pkg-name-with-slash-as-bang>@<version>.md`
and records consumed intent stems into `.changeset/ledger.yaml`.

Post-publish release tooling expects those markdown files to exist in
`.changeset/changelogs/` to populate GitHub Release bodies.

When `.changeset/changelogs/` was added to `.gitignore`, git ignored the
directory on the `changeset-release/main` branch. When the PR merged to `main`,
the publish job checked out `main` without `.changeset/changelogs/`. Running
`pnpm version -r` on `main` could not regenerate them because every intent was
already consumed in `ledger.yaml` (`No pending changes`). The assert step failed
with `Missing changelog for <pkg>@<version>`.

## Guidance

1. **Commit the changelogs — never ignore them.** `.changeset/changelogs/` must
   be tracked and committed by the version job into the Release PR.
2. **Synthesize defensively from the ledger.** `ensureChangelog` prefers the
   pnpm-written file and, when it is missing or empty, rebuilds the section from
   `.changeset/ledger.yaml` and the corresponding `.changeset/<intent>.md`
   bodies, writing the file back best-effort.
3. **Do not re-run `pnpm version -r` in the publish job.** On `main` every
   intent is already consumed; the run is a no-op that can generate no notes.

## Why This Matters

The release notes have exactly two possible sources, and only one of them is a
live process. `pnpm version -r` writes them once, on the Version PR, before the
merge. After that the only surviving source is git — or the ledger and the
intent bodies, from which the same section is reconstructible deterministically.
A release whose notes exist at neither source ships a GitHub Release with an
empty body, or fails the assert and blocks the whole publish.

## Architectural Invariants

**The release-notes source must survive across jobs.** The publish job cannot
re-run `pnpm version -r` once the ledger is committed. Release notes must either
arrive via git or be reconstructible from `ledger.yaml` and `.changeset/*.md`.

**Intents are retained on disk.** pnpm retains `.changeset/*.md` even after
recording a stem in the ledger, so deterministic synthesis from the ledger plus
the intent files is possible at any point after the merge.

**An empty body is a failure, never a release.** The assert step treats a
missing or zero-length body as `::error::` and exits non-zero, naming the
package, the version, and the expected path. A GitHub Release with no notes
certifies nothing and is not published.

**Synthesis is a fallback, not a second author.** The committed file wins
whenever it exists and is non-empty; synthesis runs only when it does not. Two
writers producing the same file would otherwise diverge.

## When to Apply

- Adding or removing a `.gitignore` entry that could match `.changeset/`.
- Moving release-note generation between workflow jobs.
- Explaining why a publish job that once succeeded now fails at the assert step.

## Examples

The committed file is preferred; synthesis fills the gap:

```ts
// ensureChangelog: committed file first, ledger+intents second
const existing = await Deno.readTextFile(changelogPath(name, version))
if (existing.trim().length > 0) return existing
// otherwise rebuild from ledger[key].intents and each intent body
```

The assert that makes an empty body fail the run:

```ts
if (raw.trim().length === 0) {
  console.error(`::error::Missing or empty changelog for ${name}@${version}`)
  Deno.exit(1)
}
```

## Prevention

- Never add `.changeset/changelogs/` to `.gitignore`.
- Keep `--assert` on both the version and publish jobs so a missing body fails
  before any GitHub Release is attempted.
- Do not run `pnpm version -r` in the publish job.

## Related

- `docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md`
- `docs/solutions/tooling-decisions/first-publish-under-oidc-trusted-publishing.md`
