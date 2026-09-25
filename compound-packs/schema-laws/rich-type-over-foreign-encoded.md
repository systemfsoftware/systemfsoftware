---
title: A wire shape a third party owns stays the Encoded side and decodes into a rich domain Type
applies_when:
  - declaring a schema for a payload this repo does not own (a Node error, an HTTP status line, an OTLP span, a vendor API response)
  - tempted to exempt a foreign schema from the other schema-laws rules because its shape is fixed
  - tempted to reshape a foreign schema into a tagged union on the wire
  - domain code reads raw foreign fields (`code?`, `errno?`, `statusLine`) and interprets them itself
tags: [schema-laws, foreign-wire, transformation, decodeTo, encoded, type]
---

A foreign payload's shape is not this repo's to change: rewriting it breaks the producer, and keeping it as the domain type spreads the producer's optionals and strings through every consumer. Effect Schema separates the two sides, so neither compromise is needed.

## Rule

1. **The foreign shape is the Encoded side, byte for byte.** Declare it exactly as the third party sends it, optionals and all.
2. **Decode into a rich Type** with `S.decodeTo` and a `SchemaTransformation` (or `SchemaGetter` pair). The Type side obeys `invariants-as-refinements`, `cross-field-invariants-as-struct-checks`, and `tagged-unions-over-state-by-presence`: the domain sees a union of the cases it distinguishes, not the producer's optionals.
3. **The transformation is lawful.** Every Type value encodes back to a foreign value that decodes to the same Type; the generated round-trip and encode-stability laws hold. A law failure is fixed in the codec (`law-failure-is-a-codec-defect`).
4. **Valid foreign input is not refused for being unwelcome.** A 503 is a valid status line; decode it to a `StatusCode` and let the decider judge it. Refuse only input the domain cannot represent.
5. **Import the third party's schema when it exports one** (for example `Rpc.exitSchema` from `effect/unstable/rpc`) instead of redeclaring it.
6. **Root the exported chain at the schema vocabulary.** Write `export const X = S.Struct({...}).pipe(S.decodeTo(...))`, not a local `const Wire = S.Struct(...)` followed by `Wire.pipe(...)`: `@systemfsoftware/effect-schema-discovery`, which `@systemfsoftware/effect-schema-vite` uses to find schemas, recognizes only chains rooted at `Schema.*`, so the second form silently loses the generated round-trip and encode-stability laws.

```ts
import { Schema as S, SchemaTransformation } from 'effect'

// SocketOsErrorCase: a tagged union of the cases the socket medium distinguishes
export const SocketOsError = S.Struct({ code: S.optional(S.String), errno: S.optional(S.Int) }).pipe(
  S.decodeTo(SocketOsErrorCase, SchemaTransformation.transform({ decode: osErrorCaseOf, encode: nodeShapeOf })),
)
```

Working example: `packages/daemon/effect-daemon-socket/src/SocketMedium/socket-failure.schema.ts` (Node's `{ code?, errno? }` decoded into the cases the socket medium distinguishes) and `packages/effect-readiness/src/DialEvidence.schema.ts` (a raw HTTP status line decoded into a branded `StatusCode`).

Gate: `review`.
