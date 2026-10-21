---
title: Dependency edges point from applications to libraries and from libraries to lower libraries; nothing imports an application and the graph has no cycles
applies_when:
  - adding a workspace dependency or a cross-package import
  - moving code between packages
  - an application needs something another application has
tags: [composition, dependency-graph, layering, cycles]
---

The workspace graph is a directed acyclic graph with applications only at its top. Libraries sit in layers: contracts and core libraries, which import only `effect` and other contracts and core libraries, then adapters, which import a core library plus their driver.

- An application never imports another application. What they share becomes a library (`contracts-between-applications`).
- A library never imports an application, and a lower layer never imports a higher one.
- A cycle is fixed by moving the shared piece down, never by a dynamic import or a type-only escape.

TanStack's `query-core` has no dependencies or peers, and every framework adapter depends on it, never the reverse. Effect keeps services in `effect` and their implementations in runtime packages. Both graphs point one way.

Gate (fact-gated): `repo-checks composition-graph`. It builds the import graph with the TypeScript compiler (a program per unit from its own tsconfig; each import, export-from, dynamic import and require resolved through the package.json `exports` map and its conditions) and compares it with the declared dependencies. It fails on any edge into an application, an import with no declared dependency, any cycle, and a runtime dependency that is declared but never imported when the unit declares itself a library (an import is the only use the compiler sees; an application or template, or a unit with no declared kind, may install a toolchain it never imports, so for those the check reports and does not fail). An import inside a string, template or comment is not an import.
