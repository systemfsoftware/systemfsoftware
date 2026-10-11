# Mutation baseline reasons - vitest

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38095184480, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                   | mutator -> replacement                                                                      | reason                                |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `08ae0db6eece175d` | `src/internal/property/error.schema.ts:299` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `0c3d4890cf658e91` | `src/internal/property/error.schema.ts:121` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `0ce009045593f047` | `src/internal/property/error.schema.ts:287` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `169033d36666c5bb` | `src/internal/property/error.schema.ts:119` | ConditionalExpression -> `true`                                                             | debt: pre-existing on main@ba6664c185 |
| `198c07f26f6e74f8` | `src/internal/property/error.schema.ts:176` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `1c974a1d515700fa` | `src/internal/property/error.schema.ts:296` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `2547bf9ac3123543` | `src/internal/property/error.schema.ts:124` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `28558647ad2ef3e8` | `src/internal/property/error.schema.ts:293` | ArrowFunction -> `() => undefined`                                                          | debt: pre-existing on main@ba6664c185 |
| `2df4fc922957069a` | `src/internal/property/error.schema.ts:205` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `33bbaa44c873e11a` | `src/internal/property/error.schema.ts:141` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `37cfc79a7bf228c6` | `src/internal/property/error.schema.ts:293` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `395bb71f0493541f` | `src/replay.schema.ts:383`                  | ObjectLiteral -> `{}`                                                                       | debt: pre-existing on main@ba6664c185 |
| `3a6110fd22c0fd40` | `src/internal/property/error.schema.ts:342` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `449ab4ed8f42425a` | `src/internal/property/error.schema.ts:173` | ArrowFunction -> `() => undefined`                                                          | debt: pre-existing on main@ba6664c185 |
| `46808178169ab1bb` | `src/internal/property/error.schema.ts:190` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `4cb84b91dba7464a` | `src/internal/errors.schema.ts:36`          | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `4f48e6005e86d201` | `src/internal/property/error.schema.ts:341` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `584c745b5d73b14f` | `src/replay.schema.ts:318`                  | ConditionalExpression -> `false`                                                            | debt: pre-existing on main@ba6664c185 |
| `5c9c9d47e86a09f8` | `src/internal/property/error.schema.ts:103` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `60d345706650b2c9` | `src/internal/property/error.schema.ts:298` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `6e11412261a4bbc0` | `src/internal/property/error.schema.ts:313` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `707023bc280c5716` | `src/internal/property/error.schema.ts:294` | ArithmeticOperator -> `total - run.property.runs`                                           | debt: pre-existing on main@ba6664c185 |
| `74de78241c5c83c3` | `src/internal/property/error.schema.ts:104` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `7fa348ec8d5e29b1` | `src/replay.schema.ts:256`                  | ConditionalExpression -> `true`                                                             | debt: pre-existing on main@ba6664c185 |
| `8444f465a148a04f` | `src/internal/property/error.schema.ts:141` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `96810203caa70348` | `src/internal/property/error.schema.ts:322` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `99dcab65cd8cd59a` | `src/replay.schema.ts:368`                  | EqualityOperator -> `text.length >= 0`                                                      | debt: pre-existing on main@ba6664c185 |
| `a8365ea12a99903f` | `src/internal/property/error.schema.ts:123` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `b14da8c9b7c9efce` | `src/replay.schema.ts:190`                  | ConditionalExpression -> `true`                                                             | debt: pre-existing on main@ba6664c185 |
| `b20ce118c64586c5` | `src/internal/property/error.schema.ts:174` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `b37442ef21edcd8e` | `src/internal/property/error.schema.ts:296` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `bbb7f50ce995079f` | `src/internal/property/error.schema.ts:297` | StringLiteral -> ````                                                                       | debt: pre-existing on main@ba6664c185 |
| `be63405f84029509` | `src/internal/property/error.schema.ts:296` | EqualityOperator -> `fakes.length !== 0`                                                    | debt: pre-existing on main@ba6664c185 |
| `c00a503f8814a85e` | `src/replay.schema.ts:368`                  | ConditionalExpression -> `true`                                                             | debt: pre-existing on main@ba6664c185 |
| `ca9d97ef3d831e6e` | `src/internal/property/error.schema.ts:143` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `cb0971636708516d` | `src/internal/property/error.schema.ts:296` | ConditionalExpression -> `true`                                                             | debt: pre-existing on main@ba6664c185 |
| `d0ff21a0cc4fd9d7` | `src/replay.schema.ts:364`                  | Regex -> `/^property=\d;seed=\d+;runs=\d+;attempt=\d+;size=\d+;path=(?:\d+(?:,\d+)*)?;f...` | debt: pre-existing on main@ba6664c185 |
| `d79e25022092dcd7` | `src/internal/property/error.schema.ts:294` | ArrowFunction -> `() => undefined`                                                          | debt: pre-existing on main@ba6664c185 |
| `dadf418366c23cc0` | `src/internal/property/error.schema.ts:142` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
| `ef24acab63148e66` | `src/internal/property/error.schema.ts:288` | ArrayDeclaration -> `["Stryker was here"]`                                                  | debt: pre-existing on main@ba6664c185 |
| `fa4a15ce5a45aa3b` | `src/internal/property/error.schema.ts:296` | ConditionalExpression -> `false`                                                            | debt: pre-existing on main@ba6664c185 |
| `fad59de561cdfdbe` | `src/replay.schema.ts:401`                  | ObjectLiteral -> `{}`                                                                       | debt: pre-existing on main@ba6664c185 |
| `fbc79e1243c1eac9` | `src/internal/property/error.schema.ts:176` | StringLiteral -> `""`                                                                       | debt: pre-existing on main@ba6664c185 |
