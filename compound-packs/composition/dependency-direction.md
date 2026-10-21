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

Gate: `repo-checks composition-graph`. It builds the graph from `package.json` dependencies AND the import specifiers in source (a declared dependency that is never imported fails, and so does an import with no declared dependency). It fails on any edge into an application, any upward edge between library layers, and any cycle.
