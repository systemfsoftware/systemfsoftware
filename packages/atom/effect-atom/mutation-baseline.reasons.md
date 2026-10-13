# Mutation baseline reasons - effect-atom

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38109196324, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                      | mutator -> replacement                       | reason                                                                                                                                   |
| ------------------ | ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `09267b6eb867e575` | `src/judge-node-fate.workflow.ts:36`           | ConditionalExpression -> `false`             | debt: pre-existing on main@ba6664c185                                                                                                    |
| `0c0d7a2634866b46` | `src/judge-propagation-sweep.workflow.ts:36`   | ConditionalExpression -> `false`             | debt: pre-existing on main@ba6664c185                                                                                                    |
| `4372f3347ff34591` | `src/judge-value-presence.workflow.ts:28`      | StringLiteral -> `""`                        | debt: pre-existing on main@ba6664c185                                                                                                    |
| `8891314dd22224b3` | `src/judge-propagation-sweep.workflow.ts:36`   | ConditionalExpression -> `true`              | debt: pre-existing on main@ba6664c185; masked by an unreproduced wall-clock Timeout in Mutation run 38109196324, Survived in 38115511598 |
| `a9ec4b7ba2cfcdab` | `src/record-build-invalidation.workflow.ts:30` | ConditionalExpression -> `true`              | debt: pre-existing on main@ba6664c185                                                                                                    |
| `afc4fb714e354872` | `src/judge-idle-ttl.workflow.ts:32`            | BooleanLiteral -> `true`                     | debt: pre-existing on main@ba6664c185                                                                                                    |
| `bf6dd12af6b840dd` | `src/judge-idle-remaining.workflow.ts:40`      | EqualityOperator -> `remaining(command) < 0` | debt: pre-existing on main@ba6664c185                                                                                                    |
| `fcae8c2320fd4972` | `src/judge-propagation-sweep.workflow.ts:34`   | ConditionalExpression -> `true`              | debt: pre-existing on main@ba6664c185                                                                                                    |
| `fe5752c9f63ce5dc` | `src/judge-propagation-sweep.workflow.ts:36`   | EqualityOperator -> `phase === 'valid'`      | debt: pre-existing on main@ba6664c185                                                                                                    |
