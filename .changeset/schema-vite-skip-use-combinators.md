---
'@systemfsoftware/effect-schema-vite': patch
---

Generated schema law suites no longer fail to load when a module exports a value derived from a schema rather than a schema itself — a type guard from `Schema.is`, a decoder, an encoder, or an arbitrary. Such an export is skipped instead of being handed to the round-trip laws.
