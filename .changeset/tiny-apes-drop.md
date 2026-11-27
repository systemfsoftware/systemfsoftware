---
"@systemfsoftware/effect-gherkin-spec": minor
---

`.withLayer` can now follow `.withLayer` and `.withScenarioLayer`, and a later layer may require services an earlier one provides; a requirement no earlier layer meets is a compile error. `.withLayer` accepts a layer with a failure type, and the builder types `FeatureBuilderWithLayer` and `FeatureBuilderBoth` gain a trailing `EShared` type parameter that defaults to `never`. Re-exports `sharedLayer` from `@systemfsoftware/effect-spec-runtime`: called at module top level, it makes a layer that every Feature in the file shares, built once before the file's first scenario and released once when the file ends.
