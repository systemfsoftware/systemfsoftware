# Mutation baseline reasons - effect-readiness

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                    | mutator -> replacement                                                            | reason                                |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `046c27e03a76cb3f` | `src/drivers/http-status-line.schema.ts:36`  | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `12e684ece3670c12` | `src/drivers/http-status-line.schema.ts:36`  | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `1546dfe179ae43c1` | `src/drivers/http-status-line.schema.ts:147` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `42c2a1fb2246a4a1` | `src/drivers/http-status-line.schema.ts:143` | StringLiteral -> `""`                                                             | debt: pre-existing on main@ba6664c185 |
| `5b8de5b10496da27` | `src/drivers/http-status-line.schema.ts:89`  | EqualityOperator -> `value > 100`                                                 | debt: pre-existing on main@ba6664c185 |
| `63700c1aa685a6b7` | `src/drivers/http-status-line.schema.ts:111` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `76a5ff8882e1872f` | `src/drivers/http-status-line.schema.ts:111` | LogicalOperator -> `token.length === 3 \|\| everyCharInAlphabet(CONTRACT_CODE...` | debt: pre-existing on main@ba6664c185 |
| `ae970b0e28b5045f` | `src/ReadinessError.schema.ts:8`             | StringLiteral -> `''`                                                             | debt: pre-existing on main@ba6664c185 |
| `b1c60df0586e50d5` | `src/ReadinessError.schema.ts:17`            | StringLiteral -> `''`                                                             | debt: pre-existing on main@ba6664c185 |
| `c8ac4963b5383bf1` | `src/drivers/http-status-line.schema.ts:99`  | MethodExpression -> `text.split('').some(char => alphabet.includes(char))`        | debt: pre-existing on main@ba6664c185 |
| `d63594280fddf4b2` | `src/drivers/http-status-line.schema.ts:36`  | LogicalOperator -> `token.length === 3 \|\| everyCharIn(DIGITS)(token)`           | debt: pre-existing on main@ba6664c185 |
| `e493c4e62385daba` | `src/drivers/http-status-line.schema.ts:89`  | EqualityOperator -> `value < 599`                                                 | debt: pre-existing on main@ba6664c185 |
| `edf01be7a1536c84` | `src/drivers/http-status-line.schema.ts:27`  | MethodExpression -> `text.split('').some(char => isCharOf(alphabet, char))`       | debt: pre-existing on main@ba6664c185 |
| `fad9b5585f4b391a` | `src/drivers/http-status-line.schema.ts:111` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `fbd97436ccd97e2c` | `src/drivers/http-status-line.schema.ts:142` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
