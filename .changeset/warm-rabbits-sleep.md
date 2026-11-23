---
"@systemfsoftware/vitest": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/differential-spec": patch
---

Render JSON text through `Schema.fromJsonString` instead of calling `JSON.stringify` directly, so the package passes the `global-json` check. Output is unchanged for JSON-serialisable values.
