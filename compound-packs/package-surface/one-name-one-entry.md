---
title: A symbol is importable under one name from one entry, and a rename leaves no alias behind
applies_when:
  - exporting a symbol from an entry, flat or inside a namespace
  - renaming or moving an export in a published or private package
  - reviewing a diff that adds an export, a re-export or a deprecated wrapper
tags: [exports, alias, re-export, rename, deprecated]
---

Make a declaration reachable through exactly one import specifier and one name: never both flat and inside a namespace, never from both the root entry and a subpath, never under a second name. When two entries need one declaration, one exports it and the other imports it without re-exporting.

A rename or move leaves no alias, shim, compatibility re-export or `@deprecated` wrapper behind, in a published or private package. For a published package it is a removal, versioned as surface-changes-are-versioned.md sets.

Where a host contract requires an object-shaped export (a plugin object the host loads), never also export its members flat.

```ts
// WRONG
export * as Stock from './stock.js'
export { reserve } from './stock.js' // the same declaration flat as well
export { reserve as holdStock } from './stock.js' // alias left behind by a rename
// RIGHT
export * as Stock from './stock.js'
```
