---
title: A wire shape a third party owns is declared exactly as sent, as the Encoded side of an adapter's codec, and decodes into a domain Type
applies_when:
  - declaring a schema for a payload this repository does not own (a runtime error object, an HTTP status line, a third-party API response)
  - domain code reads raw foreign fields such as code?, errno? or a status line
  - writing tests for an adapter that decodes a third party's payload
tags: [schema, foreign-wire, codec, adapter]
---

Declare a foreign payload's Encoded side with exactly the fields the adapter reads, each with the type and optionality the third party documents, and decode it with `S.decodeTo` into a domain Type. Never reshape the wire shape to suit the domain. A schema the third party's library exports is imported, never redeclared.

Keep the codec in the `*.schema.ts` of the adapter that talks to the third party. No module outside that adapter reads a raw foreign field (`code?`, `errno?`, a status line string) or holds the provider's grammar.

Decoding refuses only input the domain cannot represent. Never refuse valid but unwelcome foreign input: an "unavailable" answer decodes to a domain value the decider judges.

Prove the codec through the port's contract cases (testing pack: adapters-run-against-real-local-resources.md) and the schema's generated laws. A behaviour test never names a foreign field, status, endpoint or payload.

```typescript
// WRONG: wire shape reshaped, unwelcome input refused
const ChargeResponse = S.Struct({ id: S.String, status: S.Literal('succeeded') })
// RIGHT: declared as sent, decoded into the domain's own union inside the adapter
const ChargeWire = S.Struct({ id: S.String, status: S.String, decline_code: S.optional(S.String) })
export const Charge = ChargeWire.pipe(S.decodeTo(ChargeOutcome, chargeFromWire))
```
