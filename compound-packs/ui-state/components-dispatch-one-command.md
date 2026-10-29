---
title: A component never runs an Effect, and an event handler dispatches at most one command
applies_when:
  - writing an event handler in a React component
  - a component wants to run an Effect, hold a runtime, or do several things after a click or submit
tags: [ui-state, runtime, command, handler]
---

UI code touches Effect in two ways only: it reads a runtime atom (useAtomValue, useAtomSuspense), and it calls the useAtomSet setter of a runtime fn command. The app's runtime is one Atom.context value built at module scope in a .ts module. No component or hook calls Effect.run*, runtime.run* or Atom.context, and none holds a runtime or a fiber in state or a ref.

An event handler calls at most one command setter. Beside it, the handler may call UI-local setters (closing a dialog after submitting) and may branch on the event's own data (which key was pressed). It never awaits, chains .then, calls a second command, refreshes, navigates after the command, or branches on a value read from an atom or a service. That sequencing and branching live in the command's Effect.

Decision test: in each component, hook and handler the diff adds or changes, is there any of Effect.run*, runtime.run*, Atom.context, a runtime or fiber held in state or a ref, await, .then, a condition on an atom or service value, or more than one command setter call in one handler? Any yes fails.

Defect: work a handler sequences itself runs outside the runtime. Its failure becomes a promise rejection no component shows, its waiting state is rebuilt by hand, and the sequence can be tested only by rendering and clicking. A runtime fn command is a writable atom whose value is the AsyncResult of its Effect (waiting, success or failure), so the component reads the outcome from the atom, and the sequence is an Effect that a test runs without rendering.

```tsx
// WRONG
<Button
  onClick={async () => {
    if (order.status === 'paid') await refund(order.id)
    else await cancel(order.id)
    navigate('/orders')
  }}
>
  Cancel order
</Button>
```

```tsx
// RIGHT
// cancelOrder = appRuntime.fn(...) refunds or cancels by status, refreshes the order list and navigates
const cancel = useAtomSet(cancelOrder)
<Button onClick={() => { cancel(order.id); setConfirmOpen(false) }}>Cancel order</Button>
```

Sources: the atom library types a runtime fn as `Writable<AsyncResult.Result<A, E>, Arg>`, so a command's outcome is an atom value a component reads. React, "Components and Hooks must be pure" (react.dev/reference/rules/components-and-hooks-must-be-pure): "In most cases, you'll use event handlers to handle side effects"; this rule narrows what the handler itself does to one dispatch.

Gate: judge
