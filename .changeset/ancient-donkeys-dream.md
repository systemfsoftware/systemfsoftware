---
"@systemfsoftware/oxlint-plugin-effect-schema": patch
---

`schema-declaration-location`'s fix text no longer sends authors to `tests/__fixtures__/<stem>.schema.ts`. It names the production module that owns the concept, or the test harness file (`*.model.ts` or `*.fixture.ts`) for a harness schema.
