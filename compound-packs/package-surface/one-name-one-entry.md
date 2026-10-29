---
title: A symbol is importable under one name from one entry, and a rename leaves no alias behind
applies_when:
  - exporting a symbol from an entry, flat or inside a namespace
  - renaming or moving an export in a published or private package
  - reviewing a diff that adds an export, a re-export or a deprecated wrapper
tags: [exports, alias, re-export, rename, deprecated]
---

A declaration is reachable through exactly one import specifier and one name: never both flat and inside a namespace, never from both the root entry and a subpath, never under a second name.
When two entries need one declaration, one entry exports it and the other imports it without re-exporting it.
A rename or move leaves no alias, shim, compatibility re-export or @deprecated wrapper behind, in a published or private package; for a published package it is a removal, versioned as surface-changes-are-versioned.md sets.
Where a host contract requires an object-shaped export (a plugin object the host loads), that object's members are never also exported flat.

Decision test: for each name the diff exports, re-exports, renames or moves, search every module the exports map points at for that declaration. The diff fails when one declaration is reachable twice: flat and in a namespace, from two entries, through `export { a as b }`, through `const Old = New` or `type Old = New`, or through a wrapper marked @deprecated.

Defect prevented: consumers split between two spellings of one thing, every later change has to be made and versioned twice, and an alias kept after a rename leaves the old name in the surface forever, so the rename never reaches the consumers it was for.

```ts
// WRONG: an inventory package's root entry
export * as Stock from './stock.js'
export { reserve } from './stock.js' // the same declaration flat as well
export { reserve as holdStock } from './stock.js' // alias left behind by a rename
```

```ts
// RIGHT
export * as Stock from './stock.js'
```

Source: Node.js package documentation, "Extensions in subpaths": a package provides "only one subpath for each exported module so that all dependents import the same consistent specifier, keeping the package contract clear for consumers" (https://nodejs.org/api/packages.html#extensions-in-subpaths). Extending that to one name per declaration, and refusing aliases after a rename, is this pack's own ruling.

Gate: judge
