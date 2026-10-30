---
title: A file under src/ carries a cell-architecture kind suffix, a test, story or declaration suffix, or no dotted suffix at all
applies_when:
  - creating or renaming a file under src/
  - choosing the file name for a new service, schema, cell, workflow, blueprint or handle module
tags: [file-kinds, taxonomy, naming]
---

The kind suffixes, and what a file carrying each holds:

- `*.service.ts`: a `Context.Service` contract
- `*.workflow.ts`: one `Workflow.make` decision
- `*.schema.ts`: schemas and the operations on the types it declares
- `*.cell.ts`: one Sandwich cell
- `*.blueprint.ts`: a `Blueprint.make` kind
- `*.handle.ts`: a `Handle.make` kind

The only other dotted suffixes under src/ are a test suffix ending in `.test.ts`, `*.stories.ts(x)`, and the declarations `*.d.ts` and `*.d.mts`. Every other file under src/ has no dotted suffix, and its name says what it does (`postgres-ledger.ts`, `price-rounding.ts`). A feature's settings live in src/config.ts (configuration pack), not in a kind-suffixed file. A tool's own config file (a test runner's or bundler's) sits outside src/.

Never invent a role suffix (`ledger.store.ts`, `ledger.layer.ts`, `ledger.port.ts`, `ledger.api.ts`), and never put in a kind file anything but what its suffix names (a `*.schema.ts` that builds a Layer, a `*.service.ts` that holds an adapter). Name one contract and its implementations, not one capability split across technical tiers.

```
WRONG  src/ledger.layer.ts, src/ledger.memory.ts, src/vitest.config.ts
RIGHT  src/ledger.service.ts (contract), src/postgres-ledger.ts (implementation)
```
