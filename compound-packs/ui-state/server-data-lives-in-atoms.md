---
title: Data read from a server, a service or an atom lives only in the atom registry, never copied into React state and never cached by a React server-state library
applies_when:
  - a component or hook needs server data or a value from an Effect service
  - adding useState, useReducer or useRef to a component that reads atoms or services
  - adding, importing or re-exporting a React data-fetching or server-cache library
tags: [ui-state, atom, server-data, react-state, server-state-library]
---

Read a value from an atom, an Effect service or a server where it is used, with `useAtomValue` or `useAtomSuspense`. Never pass it to a `useState` or `useReducer` setter, use it as their initial value, or store it in a ref: the copy goes stale when the atom refreshes or a command invalidates it, and its loading and failure states get rebuilt by hand.

Never import a React server-state library, in any import form, type-only included: `@tanstack/react-query` and its React companions, `react-query`, `swr`, `urql`, `@apollo/client/react`, `@reduxjs/toolkit/query/react`, `@trpc/react-query`, `@trpc/tanstack-react-query`, with their subpaths. A module that re-exports one is the library.

React state holds only UI-local values: no other component reads it, it is not derived from an atom, service or fetch result, it is never persisted, and it dies with the component (a DOM element handle, an open or closed flag, hover or focus, an uncommitted input draft).

```tsx
// WRONG
const [onHand, setOnHand] = useState(AsyncResult.isSuccess(stock) ? stock.value.onHand : 0)
// RIGHT
const { value } = useAtomSuspense(stockAtom(sku))
const [open, setOpen] = useState(false) // UI-local: which panel is expanded
```
