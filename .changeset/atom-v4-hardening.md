---
'@systemfsoftware/effect-atom': minor
'@systemfsoftware/effect-atom-react': minor
---

Harden the v4 fork: Effect-native hydration, zero `as any` casts, browser-mode tests.

Breaking changes:

- `Hydration.DehydratedAtomValue.resultPromise?: Promise<unknown>` is now `result?: Deferred<unknown>` — the pending-value channel is Effect-native, and `hydrate` returns a `Fiber<void, never>` that completes once every pending result has been applied (join it for deterministic SSR flushes and tests).
- `Hydration.dehydrate`'s `encodeInitialAs: 'promise'` is now `'deferred'`, `dehydrate` returns `Array<DehydratedAtomValue>` directly, and `Hydration.toValues` is removed.
- `Registry.setSerializable` now applies to an already-materialized node as well as preloading absent ones.
- `ScopedAtom.Context` is typed `React.Context<A | undefined>` to match runtime.
- `useAtom`/`useAtomSet` `mode: 'promise'` and `mode: 'promiseExit'` are gone; the single `mode: 'effect'` returns a lazy `(value) => Effect<A, E>` instead of an eager `Promise`, so callers run the result with `Effect.runPromise`/`yield*` and no raw `Promise` remains on the public surface.

Additions:

- `Registry.setInitialValue(atom, value)` — typed initial-value seeding (also used by `useAtomInitialValues`).
- `Result.Schema` now carries a `toArbitrary` hook, so `Schema.toArbitrary` works for property tests; its generated space is the wire-representable subset (no `undefined` defects, which the JSON codec cannot carry).

Internal:

- Every `as any` / `as unknown as` cast removed from both packages' `src` (Registry, Result, Atom, AtomRef, AtomRpc, AtomHttpApi, Hooks, RegistryContext, ScopedAtom); oxlint `correctness` and `perf` categories now gate as errors.
- `atom-react` tests run in Vitest browser mode (playwright chromium) with `expect.element` assertions; jest-dom and jsdom are gone. Consumers running these tests need `playwright install chromium`.
- Fixed a zombie-notification defect: an item removed from an `AtomRef.collection` no longer notifies the collection when mutated.
