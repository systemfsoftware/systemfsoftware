---
"@systemfsoftware/effect-atom-react": major
---

The code that mounts the app owns the registry; the binding never creates one or writes registry state during render, so saved data never overwrites a value already on screen.

- `RegistryProvider` requires a `registry`. Make it with `Atom.Registry.make({ initialValues, scheduleTask: AtomReact.scheduleTask })` before the first render and dispose it at teardown.
- `HydrationBoundary` is removed: call `Atom.Hydration.hydrate(registry, state)` before `hydrateRoot`.
- `useAtomInitialValues` and `AnyInitialValue` are removed: pass `initialValues` to `Atom.Registry.make`.
- `useAtomSubscribe` is removed: use `Atom.Registry.subscribe` in a scoped Effect.

An island makes its registry at module scope; a Storybook story makes it in its loader and disposes it in `beforeEach`'s cleanup.
