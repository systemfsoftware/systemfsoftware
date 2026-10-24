---
title: A component never runs an Effect, and an event handler dispatches at most one command
applies_when:
  - writing an event handler in a React component
  - a component wants to run an Effect or hold a runtime
tags: [ui-state, runtime, command, handler]
---

No component or hook body calls Effect.run*, runtime.run* or Atom.context, and no component holds a runtime or fiber in state or a ref. The app's runtime is one Atom.context value built at module scope. Every Effect the UI runs is a read of a runtime atom or a runtime fn command.

An event handler calls at most one command setter (the useAtomSet setter of a runtime fn). It never awaits, chains .then, runs an Effect, or branches on a value read from an atom or service.

A handler never sequences work after its command, such as a second command, a refresh, or a navigation that waits on the result. That sequencing lives in the command's Effect.

```tsx
// WRONG
<Button onClick={async () => { await save(draft); navigate(`/orders/${draft.id}`) }}>Place order</Button>
```

```tsx
// RIGHT
// placeOrder = appRuntime.fn(...) saves, refreshes the order list and navigates
const place = useAtomSet(placeOrder)
<Button onClick={() => place(draft)}>Place order</Button>
```

Gate: judge
