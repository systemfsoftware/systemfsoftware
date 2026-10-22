---
title: Runtime- and framework-neutral code lives in a core library, each runtime or framework gets an adapter library, and runtime choice is an export condition, never a deep path
applies_when:
  - code needs a browser, Worker, Node or Deno-specific API
  - adding React, Astro or another framework binding to shared logic
  - the same capability must run in more than one runtime
tags: [composition, core, adapter, export-conditions, runtime]
---

A capability's logic lives in a core library that imports no runtime and no framework. Each runtime or framework binding is a separate adapter library that depends on the core. Where one entry must behave differently per runtime, the exports map uses conditions (`workerd`, `browser`, `node`, `deno`, `development`) that point at separate files under the same specifier. A consumer never picks a runtime by importing a deeper path.

TanStack splits every framework adapter around a `*-core` package with no React import; router-core's only extra entries are runtime roles, and runtime splits are conditions. Effect puts platform services in core and their implementations in platform packages.

Gate: fact-gated, `repo-checks composition-graph` fails a core library (`"layer": "core"` in its manifest) that value-imports a runtime or framework module (a Node builtin, `cloudflare:*`, `@cloudflare/*`, React and kin; a type-only import is erased and passes). Judge-gated (`core-adapter-split`), `repo-checks composition-core-adapters` asks a panel whether a non-core library that imports runtime modules should be split into a neutral core and adapters; that rule's calibration kappa is 0.42 over 23 cases, below 0.7, so it reports and never fails (see the README). `publint` and `attw` verify the condition branches; `package-topology/condition-branch-agreement` requires that they expose the same names.
