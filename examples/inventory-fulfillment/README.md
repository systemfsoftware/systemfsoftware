# @systemfsoftware/example-inventory-fulfillment

An end-to-end reference application implementing the [Cell Architecture](../../compound-packs/cell-architecture/) compound pack: an e-commerce inventory fulfillment engine running Effect RPC over Node HTTP, Drizzle ORM over PostgreSQL/PGlite, and Better-Auth session validation.

## Architecture & Verification

- **Pure Decision Workflows**: Four fulfillment workflows (`explode-bundle`, `allocate-stock`, `check-credit`, `settle-fulfillment`) built with `Workflow.make`, CC = 1, and `Match.exhaustive`.
- **Five-Phase Cell Sandwiches**: Implemented via `@systemfsoftware/effect-cell-types`. State is read into commands, decoded automatically against schemas, decided purely, encoded, and committed via exhaustive write handler records.
- **Service & Layer Separation**: `InventoryStore`, `CreditLedger`, and `ReservationLog` declared as pure `Context.Service` contracts; Drizzle layers provide implementations swap-tested between PGlite (in-memory test oracle) and PostgreSQL (production).
- **Zero Driver Mocks**: Full integration suite runs against embedded PostgreSQL with real TCP listeners and real transactions.

## Stack

| Concern            | Implementation                                             | Version        |
| :----------------- | :--------------------------------------------------------- | :------------- |
| **Transport**      | Effect RPC over HTTP Router (`effect/unstable/rpc`)        | `4.0.0-rc.116` |
| **Persistence**    | Drizzle ORM over `@effect/sql-pg` and `@effect/sql-pglite` | `1.0.0-rc.5`   |
| **Authentication** | Better-Auth session middleware                             | `1.7.5`        |

## Execution

```bash
# Run integration test suite against embedded PGlite
pnpm --filter @systemfsoftware/example-inventory-fulfillment test

# Run type checks
pnpm --filter @systemfsoftware/example-inventory-fulfillment typecheck
```
