---
title: "Diagnosing a failing codec-law test (effect-schema-law)"
date: 2026-08-14
category: test-failures
module: effect-schema-law
problem_type: test_failure
component: testing_framework
symptoms:
  - "a ruleOfSchemas law test fails in a consumer package (effect-daemon-spec, hex-schema, stryker-plugins) or a downstream repo"
  - "the law test shrinks to the empty or trivial case instead of exercising real values"
  - "the composed schema rejects every value at runtime with no compile error"
root_cause: schema_bug
resolution_type: schema_fix
severity: medium
tags: [effect-ts, schema, property-testing, codec, fast-check, ruleOfSchemas]
---

# Diagnosing a failing codec-law test

A failing law test is a **schema bug**, not a test bug. The law is correct;
the schema is wrong. Diagnose in this order:

## LAW-T1 — Check callback types first: the intermediate-encoded footgun

Verify `S.transform` callbacks exchange `to.Encoded`, not `to.Type`; inspect
the to-schema's own transform chain to confirm the intermediate type. Do not
assume the transform's `encode` callback receives the composed Type.

This is the most common codec bug: encode receives a value of the wrong
type, every encode fails, and the law test shrinks to the empty/trivial
case. Confirm with a one-line `encodeEither(schema)(oneValidValue)`
returning `Right` before the law runs.

## LAW-T2 — Check encoded-domain parity: pattern vs arbitrary

Verify the encoded-side pattern and the arbitrary annotation accept exactly
the same set of values: 10,000 random encode→decode samples produce zero
rejections. Do not narrow the arbitrary to exclude values the pattern still
accepts: an under-generating arbitrary hides a valid encoded value that the
schema rejects, and the bug ships because tests never exercise that path.

## LAW-T3 — Check composition alignment: Type must match Encoded

For every `S.compose(A, B)`, assert `A.Type` is structurally assignable to
`B.Encoded`; draw the intermediate type chain before writing code. Composed
schemas whose intermediate types mismatch reject every value at runtime
with no compile error; the law shrinks to the first counterexample and the
error tree names the misaligned intermediate. Confirm by decoding and
encoding one Type-side value through the composed schema.

## LAW-T4 — Byte-serializing transforms need byte-pair hex patterns

Prefer `(?:[0-9a-f]{2})*` for byte-pair hex in the encoded-side pattern of
a `Uint8Array` codec, and `fc.uint8Array().map(bytes => prefix +
encodeHex(bytes))` for the arbitrary. Never use `[0-9a-f]*`: it accepts
odd-length hex that cannot decode to bytes — odd-length hex slips past the
pattern but fails on decode, and the law generates only even-length from
the `Uint8Array` type side, so it never catches the gap.
