# @systemfsoftware/example-inventory-fulfillment

An end-to-end reference application implementing the [Cell Architecture](../../compound-packs/cell-architecture/) compound pack: an e-commerce inventory fulfillment engine running Effect RPC over Node HTTP, Drizzle ORM over PostgreSQL/PGlite, and Better-Auth session validation.

## Architecture & Verification

- **Pure Decision Workflows**: Four fulfillment workflows (`explode-bundle`, `allocate-stock`, `check-credit`, `settle-fulfillment`) built with `Workflow.make`, CC = 1, and `Match.exhaustive`.
- **Five-Phase Cell Sandwiches**: Implemented via `@systemfsoftware/effect-cell-types`. State is read into commands, decoded automatically against schemas, decided purely, encoded, and committed via exhaustive write handler records.
- **Store-Issued Proofs, One Commit Point**: The settlement store's reads issue `CreditProof` and `StockProof` values keyed by module-private symbols; the `settle` write handler cannot typecheck without them. Credit, stock, reservations, and the audit row commit in one transaction that re-checks the account's `credit_version` and each allocated lot's version; a failed check is the only source of `Conflict`, which the RPC edge retries on a configured, jittered schedule and rolls back when the budget runs out.
- **Service & Layer Separation**: `InventoryStore`, `SettlementStore`, and `ReservationLog` declared as pure `Context.Service` contracts; Drizzle layers provide implementations swap-tested between PGlite (in-memory test oracle) and PostgreSQL (production), and the settlement store ships an in-memory adapter that passes the same law suite.
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
