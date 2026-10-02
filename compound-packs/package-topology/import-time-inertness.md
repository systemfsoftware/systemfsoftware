---
title: Importing any entry of a published package performs none of the package's effects
applies_when:
  - adding top-level code to a module a package publishes
  - creating a client, connection, or runtime value at module scope
  - reading environment variables or configuration in a library module
  - adding an entry whose purpose is to register something when imported
tags: [package-topology, import-time, side-effects]
---

Importing an entry of a published package must not:

- perform I/O (network, filesystem, sockets, child processes);
- read `process.env`, the clock, or randomness;
- start a fiber, promise, timer, or runtime;
- install global state other code observes (patching globals or prototypes, registering handlers or matchers).

A package publishes descriptions, and the consumer runs them at its own composition root. A value that opens the connection, starts the loop, or spawns the worker at import is a composition root hidden in a library, whatever it is named.

Any other module-scope value is a declaration and is allowed, such as `Schema` values, `Context.Service` classes, `Symbol.for` identities, and `React.createContext`. Building a `Layer` value runs nothing either; which Layers a library may publish (parameterized `layer(options)`, never a static `*Live`) is governed by `cell-architecture/service-and-layer-boundaries.md`.

This holds for every declared entry, including one meant to register something. A registration is an exported function the consumer calls.

```ts
// WRONG: connects and reads the environment on import
export const db = new DatabaseConnection(process.env.DB_URL!)

// RIGHT: a tag; the consumer's composition root provides a Layer that builds the connection
export class Db extends Context.Service<Db, DatabaseConnection>()('Db') {}
```

Gate: `review`.
