---
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
---

Add a separate named catalog `effect4` in `pnpm-workspace.yaml` carrying the
`effect@4.0.0-rc.108` and `@effect/vitest@4.0.0-rc.108` release-candidate
versions. The default `catalog.effect` stays at `^3.22.1` so the rest of the
workspace continues to resolve effect 3.x. No package sources are changed in
this commit — migrating the atom packages' `src/` onto the v4 API is a
follow-up (every `effect/Either`, `Runtime.runFork`, `Cause.NoSuchElementException`,
`SubscriptionRef.SubscriptionRefTypeId`, `Stream.either`, `Channel.toPull`,
`Stream.runForEachChunk`, `Effect.fn`/`Effect.fnUntraced`, `Reactivity`
and `KeyValueStore` call site is affected).
