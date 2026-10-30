---
title: A component never runs an Effect, and an event handler dispatches at most one command
applies_when:
  - writing an event handler in a React component
  - a component wants to run an Effect, hold a runtime, or do several things after a click or submit
tags: [ui-state, runtime, command, handler]
---

UI code touches Effect in two ways only: it reads a runtime atom (`useAtomValue`, `useAtomSuspense`), and it calls the `useAtomSet` setter of a runtime fn command. The app's runtime is one `Atom.context` value built at module scope in a `.ts` module. No component or hook calls `Effect.run*`, `runtime.run*` or `Atom.context`, and none holds a runtime or a fiber in state or a ref.

An event handler calls at most one command setter. Beside it, it may call UI-local setters (closing a dialog after submitting) and branch on the event's own data (which key was pressed). It never awaits, chains `.then`, calls a second command, refreshes, navigates after the command, or branches on a value read from an atom or service. That sequencing and branching live in the command's Effect, where a test runs it without rendering and the component reads the outcome from the command atom's `AsyncResult`.

```tsx
// WRONG
<Button onClick={async () => { if (order.status === 'paid') await refund(order.id); else await cancel(order.id); navigate('/orders') }}>
// RIGHT: cancelOrder = appRuntime.fn(...) refunds or cancels by status, refreshes and navigates
const cancel = useAtomSet(cancelOrder)
<Button onClick={() => { cancel(order.id); setConfirmOpen(false) }}>Cancel order</Button>
```
