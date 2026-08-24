---
"@systemfsoftware/oxlint-plugin-test-placement": minor
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
---

Schema refutation suites are now recognised where schema law suites already were.

A generated refutation suite may live in source, beside the generated law suite, without being reported as a test file in the wrong place. A block that states a schema's refusals keeps its exemption from the private-target rule, which now recognises the refusal helper at its current import path.

The duplicate-law diagnostic names that same path when it tells you a hand-written assertion restates a generated law.
