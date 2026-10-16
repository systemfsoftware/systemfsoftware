---
title: pnpm owns the changeset ledger and changelog generation; an intent file is never a pending release
date: "2026-09-19"
last_updated: "2026-09-25"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Changing how the release phase is derived from .changeset state
  - Changing the pending-intent count or the ledger parser
  - Debugging a version-packages pull request that opened with nothing to release
  - Debugging a missing version-packages pull request after a successful publish
  - Debugging owed versions that never publish while every Release run reports phase version
  - Configuring pnpm native monorepo versioning with GitHub Releases
  - Asserting or creating GitHub Releases from .changeset/changelogs/
  - Debugging "Missing changelog" in a CI publish or release job
root_cause: design_gap
resolution_type: design_change
related_components:
  - release phase planner (plan-release)
  - pending-intent count (pending-intents)
  - release phase decision (release-phase)
  - release PR guard (open-release-pr)
  - changelog resolution (cycle.ensureChangelog)
  - GitHub Release creation (create-github-releases)
  - pnpm-native workspace versioning
tags:
  - pnpm
  - changeset
  - ledger
  - release-pipeline
  - registry
  - changelog
  - release-notes
  - github-release
---

# pnpm owns the changeset ledger and changelog generation; an intent file is never a pending release

## The Doctrine

In pnpm native workspace versioning (pnpm 11+), `pnpm change` authors the intent file, and `pnpm version -r` consumes it into `.changeset/ledger.yaml` and renders `.changeset/changelogs/<pkg-name-with-slash-as-bang>@<version>.md` — the two events are separated in time. Counting `.changeset/*.md` therefore answers "how many intent files exist", never "how many are pending". Read that way, every release leaves the pipeline in the `version` phase forever, and each push opens a Version PR that deletes files the previous run already consumed.

Two architectural invariants govern the ledger:

1. **Consumption and unlink are two events.** `pnpm version -r` consumes an intent into `ledger.yaml` on the Version PR, but unlinks the intent file only on a _later_ version run, after the registry confirms those versions. Treat `.changeset/ledger.yaml` as the record of consumption, and count only intents whose stem is absent from it.

2. **The release-notes source must survive across jobs.** `pnpm version -r` writes changelog sections once, on the Version PR, before the merge into `.changeset/changelogs/`. After that the only surviving source is git — or the ledger plus the intent bodies, from which the same section is reconstructible deterministically. A publish job cannot re-run `pnpm version -r` because every intent is already consumed; the run is a no-op that can generate no notes.

## Counting Pending Intents

**pnpm writes the ledger.** `pnpm change` authors the intent; `pnpm version -r` consumes it and renders the ledger. No production code in this repository writes the file.

**An intent whose every bump is `none` is not pending.** It requests no release, so `pnpm version -r` bumps no manifest for it and the version-bump guard below opens no Release PR. Counted as pending, it pins the phase at `version` on every push and the owed versions never reach the publish job. After one Release run was cancelled, three `none`-only intents merged before the next push held 20 owed versions off npm. The next Release PR with a real bump consumed them. Frontmatter that cannot be parsed still counts as pending.

**A bare, null-parsing key means an empty intent list.** A ledger entry's intents appear as a mapping (`dir:` plus `intents: [...]`), a sequence, or a key whose value parses as YAML null. Null is a release that consumed nothing — not an entry the parser failed to read. Contributing no stems is exactly what "empty" means; treating it as unparsed invents intents.

Count implementation:

```ts
const pending = await countPendingIntents('.changeset')
```

This reads `.changeset/ledger.yaml`, parses intents from the mapped stems, and counts intents whose stem is absent from the ledger.

## Changelog Assurance

**Commit the changelogs — never ignore them.** `.changeset/changelogs/` must be tracked and committed by the version job into the Release PR. When it was added to `.gitignore`, git ignored the directory on the `changeset-release/main` branch. When the PR merged to `main`, the publish job checked out `main` without `.changeset/changelogs/`. Running `pnpm version -r` on `main` could not regenerate them because every intent was already consumed (`No pending changes`). The assert step failed with `Missing changelog for <pkg>@<version>`.

**Synthesize defensively from the ledger.** `ensureChangelog` prefers the pnpm-written file and, when it is missing or empty, rebuilds the section from `.changeset/ledger.yaml` and the corresponding `.changeset/<intent>.md` bodies, writing the file back best-effort:

```ts
// ensureChangelog: committed file first, ledger+intents second
const existing = await Deno.readTextFile(changelogPath(name, version))
if (existing.trim().length > 0) return existing
// otherwise rebuild from ledger[key].intents and each intent body
```

**An empty body is a failure, never a release.** The assert step treats a missing or zero-length body as `::error::` and exits non-zero:

```ts
if (raw.trim().length === 0) {
  console.error(`::error::Missing or empty changelog for ${name}@${version}`)
  Deno.exit(1)
}
```

## Why This Matters

The ledger makes consumption a fact recorded beside the intent, so an intent file's presence stops implying that a release is owed. Inverting that — treating the surviving file as evidence — reintroduces a phantom Release PR on every cycle. The failure is quiet: the pipeline reports a normal phase and opens a normal-looking PR.

The release notes have exactly two possible sources, and only one of them is a live process. `pnpm version -r` writes them once, on the Version PR, before the merge. After that the only surviving source is git — or the ledger and the intent bodies, from which the same section is reconstructible deterministically. A release whose notes exist at neither source ships a GitHub Release with an empty body, or fails the assert and blocks the whole publish.

## Architectural Invariants

**Release-set membership is a registry fact, not a version-control fact.** A package leaves the release set when its version is published, never when a branch advances or a tag is written. Tags are written downstream of the publish that would prove them, so a detector reading tag absence cannot make its own precondition true.

**A failed probe is a third outcome, never a "no".** The registry probe has three results — published, unpublished, and cannot-tell. Folding cannot-tell into unpublished reclassifies a published package as owed a release. `isPublished` therefore returns false only on an explicit 404 and throws on any other non-OK response.

**A parse failure must degrade toward "nothing consumed".** An unreadable ledger yields zero consumed stems, so more intents look pending than are. That errs toward the `version` phase, which the version-bump guard catches. The opposite default errs toward phase `none`, which silently skips a release — never choose it. Any new ledger shape must sit on the conservative side of this line.

**Two independent guards, not one.** The pending count and the version-bump guard answer different questions — "is an intent unrecorded?" and "did a version actually change?" A change may not weaken either on the assumption that the other covers it. The guard makes an over-count survivable only for one push: a count that stays too high starves the publish phase, because `version` wins and the guard then exits without a PR. An intent that can never produce a bump must not count.

**Pending intents win over unpublished versions.** `decidePhase` is `pending > 0 ? version : owed > 0 ? publish : none`. Publishing while intents remain ships later commits under the previous changelog. Unpublished version numbers are abandoned when `pnpm version -r` bumps past them; they were never on the registry.

**Unlink is registry confirmation, not consumption.** Consumption writes the ledger and a changelog file; the unlink waits for a later version run to confirm the version on the registry. Deleting those changelog files out of band strands the intents as permanent orphans.

**Release runs do not cancel each other.** The Release workflow concurrency group for the default-branch ref sets `cancel-in-progress: false`. A killed version job only mutates `changeset-release/main`. A killed publish job leaves registry 404s in the release set, so `owed` remains until npm serves the versions.

## When to Apply

- Changing the phase expression in the release planner, or the pending count feeding it.
- Adding a ledger shape to the parser. A shape that fails to parse must degrade to "nothing consumed", never to "consumed".
- Explaining why `.changeset/` still holds intent files after a release landed.
- Explaining why a successful publish left no Version PR even though intents were pending.
- Explaining why the Release workflow reports phase `version` on every push, opens no Version PR, and never publishes versions the registry still 404s.
- Adding or removing a `.gitignore` entry that could match `.changeset/`.
- Moving release-note generation between workflow jobs.
- Explaining why a publish job that once succeeded now fails at the assert step.

## Examples

Counting files, which never reaches zero:

```ts
let pending = 0
for await (const entry of expandGlob('.changeset/*.md')) {
  if (basename(entry.path) !== 'README.md') pending++
}
```

Counting intents the ledger does not record as consumed:

```ts
const pending = await countPendingIntents('.changeset')
```

A ledger the parser must distinguish: one consumed intent, one still pending:

```yaml
"@scope/pkg@1.0.1":
  dir: packages/pkg
  intents:
    - twenty-vans-prove
```

## Prevention

- Keep the version-bump guard in the Release PR entry point. It is what makes a miscount survivable.
- Do not invert `decidePhase` to prefer `owed > 0` over `pending > 0`. That publishes HEAD under the previous changelog and skips the Version PR for the new intents.
- Never add `.changeset/changelogs/` to `.gitignore`.
- Keep `--assert` on both the version and publish jobs so a missing body fails before any GitHub Release is attempted.
- Do not run `pnpm version -r` in the publish job.

## Related

- [Release notes and published-surface verification](../conventions/a-release-note-claims-the-published-surface.md)
- [Changeset requirement keys on the turbo build hash](changeset-requirement-keys-on-turbo-build-hash.md)
