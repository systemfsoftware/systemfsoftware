---
'@systemfsoftware/oxlint-plugin': minor
'@systemfsoftware/oxlint-plugin-test-placement': minor
---

The recommended set now enables two new rules at error.

`no-internal-jsdoc-outside` reports the `@internal` tag on any export that is not under an internal folder. `tests-import-public-api` reports a test that reaches unpublished modules through a relative import. `internal-export-jsdoc` ships in the plugin but stays off: tagging a name that a public barrel re-exports makes `stripInternal` drop it from the published types.

Spreading the recommended set is all it takes.
