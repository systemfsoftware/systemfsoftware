# Mutation baseline reasons - npm-package

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                   | mutator -> replacement                                                   | reason                                |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `a0137027b004f184` | `src/split-ustar-entry-name.workflow.ts:52` | EqualityOperator -> `nameBytes.length - index - 1 < ustarNameFieldBytes` | debt: pre-existing on main@ba6664c185 |
| `cf36028704b94c3a` | `src/split-ustar-entry-name.workflow.ts:52` | ArithmeticOperator -> `nameBytes.length - index + 1`                     | debt: pre-existing on main@ba6664c185 |
