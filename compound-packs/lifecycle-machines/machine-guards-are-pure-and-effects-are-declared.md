---
title: An FSM guard reads only its context and event, and the table holds no side effects; the shell runs them after the transition
applies_when:
  - writing or reviewing a `createFSM` table or one of its transition functions, on a server or for a React component, hook or `**/*.tsx` file
  - a gate, connect flow, wizard or run whose next state depends on time, a flag or another value
  - code that writes a stored state, calls another service or emits an event while it moves a lifecycle
tags: [lifecycle-machines, fsm, guards, effects, purity]
---

A guard is an FSM transition function, `({ context, event }) => config | undefined` (fork `packages/xstate/src/fsm.ts:26-33`), that returns `undefined` to refuse the event. A reviewer checks its purity by what its body reads.

## Rule

A guard reads only its `context` and `event`: no clock, randomness, I/O, Effect, module-level mutable value or ambient context. A time-dependent guard reads `now` from the event, and the shell takes it from Effect's `Clock`. A stop request is an event the table declares, never a flag the guard looks up.

The table declares no side effects. An FSM transition returns `[nextSnapshot, effects]` with `effects` typed `never[]` and always empty (fork `packages/xstate/src/fsm.ts:128-139`). Effects are Effect values the shell runs after the transition: in a durable lifecycle, after the decider's shell stores the next state; in an in-process one, in the runtime `fn` that sent the event. No transition function performs I/O or calls `Effect.run*`, and the root package's `setupEffect` actions and `fromEffect` children are not used.

```ts
// WRONG (incident o): the next state comes from a shared mutable object, not the event
STOP: () => (shared.stopping ? { target: 'interrupted' } : undefined),
// WRONG: a clock read and an Effect run inside transition functions
PAY: () => (Date.now() < deadline ? { target: 'paid' } : undefined),
VERIFY: () => (Effect.runPromise(verify(email)), { target: 'verified' }),
```

```ts
// WRONG (incident p): writes, presence and event mirroring interleaved with the state change
async function stopRun(run: Run) {
  await db.execute(`UPDATE runs SET state = 'interrupted' WHERE id = ?`, [run.id])
  presence.leave(run.agent)
  run.state = 'interrupted'
  events.mirror({ type: 'run.interrupted', id: run.id })
}
```

```ts
// RIGHT: run.schema.ts, guards over the event only, no effects in the table
export const runFsm = createFSM<{}, RunEvent, RunState>({
  initial: 'running',
  states: {
    running: {
      on: {
        STOP: 'interrupted',
        FINISH: ({ event }) => (event.now < event.deadline ? { target: 'done' } : { target: 'failed' }),
      },
    },
    done: {},
    failed: {},
    interrupted: {},
  },
})

// RIGHT: the shell stores the next state, then runs the effects that state change requires
export const afterMove = (id: RunId, moved: RunMoved) =>
  Effect.gen(function*() {
    yield* Runs.use((runs) => runs.store(id, moved.to))
    yield* Presence.use((presence) => presence.announce(id, moved.to))
    yield* Events.use((events) => events.mirror(id, moved))
  })
```

Incidents, 2026-10-10, in private applications. (o) A run's next state was chosen by reading a shared mutable object, `if (shared.stopping) state = 'interrupted'`, instead of the event and the context. (p) Database writes, presence calls and event mirroring were interleaved with a lifecycle's transitions instead of being declared effects the shell runs after the transition.

The adoption record is the Key Decisions section of `docs/plans/2026-10-12-1541-feat-ui-state-pack-plan.md`.

Gate: `review` — Does any FSM transition function in the diff read anything but its `context` and `event` (a clock, randomness, I/O, an Effect, a module-level variable), perform I/O, or call `Effect.run*`? Does an effect that a state change requires run anywhere but the shell after the transition: after the store in a durable lifecycle, or in the runtime `fn` that sent the event in an in-process one?
