---
title: Display derivation of atom data is a named module-scope function, never an inline arrow passed to useAtomValue or an Atom.map in a render body
applies_when:
  - sorting, filtering, grouping, formatting or labelling atom data for display
  - passing a function to useAtomValue or deriving an atom in a component
tags: [ui-state, derivation, atom, memoization]
---

Sorting, filtering, grouping, formatting and status-to-label mapping of atom data is a named function defined at module scope in a .ts module, applied as useAtomValue(atom, f). A derived atom built with Atom.map or Atom.mapResult is defined at module scope or inside Atom.family. Neither is written in a component or hook body or in JSX.

The atom library's own React bindings are the runtime edge and are not governed by this rule.

Decision test: in each component and hook body and in JSX the diff adds or changes, is there an inline function passed to useAtomValue (useAtomValue(atom, f) or useAtomValue(f)(atom)), a call to Atom.map or Atom.mapResult, or a sort, filter, group, format or status-to-label branch over atom data? Any yes fails.

Defect: useAtomValue derives its atom with React.useMemo over [atom, f], so a function created during render builds a new atom and a new subscription on every render, and Atom.map in a body does the same with no memo at all. Display logic written inline can be tested only by rendering the component; a module-scope function is tested directly, by example or by property.

```tsx
// WRONG
const rows = useAtomValue(ordersAtom, (orders) => orders.filter(isOpen).toSorted(byPlacedAt))
return rows.map((o) => <Row key={o.id} placed={new Date(o.placedAt).toLocaleDateString()} />)
```

```tsx
// RIGHT
// order-rows.ts
export const toOpenRows = (orders: ReadonlyArray<Order>) =>
  orders.filter(isOpen).toSorted(byPlacedAt).map((o) => ({ id: o.id, placed: formatDay(o.placedAt) }))
// OrderList.tsx
const rows = useAtomValue(ordersAtom, toOpenRows)
```

Sources: the atom library's useAtomValue, which with a selector runs `React.useMemo(() => Atom.map(atom, f), [atom, f])`. React, "useMemo" (react.dev/reference/react/useMemo): React compares each dependency with its previous value using Object.is, so a function literal recreated on every render never matches.

Gate: judge
