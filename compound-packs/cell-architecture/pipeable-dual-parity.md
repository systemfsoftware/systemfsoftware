---
title: Blueprints and handles carry the kind's Pipeable prototype and full dual parity
applies_when:
  - authoring combinators and operations on blueprints and handles
  - implementing fluent APIs in capability packages
  - integrating blueprints and handles with Effect pipe workflows
tags: [cell, pipeable, dual, combinators]
---

Every blueprint and handle is `Pipeable`, and every operation is reachable both as a method (`self.op(...)`) and as a data-last function in `pipe(...)`. Both halves are supplied by the kind; the module never builds either by hand.

### 1. Prototype-backed Pipeable, attached by the kind

`Blueprint.make` and `Handle.make` attach the `Pipeable` prototype and the nominal `[TypeId]` brand when they mint the record. A blueprint carries its steps as methods and a handle carries its data; the kind attaches the prototype for both. A module must not spread `Prototype` from `effect/Pipeable` or write a computed `[TypeId]` key:

```ts
// WRONG: hand-built prototype and brand — a forge of the kind-minted record
const RunningVM = { ...Prototype, [TypeId]: TypeId, name }

// RIGHT: the kind mints and brands; do not re-implement it
const RunningVM = Handle.make<{ readonly name: string }, RawDriver>()(TypeId)

export type RunningVM = Handle.Of<typeof RunningVM>
```

### 2. Dual parity, derived from one declaration (Rule R6)

In accordance with `skill://gcanti-tim-smart-style` (Rule `R6`), every fluent builder and combinator must provide full parity between direct method chaining and data-last functional composition using Effect's `pipe(...)`. Each operation is declared once and the kind derives the forms:

- `Blueprint.make<Spec>()(TypeId).steps({ steps, targets })` installs each step as a method and exposes the data-first/data-last dual as `definition.operations.<name>`; the module re-exports that dual.
- `Blueprint.make<Spec, X>()(TypeId).operations<Ops>()({ operations, targets })` declares one indexed transition per operation, from which the method, the data-first dual, and the data-last dual are all derived.

A handle's own operations are not on the kind, so each is authored as a standalone `dual(...)` over the record and the data-last form composes like any Effect function.

```ts
import { dual } from 'effect/Function'

// Blueprint step: one declaration, three forms — method, data-first, data-last.
export const withPort = Containers.operations.withPort

// Handle operation: authored once with dual, both forms.
export const exec: {
  (cmd: string): (self: RunningVM) => Effect.Effect<ExecResult, ExecError>
  (self: RunningVM, cmd: string): Effect.Effect<ExecResult, ExecError>
} = dual(
  2,
  (self: RunningVM, cmd: string): Effect.Effect<ExecResult, ExecError> =>
    Effect.tryPromise({
      try: () => RunningVM.slot(self).execute(cmd),
      catch: (cause) => new ExecError({ cmd, cause }),
    }),
)
```

```ts
// WRONG: a bare two-argument function has a data-first shape but no data-last twin
const withEnv = (spec: ContainerSpec, env: Record<string, string>): ContainerSpec =>
  /* ... */
  pipe(make('postgres:16'), withEnv({ POSTGRES_DB: 'app' })) // TypeError: not a dual

// RIGHT: full parity — chain or pipe the same operation
const a = make('postgres:16').pipe(withPort(5432), withEnv({ POSTGRES_DB: 'app' }))

const b = pipe(
  make('postgres:16'),
  withPort(5432),
  withEnv({ POSTGRES_DB: 'app' }),
)
```

Gate: `kind-record-minted-by-kind`, `type-checker`, `review` — verify every blueprint/handle record is minted through the kind (no hand-spread `Prototype`, no computed `[TypeId]`), each operation has one declaration whose method, data-first, and data-last forms agree, and that where the derived dual trips the linter an annotated `dual(...)` overload set is exported over the same implementation (`docs/solutions/architecture-patterns/blueprint-type-index-reads.md`).
