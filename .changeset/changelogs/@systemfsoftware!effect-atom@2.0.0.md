## 2.0.0

### Major Changes

- The `result` member is removed from the `DehydratedAtomValue` type returned by `dehydrate`.

  - `DehydratedAtomValue.result` was a `Deferred` that completed when an initially-loading atom reached a real value. It never survived serialization, so it could not work across the process boundary the dehydrated state exists for; reading it after transport failed at runtime.
  - The pending-update behaviour is unchanged: entries created with `encodeInitialAs: 'deferred'` still settle the target registry once `hydrate` applies them and the source atom resolves.
  - Wait for all pending updates by joining the fiber that `hydrate` returns, as before.
  - Code that read `entry.result` directly no longer compiles; drop that access — there is no replacement field.

### Minor Changes

- `Registry.make` and `Registry.layerOptions` accept `now` and `scheduleTimer`, so every time-dependent atom can be driven without waiting in real time.

  - `now?: () => number` supplies the clock.
  - `scheduleTimer?: (f: () => void, delayMillis: number) => () => void` arms a delayed callback and returns its canceller.

  Both default to the platform's wall clock and timer, so existing callers are unaffected. One substitution now drives all three time-dependent behaviours together: idle-TTL eviction, `Atom.debounce`, and `Atom.swr` staleness. Previously each read the clock and armed timers itself, so testing any of them meant real elapsed time.

  `Registry` exposes `now` and `scheduleTimer` as members, alongside `scheduler` and `schedulerAsync`.

- Atoms built from a runtime keep the last good answer again, and four read paths that lost or overwrote a value are fixed.

  - A stream-backed atom that emitted values and then completed reported an empty stream and failed with `NoSuchElementError`. It now settles with the value the stream emitted last.
  - A failing refresh, retry or reload no longer clears the value already on screen. The previous success is carried across effect, stream, pull, `subscriptionRef` and `fn` atoms, so `Result.previousSuccess` is populated while waiting and after a failure, as documented.
  - Reading a `subscriptionRef` atom whose runtime layer failed threw `Result.getOrThrow: no value found` instead of reporting the failure. It now reports the layer's failure like every other atom on that runtime.
  - `Atom.kvs` without `mode: 'async'` wrote `defaultValue()` into the store on first read, overwriting a value the store had not finished loading. The fallback is now shown without writing, and the default is stored only once the store reports the key absent.

  Surface changes:

  - `AtomContext.self` takes the value type as a parameter: `get.self<MyResult>()` returns `Option<MyResult>` where it previously returned `Option<unknown>`.
  - `AtomRuntime.subscriptionRef` declares `Cause.NoSuchElementError` in its error channel, which its implementation always could produce.
  - The HTTP API client's `mutation` and `query` bound their `Group` and `Endpoint` type parameters to any group and any endpoint. Each is now bound to the group and endpoint its identifier arguments select, so a call that passed one of them explicitly and disagreed with the identifiers no longer compiles.
  - `Result.builder` renders a typed value. `orElse` returns the accumulated value or the fallback, `orNull` and `render` add `null`, and `exhaustive` returns the value alone, where all four previously returned `unknown`. Code that relied on assigning a rendered result anywhere now needs the value's real type.
  - `Atom.mapResult` reports the mapped value with the source atom's error type, where it previously reported a union that included an untyped result. Mapping a mapped atom now gives the second mapper the real value type instead of `unknown`; an annotation written against the old union needs updating.

- Harden the v4 fork: Effect-native hydration, zero `as any` casts, browser-mode tests.

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

- Port both packages onto the effect v4 release candidate (`effect@4.0.0-rc.108`,
  resolved from the `effect4` catalog). The `src/` is now the v4 reactivity API:
  absorbed packages (`@effect/experimental`, `@effect/platform`, `@effect/rpc`)
  are gone — their modules now live under `effect/unstable/*` and the core `effect`
  barrel — and every removed/renamed v3 symbol is replaced (`Effect.async`→
  `callback`, `Context.Tag`→`Context.Service`, `Runtime<R>`→`Runtime`, `Cause`
  error renames, `Schema.decodeEither`→`decodeExit`, the `Mailbox`/`Subscribable`/
  `GlobalValue`/`FiberId` modules). **Breaking:** the `effect` peer dependency is
  now `4.0.0-rc.x`; consumers must move to effect v4.

  Breaking changes:

  - `Registry.isRegistry` is renamed `isAtomRegistry`.
  - The read-context type `Atom.Context` is renamed `Atom.AtomContext`; `defaultMemoMap` and `KvsError` are removed.
  - `Result.toExitAsEffect`, `Result.schemaFromSelf`, `Result.PartialEncoded`, and `Result.Encoded` are removed (use `Result.toExit` + `Effect.exit` and `Result.Schema`).
  - `Atom.make(stream)`/`Atom.fn(stream)` widen the atom's error channel with `Cause.NoSuchElementError`.
  - `Registry.make`/`Registry.layerOptions` and `RegistryProvider` take a changed `scheduleTask` option signature.
  - `@systemfsoftware/effect-atom-react` no longer re-exports the atom package's namespaces (`Atom`, `Registry`, `Result`, `AtomRef`, `AtomHttpApi`, `AtomRpc`, `Hydration`, `ScopedAtom`) from its root — those modules are not browser-safe, and the react entry is browser-tested. Import them from `@systemfsoftware/effect-atom` directly.
  - Runtime type markers `Atom.TypeId`/`WritableTypeId`/`AtomRef.TypeId` moved to `~effect/reactivity/*`; the wire `SerializableTypeId` (`~effect-atom/atom/Atom/Serializable`) is unchanged, so `Hydration` payload keys are stable.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- A serialised successful result now requires its timestamp to be a finite number.
  It previously accepted `NaN` and `Infinity`, so a corrupted timestamp could decode
  without complaint and reach code that compares it.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- The `atom` packages publish their own author rather than crediting an upstream they are not downstream of, and `stryker-plugins` no longer pulls Node's ambient types into a package that has no runtime dependency on them.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text
