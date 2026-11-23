---
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/effect-cell-types": patch
---

Render JSON text in test fixtures through `Schema.fromJsonString` instead of calling `JSON.stringify` directly, so the package passes the `global-json` check. Published output is unchanged.
