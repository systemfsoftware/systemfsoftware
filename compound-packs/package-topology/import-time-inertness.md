---
title: Importing a published module performs no I/O and starts nothing
applies_when:
  - adding top-level code to a module a package publishes
  - creating a client, connection, or runtime value at module scope
  - reading environment variables or configuration in a library module
tags: [package-topology, import-time, side-effects, inertness]
---

Importing a published module must not:

- perform I/O (network, filesystem, sockets, child processes);
- read `process.env`, the clock, or randomness;
- start a fiber, promise, timer, or runtime;
- install global state other code observes (patching globals or prototypes, registering handlers).

These are declarations and are allowed at module scope: `const` values, lookup tables, regex sources, `Symbol.for` identities, module-private caches that stay empty until called, class declarations including `Schema.Class` and `Context.Service`, and `Layer` values, which describe construction without running it.

Import-time work breaks dead-code elimination, makes test results depend on load order, and fails in runtimes the module never meant to touch. A module that must run something on import is a subpath with the side-effect justification (`subpath-justification`).

```ts
// WRONG: connects and reads the environment on import
export const db = new DatabaseConnection(process.env.DB_URL!)

// RIGHT: a tag; a Layer at the composition root builds the connection
export class Db extends Context.Service<Db, DatabaseConnection>()('Db') {}
```

Gate: `review`.
