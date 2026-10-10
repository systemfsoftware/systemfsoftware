# Mutation baseline reasons - effect-daemon-conformance

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38089035845, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                           | mutator -> replacement                                      | reason                                |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| `1cc60bade589c0af` | `src/project-trace.workflow.ts:106` | ConditionalExpression -> `false`                            | debt: pre-existing on main@ba6664c185 |
| `4b35dc6986ecc772` | `src/compare-traces.workflow.ts:42` | StringLiteral -> `""`                                       | debt: pre-existing on main@ba6664c185 |
| `4e4beb8032817d82` | `src/project-trace.workflow.ts:47`  | ConditionalExpression -> `false`                            | debt: pre-existing on main@ba6664c185 |
| `6119d1af0df77886` | `src/project-trace.workflow.ts:49`  | ConditionalExpression -> `false`                            | debt: pre-existing on main@ba6664c185 |
| `75db05b9830e8a13` | `src/project-trace.workflow.ts:125` | ConditionalExpression -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `75db5f7a40664e20` | `src/compare-traces.workflow.ts:32` | ConditionalExpression -> `false`                            | debt: pre-existing on main@ba6664c185 |
| `78845e7f0d453208` | `src/project-trace.workflow.ts:35`  | ObjectLiteral -> `{}`                                       | debt: pre-existing on main@ba6664c185 |
| `7ab5d24e20c1e346` | `src/project-trace.workflow.ts:47`  | EqualityOperator -> `KERNEL_OWNED_REASONS[reason] !== true` | debt: pre-existing on main@ba6664c185 |
| `9ffdf39502bedd99` | `src/project-trace.workflow.ts:55`  | StringLiteral -> `"Stryker was here!"`                      | debt: pre-existing on main@ba6664c185 |
| `b05e2072e0bea1b0` | `src/project-trace.workflow.ts:41`  | ObjectLiteral -> `{}`                                       | debt: pre-existing on main@ba6664c185 |
| `d16ac6b09e1501de` | `src/compare-traces.workflow.ts:20` | BooleanLiteral -> `false`                                   | debt: pre-existing on main@ba6664c185 |
| `dfbcb9ac81376205` | `src/project-trace.workflow.ts:47`  | ConditionalExpression -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `e739a4d54336d99a` | `src/project-trace.workflow.ts:56`  | StringLiteral -> ````                                       | debt: pre-existing on main@ba6664c185 |
