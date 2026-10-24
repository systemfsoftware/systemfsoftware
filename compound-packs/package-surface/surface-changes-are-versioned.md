---
title: A change to a published package's declared surface takes the bump its API report diff shows
applies_when:
  - removing, renaming, narrowing or adding an export, a subpath or an exported type of a published package
  - writing the changeset for a change whose API report diff is not empty
tags: [versioning, changeset, api-report, breaking-change]
---

A published package is any package.json without "private": true, whatever its version and whether or not it is on npm yet.

Its declared surface is its exports map, the names each entry exports and the types those names reach.

Removing, renaming, moving or narrowing anything in the declared surface is a major intent, never patch or minor; no pre-1.0, alpha or not-yet-on-npm claim lowers it, and AGENTS.md REPO-R1 governs when to break, never the bump.

A backward-compatible addition to the declared surface is a minor intent, never patch.

The review judge decides the bump from the diff of the exports map and entry modules, plus the regenerated API report where the package has one; an empty report diff is never proof the surface is unchanged, and an uncertain case escalates.

Gate: judge
