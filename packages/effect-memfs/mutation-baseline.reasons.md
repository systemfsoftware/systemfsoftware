# Mutation baseline reasons - effect-memfs

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                 | mutator -> replacement                        | reason                                |
| ------------------ | ----------------------------------------- | --------------------------------------------- | ------------------------------------- |
| `071b259dba189079` | `src/MemoryFileSystemSpec.schema.ts:4`    | StringLiteral -> `""`                         | debt: pre-existing on main@ba6664c185 |
| `76892bfc729a10ed` | `src/MemoryFileSystemError.schema.ts:66`  | StringLiteral -> `''`                         | debt: pre-existing on main@ba6664c185 |
| `869eaeb5e6bc713e` | `src/MemoryFileSystemSpec.schema.ts:19`   | StringLiteral -> `"Stryker was here!"`        | debt: pre-existing on main@ba6664c185 |
| `dbec3822c9063264` | `src/MemoryFileSystemSpec.schema.ts:29`   | MethodExpression -> `path.endsWith('/')`      | debt: pre-existing on main@ba6664c185 |
| `e44416be3d963565` | `src/MemoryFileSystemError.schema.ts:64`  | StringLiteral -> `""`                         | debt: pre-existing on main@ba6664c185 |
| `eea6af5129a2f309` | `src/plan-truncate-cursor.workflow.ts:12` | EqualityOperator -> `command.position >= end` | debt: pre-existing on main@ba6664c185 |
