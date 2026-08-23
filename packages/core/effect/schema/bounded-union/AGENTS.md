# AGENTS.md — `@systemfsoftware/effect-schema-bounded-union`

One export, `boundedUnion`. Usage is in `README.md`.

The package exists because `Schema.Union` generates as an unbounded `fc.oneof`, so a union recursing through a non-array field overflows the stack during generation. This caps generation depth and changes nothing else.

```yaml
rules:
  - id: BU-R1
    title: The cap applies to generation only — decode, encode and equivalence stay Schema.Union's
    do: keep the returned value `S.Union([...base, ...recur])` with annotations added;
      put every depth concern inside the `toArbitrary` hook
    dont: filter members, reorder them, alter a member's schema, or let `maxDepth`
      reach any code path a decode or encode runs through
    harm: this package installs as a runtime dependency, so the codec it returns is the
      codec a consumer's application decodes production input with. A depth bound that
      leaked into decoding would reject deeply-nested input that `Schema.Union` accepts —
      at the boundary, on real traffic, for a reason that reads as a generator setting.
      Nothing in a test suite would show it: generated values are bounded by
      construction, so every property still passes on the values it can draw
    check: "`pnpm --filter @systemfsoftware/effect-schema-bounded-union test` exits 0 —
      the in-source properties decode values deeper than `maxDepth` and assert
      acceptance, so a leak into decoding fails them"
```

`identifier`, the first argument, is both the schema's identifier and the `depthIdentifier` the generator counts against. Two distinct recursive cycles sharing one identifier share one depth budget, and the second one silently under-generates — keep it unique per cycle.
