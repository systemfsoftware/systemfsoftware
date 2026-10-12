---
title: A lifecycle a product shows, stores or sends declares its transitions in a createFSM table, never in hand-written branching
applies_when:
  - adding or reviewing a status, phase or step field that code moves between named states, on a server or in a React component, hook or `**/*.tsx` file
  - a run, approval or wait gate, a deploy promotion, an OAuth or other connect flow, an onboarding flow or a multi-step wizard
  - a `*.workflow.ts` decider, a service or a SQL statement that writes a stored state
  - a supervisor's child status that is exported, persisted, shown to a user, or encodes restart, backoff or give-up policy
  - adopting or reviewing `@systemfsoftware/xstate`, `xstate-effect` or `xstate-react`
tags: [lifecycle-machines, fsm, xstate, state-transition, lifecycle]
---

A lifecycle counts when code decides a value's next named state from its current state and an event, and the value is rendered, persisted or sent across a process boundary. Run, approval and wait gates, OAuth connect, onboarding flows, deploy promotion and multi-step wizards count. A supervisor's child status counts when its states are exported, persisted or shown to a user, or when its transitions encode policy (restart, backoff, give-up); private bookkeeping owned by one function does not, and review reaches such code when a diff next changes it, with no sweep of code nobody touches.

Four cases do not count:

1. The progress or outcome of one read or command. It is that read's or command's `AsyncResult` (ui-state `server-data-lives-in-atoms.md`).
2. A decision's outcome union. It has no next state.
3. A UI-local value that no code branches on to compute its next value, such as an open/closed flag set to `true` or `false`.
4. A library's internal bookkeeping that is never rendered, persisted or sent, such as effect-atom's node phase (`packages/atom/effect-atom/src/advance-node-state.workflow.ts:104-112`).

Branching on a state to render it is display, not a transition (ui-state `view-models-are-pure-functions.md`).

## Rule

A counted lifecycle declares its states, events and transitions in one table built with `createFSM`, or `setup(...).createFSM` for typed context and events, from `@systemfsoftware/xstate/fsm` (fork `packages/xstate/src/fsm/index.ts:1-17`). The root package's `createMachine`, and `setupEffect(...).createMachine` from `@systemfsoftware/xstate-effect`, do not declare a counted lifecycle: the root package's `transition` writes module-level WeakMaps (fork `packages/xstate/src/transition.ts:86,93,96`), while `/fsm`'s returns the next snapshot from the table, the snapshot and the event alone (`packages/xstate/src/fsm.ts:465-485`).

Hand-written transition code is refused wherever it sits, in a component, hook, atom, service, SQL statement or decider: a status, phase or step enum or string union whose next value is computed by `if`, `switch`, a ternary, `Match` or a lookup keyed by the current state, or written from several places with no table. Code outside the table that reads the stored value decodes it through a Schema literal union of the state names (CONST-D4). A reader renders it with `Match.value(snapshot.value)`; `taggedState` from `xstate-effect` takes only root-package snapshots (`packages/xstate-effect/src/state.ts:112`).

```ts
// WRONG (incident n): a run's state written from three places, with no table
type RunState = 'running' | 'done' | 'failed' | 'interrupted'

await db.execute(`INSERT INTO runs (id, state) VALUES (?, 'running')`, [id])
let state: RunState = 'running'
state = exitCode === 0 ? 'done' : 'failed'
// at startup
await db.execute(`UPDATE runs SET state = 'interrupted' WHERE state = 'running'`)
```

```tsx
// WRONG: a rendered wizard step advanced by a ternary
const [step, setStep] = useState<'profile' | 'billing' | 'done'>('profile')
setStep(step === 'profile' ? 'billing' : step === 'billing' && complete ? 'done' : step)
```

```ts
// WRONG: a service that branches on the stored status, and the same steps on the root package
if (gate.status === 'pending' && event === 'approve') gate.status = 'approved'
const steps = createMachine({ initial: 'profile', states: { profile: { on: { NEXT: 'billing' } }, billing: {} } })
```

```ts
// RIGHT: checkout.schema.ts, one table from /fsm
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const checkoutFsm = createFSM<{}, CheckoutEvent, CheckoutStep>({
  initial: 'profile',
  states: {
    profile: { on: { NEXT: 'billing' } },
    billing: { on: { NEXT: ({ event }) => (event.complete ? { target: 'done' } : undefined) } },
    done: {},
  },
})
```

The component reads the step through the runtime (`lifecycle-hosts-follow-durability.md`) and renders it with `Match.value(snapshot.value)`.

Incident n, 2026-10-10, in a private application: an agent run's lifecycle (running, then done, failed or interrupted) was a hand-written string union. A SQL insert wrote `running`, a local mutable state variable was reassigned as the run went on, and a startup sweep rewrote `running` to `interrupted`. Its transitions sat in three places with no table, while the house fork had no consumer there.

The adoption record is the Key Decisions section of `docs/plans/2026-10-12-1541-feat-ui-state-pack-plan.md`.

Gate: `review` — Does the diff add or change code that computes or writes a value's next named state by branching (`if`, `switch`, ternary, `Match`, or a lookup keyed by the current state) on its current state, or by assigning it outside a table, where the value is rendered, persisted or sent across a process boundary, or is a supervisor child status that is exported or encodes restart, backoff or give-up policy, and is none of the four exclusions, instead of declaring the transition in a `createFSM` table from `@systemfsoftware/xstate/fsm`? Does it declare a counted lifecycle with the root package's `createMachine` or with `setupEffect(...).createMachine`?
