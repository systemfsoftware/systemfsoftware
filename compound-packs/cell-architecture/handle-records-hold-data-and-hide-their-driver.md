---
title: A handle's record holds plain data; the third-party object it wraps sits in the kind slot and its operations are exported functions
applies_when:
  - writing a handle kind or its operations
  - holding a third-party driver, client, socket or SDK object inside a handle
tags: [handle, slot, dual, driver]
---

The Data a handle kind declares (`Handle.make<Data, Slot>()(TypeId)`) holds only plain fields its users read: an id, a port, a status. A third-party object the handle wraps (a database client, a socket, an SDK instance) is the Slot, read back only inside the handle's own module through the definition's `slot` accessor. The handle's operations are functions exported from its module, written with `dual(...)` when they take arguments besides the handle so that both `query(connection, sql)` and `connection.pipe(query(sql))` type-check. No operation is a method or a closure stored on the record.

**Decision test.** Read the Data type parameter given to Handle.make and the module's exports. The rule fails when a Data field's type comes from a third-party package, when a Data field is a function, or when an exported operation that takes arguments besides the handle is not built with `dual`.

**Defect it prevents.** A driver object in a public field lets consumers call the driver directly, past the handle's own operations, and puts the driver package's types into every consumer, so replacing the driver breaks them. Functions stored on the record give each handle private copies of its operations that no caller can import, pipe or substitute, and the record stops being plain data that can be compared and logged.

```typescript
// WRONG
import type { Client } from 'some-db-driver'
const ConnectionKind = Handle.make<{
  readonly id: string
  readonly client: Client
  readonly query: (sql: string) => Effect.Effect<Rows, QueryError>
}>()(TypeId)
```

```typescript
// RIGHT
import type { Client } from 'some-db-driver'
const ConnectionKind = Handle.make<{ readonly id: string }, Client>()(TypeId) // not exported
export type Connection = Handle.Of<typeof ConnectionKind>
export const query: {
  (sql: string): (self: Connection) => Effect.Effect<Rows, QueryError>
  (self: Connection, sql: string): Effect.Effect<Rows, QueryError>
} = dual(2, (self: Connection, sql: string) =>
  Effect.tryPromise({
    try: () => ConnectionKind.slot(self).query(sql),
    catch: (cause) => new QueryError({ cause }),
  }))
```

**Source.** @systemfsoftware/effect-cell-types src/Handle.ts: `Handle.make`'s Slot parameter and `slot` accessor (https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types). `dual` is from `effect/Function`, the form Effect's own modules use for data-first and data-last calls. The cell-architecture lint rule `handle-definition-stays-private` keeps the definition, and so the slot, out of consumer code.

Gate: judge
