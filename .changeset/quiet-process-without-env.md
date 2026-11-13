---
"@systemfsoftware/vitest": patch
---

The property-check defaults no longer read `process.env` when a browser runner exposes a `process` with no `env`; there the record is empty, as it already was when `process` is absent.
