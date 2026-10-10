# Mutation baseline reasons - npm-package

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                   | mutator -> replacement                                                   | reason                                |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `04370fb4e0200653` | `src/PackagePath.schema.ts:55`              | ConditionalExpression -> `true`                                          | debt: pre-existing on main@ba6664c185 |
| `12b36adfe9f9c232` | `src/PackagePath.schema.ts:55`              | ConditionalExpression -> `false`                                         | debt: pre-existing on main@ba6664c185 |
| `15e0d6b08ead2ff5` | `src/PackagePath.schema.ts:25`              | StringLiteral -> `""`                                                    | debt: pre-existing on main@ba6664c185 |
| `2929f4a6e5ad10f9` | `src/PackagePath.schema.ts:17`              | ConditionalExpression -> `false`                                         | debt: pre-existing on main@ba6664c185 |
| `295a7504138872b0` | `src/PackagePath.schema.ts:55`              | MethodExpression -> `relative.endsWith('/')`                             | debt: pre-existing on main@ba6664c185 |
| `530b4daa2b6b9805` | `src/PackagePath.schema.ts:46`              | ConditionalExpression -> `false`                                         | debt: pre-existing on main@ba6664c185 |
| `56dd7244bf4623cf` | `src/PackagePath.schema.ts:29`              | StringLiteral -> `""`                                                    | debt: pre-existing on main@ba6664c185 |
| `60b235fcdb581e07` | `src/PackagePath.schema.ts:56`              | StringLiteral -> `''`                                                    | debt: pre-existing on main@ba6664c185 |
| `744971ad0ef3d516` | `src/PackagePath.schema.ts:33`              | MethodExpression -> `normalized.endsWith('/')`                           | debt: pre-existing on main@ba6664c185 |
| `a0137027b004f184` | `src/split-ustar-entry-name.workflow.ts:52` | EqualityOperator -> `nameBytes.length - index - 1 < ustarNameFieldBytes` | debt: pre-existing on main@ba6664c185 |
| `ca1eaeb58721bb0b` | `src/PackagePath.schema.ts:33`              | ConditionalExpression -> `false`                                         | debt: pre-existing on main@ba6664c185 |
| `cdbb8d58817b4cc6` | `src/PackagePath.schema.ts:55`              | StringLiteral -> `""`                                                    | debt: pre-existing on main@ba6664c185 |
| `cf36028704b94c3a` | `src/split-ustar-entry-name.workflow.ts:52` | ArithmeticOperator -> `nameBytes.length - index + 1`                     | debt: pre-existing on main@ba6664c185 |
| `e2407d48fee872df` | `src/PackagePath.schema.ts:25`              | ConditionalExpression -> `false`                                         | debt: pre-existing on main@ba6664c185 |
