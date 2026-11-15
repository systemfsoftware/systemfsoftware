# Feature Scenario Rubric

Judge each scenario by its step bodies and layers, never by retitled text:

1. **Consumer entry:** Does every When drive the exact entry production consumers call?
2. **Real Givens:** Does every Given produce each fact its text claims (unless asserting an initially empty world)?
3. **Consumer Then:** Does every Then assert only the entry's outcome, state read back via our system's operations, or an outbound port fake's port-level read operation?
4. **Real or contract-proven services:** Does every reached service run its real layer or a fake exercised in its contract suite (`port-fakes-share-a-contract-suite.md`)—never inline object literals or partial shapes (except `<Feature>Config` settings)?
5. **Backed world:** Does the scenario layer supply the world the Givens claim (never an empty layer under stateful Givens)?
6. **Declarative text:** Does step wording describe _what_ happens in consumer terms without naming internal functions, layers, wire formats, or unexposed settings?

**Verdict:** If a scenario fails 1, 2, 4, 5, or 6, delete it; if its Then checked a real consumer outcome (or queried our store for one, failing 3), replace it in the same change with a valid scenario running the shipped system when real IO is needed (`features-specify-our-systems-observable-behaviour.md`). If a scenario fails 3 alone by querying our store directly, rewrite only the Then to read through our system's operations.
