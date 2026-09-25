---
title: pnpm Owns the Change-Intent Ledger, So an Intent File Is Not a Pending Release
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
root_cause: design_gap
resolution_type: design_change
related_components:
  - release phase planner (plan-release)
  - pending-intent count (pending-intents)
  - release phase decision (release-phase)
  - release PR guard (open-release-pr)
  - pnpm-native workspace versioning
tags:
  - pnpm
  - changeset
  - ledger
  - release-pipeline
  - registry
---

# pnpm Owns the Change-Intent Ledger, So an Intent File Is Not a Pending Release

## Problem

The release planner derives a phase from two numbers: the release set — workspace
versions the registry does not yet serve — and how many change intents are
pending. Pending intents select `version`; only a repo with nothing pending and
unpublished versions left selects `publish`. `plan-release` prints it; the
Release workflow routes on it. Publishing while intents remain ships later
commits under the previous changelog.

The trap is the second number. `pnpm version -r` consumes an intent into
`.changeset/ledger.yaml` on the Version PR, but it unlinks the intent file only
on a later `pnpm version -r`, after the registry confirms those versions. The
consumption and the unlink are two events. Counting `.changeset/*.md` therefore
answers "how many intent files exist", never "how many are pending". Read that
way, every release leaves the pipeline in the `version` phase forever, and each
push opens a Version PR that deletes files the previous run already consumed.

`.changeset/changelogs/` is the other half of the same design. If it is deleted
out of band between consumption and confirmation, pnpm has nothing left to
verify, so the matching intent files become permanent orphans — files that are
neither pending work nor cleanly consumed, and that only a hand edit removes.

## Guidance

Treat `.changeset/ledger.yaml` as the record of consumption, and count only
intents whose stem is absent from it (`countPendingIntents`). Two properties of
the ledger decide whether that count is right:

- **pnpm writes it.** `pnpm change` authors the intent; `pnpm version -r`
  consumes it and renders the ledger. No production code in this repository
  writes the file, so a change that adds a ledger reader adds no writer.
- **A bare, null-parsing key means an empty intent list.** A ledger entry's
  intents appear as a mapping (`dir:` plus `intents: [...]`), a sequence, or a
  key whose value parses as YAML null. Null is a release that consumed nothing —
  not an entry the parser failed to read. Contributing no stems is exactly what
  "empty" means; treating it as unparsed invents intents.
- **An intent whose every bump is `none` is not pending.** It requests no
  release, so `pnpm version -r` bumps no manifest for it and the version-bump
  guard below opens no Release PR. Counted as pending, it pins the phase at
  `version` on every push and the owed versions never reach the publish job.
  After the #527 Release run was cancelled, three `none`-only intents merged
  before the next push held 20 owed versions off npm this way. The next Release
  PR with a real bump consumes them. Frontmatter that cannot be parsed still
  counts as pending.

`isPublished` owns the registry probe that sizes the release set. `openReleasePr`
— the Release PR shell entry point — holds the second line of defence: it
refuses to open a Release PR when no `packages/**/package.json` differs from the
base branch, so a miscount cannot by itself produce an empty Release PR.

## Why This Matters

The ledger makes consumption a fact recorded beside the intent, so an intent
file's presence stops implying that a release is owed. Inverting that — treating
the surviving file as evidence — reintroduces a phantom Release PR on every
cycle, and the failure is quiet: the pipeline reports a normal phase and opens a
normal-looking PR.

## Architectural Invariants

**Release-set membership is a registry fact, not a version-control fact.** A
package leaves the release set when its version is published, never when a
branch advances or a tag is written. Tags are written downstream of the publish
that would prove them, so a detector reading tag absence cannot make its own
precondition true.

**A failed probe is a third outcome, never a "no".** The registry probe has
three results — published, unpublished, and cannot-tell. Folding cannot-tell
into unpublished reclassifies a published package as owed a release.
`isPublished` therefore returns false only on an explicit 404 and throws on any
other non-OK response.

**A parse failure must degrade toward "nothing consumed".** An unreadable ledger
yields zero consumed stems, so more intents look pending than are. That errs
toward the `version` phase, which the version-bump guard catches. The opposite
default errs toward phase `none`, which silently skips a release — never choose
it. Any new ledger shape must sit on the conservative side of this line.

**Two independent guards, not one.** The pending count and the version-bump
guard answer different questions — "is an intent unrecorded?" and "did a version
actually change?" A change may not weaken either on the assumption that the
other covers it; the phantom PR returns if both are argued from the same signal.
The guard makes an over-count survivable only for one push: a count that stays
too high starves the publish phase, because `version` wins and the guard then
exits without a PR. An intent that can never produce a bump must not count.

**Pending intents win over unpublished versions.** `decidePhase` is
`pending > 0 ? version : owed > 0 ? publish : none`. Publishing while intents
remain ships later commits under the previous changelog. Unpublished version
numbers are abandoned when `pnpm version -r` bumps past them; they were never on
the registry.

**Unlink is registry confirmation, not consumption.** Consumption writes the
ledger and a changelog file; the unlink waits for a later version run to confirm
the version on the registry. Deleting those changelog files out of band strands
the intents as permanent orphans.

**Release runs do not cancel each other.** The Release workflow concurrency
group for the default-branch ref sets `cancel-in-progress: false`. A killed
version job only mutates `changeset-release/main`. A killed publish job leaves
registry 404s in the release set, so `owed` remains until npm serves the
versions.

## When to Apply

- Changing the phase expression in the release planner, or the pending count
  feeding it.
- Adding a ledger shape to the parser. A shape that fails to parse must degrade
  to "nothing consumed", never to "consumed".
- Explaining why `.changeset/` still holds intent files after a release landed.
- Explaining why a successful publish left no Version PR even though intents
  were pending.
- Explaining why the Release workflow reports phase `version` on every push,
  opens no Version PR, and never publishes versions the registry still 404s.

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

A ledger the parse must distinguish: one consumed intent, one still pending.

```yaml
"@scope/pkg@1.0.1":
  dir: packages/pkg
  intents:
    - twenty-vans-prove
```

## Prevention

- Keep a parser test for every ledger shape the reader tolerates, including the
  bare/null entry that means "empty".
- Keep the phase derivation testable without a registry: feed a stubbed release
  set and a stubbed pending count, and assert the phase. Bind those tests through
  workspace `test:scripts` on `gate:tasks` so `check:ci` cannot skip them.
- Keep the version-bump guard in the Release PR entry point. It is what makes a
  miscount survivable.
- Do not invert `decidePhase` to prefer `owed > 0` over `pending > 0`. That
  publishes HEAD under the previous changelog and skips the Version PR for the
  new intents.

## Related

- `docs/solutions/tooling-decisions/pnpm-registry-changelogs-persistence-and-synthesis.md`
- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`
