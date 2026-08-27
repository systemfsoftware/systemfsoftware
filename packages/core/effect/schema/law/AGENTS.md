# AGENTS.md — `@systemfsoftware/effect-schema-law`

Single entry `.` exposing `ruleOfSchemas`. A recursive union whose generation must terminate belongs to `@systemfsoftware/effect-schema-bounded-union`. Usage and install are in `README.md`.

## What the Laws Enforce

```yaml
rules:
  - id: LAW-L1
    title: Round-trip identity — decode(encode(x)) === x
    do: for every Type-side value, encoding then decoding recovers the original
    dont: ship a codec that loses information in either direction
    harm: encode-then-decode produces a different value than the input
    check: "`pnpm --filter @systemfsoftware/effect-schema-law test` exits 0 — the suite pins the predicate against a codec that decodes every input to one value, so a predicate that cannot say no cannot pass"

  - id: LAW-L2
    title: Encode stability — encode(decode(encoded)) matches the original encoded form
    do: canonical encoded values survive a decode→encode roundtrip unchanged
    dont: claim wire-format stability for a subtractive transform without verifying
    harm: encoded output from the codec differs from input the caller provided
    check: "`pnpm --filter @systemfsoftware/effect-schema-law test` exits 0 — the same collapsing codec pins this predicate"

  - id: LAW-L3
    title: Errors are exempt — a failure value is not a codec
    do: law-test schemas that model data — structs, unions, branded values, and `Schema.Class` / `Schema.TaggedClass` declarations
    dont: call ruleOfSchemas on a `Schema.TaggedError`
    harm: an error is a failure value, not a two-way codec; its `cause` field is routinely `S.Unknown`, which carries no round-trip guarantee
    check: "`pnpm --filter @systemfsoftware/effect-schema-vite test` exits 0 — its integration suite declares a `Schema.TaggedError` beside five data schemas and asserts the discovered set with an exact `toEqual`, so the error joining the set reddens the suite"
```
