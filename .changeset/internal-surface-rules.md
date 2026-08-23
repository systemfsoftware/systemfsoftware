---
'@systemfsoftware/oxlint-plugin': minor
'@systemfsoftware/oxlint-plugin-test-placement': minor
---

The recommended set now enables three new rules at error.

`internal-export-jsdoc` requires the `@internal` tag on every export that belongs in an internal module. `no-internal-jsdoc-outside` reports that tag on any other export. `tests-import-public-api` reports a test that reaches unpublished modules through a relative import.

Spreading the recommended set is all it takes.
