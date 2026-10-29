---
title: A module that implements a service through a driver is named for that driver and for the service it implements
applies_when:
  - adding a module that implements a service with a database client, the filesystem, a network client, a child process, a platform binding or a third party's SDK
  - renaming or moving a service implementation
  - adding a second implementation of an existing service
tags: [adapter, driver, naming, file-kinds]
---

A driver is a package or platform module that does I/O outside the process: a database client, the filesystem, a network or HTTP client, a child process, a runtime platform binding, or a third party's SDK. A module under src/ that imports a driver and builds a Layer for a Context.Service is an adapter. Its file name contains a word naming the driver (`postgres`, `sqlite`, `file`, `http`, or the third party's product name) and the name of the service it implements, and it carries no dotted suffix. A `*.blueprint.ts` or `*.handle.ts` module that provides a service keeps its kind suffix and is outside this rule.

**Decision test.** For each module the diff adds or renames under src/ that builds a Layer for a service: read its imports to find the driver, and its Layer to find the service. The rule fails when it imports a driver and its file name lacks a word for that driver, lacks the service's name, or carries a dotted suffix. A module that imports no driver is outside the test.

**Defect it prevents.** At the composition root, the import line is the one place a reader sees which driver a process runs on. A generic name (`ledger-impl.ts`, `ledger-live.ts`, `adapter.ts`) hides it, and a second implementation of the same service (a SQLite ledger beside the Postgres one) has no name left to take.

```
WRONG
src/ledger-impl.ts       // imports a Postgres client; the name says neither
src/cache.adapter.ts     // invented suffix, no driver in the name
```

```
RIGHT
src/postgres-ledger.ts   // Postgres driver, Ledger service
src/sqlite-ledger.ts     // a second implementation of the same service
src/file-cache-store.ts  // filesystem driver, CacheStore service
```

**Source.** Effect 4's own platform modules are named the same way, runtime plus capability (`NodeFileSystem`, `NodeHttpClient` in @effect/platform-node). File kinds are `file-kinds.md` in this pack.

Gate: judge
