---
title: A wire shape a third party owns is declared exactly as sent, as the Encoded side, and decodes into a domain Type
applies_when:
  - declaring a schema for a payload this repository does not own (a Node error, an HTTP status line, a vendor API response)
  - domain code reads raw foreign fields such as code?, errno? or a status line
tags: [schema, foreign-wire, codec, adapter]
---

A foreign payload is declared exactly as the third party sends it, optionals included, as the Encoded side, and decoded with S.decodeTo into a domain Type that follows this pack's other rules; the wire shape is never reshaped.

Domain code never reads raw foreign fields (code?, errno?, a status line string).

Valid foreign input is never refused for being unwelcome (a 503 decodes to a status the decider judges); decode refuses only input the domain cannot represent.

A third party's exported schema (for example Rpc.exitSchema) is imported, never redeclared.

The codec lives in the *.schema.ts of the adapter that talks to the third party; the domain module holds no provider grammar.

Gate: judge
