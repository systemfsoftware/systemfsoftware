# AGENTS.md — `@systemfsoftware/effect-schema-law`

> **Delta**: Property-test codec laws for any Effect `Schema`. Root AGENTS.md governs.

Single-function API: `ruleOfSchemas(name, schema)`. Registers two fast-check property
tests via `@effect/vitest` — round-trip identity and encode stability. Generates
inputs from the schema itself; no hand-written arbitraries needed.

## What the Laws Enforce

```yaml
rules:
  - id: LAW-L1
    title: Round-trip identity — decode(encode(x)) === x
    do: for every Type-side value, encoding then decoding recovers the original
    dont: ship a codec that loses information in either direction
    harm: encode-then-decode produces a different value than the input; downstream
      code acts on a value that never existed in the input
    check: `pnpm --filter @systemfsoftware/effect-schema-law test` exits 0

  - id: LAW-L2
    title: Encode stability — encode(decode(encoded)) matches the original encoded form
    do: canonical encoded values survive a decode→encode roundtrip unchanged
    dont: claim wire-format stability for a subtractive transform without verifying
    harm: encoded output from the codec differs from input the caller provided;
      persisted data shifts format on every read-write cycle
    check: `pnpm --filter @systemfsoftware/effect-schema-law test` exits 0

  - id: LAW-L3
    title: Errors are exempt — a failure value is not a codec
    do: law-test schemas that model data — structs, unions, branded values, and
      `Schema.Class` / `Schema.TaggedClass` declarations
    dont: call ruleOfSchemas on a `Schema.TaggedError`
    harm: an error is a failure value, not a two-way codec; its `cause` field is
      routinely `S.Unknown`, which carries no round-trip guarantee, so the law
      fails against a schema that was never meant to satisfy it
    check: review — the vite plugin's integration test proves TaggedError is
      excluded from auto-discovery, and no hand-written ruleOfSchemas call names
      an error schema
```

## When Laws Fail

A failing law test is a **schema bug**, not a test bug. The law is correct;
the schema is wrong. Diagnose in this order:

```yaml
rules:
  - id: LAW-T1
    title: Check callback types first — the intermediate-encoded footgun
    do: verify S.transform callbacks exchange `to.Encoded`, not `to.Type`; inspect
      the to-schema's own transform chain to confirm the intermediate type
    dont: assume the transform's `encode` callback receives the composed Type
    harm: most common codec bug — encode receives a value of the wrong type,
      every encode fails, the law test shrinks to the empty/trivial case
    check: review — the failing transform's encode callback exchanges to.Encoded
      (not to.Type), confirmed by a one-line encodeEither(schema)(oneValidValue)
      returning Right before the law runs

  - id: LAW-T2
    title: Check encoded-domain parity — pattern vs arbitrary
    do: verify the encoded-side pattern and the arbitrary annotation accept exactly
      the same set of values; run 10,000 random encode→decode samples
    dont: narrow the arbitrary to exclude values the pattern still accepts
    harm: an under-generating arbitrary hides a valid encoded value that the
      schema rejects — the bug ships because tests never exercise that path
    check: review — the encoded-side pattern and the arbitrary annotation accept
      the same set of values: 10,000 random encode→decode samples produce zero
      rejections

  - id: LAW-T3
    title: Check composition alignment — Type must match Encoded
    do: for every S.compose(A, B), assert A.Type is structurally assignable to
      B.Encoded; draw the intermediate type chain before writing code
    dont: compose schemas whose intermediate types mismatch
    harm: the composed schema rejects every value at runtime with no compile error;
      the law shrinks to the first counterexample and the error tree names the
      misaligned intermediate
    check: review — every S.compose(A, B) call has A.Type structurally assignable
      to B.Encoded, confirmed by decoding and encoding one Type-side value through
      the composed schema

  - id: LAW-T4
    title: Byte-serializing transforms need byte-pair hex patterns
    do: prefer (?:[0-9a-f]{2})* for byte-pair hex in the encoded-side pattern of a
      Uint8Array codec and fc.uint8Array().map(bytes => prefix + encodeHex(bytes))
      for the arbitrary
    dont: use [0-9a-f]* which accepts odd-length hex that cannot decode to bytes
    harm: odd-length hex slips past the pattern but fails on decode; the law generates
      only even-length from the Uint8Array type side and never catches the gap
    check: review — every byte-serializing transform's encoded-side pattern is
      byte-pair (?:[0-9a-f]{2})* when the type side is a byte type, never bare
      [0-9a-f]*
```

## API

```yaml
- id: LAW-A1
  title: ruleOfSchemas — the only public function
  do: call ruleOfSchemas('ShortName', schema) at the top level of a Vitest test
    file — it registers two it.prop cases
  dont: wrap in `describe` unless grouping related schemas
  harm: top-level registration ensures discovery by the test runner
  check: review — every test file that imports ruleOfSchemas calls it once per
    exported schema at top level (describe only for grouping related schemas)

- id: LAW-A2
  title: boundedUnion — for recursive tagged unions
  do: use `boundedUnion(identifier, { base, recur, maxDepth? })` when a mutually-
    recursive type overflows the generator's call stack; split into base (leaf)
    and recur (self-referential) members
  dont: use plain `S.Union(...)` for types that recurse through non-array fields
  harm: unbounded recursion crashes the test before any law is checked
  check: review — every union whose member references the union itself through a
    non-array field uses boundedUnion; plain S.Union is used only for unions that
    do not recurse
```

## Install

`pnpm add -D @systemfsoftware/effect-schema-law` — devDependency. `effect`,
`vitest`, and `@effect/vitest` are peer dependencies you already own.
