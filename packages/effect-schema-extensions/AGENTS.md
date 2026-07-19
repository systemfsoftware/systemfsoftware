# AGENTS.md — `@systemfsoftware/effect-schema-extensions`

> **Location:** `packages/effect-schema-extensions/` — extra Effect Schema codecs (hex-string, prefixed-hex). Universal agent rules live in the root `AGENTS.md`; this file carries only `effect-schema-extensions/`-specific deltas.

Extends `Schema` with branded hex-string types. Every codec must provide:

- `Schema` — the branded schema
- `decode` / `encode` — typed wrappers
- `arbitrary` — fast-check generator for property tests

🛑 Don't add codecs without branded types — bare string schemas defeat Constitution §I.4 (no primitive obsession). Every hex codec MUST brand its output.
