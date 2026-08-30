---
"@systemfsoftware/oxlint-plugin-recommended": patch
---

The recommended preset no longer requires explicit return types on exported functions. The published API report already enforces the contract, so inferred signatures that change the report now fail there instead of as a lint error.
