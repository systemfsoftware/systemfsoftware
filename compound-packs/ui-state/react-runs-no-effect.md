---
title: React code runs no React Effect; it reads atoms and subscribes through useSyncExternalStore
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), the effect-atom bindings included
tags: [ui-state, react-effect, useEffect, useSyncExternalStore, hydration, atom]
---

React code runs no React Effect. react.dev says Effects "let you 'step outside' of React and synchronize your components with some external system", and in a UI built on effect-atom every external system is an Effect service reached through a runtime atom: a component reads with `useAtomValue` or `useAtomSuspense` and dispatches with `useAtomSet`. Binding code that subscribes React to a store uses `useSyncExternalStore`, which react.dev calls "a purpose-built Hook for subscribing to an external store that is preferred instead" of an Effect. That leaves no React Effect to write (ruling of 2026-10-13).

1. **No React Effect hook in any form.** No module calls or references `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react`: not through a named or aliased import, a namespace or default member, a destructured binding, a re-export, or a value passed around (`const afterCommit = useEffect`). react.dev reserves `useInsertionEffect` "for CSS-in-JS library authors", and Effect Events "can only be called from inside Effects", so with Effects gone neither has a use.
2. **`react` is imported by name.** Namespace and default imports of `react` are refused, type-only ones included, so every React API a module reaches is visible in its import list: `import { useMemo, useSyncExternalStore } from 'react'`, `import type { ReactNode } from 'react'`.
3. **One admitted Effect: effect-atom's after-commit hydration.** `HydrationBoundary` hydrates atoms that already hold a value after commit, so an aborted transition cannot change what the current page shows. The admitted shape is exact: a `useEffect` with a dependency array, whose callback is a block holding one statement, a call `Atom.Hydration.hydrate(registry, queue)` with two arguments, where `Atom` is imported from `@systemfsoftware/effect-atom`. Without the dependency array, with a second statement, with an expression body, or with an `Atom` from any other module, it is a reach under item 1. This holds wherever the code sits; the exception is for what the Effect does, not for the package it is in.

Incidents, all 2026-10-11, in one application UI, each an Effect gluing an external system to React state. (b) A `useEffect` fetched server data and copied it into `useState`. (c) A `useEffect` built an Effect, ran it with `runtime.runFork(...)` and pushed the result and the error back with `Effect.sync(() => setView(...))`. (e) A `useEffect` started `setInterval(() => setNow(new Date()), 30_000)`. (f) A `useEffect` wrote `localStorage.setItem(key, JSON.stringify(value))` whenever the value changed. Where each goes instead: (b) and (c) are runtime atoms (`server-data-lives-in-atoms.md`, `components-dispatch-to-runtime-atoms.md`); (e) and (f) are atoms over the clock and `KeyValueStore` (`components-perform-no-io.md`).

```tsx
// WRONG (incident c): an Effect runs a fiber by hand and pushes the result into useState
export function OrderPanel({ orderId }: { readonly orderId: string }) {
  const [view, setView] = useState<OrderView | null>(null)
  useEffect(() => {
    const fiber = runtime.runFork(
      Orders.view(orderId).pipe(Effect.tap((next) => Effect.sync(() => setView(next)))),
    )
    return () => runtime.runFork(Fiber.interrupt(fiber))
  }, [orderId])
  return view === null ? <Loading /> : <OrderCard view={view} />
}
```

```ts
// WRONG: a hook subscribes in an Effect and mirrors the store into useState
export const useStock = (store: StockStore): number => {
  const [stock, setStock] = useState(store.read())
  useEffect(() => store.subscribe(() => setStock(store.read())), [store])
  return stock
}
```

```tsx
// RIGHT: the component reads a runtime atom (orders.atoms.ts holds the atom, built as server-data-lives-in-atoms.md shows)
export const orderViewAtom = Atom.family((orderId: string) =>
  appRuntime.atom(Orders.use((orders) => orders.view(orderId)))
)

export function OrderPanel({ orderId }: { readonly orderId: string }) {
  const view = AtomReact.useAtomValue(orderViewAtom(orderId))
  return Atom.AsyncResult.match(view, {
    onInitial: () => <Loading />,
    onFailure: () => <span role='alert'>Order unavailable</span>,
    onSuccess: ({ value }) => (Context.isContext(value) ? null : <OrderCard view={value} />),
  })
}
```

```ts
// RIGHT: the effect-atom binding subscribes React to the registry (effect-atom-react src/hooks-value.ts:16-26)
function useStore<A>(registry: Atom.Registry.Registry, atom: Atom.Atom<A>): A {
  const subscribe = useMemo(
    () => (onStoreChange: () => void) => Atom.Registry.subscribe(registry, atom, () => onStoreChange()),
    [registry, atom],
  )
  return useSyncExternalStore(
    subscribe,
    () => Atom.Registry.get(registry, atom),
    () => Atom.getServerValue(atom, registry),
  )
}
```

```ts
// RIGHT: the one admitted Effect (effect-atom-react src/hydration-boundary.ts:131-135)
const hydrationQueue = useMemo(() => queueHydration(registry, state), [registry, state])

useEffect(() => {
  Atom.Hydration.hydrate(registry, hydrationQueue)
}, [registry, hydrationQueue])
```

A reaction to an atom change that must run code, not render, is no hook: it is `Atom.Registry.subscribe(registry, atom, f)` inside a scoped Effect outside React, released with its scope.

Gate: `review` — Does the diff add a call or reference to `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react` in any form, other than a `useEffect` with a dependency array whose callback is the single statement `Atom.Hydration.hydrate(registry, queue)` with `Atom` from `@systemfsoftware/effect-atom`? Does it import `react` through a namespace or default specifier?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-imports` on `react` for `useLayoutEffect`, `useInsertionEffect`, `useEffectEvent` and `default`, which also refuses every namespace import of `react`, type-only included, and every `export * from 'react'`; and `@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect`, which reports every reach of `useEffect` imported from `react` (a call, a value passed around, a named re-export) except item 3's shape. Each message names `ui-state/react-runs-no-effect`. Review covers what neither sees: a dynamic `import('react')` and an Effect hook re-exported by a third-party package.
