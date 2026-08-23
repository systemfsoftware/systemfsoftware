# AGENTS.md — `@systemfsoftware/effect-schema-law`

Property-test codec laws for any Effect `Schema`. This package holds one export, `ruleOfSchemas`, and nothing else: a schema's rejection contract belongs to `@systemfsoftware/effect-schema-refutation`, and a recursive union whose generation must terminate belongs to `@systemfsoftware/effect-schema-bounded-union`. Usage and install are in `README.md`; diagnosing a failing law test is in `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`.

## What the Laws Enforce

```yaml
rules:
  - id: LAW-L1
    title: Round-trip identity — decode(encode(x)) === x
    do: for every Type-side value, encoding then decoding recovers the original
    dont: ship a codec that loses information in either direction
    harm: encode-then-decode produces a different value than the input; downstream
      code acts on a value that never existed in the input
    check: "`pnpm --filter @systemfsoftware/effect-schema-law test` exits 0 — the
      suite pins the predicate against a codec that decodes every input to one value,
      so a predicate that cannot say no cannot pass. Invert the predicate and the
      suite reddens; that inversion is the only reason the exit code means anything"

  - id: LAW-L2
    title: Encode stability — encode(decode(encoded)) matches the original encoded form
    do: canonical encoded values survive a decode→encode roundtrip unchanged
    dont: claim wire-format stability for a subtractive transform without verifying
    harm: encoded output from the codec differs from input the caller provided;
      persisted data shifts format on every read-write cycle
    check: "`pnpm --filter @systemfsoftware/effect-schema-law test` exits 0 — the same
      collapsing codec pins this predicate, and the fixed-point case pins that it
      still says yes where the round-trip really does hold"

  - id: LAW-L3
    title: Errors are exempt — a failure value is not a codec
    do: law-test schemas that model data — structs, unions, branded values, and
      `Schema.Class` / `Schema.TaggedClass` declarations
    dont: call ruleOfSchemas on a `Schema.TaggedError`
    harm: an error is a failure value, not a two-way codec; its `cause` field is
      routinely `S.Unknown`, which carries no round-trip guarantee, so the law
      fails against a schema that was never meant to satisfy it
    check: "`pnpm --filter @systemfsoftware/effect-schema-vite test` exits 0 — its
      integration suite declares a `Schema.TaggedError` beside five data schemas in
      one fixture and matches the discovered set with an exact-object `toEqual`, so
      the error joining that set reddens the suite the moment it does. Locate the
      fixture with `grep -n TaggedError
      packages/core/effect/schema/vite/tests/inline-schema-tests.integration.test.ts`;
      no line is cited because that file is edited far more often than this rule.
      A hand-written call is review's to catch"
