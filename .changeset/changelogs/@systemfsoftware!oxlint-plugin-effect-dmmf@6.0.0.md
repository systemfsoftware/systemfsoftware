## 6.0.0

### Major Changes

- The no-unbounded-fanout rule is removed from the property-testing preset and from the dmmf aggregate preset. Configs that enable it by name stop resolving it; delete the entry. Collection generation was already bounded by the generator's default size cap and by runtime budgets, so the rule enforced nothing.

### Patch Changes

- The recommended oxlint set now carries `workflow-variant-constructed` and `runtime-construction-placement` at `error`, and the make-keyed workflow rules recognize the `Workflow.total` and `Workflow.andThen` constructors as lawful workflow construction.

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin-property-testing@2.0.0
