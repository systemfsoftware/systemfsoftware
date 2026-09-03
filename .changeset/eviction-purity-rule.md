---
"@systemfsoftware/oxlint-plugin-test-placement": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
"@systemfsoftware/all": patch
---

New `eviction-purity` rule reports four assertion shapes inside test directories that certify nothing: an expected value recomputed by calling the same helper the code under test calls, a marker constant asserted against its own literal, a bare early return standing where a refusal assertion belongs, and a substring check that no valid input can fail.
