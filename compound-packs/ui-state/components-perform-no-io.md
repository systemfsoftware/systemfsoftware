---
title: A `.tsx` module performs no I/O and names no I/O global, clock or timer
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), excluding the effect-atom bindings' own implementation
tags: [ui-state, io, fetch, storage, clock, timers, tsx]
---

A `.tsx` module performs no I/O and names no I/O global, server components included. That means no `fetch` (bare, aliased, as a type, or as a property of `globalThis`, `window` or `self`), `XMLHttpRequest`, `WebSocket` or `EventSource`; no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`; no clock read (`Date.now()`, `new Date()` with no argument, `performance.now()`); and no `setTimeout` or `setInterval`. I/O goes through an Effect service built in a `.ts` module and reached through a runtime atom, as `components-dispatch-to-runtime-atoms.md` prescribes. No `.tsx` has a legitimate `fetch`: a story gets its I/O from port fakes the preview provides through the production provider (storybook-testing `stories-compose-at-their-own-root.md`), and a browser test drives the same provider.

Formatting a passed value for display is not I/O; it belongs to `view-models-are-pure-functions.md`. Build the date with Effect's `DateTime`, not `new Date(x)`: under `src/` the preset's `effecttsgo/global-date` reports `new Date(x)` as well as `new Date()` and `Date.now()`, and it accepts `DateTime.format(DateTime.makeUnsafe(x), { dateStyle: 'medium' })` (`repos/effect/packages/effect/src/DateTime.ts:653,2472`, effect 4.0.1).

Incidents, all 2026-10-11, in one application UI. (b) A `useEffect` called `fetch(url)` and stored the response in `useState`. (e) A `useEffect` started `setInterval(() => setNow(new Date()), 30_000)`, an ambient clock read inside a component. (f) A `useEffect` wrote `localStorage.setItem(key, JSON.stringify(value))` whenever the value changed.

```tsx
// WRONG (incident e): an ambient clock read on a timer inside a component
export function LastSeen() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return <time>{now.toISOString()}</time>
}
```

```tsx
// WRONG (incident f): persistence written from a component
export function Density({ density }: { readonly density: Density }) {
  useEffect(() => {
    localStorage.setItem('density', JSON.stringify(density))
  }, [density])
  return null
}
```

```ts
// RIGHT: clock, persistence and debounce are atoms over the runtime (clock.atoms.ts, settings.atoms.ts)
export const nowAtom = appRuntime.atom(DateTime.now).pipe(Atom.withRefresh('30 seconds'))

export const densityAtom = Atom.kvs({
  runtime: settingsRuntime, // Atom.context()(...) over a Layer that provides KeyValueStore
  key: 'density',
  schema: Density,
  defaultValue: () => 'comfortable',
})

export const searchTermAtom = Atom.make('').pipe(Atom.debounce('300 millis'))
```

`Atom.withRefresh` (`packages/atom/effect-atom/src/atom.blueprint.ts:3662`), `Atom.debounce` (`:3625`) and `Atom.kvs` (`src/atom-kvs.ts:236-244`, whose `runtime` must provide `KeyValueStore`) are listed in `etc/effect-atom.api.md`; `DateTime.now` is `repos/effect/packages/effect/src/DateTime.ts:838`.

Gate: `review` — Does any `.tsx` file in the diff name `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`, read the clock with `Date.now()`, `new Date()` with no argument or `performance.now()`, or call `setTimeout` or `setInterval`?

Lint: `@systemfsoftware/oxlint-config-recommended` sets, on `**/*.tsx`, `no-restricted-globals` for `fetch` and `no-restricted-properties` for `fetch` on `globalThis`, `window` and `self`, each message naming `ui-state/components-perform-no-io`. Review covers what that lint misses: storage, `XMLHttpRequest`, `WebSocket` and `EventSource`, and the clock reads and timers outside `src/`.
