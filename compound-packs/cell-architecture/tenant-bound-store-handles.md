---
title: Tenant-bound store handles must be constructed at the request edge, never via generic type tags
applies_when:
  - scoping stores and database access to authenticated tenants
  - authoring multi-tenant service tags, context environments, or cell handlers
  - designing store operations that manipulate tenant-isolated data
tags: [cell, store, multi-tenant, context, handles, isolation]
---

Construct tenant-bound store instances at the request edge from authenticated context and provide them as scoped environment handles. Store operations must never accept a tenant ID parameter.

Attaching a generic type parameter to a service tag (`LedgerStoreFor<Tenant>`) does not isolate data. TypeScript erases type parameters at runtime, and Effect's `Context` holds services in a `ReadonlyMap<string, any>` keyed by each tag's string key (`repos/effect/packages/effect/src/Context.ts`, lines 467–472 and 724–727). Two tags that differ only in a type argument share one key, so they resolve to the same service.

1. **Edge Construction**: Construct tenant-bound store instances at the request boundary using verified tenant credentials from authentication middleware or RPC context.
2. **Omit Tenant Arguments**: Public store operations must not take a `tenantId` parameter. Storing and querying are inherently scoped by the handle itself (e.g. via connection pooling, row-level security, or pre-filtered repository closures).
3. **Erased Type Tags are Ineffective**: Generic service tags cannot provide isolation across tenants. Distinct tenants sharing an Effect environment will collide under the same string key.
4. **Multi-Tenant Operations**: Operations that must coordinate across multiple tenants simultaneously must receive distinct tenant store handles as explicit values, rather than ambient environment services.

```ts
// WRONG: the type argument is erased; every tenant's tag has the key 'LedgerStore'
interface LedgerStore<Tenant> {
  readonly charge: (tenantId: string, amount: Money) => Effect.Effect<void>
}
const LedgerStoreFor = <Tenant>() => Context.Service<LedgerStore<Tenant>>('LedgerStore')

// RIGHT: Tenant-bound store handle constructed at edge, without tenantId in operations
export interface TenantSettlementStore {
  readonly readCredit: (customerId: string) => Effect.Effect<{
    readonly account: CreditAccount
    readonly proof: CreditProof
  }>
  readonly settle: (command: SettleCommand) => Effect.Effect<'Committed' | 'Conflict'>
}

export const makeTenantStore = (tenantId: TenantId): TenantSettlementStore => ({
  readCredit: (customerId) => db.scoped(tenantId).readCredit(customerId),
  settle: (command) => db.scoped(tenantId).settle(command),
})
```

Gate: `review` — verify that store operations take no tenant ID parameter, generic type tags are not used for tenant isolation, and tenant-bound store handles are constructed at the boundary edge.
