# Mutation baseline reasons - trace-spec

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                       | mutator -> replacement                                             | reason                                |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `0a98595d2b8b4fbd` | `src/drivers/tempo-trace.schema.ts:74`          | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `1517827827b2ae4a` | `src/HarnessFailure.schema.ts:7`                | ArrayDeclaration -> `[]`                                           | debt: pre-existing on main@ba6664c185 |
| `1567c3b324076224` | `src/ContractDecodeError.schema.ts:11`          | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `1674ebec5d070ec7` | `src/Verdict.schema.ts:25`                      | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `2b31e048336aaf51` | `src/drivers/tempo-trace.schema.ts:217`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `2b683737912a8fc3` | `src/drivers/tempo-trace.schema.ts:159`         | StringLiteral -> `"Stryker was here!"`                             | debt: pre-existing on main@ba6664c185 |
| `32e97d9abe545378` | `src/drivers/tempo-trace.schema.ts:93`          | Regex -> `/^0$/`                                                   | debt: pre-existing on main@ba6664c185 |
| `345238e5ed3c9524` | `src/IncompleteObservationError.schema.ts:6`    | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `34d1fd54bb52ba27` | `src/FailureDump.schema.ts:15`                  | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `3656f4b58530330e` | `src/IncompleteObservationError.schema.ts:6`    | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `393d6d0cf7a407ff` | `src/StimulusFailure.schema.ts:10`              | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `3c1caac413219835` | `src/drivers/judge-tempo-answer.workflow.ts:58` | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `4dbfac7967063758` | `src/FailureDump.schema.ts:20`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `57e730e4df803906` | `src/drivers/tempo-trace.schema.ts:201`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `583b093f388cac2d` | `src/FailureDump.schema.ts:38`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `5df047cd174453f5` | `src/EmptyObservationError.schema.ts:8`         | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `5fa612eaa2d247fb` | `src/FailureDump.schema.ts:15`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `6378a4116a9c20dc` | `src/drivers/tempo-trace.schema.ts:238`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `67badec93c8c43c8` | `src/drivers/tempo-trace.schema.ts:249`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `67e53e2195a66db5` | `src/Verdict.schema.ts:22`                      | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `6da4c335a42daf80` | `src/FailureDump.schema.ts:32`                  | ArithmeticOperator -> `depth - 1`                                  | debt: pre-existing on main@ba6664c185 |
| `749a42e5c51d8696` | `src/drivers/tempo-trace.schema.ts:232`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `7cb85d4d113f2549` | `src/FailureDump.schema.ts:20`                  | ConditionalExpression -> `false`                                   | debt: pre-existing on main@ba6664c185 |
| `81e91238f78c2037` | `src/FailureDump.schema.ts:32`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `87c5fe3802404593` | `src/StimulusFailure.schema.ts:3`               | StringLiteral -> `"Stryker was here!"`                             | debt: pre-existing on main@ba6664c185 |
| `8ccb57aaef190967` | `src/drivers/tempo-trace.schema.ts:197`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `8da2ad136020aef2` | `src/FailureDump.schema.ts:34`                  | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `98058f70d1d993bc` | `src/drivers/tempo-trace.schema.ts:124`         | ConditionalExpression -> `true`                                    | debt: pre-existing on main@ba6664c185 |
| `9e8c5c62cc13ae7c` | `src/FailureDump.schema.ts:15`                  | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `b2a5ebbcaa34b88f` | `src/FailureDump.schema.ts:23`                  | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `bc9cd3b07d679a60` | `src/drivers/tempo-trace.schema.ts:225`         | ArithmeticOperator -> `record.startMillis - record.durationMillis` | debt: pre-existing on main@ba6664c185 |
| `bd0d0a20ee8a9925` | `src/drivers/tempo-trace.schema.ts:88`          | ArithmeticOperator -> `millis / 1_000_000`                         | debt: pre-existing on main@ba6664c185 |
| `bf95fbbb81b062ca` | `src/IncompleteObservationError.schema.ts:17`   | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `c285a0f6f36aceb0` | `src/IncompleteObservationError.schema.ts:21`   | UnaryOperator -> `+1`                                              | debt: pre-existing on main@ba6664c185 |
| `c3e4caee9c34e6b6` | `src/FailureDump.schema.ts:31`                  | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `cdd9b81458b324c3` | `src/StimulusFailure.schema.ts:3`               | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `d9d93c45f028f702` | `src/drivers/tempo-trace.schema.ts:93`          | Regex -> `/0+$/`                                                   | debt: pre-existing on main@ba6664c185 |
| `dda4666add9c7b03` | `src/FailureDump.schema.ts:34`                  | ArrayDeclaration -> `[]`                                           | debt: pre-existing on main@ba6664c185 |
| `dfdebfc84fc759f7` | `src/FailureDump.schema.ts:28`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `e3170be81df34d8e` | `src/FailureDump.schema.ts:31`                  | ArrowFunction -> `() => undefined`                                 | debt: pre-existing on main@ba6664c185 |
| `e387f9fa047db5ec` | `src/FailureDump.schema.ts:29`                  | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `e9f1e673f98c8e4b` | `src/TransportObservationError.schema.ts:11`    | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `eeccc4dadb46f397` | `src/FailureDump.schema.ts:17`                  | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `f26847a50cb0fda8` | `src/drivers/tempo-trace.schema.ts:191`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `f4184e838e84d353` | `src/FailureDump.schema.ts:39`                  | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `f60be9ff58942322` | `src/TraceGraph.schema.ts:154`                  | StringLiteral -> `""`                                              | debt: pre-existing on main@ba6664c185 |
| `f6489075dfbd5863` | `src/FailureDump.schema.ts:27`                  | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
| `f67b08952299fec2` | `src/drivers/tempo-trace.schema.ts:196`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `f7f0faf72bf1b9c7` | `src/drivers/tempo-trace.schema.ts:188`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `f8cc1a71d0156935` | `src/drivers/tempo-trace.schema.ts:228`         | ObjectLiteral -> `{}`                                              | debt: pre-existing on main@ba6664c185 |
| `f9f704a6c167aa48` | `src/Verdict.schema.ts:25`                      | StringLiteral -> `''`                                              | debt: pre-existing on main@ba6664c185 |
