---
title: A durable lifecycle is a stored value advanced by a decider over the FSM's transition; an in-process one is an EffectActor the runtime owns
applies_when:
  - an approval or wait gate, a deploy promotion, an OAuth connect across the provider's redirect, or onboarding resumed in a later session
  - a `*.workflow.ts` decider over a stored state, or startup recovery that touches stored states
  - an in-process lifecycle in a React component, hook, atoms module or `**/*.tsx` file, such as a connection, a connect handshake or an in-page wizard
  - creating, restoring or reading an `EffectActor`, or calling `useMachine`, `useActor`, `useActorRef` or `useSelector`
tags: [lifecycle-machines, fsm, durability, decider, effect-actor, runtime]
---

A reviewer reads the host's durability from the diff. A lifecycle is durable when its state is persisted, when it waits for a human, a provider callback or a redirect, or when it spans a deploy. It is in-process when it lives and dies inside one running process with nothing persisted.

## Rule

**Durable.** The lifecycle is a stored state value and context. A `Workflow.make` decider rebuilds the FSM snapshot from them, `{ status: 'active', value, context, output: undefined, error: undefined }` (fork `packages/xstate/src/fsm.ts:117-126`), and calls the table's `transition(snapshot, event)` (`:161-164`, `:475-483`), which writes nothing outside its return value. An unhandled event, a guard refusal and a guard returning `undefined` all return the input snapshot object itself (`:390-396`, `:459-463`). The decider treats an unchanged snapshot as a decision failure and returns a tagged refusal naming the current state value and the event type; a no-op is not a legal command (CONST-D2). The refusal is a total `Match` over whether the snapshot changed, because cell-architecture `pure-decision-workflows.md` forbids `if` in a decision body. The table lives in the lifecycle's `*.schema.ts`, the one local import a decision body may make (`packages/oxlint-plugin/oxlint-plugin-dmmf-workflow/src/rules/make-body-purity.ts:176-183`). The decider never calls the root package's `transition`, `initialTransition` or `resolveState`. Recovery advances a stored state only through the same decider. The shell stores the next value and context, then runs the effects.

No actor holds durable state, and restoring a persisted snapshot into an actor is not the durable path: a restored `EffectActor` runs its declared Effect actions as forked Effects while it transitions (fork `packages/xstate-effect/src/createEffectActor.ts:48-56`), so an effect can run before the state is stored, and Effect tasks that were running "start again from the beginning" (`:36-37`). The fork's `@experimental` `durable` module is not required.

**In-process.** The lifecycle runs as an `EffectActor` that `createEffectActor` creates inside the runtime over the table; `createEffectActor` takes any actor logic (`packages/xstate-effect/src/createEffectActor.ts:62`), and an FSM is one (`packages/xstate/README.md:66`). With one instance, the actor is a service in the app runtime's Layer; with one instance per key, it lives in a runtime atom whose scope owns it. A component reaches the actor only through runtime atoms: an atom over `snapshots(actor)` (`packages/xstate-effect/src/actor.ts:112`), read with `useAtomValue`, and an `appRuntime.fn` that calls `send` (`actor.ts:87`), dispatched with `useAtomSet`. No component calls `useSelector` or `actor.send`, so the UI keeps one subscription system, the registry, and the bridge `createActorAtoms` is not used. A component never creates the actor (ui-state `components-dispatch-to-runtime-atoms.md`), and never holds an in-process lifecycle in `useState`.

```ts
// WRONG: an approval gate held in an actor and restored on boot
const gate = yield * createEffectActor(approvalFsm, { snapshot: yield * store.loadSnapshot(id) })
// WRONG (incident q): recovery rewrites stored states outside any table
yield * sql`UPDATE jobs SET state = 'interrupted' WHERE state = 'running'`
// WRONG: a decider over the root package, and one that stores a refused event as a success
const [next] = transition(machine, snapshot, event)
const [same] = reviewFsm.transition(snapshot, event) // then returns Result.succeed(same)
```

```tsx
// WRONG (incident r): a connection lifecycle held in a component
const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
// WRONG: the component starts the actor, or reads it outside the registry
const [snapshot, send] = useActor(reviewFsm)
const status = useSelector(actor, selectStatus)
```

```ts
// RIGHT (durable): review.schema.ts holds the table; decide-review.workflow.ts imports it
export const decideReview = Workflow.make({
  command: DecideReview,
  decision: ReviewMoved,
  error: IllegalTransition,
  decide: (command) => {
    const snapshot = {
      status: 'active',
      value: command.state,
      context: {},
      output: undefined,
      error: undefined,
    } as const
    const [next] = reviewFsm.transition(snapshot, { type: command.event })
    return Match.value(next === snapshot).pipe(
      Match.when(true, () => Result.fail(new IllegalTransition({ state: command.state, event: command.event }))),
      Match.when(false, () => Result.succeed(new ReviewMoved({ from: command.state, to: next.value }))),
      Match.exhaustive,
    )
  },
})
```

```tsx
// RIGHT (in-process): the runtime owns the actor; the component reads and dispatches through atoms
export const ReviewActorLive = Layer.effect(ReviewActor, createEffectActor(reviewFsm))
export const reviewStateAtom = appRuntime.atom(Stream.unwrap(Effect.gen(function*() {
  return snapshots(yield* ReviewActor)
})))
export const approve = appRuntime.fn((_: void) =>
  Effect.gen(function*() {
    yield* send(yield* ReviewActor, { type: 'APPROVE' })
  })
)
// one actor per key: Atom.family((id: ReviewId) => appRuntime.atom(createEffectActor(reviewFsm)))

export function ReviewPanel() {
  const review = AtomReact.useAtomValue(reviewStateAtom)
  const doApprove = AtomReact.useAtomSet(approve)
  return <ReviewView review={review} onApprove={() => doApprove()} />
}
```

A runtime atom's `Success` value is typed `A | Context.Context<R>` at this pin (`packages/atom/effect-atom/src/atom.blueprint.ts:2088`); a reader narrows it with `Context.isContext` before using the snapshot. The durable shape is the public `systemfsoftware/effect-endgame-starter-kit` decider at `375e468f` (`apps/site/src/features/guestbook/moderate-guestbook-entry.workflow.ts:44-60`), with `/fsm`'s `transition` where it calls the root package's.

Incidents. (q) 2026-10-10, in a private application: a durable lifecycle kept in a database row had no decider, and recovery rewrote its state in raw SQL outside any transition table. (c) 2026-10-11, in a private application UI: a component ran an Effect with `runtime.runFork(...)` from a mount effect and pushed the result into `useState`, a process the component owned that nothing else could read; an actor started from a component repeats it. (r) 2026-10-10, in a private application: a terminal component held a connection lifecycle in `useState<'connecting' | 'open' | 'closed'>`.

The adoption record is the Key Decisions section of `docs/plans/2026-10-12-1541-feat-ui-state-pack-plan.md`.

Gate: `review` — Does the diff hold, in an actor or a restored snapshot, a lifecycle that is persisted, waits on a human, a provider callback or a redirect, or spans a deploy, instead of a stored state value advanced by the FSM's `transition` in a decider whose shell stores the next value before running its effects? Does a decider call the root package's `transition`, `initialTransition` or `resolveState`, treat an unchanged snapshot as success instead of returning a tagged refusal that names the state value and the event type, or does any code rewrite a stored state outside the decider? Does the diff create an in-process actor anywhere but the runtime's Layer or a runtime atom, hold an in-process lifecycle in a component's `useState`, or read an actor in a component with `useSelector` or `actor.send`?
