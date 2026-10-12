---
title: Every Effect the UI runs is an atom of one module-scope runtime, and an event handler dispatches at most one command
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), excluding the effect-atom bindings' own implementation
tags: [ui-state, runtime, atom, dispatch, composition-root, effect]
---

Every Effect the UI runs is a runtime atom. Reads are `appRuntime.atom(effect)`, wrapped in `Atom.family` when parameterised, and consumed with `useAtomValue` or `useAtomSuspense`. Commands are `appRuntime.fn(...)`, dispatched with the setter from `useAtomSet`. No component or hook builds, holds or runs a runtime, a fiber or an Effect: the registry owns each fiber's lifetime, and a component that runs its own Effect owns a fiber nothing interrupts and a result nothing else can read.

1. **One runtime, built once at module scope in a `.ts` module**, as `appRuntime = Atom.context()((get) => get(appLayerAtom))`. The Layer-choice atom `appLayerAtom` and its default that fails on use are owned by `compound-packs/storybook-testing/stories-compose-at-their-own-root.md` (items 1-2 at `:14-15`, RIGHT block at `:45-57`); this rule shows the same shape and does not redefine it. The production entry seeds the live Layer through `RegistryProvider` with `initialValues={[Atom.initialValue(appLayerAtom, AppLive)]}`, and the Storybook preview and a browser test seed their fakes into the same atom the same way. Services, Layers and the composition root are cell-architecture's `service-and-layer-boundaries.md`.
2. **Never seed `appRuntime.layer` directly.** It replaces the merged Layer that carries the `Reactivity` service, so commands die and invalidation stops. A probe on 2026-10-11 against `@systemfsoftware/effect-atom` 6.0.0 showed it: seeding `runtime.layer` swapped the read to the fake, but the command ended in a `Failure` and the watched atom never re-ran; seeding the Layer-choice atom swapped the read, the command succeeded and the watched atom re-ran.
3. **An event handler dispatches at most one command**: the `useAtomSet` setter of an `appRuntime.fn` or of a server-backed writable atom. It may also call UI-local setters (as `server-data-lives-in-atoms.md` defines UI-local state), such as closing a dialog after submitting. It passes the event's data or the component's UI-local draft, awaits nothing, chains no `.then`, runs no Effect, dispatches no second command, and branches on no atom or service value; branching on event data (`e.key === 'Enter'`) is fine. Sequencing and domain branching move into the `appRuntime.fn` Effect.
4. **No component or hook starts or owns an actor.** `useMachine`, `useActor` and `useActorRef` from `@systemfsoftware/xstate-react`, and a Provider made by its `createActorContext`, start an actor in a mount effect and stop it on unmount: at `c8c376cc2fd798c00c131185149fa6536cc3a027`, `useActorLifecycle` starts the actor inside `useEffect` (`packages/xstate-react/src/useActorRef.ts:72,91`), `useActorRef` (`:143`) and `useActor` (`useActor.ts:65`) call it, `useMachine` delegates to `useActor` (`useMachine.ts:18`), and `createActorContext`'s Provider calls `useActorRef` (`createActorContext.ts:45`). `createActor` or `createEffectActor` called in a component does the same by hand. An actor in UI is created inside the runtime, in its Layer or in a runtime atom, and a component reaches it only through runtime atoms: an atom over its snapshots and an `appRuntime.fn` that sends its events. The `lifecycle-machines` pack's `lifecycle-hosts-follow-durability.md` owns the host. The fork's atom bridge, `createActorAtoms`, does not interoperate with this repo's atoms at `c8c376cc2f`.

Incidents, all 2026-10-11, in one application UI. (c) A component held `useState<View | null>(null)`; a `useEffect` built an Effect, ran it with `runtime.runFork(...)`, and pushed the result back with `Effect.sync(() => setView(...))` and the error with `Effect.catch((e) => Effect.sync(() => setError(e.message)))`. Effect was used, but server data still lived in `useState` and the fiber was managed by hand. A component that starts an actor in a mount effect repeats the same failure: a process the component owns and nothing else reads. (d) A component held `useState<AppRuntime | undefined>(undefined)`: the composition root was built inside a component.

Public incident (l), 2026-10-09: `systemfsoftware/effect-endgame-starter-kit` at `375e468f`, `apps/site/src/features/guestbook/guestbook-page.tsx:51-97`. A page handler ran its command with `Effect.runPromise` inside the component.

```tsx
// WRONG (incident c): the component runs the Effect and copies the result into useState
export function OrderView({ id }: { readonly id: OrderId }) {
  const [view, setView] = useState<OrderView | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const fiber = runtime.runFork(
      Orders.view(id).pipe(
        Effect.tap((loaded) => Effect.sync(() => setView(loaded))),
        Effect.catch((e) => Effect.sync(() => setError(e.message))),
      ),
    )
    return () => runtime.runFork(Fiber.interrupt(fiber))
  }, [id])
  return view === null ? <p>{error}</p> : <OrderCard view={view} />
}
```

```tsx
// WRONG (incident d): the runtime is built inside a component
export function App() {
  const [runtime, setRuntime] = useState<AppRuntime | undefined>(undefined)
  useEffect(() => setRuntime(ManagedRuntime.make(AppLive)), [])
  return runtime === undefined ? null : <Routes runtime={runtime} />
}
```

```tsx
// WRONG: the component starts and owns the actor
export function ReviewPanel() {
  const [snapshot, send] = useActor(reviewFsm)
  return <button onClick={() => send({ type: 'APPROVE' })}>{snapshot.value}</button>
}
```

```tsx
// WRONG: a handler that awaits and sequences, and a handler that dispatches two commands
<button onClick={async () => { await save(draft); navigate(next) }}>Save</button>
<button onClick={() => { save(draft); archive(id) }}>Save and archive</button>
```

```ts
// RIGHT: app.runtime.ts, one runtime over the Layer-choice atom
export const appLayerAtom = Atom.make(Layer.effect(AppServices)(Effect.die('no AppServices Layer was provided')))
export const appRuntime = Atom.context()((get) => get(appLayerAtom))

// order.atoms.ts, a read and a command that sequences save, refresh and navigation through services
export const orderAtom = Atom.family((id: OrderId) => appRuntime.atom(Orders.view(id)))
export const saveOrder = appRuntime.fn((draft: Draft, get) =>
  Effect.gen(function*() {
    yield* Orders.use((orders) => orders.save(draft))
    get.refresh(orderAtom(draft.id))
    yield* Navigation.use((navigation) => navigation.toOrder(draft.id))
  })
)
```

```tsx
// RIGHT: one command plus a UI-local setter
export function SaveDialog({ draft }: { readonly draft: Draft }) {
  const [open, setOpen] = useState(true)
  const save = AtomReact.useAtomSet(saveOrder)
  return open
    ? (
      <button
        onClick={() => {
          save(draft)
          setOpen(false)
        }}
      >
        Save
      </button>
    )
    : null
}
```

`Atom.context` returns a factory whose result carries the `atom` and `fn` members (`packages/atom/effect-atom/src/atom.blueprint.ts:2081-2136`); `fn`'s second argument is a `FnContext` with `refresh` (`:2489-2496`); `Atom.initialValue` is `:3545`. `AtomReact.useAtomSet` is `packages/atom/effect-atom-react/src/hooks-value.ts:163` and `RegistryProvider`'s `initialValues` is `src/registry-context.ts:81`. Building `ManagedRuntime.make` inside a function body under `src/` is already refused by effect-platform's `runtime-construction-placement` lint; this rule does not restate it.

Gate: `review` — Does any component or hook in the diff call `Effect.run*`, `runtime.run*`, `ManagedRuntime.make` or `Atom.context(`, hold a runtime or fiber in state or a ref, or contain an event handler that dispatches two commands, uses `await` or `.then`, or branches (`if`, `switch`, ternary, `&&`) on a value read from an atom or service? Does any component or hook in the diff call `useMachine`, `useActor`, `useActorRef`, `createActor` or `createEffectActor`, or render a Provider made by `createActorContext`?
