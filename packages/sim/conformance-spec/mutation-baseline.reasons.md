# Mutation baseline reasons - conformance-spec

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38095184480, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                   | mutator -> replacement | reason                                |
| ------------------ | ------------------------------------------- | ---------------------- | ------------------------------------- |
| `5fc03e62d57e05e2` | `src/Conformance/model-errors.schema.ts:15` | StringLiteral -> ````  | debt: pre-existing on main@ba6664c185 |
