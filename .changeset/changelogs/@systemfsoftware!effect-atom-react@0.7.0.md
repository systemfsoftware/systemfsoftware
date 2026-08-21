## 0.7.0

### Minor Changes

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

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- The `atom` packages publish their own author rather than crediting an upstream they are not downstream of, and `stryker-plugins` no longer pulls Node's ambient types into a package that has no runtime dependency on them.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

- Updated dependencies:
  - @systemfsoftware/effect-atom@2.0.0
