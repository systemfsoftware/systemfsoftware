---
title: Dependencies must point inward from the imperative shell to the pure domain core
applies_when:
  - organizing package structure, folders, or modules in an application
  - adding import statements in domain decisions, workflows, or schemas
  - introducing database clients, HTTP frameworks, or external SDKs
  - wiring dependencies at the application entrypoint or composition root
tags: [cell-architecture, inward-dependencies, onion-architecture, fcis, composition-root]
---

# Dependencies must point inward from the imperative shell to the pure domain core

The fundamental dependency rule of Functional Core, Imperative Shell (FCIS) and Cell Architecture is that **dependencies point inward** (`CONSTITUTION.md` CONST-B4, `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`).

The imperative shell (handlers, CLI commands, HTTP controllers, database repositories, message listeners) may import the pure domain core (workflows, commands, decision variants, domain schemas). The pure core must never import the shell, the database, transport layers, or external frameworks.

```text
External World / Transports / Drivers (HTTP, CLI, Postgres, S3)
  ↓ (imports & drives)
Imperative Shell (Executors, Adapters, Handlers, Sandwiches)
  ↓ (imports & calls)
Pure Domain Core (Workflows, Decisions, Schemas, Branded Types)
```

## Doctrine & Constraints

- **Pure Core has Zero Infrastructure Imports**: A `*.workflow.ts` or domain model file must never import node built-ins (`node:fs`, `node:net`, `node:http`), database drivers (`pg`, `@effect/sql-*`), HTTP libraries, or framework runtimes.
- **Wire at One Composition Root**: All concrete implementations and environment layers are assembled and wired at a single composition root (typically `main.ts` or `entrypoint.ts`).
- **Purity by Return Type, Not Folder**: While directory structure should be clean, purity is determined by function signatures (`(input: In) => Result<Out, Err>` vs `Effect<A, E, R>`), not by whether a file lives in a folder called `pure/` or `core/` (`CONSTITUTION.md` CONST-P3).
- **Core Never Instantiates Drivers**: The core defines abstract ports (`Context.Tag`) if capabilities are needed across boundaries, but never constructs the driver.

## Calibration Examples

- **wrong**:
  ```ts
  // Inside a domain decision module:
  import { dbClient } from '../infrastructure/db' // VIOLATION: Core imports database driver!

  export const decideRebalance = (account: Account) => {
    // Calling or referencing dbClient here couples domain logic to infrastructure
  }
  ```
- **right**:
  ```ts
  // Pure domain workflow:
  // src/domain/rebalance.workflow.ts
  import { Workflow } from '@systemfsoftware/effect-cell-types'
  import { AccountCommand } from './Account.schema'

  export const decideRebalance = Workflow.make(AccountCommand, (account) => {
    // Pure calculation and decision mapping only. Zero infrastructure imports.
  })

  // Imperative shell:
  // src/shell/rebalance.executor.ts
  import { decideRebalance } from '../domain/rebalance.workflow'
  import { loadAccount, persistRebalance } from '../infrastructure/db'

  export const runRebalance = (id: string) =>
    Sandwich.read(() => loadAccount(id))
      .decide(decideRebalance)
      .write((outcome) => persistRebalance(outcome))
  ```

## Verification & Gate

- `lint`: Import-origin and dependency linter rejects any import of shell/driver libraries inside pure core packages or `*.workflow.ts` files.
- `type-checker`: Packages without I/O dependencies cannot import them (`TS2307: Cannot find module`).
