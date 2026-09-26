## 0.3.0

### Minor Changes

- Discern's schemas now carry their states instead of optional fields. `CaseTrace` is a union keyed by `status`: only an `Uncertain` case carries `reason`, and it is required there. `PatternMatched` and `PatternMissed` no longer carry `reason`; `PatternUncertain` requires it. `DecisionInspection` is a union keyed by `kind`, each carrying that kind's `criteria`. `Model.BudgetLimits` holds one `BudgetLimit` per dimension, either `Unlimited` or a `Limited` non-negative integer count, in place of optional numbers where absence meant unlimited; `BudgetLimit`, `Unlimited` and `Limited` are exported. Route and answer probabilities are a branded `Probability` in [0, 1]: a model or recorded answer outside that range is refused at decode. `Procedure` `onUncertain` receives the decoded route (`RouteUncertainOf`). `EvalMetrics`, `EvalRecord`, `EvalReport`, `CaseInspection`, `CompiledPlan`, `Trace`, `Observation` and `Observations` are plain structs instead of classes: build them with `.make(...)` or object literals, not `new`. The encoded shapes of `CaseTrace`, `DecisionInspection`, the pattern results and `BudgetLimits` change, and stored values in the old shapes no longer decode. To migrate stored budget limits, write `{ decisions: 100 }` as `{ decisions: { _tag: 'Limited', count: 100 }, calls: { _tag: 'Unlimited' } }` and an absent limit as `{ _tag: 'Unlimited' }`. To migrate stored traces, drop `reason` from `Match` and `Miss` cases and give every `Uncertain` case a `reason`.

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.
