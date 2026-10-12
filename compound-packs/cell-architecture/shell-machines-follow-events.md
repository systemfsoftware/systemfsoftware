---
title: A state machine lives in a service adapter module as a closed event-to-target table, and decides nothing
applies_when:
  - holding a protocol or process lifecycle (a connection, a request in flight, a supervised child) in a service
  - adopting or reviewing @systemfsoftware/xstate, its /fsm entry, xstate-effect or xstate-react
  - writing a createFSM config, a guard, or a transition function
  - wiring an atom, a hook or a component to a machine or an actor
  - sending a decision's result to a running machine
tags: [cell, service, adapter, state-machine, xstate, fsm, atom, lifecycle]
---

A business lifecycle is a decision (`pure-decision-workflows.md`). A state machine is admitted only for a protocol or process lifecycle, such as a connection, a request in flight or a supervised child, and only where it cannot make a business choice:

- **It lives in the adapter module that implements an IO-layer service's Layer**, beside the `*.service.ts` and never inside it (`service-and-layer-boundaries.md`).
- **It is written in the fork's `/fsm` table form**: `createFSM`, or `setup(...).createFSM`, from `@systemfsoftware/xstate/fsm`. The root package's `createMachine` and `setup(...).createMachine` carry guards, eventless and delayed transitions, invocations and actions, so they are refused rather than narrowed.
- **Its config is closed.** The only keys are `id`, `initial`, `context`, `states`, `on` and `target`. Each transition maps an event type to a fixed target. A transition function may only copy event fields into context, as in `({ event }) => ({ target: 'open', context: { id: event.id } })`; a guard, a ternary or any computed target is refused.
- **Every state names every event type some state of the machine handles.** The fork drops an event that the current state's `on` table does not name and returns the input snapshot unchanged, so a missing entry is a silent drop. Naming it, as a stay if nothing should happen, turns the drop into a declared choice: the shell's analogue of `Match.exhaustive`.
- **A decision's result reaches a machine as an event whose type is the result's `_tag`.** Outcomes arrive already told apart, so a machine never needs a guard to tell them apart.
- **The service exposes functions or streams of plain values.** Atoms read them through an atom runtime over the service's Layer. No atom module imports a state-machine-family specifier, no module imports the family's React bindings (`@systemfsoftware/xstate-react`, `@systemfsoftware/xstate-store-react`, `@xstate/react`), and nothing outside the adapter module subscribes to an actor or reads its snapshot.

```ts
// WRONG: the guard decides by reading shared mutable state, and the connection
// lifecycle is held in a component.
const connection = createMachine({
  initial: 'open',
  states: {
    open: { on: { STOP: { guard: () => shared.stopping, target: 'closed' } } },
    closed: {},
  },
})

function Status() {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  // ...
}

// RIGHT: Connection.service.ts declares the contract; connection.ts, the adapter
// module beside it, holds a closed table in which every state names every event.
import { createFSM } from '@systemfsoftware/xstate/fsm'
import { Effect, Layer, Stream, SubscriptionRef } from 'effect'
import { Connection } from './Connection.service.js'

const table = createFSM({
  initial: 'idle',
  states: {
    idle: { on: { CONNECT: 'connecting', CONNECTED: 'idle', DROPPED: 'idle' } },
    connecting: { on: { CONNECT: 'connecting', CONNECTED: 'open', DROPPED: 'idle' } },
    open: { on: { CONNECT: 'open', CONNECTED: 'open', DROPPED: 'idle' } },
  },
})

export const layer = Layer.effect(Connection)(
  Effect.gen(function*() {
    const snapshot = yield* SubscriptionRef.make(table.initialState)
    const send = (type: 'CONNECT' | 'CONNECTED' | 'DROPPED') =>
      SubscriptionRef.update(snapshot, (current) => table.transition(current, { type })[0])
    return Connection.of({
      status: SubscriptionRef.changes(snapshot).pipe(Stream.map((current) => current.value)),
      connect: send('CONNECT'),
    })
  }),
)

// An atom reads the service function; no atom sees the table or an actor.
const connectionStatus = appRuntime.atom(
  Stream.unwrap(Connection.use((connection) => Effect.succeed(connection.status))),
)
```

Two fork behaviours carry this rule, so an adopting repo's dependency pin covers both with a differential test (`compound-packs/boundary-testing/pin-dependency-semantics.md`): an event the current state does not name returns the input snapshot object, and a declared stay that changes no context returns that same object. A pin that moves either behaviour changes what a missing `on` entry means.

Unnamed incidents, both observed on 2026-10-10: a next state was chosen by a guard reading a shared mutable object; and a connection lifecycle was held in a component's state.

Four judgements stay with review, and the rules say why:

- whether a lifecycle is protocol or business, because that turns on meaning;
- whether a machine mirrors a business lifecycle, because that turns on meaning;
- whether the machine sits inside a service adapter module and nothing outside it subscribes to its actor, because placement across files is not a shape a one-file rule reads;
- whether an event's copied fields carry a business value computed outside a decision, because a copy is syntactically identical whatever its source.

One residual stays with review as well: an event type in the machine's event union that no state's `on` table names. The fork types every `on` key as optional, so no instrument sees it, and the shell rule compares states only with one another.

Gate: `shell-machine-follows-events`, `atoms-read-services`, `review` — the rules refuse a root-package machine config, a config key outside the closed set, a guard or non-copy transition function, a config they cannot resolve, a state that omits an event another state names, a family re-export or dynamic import in `src`, a family import in an atom module, and any import of the family's React bindings; review owns the four judgements and the event-union residual above.
