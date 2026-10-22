---
title: An unpublished workspace library has no versioned surface, so a wrong shape is deleted and rebuilt rather than kept for compatibility
applies_when:
  - a workspace library's exports or structure is wrong
  - deciding whether a change to an internal package needs a deprecation path
  - applying package-topology's versioning rules to a private package
tags: [composition, versioning, delete-and-rebuild]
---

`package-topology`'s versioning rules (`surface-changes-are-versioned`, the keep-both clauses) protect consumers outside the repository. A library marked `"private": true` has none. Every consumer is in the same commit, so the repair is to delete the wrong shape and rebuild it, updating every consumer in the same change.

Keeping a wrong internal shape alive with aliases, shims or compatibility re-exports carries the cost of a published package without its reason, and it is how workarounds become architecture.

Gate: review, plus (fact-gated) `repo-checks composition-entries`: a private library's exports map may not contain deprecated aliases (two specifiers resolving to the same file).
