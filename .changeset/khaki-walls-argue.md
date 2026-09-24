---
"@systemfsoftware/oxlint-config-recommended": minor
---

The recommended config now enables the test-discipline rules it bundles. Before this release it loaded the plugin but turned none of its rules on, so Gherkin-only behaviour tests, test naming, test-file placement, and the differential and conformance harness rules went unchecked. Expect new lint errors in test files that break those rules.
