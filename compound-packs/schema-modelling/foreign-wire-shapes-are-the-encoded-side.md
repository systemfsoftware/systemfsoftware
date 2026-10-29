---
title: A wire shape a third party owns is declared exactly as sent, as the Encoded side of an adapter's codec, and decodes into a domain Type
applies_when:
  - declaring a schema for a payload this repository does not own (a runtime error object, an HTTP status line, a third-party API response)
  - domain code reads raw foreign fields such as code?, errno? or a status line
  - writing tests for an adapter that decodes a third party's payload
tags: [schema, foreign-wire, codec, adapter]
---

A foreign payload's Encoded side declares the fields the adapter reads, each with the type and optionality the third party documents, and no field the adapter does not read. It is and decoded with S.decodeTo into a domain Type that follows this pack's other rules. The wire shape is never reshaped to suit the domain.

The codec lives in the *.schema.ts of the adapter that talks to the third party. No module outside that adapter reads a raw foreign field (code?, errno?, a status line string) or holds the provider's grammar.

Decoding refuses only input the domain cannot represent. Valid foreign input is never refused for being unwelcome: an "unavailable" answer decodes to a domain value the decider judges.

A schema the third party's library exports is imported, never redeclared.

The codec is proven by the port's contract cases (testing pack, adapters-run-against-real-local-resources.md), read through the port's result, and by the schema's generated laws. A behaviour test that drives the same adapter never names a foreign field, status, endpoint or payload and never asserts a decoded foreign value; it asserts only what its consumer observes (testing pack).

Decision test: does every field the Encoded schema declares carry the type and optionality the third party documents, is every declared field read by the adapter, and is every read of a foreign field inside the adapter's codec? A reshaped wire schema, a foreign field read in domain code, a refusal of valid-but-unwelcome input, or a behaviour test asserting the wire shape fails the rule.

Defect prevented: a wire schema reshaped to the domain refuses responses the third party really sends, or accepts ones it never sends. Domain code that branches on vendor optionals breaks when the vendor changes. An unwelcome answer refused at decode reaches the decider as a decode failure instead of an outcome it can handle.

```typescript
// WRONG: wire shape reshaped, unwelcome input refused, domain reads the raw status
const ChargeResponse = S.Struct({ id: S.String, status: S.Literal('succeeded') })
if (raw.status === 'card_declined') return Declined.make({})
```

```typescript
// RIGHT: declared as sent, decoded into the domain's own union inside the adapter
const ChargeWire = S.Struct({ id: S.String, status: S.String, decline_code: S.optional(S.String) })
export const Charge = ChargeWire.pipe(S.decodeTo(ChargeOutcome, chargeFromWire))
```

Source: Effect 4 Schema.ts, decodeTo (a composed schema decodes from the source's Encoded to the target's Type and encodes back); systemfsoftware/constitution CONSTITUTION.md, CONST-D1 (close types so an illegal value cannot be constructed) and CONST-D2 (every distinct failure is its own tagged variant); Alexis King, "Parse, don't validate" (2019), on parsing at the boundary into a type that keeps what was learned.

Gate: judge
