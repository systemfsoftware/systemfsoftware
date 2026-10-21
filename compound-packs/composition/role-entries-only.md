---
title: A library's entries are its root namespace barrel plus named roles; internals are blocked in the exports map and a long list of entries is judged as roles or a folder mirror
applies_when:
  - adding a subpath to a library's exports map
  - a consumer or test wants a file that is not exported
  - a library's exports map grows past a handful of entries (read the keys: roles are fine, a mirror of the tree is not)
tags: [composition, exports-map, roles, internal]
---

A library exposes:

- `.`, one barrel of namespaces (`cell-architecture/single-namespace-barrel`), and
- a few **role** entries, each named for what a consumer is doing, not for a file: `./server`, `./client`, `./config`, `./testing`, `./workerd`.

Everything else is unreachable. `"./internal/*": null` blocks it explicitly, and internal files are lowercase or `_`-prefixed. An entry never mirrors the folder tree.

There is no entry count that fails. A library that serves many runtimes or frameworks legitimately has many roles (Vitest has 14 entries, Effect 21, TanStack Start 17), and a count says nothing about whether each key is a role or a file. What fails is a list whose keys are source folders and files, or that exposes internals: younna-ai's `workers/platform` published 136 subpaths, one per module.

Vitest's entries are roles (core, node, browser, runtime, worker, config) plus an explicit `./internal/*`. TanStack Query exports only `.` and `./package.json`. Effect blocks `./internal/*` and uses casing as the policy: public modules are PascalCase, internal ones lowercase.

Gate: fact-gated, `repo-checks composition-entries` fails a missing `./internal/*: null` when the library has an internal folder and, for a private library, two entries that resolve to one file (`./package.json` and a `null` block are not entries). There is no count gate: the number of role entries (a guide of 8, shown to the judge and reported when exceeded) is evidence, never a failure. Judge-gated (`entries-are-roles`, calibration kappa 0.74 over 29 cases, see the README): the same check asks a panel whether the entries are roles or a mirror of the source folder tree or exposed internals; a violated verdict needs both panel members and fails only while the kappa stays at or above 0.7.
