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
`GlobalValue`/`FiberId` modules, the `~effect-atom/atom/…` wire TypeIds
preserved). **Breaking:** the `effect` peer dependency is now `4.0.0-rc.x`;
consumers must move to effect v4.
