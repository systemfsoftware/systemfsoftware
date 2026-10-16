---
title: Each published symbol is importable under one name from one entry point
applies_when:
  - exporting a symbol from both the root entry and a subpath
  - exporting a name both flat and inside a namespace
  - adding an alias for an already exported symbol
  - re-exporting from one entry what another entry of the same package already exports
tags: [package-topology, access-path, re-export, namespace]
---

A published symbol has one canonical name at one entry specifier. The same symbol is not reachable both flat and inside a namespace, both from the root and from a subpath, or under a second name. Different symbols are different paths: a flat export beside a namespace over other symbols is fine.

A second path to one symbol hides nothing new and still has to be documented, versioned, and kept equal to the first. Consumers split across both, so neither can change alone.

When two entries both need a declaration, one entry exports it and the other imports it.

Where a host contract requires an object-shaped export, the object is the host's shape, and its members are not also exported flat. Otherwise a namespace object built as a value (`export const N = { a, b }`) is allowed only as the sole path to its members, and only to chunk a surface too large to scan at once (`declared-entry-points`). Which namespace a package root exports is governed by `cell-architecture/single-namespace-barrel.md`.

An existing package that already exports one symbol two ways keeps both until a versioned change removes one (`surface-changes-are-versioned`).

Gate: `review`.
