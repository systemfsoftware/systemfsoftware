# Mutation baseline reasons - effect-atom

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38109196324, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                      | mutator -> replacement                               | reason                                |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| `0437fc6b6fe0e77e` | `src/async-result.schema.ts:1386`              | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `09267b6eb867e575` | `src/judge-node-fate.workflow.ts:36`           | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `0c0d7a2634866b46` | `src/judge-propagation-sweep.workflow.ts:36`   | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `1aa23b1bafe15dd2` | `src/async-result.schema.ts:240`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `1ebeb70e714ea80e` | `src/hydration.schema.ts:150`                  | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `20cc404126b6ac38` | `src/async-result.schema.ts:592`               | ArrowFunction -> `() => undefined`                   | debt: pre-existing on main@ba6664c185 |
| `2cab323cb74418fb` | `src/async-result.schema.ts:1024`              | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `2f83920bb9fc1e49` | `src/async-result.schema.ts:1426`              | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `33572382485de056` | `src/async-result.schema.ts:1010`              | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `34de1594ce035f29` | `src/async-result.schema.ts:124`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `356c0957158608b3` | `src/async-result.schema.ts:930`               | BooleanLiteral -> `false`                            | debt: pre-existing on main@ba6664c185 |
| `4372f3347ff34591` | `src/judge-value-presence.workflow.ts:28`      | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `4ad8a156a21e70e1` | `src/async-result.schema.ts:929`               | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `50049ac58dbc7a27` | `src/async-result.schema.ts:1542`              | ObjectLiteral -> `{}`                                | debt: pre-existing on main@ba6664c185 |
| `58086f0c5760920c` | `src/async-result.schema.ts:929`               | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `64b7713908c3d02d` | `src/hydration.schema.ts:125`                  | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `68b18dc140b98bc6` | `src/async-result.schema.ts:1512`              | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `6a8aa8b382463b95` | `src/async-result.schema.ts:555`               | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `6b0776ed7ddfba00` | `src/async-result.schema.ts:1386`              | ArrayDeclaration -> `[]`                             | debt: pre-existing on main@ba6664c185 |
| `6c7847b0c09c25d0` | `src/async-result.schema.ts:132`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `74ef10083c088d10` | `src/async-result.schema.ts:1215`              | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `800f4b2d11925a92` | `src/async-result.schema.ts:1406`              | ArrayDeclaration -> `[]`                             | debt: pre-existing on main@ba6664c185 |
| `84bab0ba57285d06` | `src/async-result.schema.ts:1374`              | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `92aeb744ea07dc2c` | `src/async-result.schema.ts:672`               | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `95696a96ac72b23f` | `src/async-result.schema.ts:410`               | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `9a9aa95e7255e579` | `src/hydration.schema.ts:125`                  | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `9a9aef5affb6bcee` | `src/async-result.schema.ts:1010`              | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `a1a6d2300e1ee022` | `src/async-result.schema.ts:114`               | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `a5a08790054a3241` | `src/async-result.schema.ts:983`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `a6e814e5cbcf4ddc` | `src/async-result.schema.ts:1374`              | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `a9ec4b7ba2cfcdab` | `src/record-build-invalidation.workflow.ts:30` | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `afc4fb714e354872` | `src/judge-idle-ttl.workflow.ts:32`            | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `bb746bed64d4d663` | `src/async-result.schema.ts:118`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `be3b03d71e85be6a` | `src/async-result.schema.ts:115`               | BooleanLiteral -> `true`                             | debt: pre-existing on main@ba6664c185 |
| `be7ad57ec72b4980` | `src/async-result.schema.ts:1517`              | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `bf6dd12af6b840dd` | `src/judge-idle-remaining.workflow.ts:40`      | EqualityOperator -> `remaining(command) < 0`         | debt: pre-existing on main@ba6664c185 |
| `cf9b2ab227fb5f22` | `src/async-result.schema.ts:114`               | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `d08d1a7fe6aeb919` | `src/async-result.schema.ts:1406`              | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `d209487544190476` | `src/async-result.schema.ts:929`               | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `d3d92b24fa853ab0` | `src/hydration.schema.ts:152`                  | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `d84151158ed5579a` | `src/async-result.schema.ts:1374`              | ArrayDeclaration -> `[]`                             | debt: pre-existing on main@ba6664c185 |
| `d8f695a4801dce93` | `src/async-result.schema.ts:139`               | StringLiteral -> ````                                | debt: pre-existing on main@ba6664c185 |
| `e2c05200d6c5725d` | `src/async-result.schema.ts:969`               | ConditionalExpression -> `false`                     | debt: pre-existing on main@ba6664c185 |
| `f54e7d202b705630` | `src/async-result.schema.ts:592`               | StringLiteral -> `""`                                | debt: pre-existing on main@ba6664c185 |
| `fcae8c2320fd4972` | `src/judge-propagation-sweep.workflow.ts:34`   | ConditionalExpression -> `true`                      | debt: pre-existing on main@ba6664c185 |
| `fe5752c9f63ce5dc` | `src/judge-propagation-sweep.workflow.ts:36`   | EqualityOperator -> `phase === 'valid'`              | debt: pre-existing on main@ba6664c185 |
| `ff48c0e7f17f813a` | `src/async-result.schema.ts:969`               | BlockStatement -> `{}`                               | debt: pre-existing on main@ba6664c185 |
| `ffbee92897617cfc` | `src/async-result.schema.ts:1154`              | MethodExpression -> `tag.every(t => isTagged(e, t))` | debt: pre-existing on main@ba6664c185 |
