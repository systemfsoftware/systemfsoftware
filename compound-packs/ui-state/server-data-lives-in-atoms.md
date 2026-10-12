---
title: Server data is read through effect-atom atoms over Effect services, never held in React state or a React server-state library
applies_when:
  - writing or reviewing a React component, hook, or `**/*.tsx` file
  - changing a UI package (a package that renders React), excluding the effect-atom bindings' own implementation
tags: [ui-state, atom, server-state, useState, react-query]
---

Data that originates from a server, an Effect service or another component is read through effect-atom atoms (`useAtomValue`, `useAtomSuspense`) and is never copied into `useState`, `useReducer` or `useRef`. A copy is a second store beside the registry: it goes stale when the atom refreshes, and the fetch, the retry and the error state move into the component.

No module imports a React server-state library, in any import form, type-only included: `@tanstack/react-query`, `@tanstack/react-query-devtools`, `@tanstack/react-query-persist-client`, `@tanstack/react-query-next-experimental`, `react-query`, `swr`, `urql`, `@apollo/client/react`, `@reduxjs/toolkit/query/react`, `@trpc/react-query` and `@trpc/tanstack-react-query`, each with its subpaths. A module that re-exports one of them is banned the same way as the library, and so is every import of that module.

`useState` holds UI-local state only. A reviewer recognizes it from the diff by four facts: no other component reads the value; it is not derived from an atom, service or fetch result; it is never persisted; and it dies with the component. A DOM element handle, an open/closed flag, hover and focus, and an uncommitted input draft qualify (incident g, 2026-10-11: `useState<HTMLElement | null>(null)` for a scroll container, and `useState<Provider | null>(null)` for which option's dialog is opening). A `useState` that receives a fetched count, or is initialised from `useAtomValue(...)`, does not.

A value that tracks whether a read or command is pending, finished or failed (loading, ready, busy, submitting, error, or a notice built from a command's outcome) is not UI-local either, though it can pass the four facts. The component reads it from the `AsyncResult` of the runtime atom or `appRuntime.fn` it concerns: `Initial`, `Success` or `Failure`, each carrying `waiting` (`packages/atom/effect-atom/src/async-result.schema.ts:63,88`). A value whose next named state code computes from its current one, and that is rendered, persisted or sent, is a lifecycle the `lifecycle-machines` pack counts; it is not UI-local even when it passes the four facts, and that pack's `lifecycles-are-xstate-machines` check catches it. `@systemfsoftware/xstate-store` is not refused by name: a store that more than one component reads already fails this rule, a store one component owns is UI-local like `useReducer`, and a store whose next state is computed by branching on its current one is a counted lifecycle, however many components read it.

Incidents, all 2026-10-11, in one application UI. (a) A page called `useMutation` from `@tanstack/react-query`, and several components called `useQuery(api.<feature>.<endpoint>({ params }))`, where `useQuery` was react-query's hook re-exported through the app's own internal package. (b) A `useEffect` fetched a URL and merged the response into `useState` through its setter. (c) A `useState<View | null>` received the result of an Effect the component ran itself.

Public incident (l), 2026-10-09: `systemfsoftware/effect-endgame-starter-kit` at `375e468f`, `apps/site/src/features/guestbook/guestbook-page.tsx:51-97`. The page tracked its requests in boolean `useState` flags, `ready` and `busy`. One handler set `busy` around its command; another ran its command without touching either flag, so the submit button (`disabled={!ready || busy}`) stayed enabled while that command was in flight.

```tsx
// WRONG (incident b): server data fetched in an effect and held in useState
export function DemandBadge({ sku }: { readonly sku: Sku }) {
  const [demand, setDemand] = useState<Record<Sku, number>>({})
  useEffect(() => {
    fetch(`/demand/${sku}`)
      .then((response) => response.json())
      .then((body) => setDemand((current) => ({ ...current, [sku]: body.pending })))
  }, [])
  return <span>{demand[sku]}</span>
}
```

```ts
// WRONG (incident a): a server-state hook re-exported through an internal package
export { useMutation, useQuery } from '@tanstack/react-query'
```

```tsx
// WRONG (incident l): request progress kept in useState flags
export function ModerateButton({ entry }: { readonly entry: EntryId }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={() => {
        setBusy(true)
        Effect.runPromise(moderate(entry)).finally(() => setBusy(false))
      }}
    >
      Moderate
    </button>
  )
}
```

```tsx
// RIGHT: a parameterised runtime atom over the Demand service, rendered as an AsyncResult
// demand.atoms.ts
export const demandAtom = Atom.family((sku: Sku) => appRuntime.atom(Demand.pending(sku)))

// DemandBadge.tsx
export function DemandBadge({ sku }: { readonly sku: Sku }) {
  const demand = AtomReact.useAtomValue(demandAtom(sku))
  return Atom.AsyncResult.match(demand, {
    onInitial: () => <Spinner />,
    onFailure: () => <span role='alert'>Demand unavailable</span>,
    onSuccess: ({ value }) => <span>{value}</span>,
  })
}
```

```tsx
// RIGHT: request progress read from the command's AsyncResult
// guestbook.atoms.ts
export const moderateEntry = appRuntime.fn((entry: EntryId) => Guestbook.use((guestbook) => guestbook.moderate(entry)))

// ModerateButton.tsx
export function ModerateButton({ entry }: { readonly entry: EntryId }) {
  const moderation = AtomReact.useAtomValue(moderateEntry)
  const moderate = AtomReact.useAtomSet(moderateEntry)
  return (
    <button disabled={moderation.waiting} onClick={() => moderate(entry)}>
      Moderate
    </button>
  )
}
```

`Atom.family`, `Atom.AsyncResult` and the runtime's `atom` member are exported by `@systemfsoftware/effect-atom` (`etc/effect-atom.api.md:9`; `AsyncResult.match` at `src/async-result.schema.ts:747`, runtime `atom` at `src/atom.blueprint.ts:2081-2099`), and `AtomReact.useAtomValue` by `@systemfsoftware/effect-atom-react` (`src/hooks-value.ts:101`). `appRuntime` is built as `components-dispatch-to-runtime-atoms.md` prescribes.

Gate: `review` — Does the diff import a banned specifier, or a local module that re-exports one, or put into `useState`/`useReducer`/`useRef` a value that another component reads, that is derived from an atom, service or fetch result, that is persisted, or that outlives the component? Does the diff keep in `useState`, `useReducer` or `useRef` a flag or value that tracks whether a read or command is pending, done or failed, instead of reading the `AsyncResult` of the runtime atom or `appRuntime.fn` it concerns?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-imports` with the specifiers above and their subpaths, its message naming `ui-state/server-data-lives-in-atoms`. It reports the import of a library and the module that re-exports it; review covers what it cannot see: a component importing the hook from that internal module, and server data held in React state.
