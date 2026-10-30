---
title: A handle's record holds plain data; the third-party object it wraps sits in the kind slot and its operations are exported functions
applies_when:
  - writing a handle kind or its operations
  - holding a third-party driver, client, socket or SDK object inside a handle
tags: [handle, slot, dual, driver]
---

The Data a handle kind declares (`Handle.make<Data, Slot>()(TypeId)`) holds only plain fields its users read: an id, a port, a status. The third-party object the handle wraps (a database client, a socket, an SDK instance) is the Slot, read back only inside the handle's module through the definition's `slot` accessor.

Write the handle's operations as functions exported from its module, with `dual(...)` when they take arguments besides the handle, so both `query(connection, sql)` and `connection.pipe(query(sql))` type-check. Never put a driver object or a function on the record: a driver in a public field lets consumers bypass the handle and ties every consumer to the driver package's types.

```typescript
// WRONG
Handle.make<{ readonly id: string; readonly client: Client; readonly query: (sql: string) => Effect.Effect<Rows> }>()(
  TypeId,
)
// RIGHT
const ConnectionKind = Handle.make<{ readonly id: string }, Client>()(TypeId) // not exported
export const query = dual(
  2,
  (self: Connection, sql: string) =>
    Effect.tryPromise({ try: () => ConnectionKind.slot(self).query(sql), catch: (cause) => new QueryError({ cause }) }),
)
```
