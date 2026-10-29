---
title: A React component or hook module performs no I/O and reads no clock or timer; every outside value reaches it through a runtime atom
applies_when:
  - writing or reviewing a React component or hook in an effect-atom application
  - a component needs server data, a browser storage value, the current time or a delay
  - persisting a person's choice on the client
tags: [ui-state, io, clock, timer, storage, react, atom]
---

A component or hook module in an application (.tsx and .ts alike) calls none of these, and calls no function that does unless that function is an Effect service in the app's Layer:

- network: fetch (bare, aliased, or as a property of globalThis, window or self), XMLHttpRequest, WebSocket, EventSource;
- storage: localStorage, sessionStorage, indexedDB, document.cookie;
- clock and timers: Date.now(), new Date() with no argument, performance.now(), setTimeout, setInterval.

Each is an Effect service in the app's Layer, read through a runtime atom: server data through `appRuntime.atom(...)`, client-persisted state through `Atom.kvs` over a runtime whose Layer provides a KeyValueStore, the current time through a runtime atom with `Atom.withRefresh`, a delay on input through `Atom.debounce`. `new Date(value)` built from a value the component was given is formatting, not a clock read; derivations-live-at-module-scope.md governs it.

The atom library's own React bindings are the runtime edge and are not governed by this rule.

Decision test: does any component or hook module the diff adds or changes name an API in the list above, or call a helper outside the app's Layer that does? Any yes fails.

Defect: an I/O or clock call made from render or a mount effect runs outside the runtime. Two responses can arrive out of order and the stale one wins; the value is a hidden input that a story or test cannot set; and a failure lands in no AsyncResult the UI can show. Stories and browser tests then need the real network, storage or clock instead of the port fakes the preview provides (pack: ui-testing, stories-get-io-from-the-preview-provider.md).

```tsx
// WRONG
function LastSynced() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => localStorage.setItem('sync-view', view), [view])
  // ...
}
```

```tsx
// RIGHT
// clock.atoms.ts
export const nowAtom = appRuntime.atom(DateTime.now).pipe(Atom.withRefresh('30 seconds'))
export const syncViewAtom = Atom.kvs({
  runtime: appRuntime,
  key: 'sync-view',
  schema: SyncView,
  defaultValue: () => 'list',
})
// LastSynced.tsx
const { value: now } = useAtomSuspense(nowAtom)
const [view, setView] = useAtom(syncViewAtom)
```

Sources: React, "Components and Hooks must be pure" (react.dev/reference/rules/components-and-hooks-must-be-pure): "`new Date()` is not idempotent as it always returns the current date", and side effects run "inside of event handlers or Effects. But never during render." React, "You Might Not Need an Effect" (react.dev/learn/you-might-not-need-an-effect): fetching in an Effect causes a "race condition" in which "two different requests 'raced' against each other and came in a different order than you expected", and "solving them is not trivial".

Gate: judge
