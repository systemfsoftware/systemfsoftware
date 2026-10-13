# Mutation baseline reasons - trace-spec

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                               | mutator -> replacement | reason                                                                           |
| ------------------ | --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `70907923873fb770` | `src/judge-tempo-answer.workflow.ts:58` | StringLiteral -> `""`  | debt: pre-existing on main@ba6664c185; relocated by #718 from `3c1caac413219835` |
