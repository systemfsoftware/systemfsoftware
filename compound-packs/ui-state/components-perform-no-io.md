---
title: A React component or hook module performs no I/O and reads no clock or timer; every outside value reaches it through a runtime atom
applies_when:
  - writing or reviewing a React component or hook in an effect-atom application
  - a component needs server data, a browser storage value, the current time or a delay
  - persisting a person's choice on the client
tags: [ui-state, io, clock, timer, storage, react, atom]
---

A component or hook module (.tsx and .ts alike) calls none of these, and calls no function that does unless that function is an Effect service in the app's Layer:

- network: `fetch` (bare, aliased, or on `globalThis`, `window` or `self`), `XMLHttpRequest`, `WebSocket`, `EventSource`
- storage: `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`
- clock and timers: `Date.now()`, `new Date()` with no argument, `performance.now()`, `setTimeout`, `setInterval`

Each is an Effect service in the app's Layer, read through a runtime atom: server data through `appRuntime.atom(...)`, client-persisted state through `Atom.kvs` over a runtime whose Layer provides a KeyValueStore, the current time through a runtime atom with `Atom.withRefresh`, a delay on input through `Atom.debounce`. `new Date(value)` from a value the component was given is formatting, not a clock read (derivations-live-at-module-scope.md). The atom library's own React bindings are the runtime edge.

This keeps responses from racing out of order, keeps inputs a story can set, and lets stories use the I/O stand-ins the preview loads (ui-testing pack: stories-get-io-from-stand-ins-beside-the-io-module.md).

```tsx
// WRONG
useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 30_000)
  return () => clearInterval(t)
}, [])
useEffect(() => localStorage.setItem('sync-view', view), [view])
// RIGHT
export const nowAtom = appRuntime.atom(DateTime.now).pipe(Atom.withRefresh('30 seconds'))
export const syncViewAtom = Atom.kvs({
  runtime: appRuntime,
  key: 'sync-view',
  schema: SyncView,
  defaultValue: () => 'list',
})
```
