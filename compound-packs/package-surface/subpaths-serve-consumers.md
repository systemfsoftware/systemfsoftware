---
title: A package's subpath entries exist for its consumers, never as a mirror of its source folders
applies_when:
  - adding, removing or renaming a subpath in a package's exports map or its bundler's entry list
  - a sibling package wants a module the root entry does not export
tags: [exports-map, subpath, entry-point, encapsulation]
---

A subpath is added only for a consumer that imports it, with a reason the root entry cannot carry the same names, such as importing them from the root would load a dependency, a runtime-specific API or a side effect that other importers of the root must not pay for.
A subpath key names what the consumer imports it for. The exports map is never written to follow the source tree: no wildcard onto source paths (`./*` to `./src/*`) and no subpath per source folder or file.
A sibling package that needs a module the root entry keeps private gets it in one of two ways: the root entry exports the names it needs as a deliberate addition to the surface, or the module moves to the package that uses it. A subpath opened for that sibling is neither.
A subpath, import map or export added so that a test can reach a module is governed by the testing pack's rule that tests reach a package only through its published entries, not by this rule.

Decision test: for each subpath the diff adds or renames, the pull request names a consumer that imports it and the reason the root entry cannot export those names. The diff fails when that is missing, when the only reason given is that the root entry does not export the module, or when the exports map gains a wildcard onto source paths or a subpath for each of several source folders.

Defect prevented: every module reachable through a subpath is part of the published surface, so a subpath that mirrors a source folder turns moving or renaming an internal file into a breaking change, and a sibling coupled to an internal module breaks whenever that module is refactored.

```jsonc
// WRONG: an orders package opens its internals one folder at a time
"exports": {
  ".": "./dist/index.js",
  "./pricing": "./dist/pricing/index.js", // src/pricing/, opened so the invoicing package can reach it
  "./*": "./dist/*.js"
}
```

```jsonc
// RIGHT: the root carries the public names; one subpath exists because it loads a UI framework the root must not
"exports": {
  ".": "./dist/index.js",
  "./react": "./dist/react.js"
}
```

Source: Node.js package documentation, "Package entry points": the exports field prevents "any other entry points besides those defined", and "this encapsulation allows module authors to clearly define the public interface for their package" and "provides more reliable guarantees about package interfaces for tools and when handling semver upgrades" (https://nodejs.org/api/packages.html#package-entry-points). The test for what counts as a reason is this pack's own ruling.

Gate: judge
