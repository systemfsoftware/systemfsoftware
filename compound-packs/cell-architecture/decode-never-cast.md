---
title: External data must be decoded via Schema at I/O boundaries, never cast
applies_when:
  - decoding raw external input into cell Channel I or Phase 1 read results
  - reviewing type assertions or unchecked casts across I/O boundaries
tags: [cell, schema, decode, type-assertion, data-integrity]
---

Domain boundaries must enforce strict schema decoding. Unchecked type assertions and cast laundering subvert the four-channel contract and allow malformed external state to enter pure workflows:

### 1. Decode Never Cast at I/O Boundaries

Never use TypeScript type assertions (`as T`, `as unknown as T`, or unchecked object spreads) to cross from external I/O (database queries, HTTP bodies, environment variables, filesystem reads) into the domain core:

- **Strict Decoding**: All raw external data entering Channel `I` or produced during Phase 1 (`read`) must pass through `Schema.decodeUnknown` or `Schema.decodeUnknownEffect`.
- **Typed Refusal on Malformation**: Decoding errors must surface on the `E` channel as structured, typed schema errors preserving `cause`, never as unhandled runtime exceptions or silent property drops.
- **Database Rows are Untrusted**: Database drivers (e.g. Drizzle, SQL queries) produce raw row shapes. Row types must decode into domain entities at the boundary before entering pure decisions.

```ts
// WRONG: Type assertion circumvents validation, passing corrupted state to Channel I
export const readOrder = (rawId: string) =>
  Effect.gen(function*() {
    const row = yield* db.select().from(orders).where(eq(orders.id, rawId))
    return row as unknown as Order // Cast laundering! Unvalidated nulls or missing fields reach the core
  })

// RIGHT: Total schema decode at the boundary before the pure core sees the data
export const readOrder = (rawId: string) =>
  Effect.gen(function*() {
    const row = yield* db.select().from(orders).where(eq(orders.id, rawId))
    return yield* Schema.decodeUnknownEffect(OrderSchema)(row)
  })
```

Gate: `type-checker` — verify no `as unknown as T` or unvalidated type assertions cross boundary modules.

Recursive schemas: `compound-packs/schema-laws/recursive-schema-suspend.md`.
