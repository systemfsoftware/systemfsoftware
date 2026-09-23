---
title: Conditional saves must require store-issued proofs minted from an earlier read
applies_when:
  - authoring or calling conditional store save operations
  - passing observed state or versions from sandwich read to write phases
  - designing compile-time tokens against stale or forged writes
tags: [cell, store, proof, compile-time-safety, unique-symbol, optimistic-locking]
---

A store's conditional save must accept a decision only with a proof issued by that store's read phase. Code outside the store's internal modules cannot create, forge, or cast this proof.

Relying on naked primitive versions (`number` or `string`) allows write callsites to forge versions, swap keys, or omit concurrency checks silently. Using TypeScript module-private `unique symbol` keys guarantees compile-time prevention of unauthorized proof creation (TypeScript Handbook, Symbols; https://www.typescriptlang.org/docs/handbook/symbols.html).

1. **Unforgeable Token**: The proof type carries a module-private `unique symbol` property exported only as a type. The minting functions and symbol values remain private to store adapter modules. Saving without a proof, passing an object literal, or passing another store's proof fails type checking.
2. **Key and Lifetime Binding**: A proof issued for one entity key or an outdated version is rejected at runtime by the store as a conflict.
3. **Proof Content**: By default, the proof carries the observed version or etag. Where contention makes version conflicts costly, a store may carry a business condition derived directly from `decide`'s precondition, never a duplicated ad-hoc business rule.
4. **Type Test Requirement**: The adopting package must provide a type test (e.g. using TSTyche) proving that calls to `settle` or conditional saves without a proof, with raw object literals, or with mismatched proof types are rejected by the compiler.

```ts
// WRONG: Naked version numbers allow forgery, omission, or passing arbitrary numbers
export interface InsecureStore {
  readonly readCredit: (id: string) => Effect.Effect<{ balance: number; version: number }>
  readonly settle: (id: string, amount: number, version: number) => Effect.Effect<'Committed' | 'Conflict'>
}
// Caller can forge: store.settle('cust-1', 50, 999)

// RIGHT: only src/store/SettlementProof.ts can write the key, so only the store mints proofs
const CreditProofId: unique symbol = Symbol('CreditProof')
export interface CreditProof {
  readonly [CreditProofId]: { readonly customerId: string; readonly version: number }
}

export interface SettlementCommand {
  readonly orderId: string
  readonly customerId: string
  readonly events: readonly InventoryReservationEvents[]
  readonly audit: AuditPayload
  readonly stock: StockProof
  readonly charge: Option.Option<{ readonly amount: Money; readonly proof: CreditProof }>
}
// settle({ ...command, charge: Option.some({ amount, proof: { version: 7 } }) })  -> type error
// settle({ ...command, charge: Option.some({ amount, proof: stockRead.proof }) }) -> type error
```

Gate: `type-checker` — verify that conditional store mutations require nominal store-issued proof types keyed by module-private unique symbols, preventing object literal instantiation and mismatched store proof passing.
