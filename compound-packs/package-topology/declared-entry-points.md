---
title: The exports map declares every specifier a consumer may import; a subpath exists to chunk a large surface or because a host dictates its name
applies_when:
  - adding, removing, or renaming a subpath export
  - adding an entry to a package's exports map or tsdown entry list
  - deciding whether a module should be importable from its own specifier
  - splitting a package's surface into several entry points
tags: [package-topology, exports-map, subpath, entry-point]
---

The exports map in `package.json` is the complete list of specifiers a consumer can import. Every path it does not list is unreachable. Every path it does list becomes depended on, whatever its documentation says, so each entry is a contract.

A subpath entry is justified in two ways only:

- **Chunking.** Without it, a consumer choosing imports from one entry would scan more names than a reader holds at once, about seven (Miller's span of immediate memory). The bound is on the names offered together at one entry, not on a file or on the package's total, which is unbounded. A subpath groups part of the vocabulary into its own entry; a namespace export from the root is the other chunking device.
- **Host contract.** A tool imports a fixed specifier, such as the `react/jsx-runtime` the JSX transform requests, or a `config` entry a test runner loads without the runtime.

A subpath never mirrors the folder tree, and never exists to hide nothing. An entry that assembles other modules must hide at least two of them and expose fewer names than they offer; otherwise it is not a separate entry. An entry module that is itself one unit, re-exporting nothing, is exempt from that count.

An existing published subpath that fails this rule is removed only by a versioned change (`surface-changes-are-versioned`).

Gate: `review`.
