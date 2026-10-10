# Mutation baseline reasons - effect-daemon-process

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38089035845, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                                | mutator -> replacement                 | reason                                |
| ------------------ | -------------------------------------------------------- | -------------------------------------- | ------------------------------------- |
| `152ed13551641dd5` | `src/ProcessMedium/KillSignalDecision.schema.ts:33`      | ObjectLiteral -> `{}`                  | debt: pre-existing on main@ba6664c185 |
| `47b1107887389b6a` | `src/ProcessMedium/classify-process-exit.workflow.ts:20` | StringLiteral -> `"Stryker was here!"` | debt: pre-existing on main@ba6664c185 |
