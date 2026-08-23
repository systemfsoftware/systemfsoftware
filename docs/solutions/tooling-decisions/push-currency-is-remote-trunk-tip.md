---
title: Push Currency Is the Remote Trunk Tip
date: "2026-08-22"
module: systemfsoftware
problem_type: tooling_decision
category: tooling-decisions
component: tooling
severity: medium
applies_when:
  - A pre-push or similar gate must decide whether a branch is current
  - Local main exists and may lag the remote
  - Tag or delete refs ride the same hook as branch refs
root_cause: design_gap
resolution_type: design_change
related_components:
  - git pre-push
  - remote main
tags:
  - git
  - pre-push
  - trunk
  - currency
---

# Push Currency Is the Remote Trunk Tip

## Problem

A branch that does not contain the remote trunk tip is reviewed and CI'd on a stale base. Using the local trunk ref as the source of truth fails the same way: that ref can lag. Using every pushed object as the unit of currency fails the other way: a tag on an ancestor of trunk is not "behind," it is history.

## Mechanism

Currency is ancestry of a freshly queried remote tip, not equality with a local name.

```
currency(ref) := isHead(ref) => ancestor(remoteTrunkTip, ref.sha)
```

`remoteTrunkTip` is the SHA `ls-remote` reports for the remote's `main` at hook time. A missing object is fetched. A missing remote `main` is not behind. Deletes and non-head refs are not in the domain.

## Architectural Invariants

**The trunk is the remote tip, never a local name.** A local `main` is a cache. A gate that reads it measures yesterday.

**Ancestry, not equality.** A feature commit that contains the tip is current. Requiring equality with the tip would refuse every feature branch.

**The domain is head refs.** Tags, notes, and deletes do not participate. A tag on an ancestor of trunk would fail `ancestor(tip, tag)` after trunk moved; that is not a currency defect.

**A query failure is a refuse.** Offline or unreadable remote cannot prove currency. Fail closed.

## Failure Modes Prevented

1. **Stale local trunk** — local `main` is behind; a feature based on it looks current if the gate reads the local name.
2. **Tag false refuse** — releasing an old tag after trunk moved is not a behind-branch.
3. **Silent pass on no network** — treating `ls-remote` failure as "no remote main" would allow every stale push.

## Verification Patterns

- Exhaustive decide over the closed ref-kind set: refuse iff at least one head ref is behind.
- Real-git sandwich: current feature allows; after trunk advances, same feature refuses; tag-only stdin still allows; rebase then allows.
- Live refuse on a branch that `rev-list HEAD..origin/main` counts as non-empty; live allow after that set is empty.

## Related

None.
