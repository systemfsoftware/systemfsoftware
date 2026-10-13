# Mutation baseline reasons - effect-memfs

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                 | mutator -> replacement                        | reason                                |
| ------------------ | ----------------------------------------- | --------------------------------------------- | ------------------------------------- |
| `eea6af5129a2f309` | `src/plan-truncate-cursor.workflow.ts:12` | EqualityOperator -> `command.position >= end` | debt: pre-existing on main@ba6664c185 |
