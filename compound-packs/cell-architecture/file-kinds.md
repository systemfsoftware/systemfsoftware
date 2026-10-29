---
title: A file under src/ carries a cell-architecture kind suffix, a test, story or declaration suffix, or no dotted suffix at all
applies_when:
  - creating or renaming a file under src/
  - choosing the file name for a new service, schema, cell, workflow, blueprint, handle or settings module
tags: [file-kinds, taxonomy, naming]
---

The kind suffixes, and what a file carrying each one holds:

- `*.service.ts`: a Context.Service contract
- `*.workflow.ts`: one Workflow.make decision
- `*.schema.ts`: schemas and the operations on the types it declares
- `*.cell.ts`: one Sandwich cell
- `*.blueprint.ts`: a Blueprint.make kind
- `*.handle.ts`: a Handle.make kind
- `*.config.ts`: a feature's `<Feature>Config` settings service, as the configuration pack defines it

The only other dotted suffixes under src/ are a test suffix ending in `.test.ts`, `*.stories.ts` and `*.stories.tsx`, and the declaration suffixes `*.d.ts` and `*.d.mts`. A configuration file a tool loads by name (a test runner's or bundler's config) sits outside src/. Every other file under src/ has no dotted suffix, and its name says what it does (`postgres-ledger.ts`, `price-rounding.ts`).

**Decision test.** For each file the diff adds or renames under src/, take the part of its basename between the stem and the extension. The rule fails when that part is neither empty nor one of the suffixes above, or when the file does not hold what its suffix names (a `*.schema.ts` that builds a Layer, a `*.service.ts` that holds an adapter).

**Defect it prevents.** Lint rules and reviewers select files by kind suffix: the cell-architecture lint applies its blueprint, handle and cell rules by suffix. A file with an invented role suffix (`ledger.store.ts`, `ledger.layer.ts`) looks governed while no rule selects it, and renaming it from one invented suffix to another silently drops whatever check had keyed on the old one. Role suffixes also split one capability across files named for technical tiers (`ledger.port.ts`, `ledger.layer.ts`, `ledger.memory.ts`) instead of one contract and named implementations.

```
WRONG
src/ledger.layer.ts
src/ledger.api.ts
src/ledger.memory.ts
src/vitest.config.ts
```

```
RIGHT
src/ledger.service.ts   // the contract
src/postgres-ledger.ts  // an implementation, named by adapters-are-named-for-their-driver.md
vitest.config.ts        // tool configuration, outside src/
```

**Source.** The kinds are the modules of @systemfsoftware/effect-cell-types (Workflow, Sandwich, Blueprint, Handle; https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types) and the cell-architecture lint in the same repository, which selects kind files by suffix. The `*.config.ts` kind is the configuration pack's `settings-reach-code-through-context.md`.

Gate: judge
