---
title: A module that implements a service through a driver is named for that driver and for the service it implements
applies_when:
  - adding a module that implements a service with a database client, the filesystem, a network client, a child process, a platform binding or a third party's SDK
  - renaming or moving a service implementation
  - adding a second implementation of an existing service
tags: [adapter, driver, naming, file-kinds]
---

A driver is a package or platform module that does I/O outside the process: a database client, the filesystem, a network or HTTP client, a child process, a runtime platform binding, or a third party's SDK. A module under src/ that imports a driver and builds a Layer for a `Context.Service` is an adapter.

Always name an adapter's file with a word for the driver (`postgres`, `sqlite`, `file`, `http`, or the third party's product name) and the name of the service it implements, with no dotted suffix. A `*.blueprint.ts` or `*.handle.ts` module that provides a service keeps its kind suffix and is outside this rule.

Never use a generic name (`ledger-impl.ts`, `ledger-live.ts`, `adapter.ts`) or an invented suffix (`cache.adapter.ts`).

```
WRONG  src/ledger-impl.ts      // imports a Postgres client; the name says neither
RIGHT  src/postgres-ledger.ts  // Postgres driver, Ledger service
RIGHT  src/sqlite-ledger.ts    // a second implementation of the same service
```
