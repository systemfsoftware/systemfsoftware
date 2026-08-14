---
"@systemfsoftware/effect-atom": minor
"@systemfsoftware/effect-atom-react": minor
---

Port both packages onto the effect v4 release candidate (`effect@4.0.0-rc.108`,
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
