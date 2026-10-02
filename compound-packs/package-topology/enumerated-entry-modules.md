---
title: An entry module names every export it publishes, and is either pure surface or one unit, never both
applies_when:
  - adding or changing exports in a package's mod.ts or index.ts
  - re-exporting another module or package from an entry point
  - adding a function or class definition to a module that is an entry point
tags: [package-topology, entry-module, re-export, wildcard]
---

A module that the exports map points at lists every name it exposes. `export * from './x.js'` and `export * from '@scope/other'` are not used in an entry module: any export later added to the target silently becomes this package's contract, the target's default export is dropped, and two wildcards exporting the same name drop it silently. `export * as Name from './x.js'` publishes one named namespace and is allowed.

An entry module is one of two things:

- **Surface.** It contains only enumerated re-exports, namespace exports, binders, and inert wiring values (`import-time-inertness`). A binder narrows a generic to this package's types with a type annotation and adds no runtime content: `export const poll: NarrowSignature = genericPoll`. It is a declaration, not a unit, because the generic's type already fixes what it does at the narrowed types, so it needs no file or tests of its own. A binding that adds a decision its type does not force is behavior, not a binder.
- **A unit.** It defines its own single capability and re-exports nothing.

Mixing new behavior with re-export assembly in one entry module puts behavior in a file no suffix rule or mutation scope reaches.

Which namespace the package root exports is governed by `cell-architecture/single-namespace-barrel.md`. An existing entry that uses a wildcard is converted by a versioned change (`surface-changes-are-versioned`), since enumerating can drop names the wildcard exported.

Gate: `review`.
