---
title: Display derivation of atom data is a named module-scope function, never an inline arrow passed to useAtomValue or an Atom.map in a render body
applies_when:
  - sorting, filtering, grouping, formatting or labelling atom data for display
  - passing a function to useAtomValue or deriving an atom in a component
tags: [ui-state, derivation, atom, memoization]
---

Write sorting, filtering, grouping, formatting and status-to-label mapping of atom data as a named function at module scope in a `.ts` module, applied as `useAtomValue(atom, f)`. Define a derived atom (`Atom.map`, `Atom.mapResult`) at module scope or inside `Atom.family`. Never write either in a component or hook body or in JSX.

`useAtomValue` derives its atom with `React.useMemo` over `[atom, f]`, so a function created during render builds a new atom and subscription on every render, and `Atom.map` in a body does the same. A module-scope function is also tested directly, by example or by property, without rendering. The atom library's own React bindings are the runtime edge.

```tsx
// WRONG
const rows = useAtomValue(ordersAtom, (orders) => orders.filter(isOpen).toSorted(byPlacedAt))
// RIGHT: order-rows.ts exports toOpenRows
const rows = useAtomValue(ordersAtom, toOpenRows)
```
