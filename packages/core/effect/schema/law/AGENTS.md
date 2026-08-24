# AGENTS.md — `@systemfsoftware/effect-schema-law`

Two entries: `.` exposes `ruleOfSchemas`, `./refutation` exposes the refusal/adequacy surface (`refutes`, `scanObligations`, `obligationsOf`, `adequacyReport`, `discriminates`, `dischargedBy`, `armsOf`, `WITNESS_BUDGET`, and associated types). A recursive union whose generation must terminate belongs to `@systemfsoftware/effect-schema-bounded-union`. Usage and install are in `README.md`; diagnosing a failing law test is in `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`.

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

  - id: REF-R1
    title: A refusal generator is derived from the domain contract, never from the refinement literal
    do: build the generator from what the type promises about its values — "a non-hex
      character is not a hex string" — so the test asserts something the schema's own
      predicate did not tell it
    dont: construct the generator by negating, mirroring or importing the regex,
      bound or predicate the schema checks with
    harm: a generator read off the literal reproduces the exact circularity that makes
      a generated law blind. It refuses precisely what the predicate refuses, so it
      passes for every schema the predicate accepts — including the schema after
      someone widens that predicate wrongly. The refusal property, the discrimination
      property and the adequacy verdict all go green on a schema whose constraint no
      longer holds, and the suite reports coverage of the one thing it cannot see
    check: "`pnpm --filter @systemfsoftware/effect-schema-law test` exits 0 — the
      suite exercises the in-source refutation properties; the generator-construction
      half is review — for each generator, whether its construction reads any value
      from the schema it tests, which is unbuildable because both spellings produce
      the same type"
```

An obligation is keyed by the AST node a weakening removes, not by the path that reaches it — so one `refutes` call discharges that node everywhere it appears, and three schemas built on one refinement owe one refusal between them.

`scanObligations` reports `blind` arms separately from `obligations`: an arm nothing could draw for is not an arm with no witness. Read the two lists apart before concluding a schema is adequate. The vocabulary — refutation adequacy, schema weakening, witness, refutation obligation, obligation node — is defined once in the root `CONCEPTS.md`; use those terms and do not redefine them here.
