---
title: A file under src/ carries only a cell-architecture kind suffix or a suffix its tool loads by name, and an adapter is named for the driver it binds
applies_when:
  - creating or renaming a file under src/
  - adding a module that implements a service through a driver or platform runtime
tags: [file-kinds, taxonomy, naming, adapter]
---

The kind suffixes are *.service.ts (a Context.Service contract), *.workflow.ts (a Workflow.make decision), *.schema.ts (schemas and operations on the types it declares), *.cell.ts (one Sandwich cell), *.blueprint.ts (Blueprint.make) and *.handle.ts (Handle.make).

The only other dotted suffixes under src/ are a test suffix ending in .test.ts, *.stories.ts or *.stories.tsx, and the declaration suffixes *.d.ts and *.d.mts. A configuration file a tool loads by name sits outside src/.

Never invent a suffix to mark a role or tier (*.api.ts, *.layer.ts, *.port.ts, *.memory.ts, *.fake.ts, *.store.ts, *.client.ts, *.model.ts, *.live.ts, *.medium.ts, or *.config.ts under src/).

A blueprint or handle module keeps its kind suffix when it provides a service. Every other module that implements a service through a driver carries no suffix and is named for the driver it binds and the capability it serves (postgres-ledger.ts, file-cache-store.ts).

Whether a module is an adapter, and whether its name names its driver, is decided by the review judge; an uncertain case escalates.

```
WRONG
src/ledger.layer.ts
src/ledger.api.ts
src/ledger.memory.ts
```

```
RIGHT
src/ledger.service.ts   // the contract
src/postgres-ledger.ts  // the adapter, named for the Postgres driver it binds
```

Gate: judge
