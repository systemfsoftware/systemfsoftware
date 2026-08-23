---
date: "2026-08-23"
module: systemfsoftware
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - Resolving sibling packages by walking up from a module's own location
  - Discovering plugins, presets, or adapters by scanning a scope directory
root_cause: layout_assumption
resolution_type: design_change
related_components:
  - packages/testing/mutation/stryker-js/mutation-run
  - packages/testing/mutation/stryker-js/instrumenter
tags:
  - pnpm
  - plugin-discovery
  - node-resolution
---

# The first populated `node_modules` is not the install root

## Problem

Plugin discovery resolved a scope directory by walking up from the loader's own
module location and returning the first `node_modules/@scope` that had entries.
That is correct under a hoisted layout and under a workspace, and silently wrong
under a pnpm-isolated install: the walk hits the loader package's own virtual
`node_modules` first, which contains only that package's own dependencies. Every
sibling plugin the project installed lives one level further up and is never
seen.

The failure has no error. Discovery returns an empty list, the "expression
matched no plugins" warning is suppressed for the default expression, and the
run proceeds with no checker and no test runner — which reports as a clean
hundred-percent score. A missing directory and a wrong directory produce the
same observable as a correct directory with nothing to load.

## Core invariants

- **A resolution that can be wrong without erroring must not have a
  short-circuit.** Union every candidate root instead of stopping at the first
  populated one; the union converges on all three layouts, and no layout needs
  detecting.
- **A fixed count of `..` segments encodes a build layout, not a location.**
  `dist/` and `src/plugins/` sit at different depths, so the same expression
  resolves to different directories depending on which one is running. Resolve
  from a name the runtime can answer for, or walk until the shape matches.
- **Absence and misresolution must be distinguishable.** `ENOENT` on a candidate
  root is not an error — some candidates simply do not exist — but every other
  error is, and swallowing it turns a permissions or symlink fault into a clean
  score too.

## Code smells

- A loop that walks ancestors and `return`s inside the first successful
  iteration, when the caller's contract is "everything installed".
- A relative URL literal with four or more `..` segments in a published package.
- A warning suppressed precisely for the default value, which is the case that
  will actually run in the field.
