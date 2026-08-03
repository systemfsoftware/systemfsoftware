# AGENTS.md — `effect-memfs/`

> Delta only. Universal rules: root `AGENTS.md`.

A hard fork of `nounder/effect-memfs`, maintained here and published under our name. It is
NOT vendored — `repos/` is the read-only tree (REPO-S3); this package is edited normally.

```yaml
- id: MF1
  title: Narrow driver values with predicates, never casts
  do: convert a memfs value with a runtime-checked type predicate that throws on mismatch, inside the Effect.tryPromise that already maps failures to PlatformError
  dont: bridge a driver value with `as`, `as unknown as`, or an options-laundering `as never`
  harm: adapter-no-cast bans every assertion in a *.adapter.ts, and its prescribed decode is impossible for a live handle or a TS overload — a cast here has no legal remedy and drives a suppression comment
  check: pnpm --filter @systemfsoftware/effect-memfs lint exits 0 with zero adapter-no-cast reports

- id: MF2
  title: The port is @effect/platform, the driver is memfs
  do: keep exactly one driver (`memfs`) behind the FileSystem port
  dont: import a second external system into memory-file-system.adapter.ts
  harm: adapter-single-external-system exempts the @effect/platform PORT scope precisely so the one DRIVER is countable; a second driver silently defeats that
  check: adapter-single-external-system reports nothing for this package
```
