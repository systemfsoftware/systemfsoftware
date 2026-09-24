## 0.1.0

### Minor Changes

- Decision nodes, patterns, matchers, classification matches, procedures, registries, and models are built on the `Blueprint` kind.

  - Every operation has a method and a same-name function that agree in type. Patterns gain `evaluate` and `preview` methods, matchers gain `when`, `onUncertain`, and `orElse`, and a classification match gains `caseOf`.
  - `Discern.Model.model(provider)` starts a model blueprint. Add interceptors with `recording`, `caching`, `replaying`, and `budgeted` as methods or through `pipe`, then read its `layer`.
  - `DecisionNode`, `ClassifyDecision`, `ProbabilityDecision`, `RateDecision`, `Pattern`, `Matcher`, `ClassificationMatcher`, `Procedure`, and `Registry` are now type aliases, so an `interface` can no longer extend them. `ClassificationMatcher` no longer carries the `_remaining` field; its remaining labels live in its type.
