---
title: React code runs no React Effect; it reads atoms and subscribes through useSyncExternalStore
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), the effect-atom bindings included
tags: [ui-state, react-effect, useEffect, useSyncExternalStore, hydration, atom]
---

React code runs no React Effect. react.dev says Effects "let you 'step outside' of React and synchronize your components with some external system", and in a UI built on effect-atom every external system is an Effect service reached through a runtime atom: a component reads with `useAtomValue` or `useAtomSuspense` and dispatches with `useAtomSet`. Binding code that subscribes React to a store uses `useSyncExternalStore`, which react.dev calls "a purpose-built Hook for subscribing to an external store that is preferred instead" of an Effect. That leaves no React Effect to write, in application code or in the bindings (ruling of 2026-10-13).

1. **No React Effect hook in any form.** No module calls or references `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react`: not through a named or aliased import, a namespace or default member, a destructured binding, a re-export, or a value passed around (`const afterCommit = useEffect`). react.dev reserves `useInsertionEffect` "for CSS-in-JS library authors", and Effect Events "can only be called from inside Effects", so with Effects gone neither has a use. There is no exception.
2. **`react` is imported by name.** Namespace and default imports of `react` are refused, type-only ones included, and so are `import('react')` and `require('react')`, which load the whole module with its Effect hooks as members. Every React API a module reaches is visible in its import list: `import { useMemo, useSyncExternalStore } from 'react'`, `import type { ReactNode } from 'react'`.
3. **Saved data reaches the registry before the first render.** The code that mounts the app owns the registry: it seeds it with `Atom.Registry.make({ initialValues })`, restores saved state with `Atom.Hydration.hydrate(registry, state)` before `hydrateRoot` or `createRoot(...).render`, and disposes it at teardown. The binding writes no registry state from React, and no Effect waits for commit to write it. `Atom.Hydration.hydrate` assigns the saved value to each atom the state names and replaces a value the registry already holds, so the owner restores saved state before the first render, while those atoms have not been read yet; restored before render, saved data never overwrites a value already on screen (ruling of 2026-10-13). Upstream hydrates during render and defers atoms the page already holds to a `useEffect`, because hydrating a live registry during a transition that is later abandoned would change the current page: tim-smart/effect-atom `packages/atom-react/src/ReactHydration.ts` at `2fc0f70` holds existing atoms back "until _after_ the render phase" because "If the transition is aborted, we will have hydrated any _new_ Atom values, but we throw away the fresh data for any existing ones" (lines 36-42); TanStack/query `packages/react-query/src/HydrationBoundary.tsx` at `0fbbc62` does the same for queries (lines 106-112). Hydrating before render leaves no live registry to protect, so that Effect has no job here. The one write after commit is the engine's own: an entry the server dehydrated while still pending is completed when the server's promise resolves, outside React, and components see it through `useSyncExternalStore`.
4. **The ban takes no inline exception.** No `oxlint-disable` or `eslint-disable` directive, in any of its line, next-line or block forms, names the Effect rule, covers a refused import or load under items 1-2 without naming a rule, or names the import ban where it covers a refused `react` import. A directive that turns off an unrelated rule is outside this rule.

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
// WRONG: saved state is written into the registry after commit
export function SavedPage({ state, children }: { readonly state: SavedState; readonly children: ReactNode }) {
  const registry = AtomReact.useRegistry()
  useEffect(() => {
    Atom.Hydration.hydrate(registry, state)
  }, [registry, state])
  return children
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
// RIGHT: the effect-atom binding subscribes React to the registry (effect-atom-react src/hooks-value.ts:15-25)
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

```tsx
// RIGHT: the entry that mounts the app restores saved state before the first render
const registry = Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask })
Atom.Hydration.hydrate(registry, savedState)
hydrateRoot(
  container,
  <AtomReact.RegistryProvider registry={registry}>
    <App />
  </AtomReact.RegistryProvider>,
)
```

A reaction to an atom change that must run code, not render, is no hook: it is `Atom.Registry.subscribe(registry, atom, f)` inside a scoped Effect outside React, released with its scope.

Gate: `review` — Does the diff add a call or reference to `useEffect`, `useLayoutEffect`, `useInsertionEffect` or `useEffectEvent` from `react` in any form? Does it import `react` through a namespace or default specifier, `import('react')` or `require('react')`? Does it add a disable directive that turns either ban off where it applies?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-imports` on `react` for `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useEffectEvent` and `default`, which also refuses every namespace import of `react`, type-only included, every re-export of those names and every `export * from 'react'`; and `@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect` reports every `import('react')` and `require('react')` with a literal specifier and every directive item 4 refuses. Each message names `ui-state/react-runs-no-effect`. Review covers what neither sees: a computed specifier such as `import(name)` and an Effect hook re-exported by a third-party package.
