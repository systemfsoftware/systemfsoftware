---
title: A wire shape a third party owns is declared exactly as sent, and the adapter translates it into the domain's own values
applies_when:
  - declaring a schema for a payload this repository does not own (a runtime error object, an HTTP status line, a third-party API response)
  - domain code reads raw foreign fields such as code?, errno? or a status line
  - writing tests for an adapter that decodes a third party's payload
  - an adapter builds one domain value from several payloads, or several domain values from one payload
tags: [schema, foreign-wire, codec, adapter]
---

Declare a foreign payload's wire schema with exactly the fields the adapter reads, each with the type and optionality the third party documents. Never reshape the wire shape to suit the domain, and never derive a domain schema from a payload's fields. A schema the third party's library exports is imported, never redeclared.

A wire shape need not match one domain type. Use `S.decodeTo` when a pure schema transformation turns a payload into a domain value; the wire schema is then the codec's Encoded side, and the codec meets the round-trip laws (law-failures-are-codec-defects.md) or the one-way rule (one-way-codecs-forbid-a-direction-only-when-no-honest-value-exists.md). Otherwise the adapter decodes its wire shapes and builds each domain value through that value's schema, so the domain's own checks run, whether one payload yields several values, several payloads yield one aggregate, or a lookup sits between them.

Keep the wire shapes and codecs in the `*.schema.ts` of the adapter that talks to the third party. No module outside that adapter reads a raw foreign field (`code?`, `errno?`, a status line string) or holds the provider's grammar.

A third-party parser (an AST parser, a JSONC or YAML parser) runs in the adapter's implementation module (its `*.handle.ts`, `*.service.ts` or plain adapter file), before `Schema.decode`. The adapter's `*.schema.ts` declares only the wire schemas and any pure Schema codecs over the parsed value, because schema files are decision code and never import a parser (pack: cell-architecture, presentation-is-a-formatter-the-write-phase-calls.md).

Decoding refuses only input the domain cannot represent. Never refuse valid but unwelcome foreign input: an "unavailable" answer decodes to a domain value the decider judges.

Prove the codec or adapter translation through the port's contract cases (testing pack: adapters-run-against-real-local-resources.md) and the schema's generated laws. A codec that forbids encoding follows the one-way rule (one-way-codecs-forbid-a-direction-only-when-no-honest-value-exists.md). A behaviour test never names a foreign field, status, endpoint or payload.

```typescript
// WRONG: wire shape reshaped, unwelcome input refused
const ChargeResponse = S.Struct({ id: S.String, status: S.Literal('succeeded') })
// RIGHT: declared as sent, in the adapter's *.schema.ts, as the Encoded side of a codec into the domain's own union
const ChargeWire = S.Struct({ id: S.String, status: S.String, decline_code: S.optional(S.String) })
export const Charge = ChargeWire.pipe(S.decodeTo(ChargeOutcome, chargeFromWire))
```
