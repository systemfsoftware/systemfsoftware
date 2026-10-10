# Mutation baseline reasons - hex-schema

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                   | mutator -> replacement                                | reason                                |
| ------------------ | --------------------------- | ----------------------------------------------------- | ------------------------------------- |
| `16ad96af52396f61` | `src/ColonHex.schema.ts:7`  | Regex -> `/([0-9A-Fa-f]{1,2}(:[0-9A-Fa-f]{1,2})*)?$/` | debt: pre-existing on main@ba6664c185 |
| `2bf2291f271a464d` | `src/StrictHex.schema.ts:4` | Regex -> `/^[0-9a-f]$/`                               | debt: pre-existing on main@ba6664c185 |
| `5841daea53a435e6` | `src/ColonHex.schema.ts:7`  | Regex -> `/^([0-9A-Fa-f]{1,2}(:[0-9A-Fa-f]{1,2})*)?/` | debt: pre-existing on main@ba6664c185 |
| `a0e775a4ec5e1303` | `src/HexString.schema.ts:5` | ConditionalExpression -> `false`                      | debt: pre-existing on main@ba6664c185 |
| `ba020480333c484e` | `src/ColonHex.schema.ts:4`  | MethodExpression -> `byte.toLowerCase()`              | debt: pre-existing on main@ba6664c185 |
| `ba88c368570abe65` | `src/HexString.schema.ts:5` | MethodExpression -> `hex.endsWith('0x')`              | debt: pre-existing on main@ba6664c185 |
| `fbb5613fee8aae24` | `src/ColonHex.schema.ts:4`  | Regex -> `/./g`                                       | debt: pre-existing on main@ba6664c185 |
