---
title: A symbol is importable under one name from one entry, and a rename leaves no alias behind
applies_when:
  - exporting a symbol from an entry, flat or inside a namespace
  - renaming or moving an export in a published or private package
tags: [exports, alias, re-export, rename]
---

A symbol is never exported both flat and inside a namespace, from both the root and a subpath, or under a second name.
When two entries need one declaration, one entry exports it and the other imports it without re-exporting it.
A rename or move leaves no alias, shim, compatibility re-export or @deprecated wrapper behind, in a published or private package.
Where a host contract requires an object-shaped export, its members are never also exported flat.

```WRONG
export * as Medium from './medium.js'
export { readyOnStart } from './medium.js'
```

```RIGHT
export * as Medium from './medium.js'
```

Gate: judge
