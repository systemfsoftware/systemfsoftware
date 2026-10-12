---
title: Display derivation is a named pure function in a `.ts` module, applied as `useAtomValue(atom, f)`
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), excluding the effect-atom bindings' own implementation
tags: [ui-state, view-model, pure-function, derivation, atom-map]
---

Display derivation over atom data (sorting, filtering, grouping, formatting, status-to-label mapping) is a named pure function, defined at module scope in a `.ts` module. A component applies it only as `useAtomValue(atom, f)`. A derived atom built with `Atom.map` or `Atom.mapResult` is defined at module scope, or inside `Atom.family`, never in a component body. The derivation is never written inline in the body or JSX, and never as an inline arrow.

Why not an inline arrow: `useAtomValue(atom, f)` derives with `React.useMemo(() => Atom.map(atom, f), [atom, f])` (`packages/atom/effect-atom-react/src/hooks-value.ts:110`), so a fresh arrow on every render derives a new atom on every render. A named function in a `.ts` module is stable, and it is the pure core that kb://software/fcis puts beside the shell: "Purity is per-function by return type, never per-folder." Its property tests and mutation measure are owned elsewhere and not restated: storybook-testing `stories-are-the-ui-integration-tests.md` and mutation-discipline `kill-survivors-with-contract-properties.md`.

Rendering load state is not domain branching: `Atom.AsyncResult.match(result, { onInitial, onFailure, onSuccess })` in a component passes.

Incident h, 2026-10-11, in one application UI: sorting, filtering, date formatting and status-to-label branching were written inline in component bodies, with no pure function and no property test.

```tsx
// WRONG (incident h): derivation inline, in an arrow passed to useAtomValue and in JSX
export function Orders() {
  const rows = AtomReact.useAtomValue(ordersAtom, (orders) => [...orders].sort(byPlacedAt).filter(isOpen))
  return (
    <ul>
      {rows.map((order) => (
        <li key={order.id}>
          {order.status === 'paid' ? 'Paid' : 'Due'} {new Date(order.placedAt).toLocaleDateString()}
        </li>
      ))}
    </ul>
  )
}
```

```ts
// RIGHT: order-rows.ts, exported and property-tested there
export const toOrderRows = (orders: ReadonlyArray<Order>): ReadonlyArray<OrderRow> =>
  orders.filter(isOpen).toSorted(byPlacedAt).map((order) => ({
    id: order.id,
    status: statusLabel[order.status],
    placed: DateTime.format(DateTime.makeUnsafe(order.placedAt), { dateStyle: 'medium' }),
  }))
```

```tsx
// RIGHT: Orders.tsx applies the named function and renders
export function Orders() {
  const rows = AtomReact.useAtomValue(ordersAtom, toOrderRows)
  return <ul>{rows.map((row) => <li key={row.id}>{row.status} {row.placed}</li>)}</ul>
}
```

`useAtomValue(atom, f)` is the second overload at `packages/atom/effect-atom-react/src/hooks-value.ts:101-103`; `Atom.map` and `Atom.mapResult` are listed in `packages/atom/effect-atom/etc/effect-atom.api.md`. `DateTime.format` and `DateTime.makeUnsafe` are `repos/effect/packages/effect/src/DateTime.ts:2472,653`.

Gate: `review` — Does any component in the diff sort, filter, group, format or branch on a domain status inline (in the body, in JSX, or in an arrow passed to `useAtomValue`), or call `Atom.map`/`Atom.mapResult` in a component body, instead of passing a named function imported from a `.ts` module?
