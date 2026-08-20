---
title: ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE from pending change intents naming deleted packages
date: 2026-08-20
category: docs/solutions/runtime-errors
module: intent versioning
problem_type: runtime_error
component: tooling
symptoms:
  - "ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE from `pnpm version -r` (and `--dry-run`), naming a package that is no longer a member of the workspace"
  - "Release Phase 1 (intent consumption) fails, so no Release PR opens"
root_cause: stale_intent
resolution_type: config_change
severity: high
tags: [pnpm, changesets, intent, release, deleted-packages, workspace-membership]
---

# ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE from pending change intents naming deleted packages

## Problem

`pnpm version -r` — the pnpm-native engine that consumes pending change
intents and computes the release plan (CONCEPTS: _intent versioning_) — aborts
with `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` when a pending intent names a
package that is not a member of the workspace. The planner refuses the whole
release, not just the offending intent: no plan is emitted, no Release PR
opens, and every subsequent push to `main` fails the same way until the stale
name is removed.

This is the _intent-side_ half of a deletion. When the cell-role suffix rule
fleet was deleted, the deleted packages (thirteen plugin packages keyed on
`sanctioned cell-role suffixes`, e.g. `@systemfsoftware/oxlint-plugin-effect-acl`
and `@systemfsoftware/oxlint-plugin-effect-executor`) left the workspace
entirely — no manifest, no build task, no version to carry a bump. Pending
intents written before or around the deletion still named several of them
(both as `patch` and as `minor`), some in an intent whose whole subject was a
deleted package and is therefore void, and the deletion itself had already
recorded its own intent. The planner cannot satisfy a bump demand for a
package that has no manifest, so it fails closed.

## Symptoms

- `corepack pnpm version -r --dry-run` exits non-zero with
  `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE`, naming the stale package and the
  intent file that contains it.
- The release workflow's intent-consumption phase fails, so the Release PR
  never opens; the repo cannot release until the intents are repaired.

## What Didn't Work

- **Retrying the release.** The error is deterministic — it is produced by
  recomputing the plan from the same intents, so it reproduces identically on
  every run and every push.
- **Treating the registry as the authority.** A deleted package's last
  published version keeps working for existing installs, but plan-time
  validation matches against _live workspace membership_, never against what
  exists on the registry. A name that is real on npm but absent from the
  workspace is still unknown to the planner.

## Solution

Repair the pending intents so no name outside the workspace appears in any
frontmatter:

1. **Delete the dead entries.** For each deleted package name, drop its
   intent line from every pending intent. No replacement bump exists for a
   package that left the workspace; a `none` intent would also be wrong,
   because `none` still names the package and the planner rejects the name.
2. **Delete intents whose whole subject died.** An intent whose only
   frontmatter entries are deleted packages has nothing left to say; remove
   the file entirely (its change record, if it has any, is preserved by the
   deletion commit).
3. **Keep the deletion's own intent.** The intent that records the fleet
   deletion (naming the surviving aggregate packages) stays — it is the last,
   correct release record the deletion earns, and it carries the
   `npm deprecate` instruction for the removed names.
4. **Verify with the dry-run.** `pnpm version -r --dry-run` must exit 0 and
   print a plan in which every name is a live workspace member. The dry-run
   is exactly the deterministic check the release pipeline runs, applied
   without mutating the tree.

This repair landed once before on a side branch and never reached `main`,
which is how `main` came to hold the stale intents again; the fix is
branch-independent — it is the same three-file edit on any branch whose
pending intents name the deleted fleet.

## Why This Works

**A bump target must be a live workspace member.** `pnpm version -r` computes
the plan by walking the workspace graph; a bump demand is satisfiable only for
a package that has a manifest to carry the new version. A deleted package has
none, so the demand is algorithmically unsatisfiable, and the planner's only
correct non-silent response is to refuse — exactly what
`ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` is. Failing closed on an unsatisfiable
plan beats silently dropping the intent, which would ship a release record
the author believes covers a package the workspace no longer contains.

**The planner is the gate.** Membership and protocol validation live in the
consumption command itself, not in a separate checker — so the release
pipeline cannot diverge from the check that guards it. This parallels the
hash-side gate (REPO-R2): the changeset requirement keys on the turbo build
hash _because the engine already computes reach exactly_, and deleted
packages — absent at head — can never demand an intent there. Both laws bind
the same class: **a deleted package is not a release subject by any
mechanism.**

## Architectural Invariants

1. **A deletion sweeps its intents in the same change.** Removing a
   workspace package without removing every pending intent that names it
   breaks the next release deterministically. The removal is complete only
   when the names are gone from the workspace, from the intents, and from
   any rule or config that still owns them.
2. **The deletion's own intent is the last word for the name.** After the
   intent that records the deletion is consumed, no later intent may name the
   package; a name absent from the workspace cannot reappear in a release
   plan.
3. **Validate the plan before the merge, not at publish.** Whenever a change
   adds or removes a workspace package — or touches a package's manifest
   range for a sibling — run the consumption dry-run in the same change. It
   is the single command that catches both this failure
   (`UNKNOWN_PACKAGE`) and its sibling (`INTERNAL_RANGE`, a bare range on an
   internal dependency), and it costs nothing but a read.

## Verification

- After repair: `pnpm version -r --dry-run` exits 0 and the plan lists no
  name outside the workspace.
- Red case: any reintroduced intent naming a deleted package must reproduce
  `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` on the same dry-run.
- The edited intent files pass the changeset content validator (bump-vs-body
  and banned-content rules) unchanged from the pre-repair state — the repair
  changes only _which_ packages a release record covers, never what a
  consumer reads in the body.

## Related

- `docs/solutions/runtime-errors/pnpm-internal-range-breaks-recursive-versioning.md` — sibling failure of the same command and phase: `ERR_PNPM_VERSIONING_INTERNAL_RANGE` from a bare range on an internal dependency. Same dry-run preflight, different root cause.
- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` — the hash-side law for the same class: a package deleted at head can never demand an intent, because releasability keys on the head manifest and reach keys on the engine's hash. This doc is the intent-side law: the planner refuses a name that is not a member.
