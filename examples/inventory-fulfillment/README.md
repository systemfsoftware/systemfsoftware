# @systemfsoftware/example-inventory-fulfillment

A stress-test example for the [cell-architecture compound pack](../../../compound-packs/cell-architecture/): an e-commerce inventory fulfillment backend that proves the pack's rules hold on a real wire — `effect/unstable/rpc` over `@effect/platform-node`, drizzle-orm over `@effect/sql-pg` (production) and `@effect/sql-pglite` (test), better-auth for sessions.

## What it proves

- **Pure decision core**: the four fulfillment workflows (`explode-bundle`, `allocate-stock`, `check-credit`, `settle-fulfillment`) are `Workflow.make` constructions with CC=1, zero imperative control flow, and `Match.exhaustive` decision dispatch.
- **Ports separate from layers**: `InventoryStore`, `CreditLedger`, `ReservationLog`, `AuthContext` are declared without drivers; drizzle-backed Layers swap between PGlite (tests) and PostgreSQL (production) without touching port code. The clock is effect's built-in `Clock`.
- **I/O sandwich**: the `fulfillment.cell.ts` composition root reads, decodes, decides, encodes, and writes — with optimistic concurrency via a version-column CAS and a bounded retry (3) that never enters the core.
- **Decode never cast**: every row and wire payload crosses into the domain through `S.decodeUnknown`; drizzle row types never leak inward.
- **Sociable integration**: the suite drives real RPC requests through the real HTTP server into the real embedded Postgres — no mock ports.

## Stack (spike-validated)

| Concern     | Choice                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Transport   | `effect/unstable/rpc` (in-tree; the npm `@effect/rpc` v3 line is peer-incompatible)                      |
| Persistence | drizzle-orm `1.0.0-rc.5-5935859` over `@effect/sql-pg` / `@effect/sql-pglite` at `4.0.0-rc.116`          |
| Auth        | better-auth `1.7.5` with its official Drizzle adapter (promise-mode drizzle view over the shared client) |

The `unstable/*` surface rides the frozen `effect@4.0.0-rc.116` workspace pin; any bump must re-run the backend compatibility spike first.

## Run

```sh
pnpm install
pnpm --filter @systemfsoftware/example-inventory-fulfillment test
pnpm --filter @systemfsoftware/example-inventory-fulfillment typecheck
```

Environment (production path): `DATABASE_URL` and `BETTER_AUTH_SECRET` must be set; the production layer fails closed without them. See `.env.example`.
