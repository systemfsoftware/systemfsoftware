---
title: Data read from a server, a service or an atom lives only in the atom registry, never copied into React state and never cached by a React server-state library
applies_when:
  - a component or hook needs server data or a value from an Effect service
  - adding useState, useReducer or useRef to a component that reads atoms or services
  - adding, importing or re-exporting a React data-fetching or server-cache library
tags: [ui-state, atom, server-data, react-state, server-state-library]
---

A value read from an atom, an Effect service or a server is read where it is used, with useAtomValue or useAtomSuspense. It is never passed to a useState or useReducer setter, never used as their initial value, and never stored in a ref.

No module imports a React server-state library, in any import form, type-only included: @tanstack/react-query and its React companion packages, react-query, swr, urql, @apollo/client/react, @reduxjs/toolkit/query/react, @trpc/react-query, @trpc/tanstack-react-query, each with its subpaths. A module that re-exports one of them, under any name, is the library.

React state holds only UI-local values. A value is UI-local when all four hold: no other component reads it; it is not derived from an atom, service or fetch result; it is never persisted; it dies with the component. A DOM element handle, an open or closed flag, hover or focus, and an uncommitted input draft qualify.

Decision test: for each useState, useReducer and useRef the diff adds or changes, trace where its initial value and every value passed to its setter come from; for each data hook the diff imports, trace where the hook is defined. A value that comes from an atom, a service or a fetch result fails, and so does a hook that is, or re-exports, a library in the list above. A value that meets all four UI-local facts passes.

Defect: the same server data held twice, once in the registry and once in React state or a second library cache, drifts apart. The copy stays stale when the atom refreshes or a command invalidates it, and its loading and failure states are rebuilt by hand around it.

```tsx
// WRONG
const stock = useAtomValue(stockAtom(sku))
const [onHand, setOnHand] = useState(AsyncResult.isSuccess(stock) ? stock.value.onHand : 0)
```

```tsx
// RIGHT
const { value } = useAtomSuspense(stockAtom(sku))
const [open, setOpen] = useState(false) // UI-local: which panel is expanded
return <StockPanel onHand={value.onHand} open={open} onToggle={() => setOpen(!open)} />
```

Sources: React, "You Might Not Need an Effect" (react.dev/learn/you-might-not-need-an-effect): "When something can be calculated from the existing props or state, don't put it in state", which avoids "bugs caused by different state variables getting out of sync with each other"; for an external store, useSyncExternalStore "is less error-prone than manually syncing mutable data to React state with an Effect". The atom library's useAtomValue reads the registry through useSyncExternalStore, so the registry is already the subscribed store.

Gate: judge
