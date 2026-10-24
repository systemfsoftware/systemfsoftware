---
title: A package's subpath entries exist for its consumers, never as a mirror of its source folders
applies_when:
  - adding, removing or renaming a subpath in a package's exports map or tsdown entry list
  - a sibling package wants a module the root entry does not export
tags: [exports-map, subpath, entry-point]
---

Never add a subpath whose key and target are a source folder or file (./agent pointing at src/agent/mod.ts), whether for every folder or only some. Never add a subpath so a sibling package can reach a module the root entry keeps private. Whether a subpath is an entry its consumers need is decided by the review judge; an uncertain case escalates.

Gate: judge
