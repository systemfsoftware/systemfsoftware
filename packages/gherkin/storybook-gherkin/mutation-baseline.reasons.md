# Mutation baseline reasons - storybook-gherkin

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                  | mutator -> replacement | reason                                |
| ------------------ | -------------------------- | ---------------------- | ------------------------------------- |
| `1b637d629fe11e84` | `src/Errors.schema.ts:36`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `2b0002d0c643d26b` | `src/Errors.schema.ts:93`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `306b7af562aaf438` | `src/Errors.schema.ts:64`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `3af4e066b6972244` | `src/Errors.schema.ts:27`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `3ed813685d0d8b1f` | `src/Errors.schema.ts:117` | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `490843dd6c8cbe32` | `src/Errors.schema.ts:80`  | StringLiteral -> `""`  | debt: pre-existing on main@ba6664c185 |
| `7061cf6a9df17c31` | `src/Errors.schema.ts:106` | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `70fe91caa0c72974` | `src/Errors.schema.ts:56`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `8181f533bbed6ccb` | `src/Errors.schema.ts:18`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `85236bb17a7da344` | `src/Errors.schema.ts:78`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `8ad9ea2eb908d659` | `src/Errors.schema.ts:3`   | StringLiteral -> `""`  | debt: pre-existing on main@ba6664c185 |
| `a94834114a85ee1e` | `src/Errors.schema.ts:45`  | StringLiteral -> `''`  | debt: pre-existing on main@ba6664c185 |
| `aa6bf2e274bf021c` | `src/Errors.schema.ts:79`  | StringLiteral -> `""`  | debt: pre-existing on main@ba6664c185 |
