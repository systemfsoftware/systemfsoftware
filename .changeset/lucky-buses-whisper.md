---
"@systemfsoftware/oxlint-plugin-test-discipline": patch
---

`behaviour-test-requires-gherkin` now tells authors to import `it` from `@systemfsoftware/effect-gherkin-spec` and build the suite with `makeFeature({ it })`, matching the current `makeFeature` signature.
