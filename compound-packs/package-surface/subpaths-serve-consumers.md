---
title: A package's subpath entries exist for its consumers, never as a mirror of its source folders
applies_when:
  - adding, removing or renaming a subpath in a package's exports map or its bundler's entry list
  - a sibling package wants a module the root entry does not export
tags: [exports-map, subpath, entry-point, encapsulation]
---

Add a subpath only for a consumer that imports it, with a reason the root entry cannot carry the same names: importing them from the root would load a dependency, a runtime-specific API or a side effect other importers of the root must not pay for. Name the subpath key for what the consumer imports it for.

Never write the exports map to follow the source tree: no wildcard onto source paths (`./*` to `./src/*`) and no subpath per source folder or file. Every module reachable through a subpath is published surface, so a mirrored folder makes moving an internal file a breaking change.

When a sibling package needs a module the root keeps private, either the root exports the names as a deliberate addition to the surface, or the module moves to the package that uses it. Never open a subpath for the sibling.

A subpath, imports map or export added so a test can reach a module is governed by the testing pack's tests-reach-only-the-published-surface.md.

```jsonc
// WRONG
"exports": { ".": "./dist/index.js", "./pricing": "./dist/pricing/index.js", "./*": "./dist/*.js" }
// RIGHT: one subpath, because it loads a UI framework the root must not
"exports": { ".": "./dist/index.js", "./react": "./dist/react.js" }
```
