---
title: A library's entries are its root namespace barrel plus named roles; internals are blocked in the exports map and the entry count is capped by a check
applies_when:
  - adding a subpath to a library's exports map
  - a consumer or test wants a file that is not exported
  - a library's exports map grows past a handful of entries
tags: [composition, exports-map, roles, internal]
---

A library exposes:

- `.`, one barrel of namespaces (`cell-architecture/single-namespace-barrel`), and
- a few **role** entries, each named for what a consumer is doing, not for a file: `./server`, `./client`, `./config`, `./testing`, `./workerd`.

Everything else is unreachable. `"./internal/*": null` blocks it explicitly, and internal files are lowercase or `_`-prefixed. An entry never mirrors the folder tree.

Vitest's entries are roles (core, node, browser, runtime, worker, config) plus an explicit `./internal/*`. TanStack Query exports only `.` and `./package.json`. Effect blocks `./internal/*` and uses casing as the policy: public modules are PascalCase, internal ones lowercase.

Gate: `repo-checks composition entries` fails a library with more than 8 entries, an entry whose path mirrors a source folder, or a missing `./internal/*: null` when the library has an internal folder. Raising the cap for one library requires a recorded exception in the library's README.
