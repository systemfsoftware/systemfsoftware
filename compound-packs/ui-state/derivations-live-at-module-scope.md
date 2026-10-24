---
title: Display derivation is a named module-scope function, never an inline arrow passed to useAtomValue or an Atom.map in a render body
applies_when:
  - sorting, filtering, grouping, formatting or labelling atom data for display
  - passing a function to useAtomValue or deriving an atom in a component
tags: [ui-state, derivation, atom, memoization]
---

Never pass an inline arrow to useAtomValue, in either useAtomValue(atom, f) or useAtomValue(f)(atom) form. Never call Atom.map or Atom.mapResult in an application's component or hook body. useAtomValue memoizes on [atom, f], so a fresh function derives and resubscribes a new atom on every render.

Sorting, filtering, grouping, formatting and status-to-label mapping of atom data is a named function defined at module scope in a .ts module and applied as useAtomValue(atom, f). It is never written inline in a component body or in JSX.

A derived atom is defined at module scope or inside Atom.family, never in a render body.

The effect-atom bindings' own implementation (packages/atom/effect-atom-react/src/hooks-value.ts) is the runtime edge and is not governed by this rule.

```ts
// WRONG
const rows = useAtomValue(ordersAtom, (orders) => orders.filter(isOpen).toSorted(byPlacedAt))
```

```ts
// RIGHT
// order-rows.ts
export const toOpenRows = (orders: ReadonlyArray<Order>) => orders.filter(isOpen).toSorted(byPlacedAt)
// OrderList.tsx
const rows = useAtomValue(ordersAtom, toOpenRows)
```

Gate: judge
