# Mutation baseline reasons - oxlint-plugin-test-discipline

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                             | mutator -> replacement                                                             | reason                                |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| `002891963b9507d5` | `src/rules/model-fixture-imports-subject.ts:59`       | StringLiteral -> `"Stryker was here!"`                                             | debt: pre-existing on main@ba6664c185 |
| `01063a1bd8a33858` | `src/rules/prop-fixture-schema-origin.ts:166`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `014b66e90af5c450` | `src/rules/prop-fixture-schema-origin.ts:237`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `01706914e0a2be01` | `src/rules/prop-arbitrary-schema-origin.ts:319`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `01f7a9bffa04b8db` | `src/rules/prop-fixture-schema-origin.ts:176`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `021f26c96157fce1` | `src/rules/prop-fixture-schema-origin.ts:215`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `03528f38d791049d` | `src/rules/tests-import-public-api.ts:12`             | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `040af026263f5537` | `src/rules/prop-arbitrary-schema-origin.ts:160`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `04fe9322a1b09a44` | `src/rules/no-silent-return.ts:156`                   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `05630f00382918a0` | `src/rules/lane.ts:56`                                | ArrayDeclaration -> `["Stryker was here"]`                                         | debt: pre-existing on main@ba6664c185 |
| `05f269ec4d68f212` | `src/rules/prop-arbitrary-schema-origin.ts:261`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `068033b22315fc91` | `src/rules/prop-arbitrary-schema-origin.ts:192`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `069b77da1065e8de` | `src/rules/prop-arbitrary-schema-origin.ts:360`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `07481587ef15d057` | `src/rules/prop-arbitrary-schema-origin.ts:196`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `07a600b630c2e665` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `083a55da6196d917` | `src/rules/behaviour-exercises-use-case.ts:50`        | StringLiteral -> `"Stryker was here!"`                                             | debt: pre-existing on main@ba6664c185 |
| `08b05af87df22220` | `src/rules/property-file-purity.ts:83`                | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `0956ad9528274e39` | `src/rules/prop-arbitrary-schema-origin.ts:139`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `0a2b66a4b70e5861` | `src/rules/expect-call.ts:17`                         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `0a31723d480e541a` | `src/rules/prop-arbitrary-schema-origin.ts:419`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `0c8396a73ff29ec8` | `src/rules/prop-arbitrary-schema-origin.ts:139`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `0d4af5bc06e2c0b9` | `src/rules/prop-fixture-schema-origin.ts:225`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `0da108849de931d1` | `src/rules/behaviour-exercises-use-case.ts:80`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `0e44b0e9f24aede1` | `src/rules/no-behaviourless-assertion.ts:24`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `0ebdec9a20f9aceb` | `src/rules/prop-arbitrary-schema-origin.ts:291`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `0feff9b3001386ea` | `src/rules/tests-import-public-api.ts:49`             | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `10631dee4e40167f` | `src/rules/prop-generated-law-duplicate.ts:133`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `1175d227b4c2737a` | `src/rules/prop-generated-law-duplicate.ts:133`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `120ec3de52eae3ef` | `src/rules/no-pseudo-gherkin-unit-tests.ts:54`        | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `1289401633b95dc8` | `src/rules/prop-arbitrary-schema-origin.ts:286`       | ArrowFunction -> `() => undefined`                                                 | debt: pre-existing on main@ba6664c185 |
| `139b8e1dac8b8505` | `src/rules/behaviour-exercises-use-case.ts:64`        | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `1403976c4dcd5200` | `src/rules/prop-generated-law-duplicate.ts:154`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `150ac42fc0750ead` | `src/rules/prop-fixture-schema-origin.ts:183`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `158348788356f6be` | `src/rules/prop-generated-law-duplicate.ts:225`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `15ed14887d431c74` | `src/rules/prop-arbitrary-schema-origin.ts:218`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `17849cb97caeaa62` | `src/rules/prop-fixture-schema-origin.ts:201`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `180ef5690e347518` | `src/rules/prop-fixture-schema-origin.ts:79`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `184fa35740e57014` | `src/rules/conformance-test-requires-harness.ts:95`   | AssignmentOperator -> `violations -= 1`                                            | debt: pre-existing on main@ba6664c185 |
| `1b05f8e695b10df4` | `src/rules/prop-fixture-schema-origin.ts:186`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1bb7a53f53ea65f3` | `src/rules/prop-fixture-schema-origin.ts:209`         | MethodExpression -> `parent.arguments.every(argument => argument === current)`     | debt: pre-existing on main@ba6664c185 |
| `1bfa8834bf32937c` | `src/rules/prop-arbitrary-schema-origin.ts:133`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1bfcf765c8850eb1` | `src/rules/prop-generated-law-duplicate.ts:107`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1c8ededb2187c689` | `src/rules/tests-import-public-api.ts:7`              | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `1e25624aacd12975` | `src/rules/in-source-test-prop-only.ts:39`            | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `1ecbf4cba99aaaad` | `src/rules/prop-generated-law-duplicate.ts:23`        | ObjectLiteral -> `{}`                                                              | debt: pre-existing on main@ba6664c185 |
| `1f5ffad9a7906fa0` | `src/rules/prop-arbitrary-schema-origin.ts:294`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1fa48e8cc89fd248` | `src/rules/prop-arbitrary-schema-origin.ts:185`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `20d02f371b03589e` | `src/rules/prop-fixture-schema-origin.ts:166`         | LogicalOperator -> `suspendThunkOf(nested, union, getScope) !== undefined \|\...`  | debt: pre-existing on main@ba6664c185 |
| `20d9ac4f682fc0ef` | `src/rules/prop-generated-law-duplicate.ts:115`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `21d36e6f6cfe94ad` | `src/rules/prop-arbitrary-schema-origin.ts:295`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `22fa6d241195bbe8` | `src/rules/prop-arbitrary-schema-origin.ts:279`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `236e9ca841babc8d` | `src/rules/prop-generated-law-duplicate.ts:151`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `25faac4b9f691c7e` | `src/rules/prop-fixture-schema-origin.ts:99`          | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `2621f5841421591e` | `src/rules/prop-fixture-schema-origin.ts:122`         | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `2640eee3b712185a` | `src/rules/prop-arbitrary-schema-origin.ts:259`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `26dee9099aff6d00` | `src/rules/conformance-test-requires-harness.ts:28`   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `27d3e6693de640ee` | `src/rules/no-nested-quantification.ts:90`            | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `28b0f75ee24d672e` | `src/rules/prop-fixture-schema-origin.ts:174`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `28cec69563b2c730` | `src/rules/prop-arbitrary-schema-origin.ts:286`       | MethodExpression -> `value.every(item => mentionsLocalBinding(provenance, item))`  | debt: pre-existing on main@ba6664c185 |
| `2925d799e4ce0d35` | `src/rules/behaviour-exercises-use-case.ts:80`        | MethodExpression -> `statement.specifiers.every(spec => !(spec.type === 'Impor...` | debt: pre-existing on main@ba6664c185 |
| `296bcdb57e1272ea` | `src/rules/model-fixture-imports-subject.ts:38`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `2b08dbc6f5cc5206` | `src/rules/in-source-test-targets-private.ts:68`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `2bc0a2610a2eb00e` | `src/rules/no-behaviourless-assertion.ts:22`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `2bfeb5ca49130e8e` | `src/rules/differential-test-requires-harness.ts:66`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `2c4a4bf7e4d79374` | `src/rules/prop-fixture-schema-origin.ts:100`         | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `2ce1fc6c35e2b89c` | `src/rules/prop-arbitrary-schema-origin.ts:360`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `2d0df03d09874f33` | `src/rules/prop-fixture-schema-origin.ts:110`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `2d554c5f63e320b2` | `src/rules/prop-arbitrary-schema-origin.ts:181`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `2e0f19e0728ba3bb` | `src/rules/prop-arbitrary-schema-origin.ts:237`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `2e442c0b927e1ffb` | `src/rules/model-fixture-imports-subject.ts:48`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `2e5e13309ec75321` | `src/rules/no-behaviourless-assertion.ts:16`          | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `2ebe532b614b3c7d` | `src/rules/prop-arbitrary-schema-origin.ts:303`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `305aab27959a76ee` | `src/rules/prop-fixture-schema-origin.ts:101`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `325b7f0308ce3760` | `src/rules/differential-test-requires-harness.ts:30`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `32965276181440e4` | `src/rules/prop-fixture-schema-origin.ts:105`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `32e2fa64bdcf0b0e` | `src/rules/trace-test-requires-taxonomy.ts:156`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `33219c19459c5c10` | `src/rules/prop-fixture-schema-origin.ts:209`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3326befe5e70e445` | `src/rules/prop-fixture-schema-origin.ts:107`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `3329c021ae6c000b` | `src/rules/prop-generated-law-duplicate.ts:148`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `33bde15a6c5da1f3` | `src/rules/model-fixture-imports-subject.ts:59`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `33f7a020c9c79e00` | `src/rules/prop-fixture-schema-origin.ts:199`         | AssignmentOperator -> `depth -= 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `348bbc448835e836` | `src/rules/prop-arbitrary-schema-origin.ts:162`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `35272f49bbba2992` | `src/rules/prop-fixture-schema-origin.ts:121`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `364e315d080a4c6a` | `src/rules/prop-generated-law-duplicate.ts:51`        | ObjectLiteral -> `{}`                                                              | debt: pre-existing on main@ba6664c185 |
| `368d386a5869e00c` | `src/rules/prop-fixture-schema-origin.ts:79`          | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `36bd636cda6248b5` | `src/rules/prop-generated-law-duplicate.ts:145`       | EqualityOperator -> `CODEC_ACCESSORS[name] === true`                               | debt: pre-existing on main@ba6664c185 |
| `372344f7e82640f6` | `src/rules/lane.ts:127`                               | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `372d0928f3b4af8a` | `src/rules/prop-arbitrary-schema-origin.ts:204`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `3764534d9399b7c4` | `src/rules/prop-arbitrary-schema-origin.ts:318`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3795a5005a034b3f` | `src/rules/test-suffix-outside-src.ts:33`             | EqualityOperator -> `specific.length != 0`                                         | debt: pre-existing on main@ba6664c185 |
| `37bb6aa0fcc6a316` | `src/rules/no-io-module-in-source-test.ts:58`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `37bb7a84aacdab27` | `src/rules/prop-arbitrary-schema-origin.ts:213`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `380771c170b6ddc7` | `src/rules/prop-generated-law-duplicate.ts:155`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `387574ebe7f6388e` | `src/rules/prop-fixture-schema-origin.ts:204`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `38c2cedf5c2e0481` | `src/rules/conformance-test-requires-harness.ts:76`   | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `3a761da58d1dbb1c` | `src/rules/behaviour-exercises-use-case.ts:59`        | MethodExpression -> `source.endsWith('/')`                                         | debt: pre-existing on main@ba6664c185 |
| `3a7e8b9bbe0ae4cb` | `src/rules/prop-fixture-schema-origin.ts:29`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `3b4e124bf460071b` | `src/rules/prop-fixture-schema-origin.ts:122`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3b503185f53b7f40` | `src/rules/prop-arbitrary-schema-origin.ts:262`       | EqualityOperator -> `verdict !== 'opaque'`                                         | debt: pre-existing on main@ba6664c185 |
| `3c41cea5a8357665` | `src/rules/tests-import-public-api.ts:7`              | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `3c437deabe1b052f` | `src/rules/prop-fixture-schema-origin.ts:166`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3c8713018c5a24ec` | `src/rules/prop-arbitrary-schema-origin.ts:199`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `3de9e5003b4c2318` | `src/rules/prop-generated-law-duplicate.ts:115`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `3e3f8800b52cd936` | `src/rules/prop-generated-law-duplicate.ts:145`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `3fbcdaf55c098064` | `src/rules/behaviour-exercises-use-case.ts:64`        | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `3fe3bfc8d6c6942f` | `src/rules/model-fixture-imports-subject.ts:28`       | EqualityOperator -> `index < 0`                                                    | debt: pre-existing on main@ba6664c185 |
| `404517ba18fce35d` | `src/rules/prop-fixture-schema-origin.ts:215`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `436c7b99acd6af84` | `src/rules/vitest-from-systemfsoftware-vitest.ts:34`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `44714dfcab4faa7b` | `src/rules/trace-test-requires-taxonomy.ts:185`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `44eae9a5a70b804f` | `src/rules/prop-fixture-schema-origin.ts:158`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `45cb0eb75add6788` | `src/rules/prop-fixture-schema-origin.ts:219`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `45f5cd682e71d432` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | LogicalOperator -> `edge.source === EFFECT_SOURCE \|\| edge.imported === 'Arb...`  | debt: pre-existing on main@ba6664c185 |
| `475bb198cfb5ee3f` | `src/rules/prop-generated-law-duplicate.ts:146`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `48da46a2b01fed49` | `src/rules/prop-arbitrary-schema-origin.ts:254`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `491c4e6094bddf61` | `src/rules/prop-fixture-schema-origin.ts:213`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `497cad8e1b5b86e7` | `src/rules/differential-test-requires-harness.ts:22`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `497e702bc5a7562d` | `src/rules/no-behaviourless-assertion.ts:18`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4a22a183fc70edab` | `src/rules/prop-arbitrary-schema-origin.ts:154`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4a2b0070c5bbcb2d` | `src/rules/prop-arbitrary-schema-origin.ts:419`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `4b005d117ae95e27` | `src/rules/prop-arbitrary-schema-origin.ts:294`       | EqualityOperator -> `key !== 'parent'`                                             | debt: pre-existing on main@ba6664c185 |
| `4b2ef64c52a9a1cb` | `src/rules/prop-generated-law-duplicate.ts:156`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4b3188243609ef0f` | `src/rules/prop-generated-law-duplicate.ts:154`       | LogicalOperator -> `CODEC_ACCESSORS[callee.name] !== true \|\| NEUTRAL_METHOD...`  | debt: pre-existing on main@ba6664c185 |
| `4c2ea0b035fdcebd` | `src/rules/prop-fixture-schema-origin.ts:209`         | BooleanLiteral -> `parent.arguments.some(argument => argument === current)`        | debt: pre-existing on main@ba6664c185 |
| `4ce0d4494ef08164` | `src/rules/trace-test-requires-taxonomy.ts:33`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4cfbc07bcba535cf` | `src/rules/prop-fixture-schema-origin.ts:213`         | EqualityOperator -> `parent.object !== current`                                    | debt: pre-existing on main@ba6664c185 |
| `4d2b136b14f66c8f` | `src/rules/prop-arbitrary-schema-origin.ts:55`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4d4c8cafdfa2bd29` | `src/rules/prop-fixture-schema-origin.ts:166`         | ArrowFunction -> `() => undefined`                                                 | debt: pre-existing on main@ba6664c185 |
| `4e0d436635b88131` | `src/rules/prop-fixture-schema-origin.ts:166`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4e4090cad134ae88` | `src/rules/no-nested-quantification.ts:117`           | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `4e70f93af2853a81` | `src/rules/prop-generated-law-duplicate.ts:102`       | ArrowFunction -> `() => undefined`                                                 | debt: pre-existing on main@ba6664c185 |
| `4e7521dbd8a57983` | `src/rules/in-source-test-prop-only.ts:22`            | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4e78dc7f39a45c9a` | `src/rules/prop-fixture-schema-origin.ts:209`         | EqualityOperator -> `argument !== current`                                         | debt: pre-existing on main@ba6664c185 |
| `4ef0327900f162d0` | `src/rules/prop-generated-law-duplicate.ts:109`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4f01c2ed3b9d8fd1` | `src/rules/prop-fixture-schema-origin.ts:236`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `4f6ba183b08e65ca` | `src/rules/prop-fixture-schema-origin.ts:166`         | EqualityOperator -> `suspendThunkOf(nested, union, getScope) === undefined`        | debt: pre-existing on main@ba6664c185 |
| `4fff6ca43dfb50ec` | `src/rules/prop-arbitrary-schema-origin.ts:185`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `50b7b93853bfbb89` | `src/rules/prop-arbitrary-schema-origin.ts:261`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `50e334207022bb1d` | `src/rules/prop-fixture-schema-origin.ts:94`          | LogicalOperator -> `callee.property.type !== 'Identifier' && callee.property....`  | debt: pre-existing on main@ba6664c185 |
| `5104f08774a08e40` | `src/rules/prop-fixture-schema-origin.ts:102`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `51ab10d56b1e4e60` | `src/rules/prop-arbitrary-schema-origin.ts:228`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `522d9ad0995cee6e` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `536e11f3efdafaab` | `src/rules/conformance-test-requires-harness.ts:85`   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `539e14ecf7156ec0` | `src/rules/prop-fixture-schema-origin.ts:199`         | EqualityOperator -> `depth < MAX_WALK_DEPTH`                                       | debt: pre-existing on main@ba6664c185 |
| `5486642a424a8c6e` | `src/rules/prop-arbitrary-schema-origin.ts:192`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `54c5274218975bec` | `src/rules/prop-generated-law-duplicate.ts:143`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `5529e4e218122f72` | `src/rules/behaviour-exercises-use-case.ts:128`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `558cb40803b3d71f` | `src/rules/in-source-test-targets-private.ts:84`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `559971cced7a6770` | `src/rules/prop-fixture-schema-origin.ts:122`         | EqualityOperator -> `key !== 'parent'`                                             | debt: pre-existing on main@ba6664c185 |
| `55bb270804a4caec` | `src/rules/in-source-test-prop-only.ts:40`            | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `59a602786ac4da5f` | `src/rules/prop-generated-law-duplicate.ts:118`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `5a89a72281d49a9a` | `src/rules/model-fixture-imports-subject.ts:59`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5ac13cd52a3f0e83` | `src/rules/prop-arbitrary-schema-origin.ts:192`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5b2634e53339a610` | `src/rules/prop-generated-law-duplicate.ts:132`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `5b873d57d6358de5` | `src/rules/no-silent-return.ts:155`                   | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `5bd34ae52ba7d86c` | `src/rules/prop-generated-law-duplicate.ts:145`       | EqualityOperator -> `NEUTRAL_METHODS[name] === true`                               | debt: pre-existing on main@ba6664c185 |
| `5d38d555f70f8e93` | `src/rules/trace-test-requires-taxonomy.ts:98`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `5d3984d38049d10f` | `src/rules/expect-call.ts:17`                         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `5d8f496795508bc9` | `src/rules/in-source-test-prop-only.ts:65`            | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5dad8b6baddb7d1b` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `5db532f380d07236` | `src/rules/prop-arbitrary-schema-origin.ts:169`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `5df2f432a275181d` | `src/rules/prop-fixture-schema-origin.ts:94`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5e8def8296f7f236` | `src/rules/behaviour-exercises-use-case.ts:63`        | StringLiteral -> `"Stryker was here!"`                                             | debt: pre-existing on main@ba6664c185 |
| `5ee888b4efb060dd` | `src/rules/prop-generated-law-duplicate.ts:148`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5f25204f21809f58` | `src/rules/prop-fixture-schema-origin.ts:236`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5f601b4af9245bc2` | `src/rules/prop-arbitrary-schema-origin.ts:196`       | EqualityOperator -> `depth >= MAX_WALK_DEPTH`                                      | debt: pre-existing on main@ba6664c185 |
| `60e2ff321bb52782` | `src/rules/prop-arbitrary-schema-origin.ts:262`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6150ba09845d6cac` | `src/rules/prop-fixture-schema-origin.ts:122`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `627082de64409615` | `src/rules/prop-fixture-schema-origin.ts:57`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6275d368f1bd0b11` | `src/rules/model-fixture-imports-subject.ts:59`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `633292e7b644a2f8` | `src/rules/prop-arbitrary-schema-origin.ts:261`       | EqualityOperator -> `verdict !== 'schema'`                                         | debt: pre-existing on main@ba6664c185 |
| `63b5ae696ea2d055` | `src/rules/prop-fixture-schema-origin.ts:161`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `644f8aa5d670fc58` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | EqualityOperator -> `edge.source !== EFFECT_SOURCE`                                | debt: pre-existing on main@ba6664c185 |
| `647877f9c3f6ab86` | `src/rules/prop-fixture-schema-origin.ts:188`         | EqualityOperator -> `property.key.name !== 'recursionBudget'`                      | debt: pre-existing on main@ba6664c185 |
| `655705262f43a30e` | `src/rules/model-fixture-imports-subject.ts:48`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `6627920fe1922eb3` | `src/rules/prop-fixture-schema-origin.ts:208`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `66533023941dbe74` | `src/rules/prop-arbitrary-schema-origin.ts:185`       | EqualityOperator -> `verdict !== 'handBuilt'`                                      | debt: pre-existing on main@ba6664c185 |
| `678b18b0fd42f855` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `686f5cbcf3557fe0` | `src/rules/behaviour-exercises-use-case.ts:65`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `691d91507b6f7688` | `src/rules/prop-arbitrary-schema-origin.ts:261`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `698d753a15282ae4` | `src/rules/prop-arbitrary-schema-origin.ts:181`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6a8ba37f4c37f453` | `src/rules/in-source-test-prop-only.ts:24`            | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6ad819230d4af9f5` | `src/rules/prop-generated-law-duplicate.ts:148`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6c356de85d8a4d2f` | `src/rules/prop-arbitrary-schema-origin.ts:126`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6c756c979d6c44d6` | `src/rules/prop-fixture-schema-origin.ts:209`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6cee6758c9cc3faa` | `src/rules/prop-fixture-schema-origin.ts:94`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6dff1c8d8ae8be9f` | `src/rules/prop-fixture-schema-origin.ts:219`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6e044e178dd80eb6` | `src/rules/prop-fixture-schema-origin.ts:66`          | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `6e4765a44fc70d53` | `src/rules/prop-arbitrary-schema-origin.ts:167`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `6e5b53229b6117d3` | `src/rules/in-source-test-targets-private.ts:86`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6e89a746a804f6d3` | `src/rules/trace-test-requires-taxonomy.ts:174`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6e99776d3b806ce1` | `src/rules/behaviour-exercises-use-case.ts:63`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6eec067a56505f0d` | `src/rules/no-silent-return.ts:156`                   | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `6f04c9155059ad25` | `src/rules/suppression-directive.ts:22`               | Regex -> `/\s*/u`                                                                  | debt: pre-existing on main@ba6664c185 |
| `6f4ad20745d08e14` | `src/rules/prop-generated-law-duplicate.ts:145`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6fa2e6e1969aa29d` | `src/rules/prop-fixture-schema-origin.ts:188`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `6fc2e4b9209e411e` | `src/rules/trace-test-requires-taxonomy.ts:176`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `70451caa4febeef7` | `src/rules/prop-arbitrary-schema-origin.ts:288`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `715a9c4b45bd9a73` | `src/rules/prop-fixture-schema-origin.ts:111`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `724913ef6d5ed42a` | `src/rules/prop-fixture-schema-origin.ts:219`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `7366d142dfd7a1d0` | `src/rules/prop-arbitrary-schema-origin.ts:192`       | EqualityOperator -> `resolved.kind !== 'function'`                                 | debt: pre-existing on main@ba6664c185 |
| `736bbbf64fbe77ae` | `src/rules/in-source-test-prop-only.ts:23`            | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `76463067d3490010` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `7774a364c43b2878` | `src/rules/prop-arbitrary-schema-origin.ts:132`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `779f76ca9382477c` | `src/rules/prop-arbitrary-schema-origin.ts:192`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `78dc3ad0c0a3d390` | `src/rules/no-test-file-in-src.ts:35`                 | MethodExpression -> `basename.startsWith(SCHEMA_SUFFIX)`                           | debt: pre-existing on main@ba6664c185 |
| `79602bc99175dcd7` | `src/rules/prop-generated-law-duplicate.ts:148`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `7984d7b76482b742` | `src/rules/prop-fixture-schema-origin.ts:82`          | EqualityOperator -> `resolved.init.type !== 'FunctionExpression'`                  | debt: pre-existing on main@ba6664c185 |
| `7a1000f5d1b95e27` | `src/rules/prop-arbitrary-schema-origin.ts:262`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `7b2f419cadede4ab` | `src/rules/prop-fixture-schema-origin.ts:82`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `7b98978aa8bff5d9` | `src/rules/prop-generated-law-duplicate.ts:154`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `7bcef1cfc90f9e1b` | `src/rules/prop-arbitrary-schema-origin.ts:183`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `7c4c1d3b5ed33650` | `src/rules/prop-arbitrary-schema-origin.ts:276`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `7d87dfca45e02482` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `7e3ae5d46399bc86` | `src/rules/conformance-test-requires-harness.ts:38`   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `805cf838051dbcb9` | `src/rules/prop-arbitrary-schema-origin.ts:126`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `80f89c6bb798db48` | `src/rules/lane.ts:77`                                | EqualityOperator -> `fastCheckImportSites(statement).length != 0`                  | debt: pre-existing on main@ba6664c185 |
| `812607201c3b7808` | `src/rules/behaviour-exercises-use-case.ts:59`        | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `8487ea749b2a0fcf` | `src/rules/model-fixture-imports-subject.ts:48`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `84c92f796eda778e` | `src/rules/prop-fixture-schema-origin.ts:219`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `84efd911516051ae` | `src/rules/prop-arbitrary-schema-origin.ts:272`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `855814483c5052f2` | `src/rules/prop-fixture-schema-origin.ts:236`         | LogicalOperator -> `callee.property.type !== 'Identifier' && callee.property....`  | debt: pre-existing on main@ba6664c185 |
| `85764a3b51599b56` | `src/rules/no-io-module-in-source-test.ts:49`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `85ed0bf3a4d34f2e` | `src/rules/prop-arbitrary-schema-origin.ts:246`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `85f503c84b29afe7` | `src/rules/in-source-test-targets-private.ts:87`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `85fc756c4280dac1` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `86e5800b571da33a` | `src/rules/conformance-test-requires-harness.ts:88`   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `8836de184afd0078` | `src/rules/differential-test-requires-harness.ts:31`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `89114c393d9cb67e` | `src/rules/no-pseudo-gherkin-unit-tests.ts:44`        | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `892cbceb3be293aa` | `src/rules/prop-arbitrary-schema-origin.ts:256`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `8974f25243429593` | `src/rules/prop-fixture-schema-origin.ts:113`         | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `89868f0501e10f77` | `src/rules/model-fixture-imports-subject.ts:43`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `8a042e99bd926b5d` | `src/rules/prop-arbitrary-schema-origin.ts:134`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `8a434b54b59aff8f` | `src/rules/prop-fixture-schema-origin.ts:209`         | ArrowFunction -> `() => undefined`                                                 | debt: pre-existing on main@ba6664c185 |
| `8a6d4365165a037d` | `src/rules/prop-fixture-schema-origin.ts:176`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `8bc7c5907a3ac19c` | `src/rules/trace-test-requires-taxonomy.ts:118`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `8c62f6c02670f741` | `src/rules/conformance-test-requires-harness.ts:55`   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `8c788d1f5cf92528` | `src/rules/prop-fixture-schema-origin.ts:204`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `8d0551f44915bc27` | `src/rules/no-behaviourless-assertion.ts:75`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `8d6c5176743be5cb` | `src/rules/prop-generated-law-duplicate.ts:148`       | LogicalOperator -> `provenance.classifyCall(name, node) === 'domain' && recei...`  | debt: pre-existing on main@ba6664c185 |
| `8db783e1fd9d00ba` | `src/rules/prop-fixture-schema-origin.ts:123`         | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `8e8163d3d6da850a` | `src/rules/prop-fixture-schema-origin.ts:165`         | MethodExpression -> `nestedNames.every(nested => suspendThunkOf(nested, union,...` | debt: pre-existing on main@ba6664c185 |
| `8f6abd6b4f53b648` | `src/rules/prop-arbitrary-schema-origin.ts:141`       | MethodExpression -> `edge.source.endsWith('${FASTCHECK_PACKAGE}/')`                | debt: pre-existing on main@ba6664c185 |
| `90529df290a1e85e` | `src/rules/prop-fixture-schema-origin.ts:94`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9195f63f58c9c824` | `src/rules/prop-arbitrary-schema-origin.ts:252`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `92ccef7989030756` | `src/rules/tests-import-public-api.ts:56`             | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `93017af14bbe8f72` | `src/rules/prop-fixture-schema-origin.ts:215`         | EqualityOperator -> `call.callee === parent`                                       | debt: pre-existing on main@ba6664c185 |
| `93088464e3cb6868` | `src/rules/prop-arbitrary-schema-origin.ts:319`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `93d47a62c99eb4a1` | `src/rules/prop-generated-law-duplicate.ts:154`       | LogicalOperator -> `CODEC_ACCESSORS[callee.name] !== true && NEUTRAL_METHODS[...`  | debt: pre-existing on main@ba6664c185 |
| `93f4e157d30491d6` | `src/rules/prop-arbitrary-schema-origin.ts:246`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `950a11e7bbecc7f9` | `src/rules/prop-arbitrary-schema-origin.ts:262`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `9590559e0b84f180` | `src/rules/prop-arbitrary-schema-origin.ts:171`       | EqualityOperator -> `edge.imported !== 'Arbitrary'`                                | debt: pre-existing on main@ba6664c185 |
| `9615de513e168823` | `src/rules/model-fixture-imports-subject.ts:48`       | MethodExpression -> `source.endsWith('./')`                                        | debt: pre-existing on main@ba6664c185 |
| `97098313569f3d5a` | `src/rules/prop-fixture-schema-origin.ts:236`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `97a65c72b9d25372` | `src/rules/behaviour-exercises-use-case.ts:138`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `97c5a884aa61370d` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `97cefe1fd2f2d376` | `src/rules/prop-arbitrary-schema-origin.ts:321`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `994bca48a0a247bd` | `src/rules/in-source-test-prop-only.ts:21`            | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `998a7f1e2171289b` | `src/rules/behaviour-exercises-use-case.ts:149`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9a11eef3d5d20e2c` | `src/rules/lane.ts:51`                                | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `9c25020d230dec9b` | `src/rules/prop-arbitrary-schema-origin.ts:154`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9caf2442a47d34a8` | `src/rules/lane.ts:46`                                | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `9d7c61d5317c1374` | `src/rules/prop-arbitrary-schema-origin.ts:121`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9eb339291ee448f6` | `src/rules/prop-fixture-schema-origin.ts:219`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9ed6dad3a3bad275` | `src/rules/prop-fixture-schema-origin.ts:102`         | EqualityOperator -> `value.name !== name`                                          | debt: pre-existing on main@ba6664c185 |
| `9f9c9bfccd352d0f` | `src/rules/prop-fixture-schema-origin.ts:162`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `9fa91e17ac6f2936` | `src/rules/prop-arbitrary-schema-origin.ts:185`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `a04aab19e59dfaad` | `src/rules/prop-fixture-schema-origin.ts:199`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a1421c92f1248012` | `src/rules/model-fixture-imports-subject.ts:59`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `a203b5dbc00d6aca` | `src/rules/prop-fixture-schema-origin.ts:213`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `a252f0c552556fa4` | `src/rules/prop-fixture-schema-origin.ts:27`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a46c8e0f87c9c85d` | `src/rules/prop-arbitrary-schema-origin.ts:293`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `a64118433811ae02` | `src/rules/prop-arbitrary-schema-origin.ts:75`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a71fc6e736df3bf1` | `src/rules/prop-arbitrary-schema-origin.ts:278`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a77fd4e80f705794` | `src/rules/trace-test-requires-taxonomy.ts:174`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a7885caa6aa47a71` | `src/rules/prop-generated-law-duplicate.ts:133`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `a7bcdf087f4372a8` | `src/rules/prop-arbitrary-schema-origin.ts:308`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `a7fb9b4dcb783f7c` | `src/rules/prop-fixture-schema-origin.ts:202`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `a81974ddb0125475` | `src/rules/prop-fixture-schema-origin.ts:210`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `a9d577c1da2dafab` | `src/rules/behaviour-exercises-use-case.ts:65`        | EqualityOperator -> `stack.length >= 0`                                            | debt: pre-existing on main@ba6664c185 |
| `a9f4fb72dfa778d9` | `src/rules/prop-fixture-schema-origin.ts:79`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `aa42a4848efe00dd` | `src/rules/prop-arbitrary-schema-origin.ts:290`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `aa60dd8830d65dc7` | `src/rules/prop-arbitrary-schema-origin.ts:253`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `aad2104e3012b32c` | `src/rules/behaviour-exercises-use-case.ts:125`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `abe3950a00b3b905` | `src/rules/prop-fixture-schema-origin.ts:99`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ad5cb5b2231639a3` | `src/rules/no-io-module-in-source-test.ts:15`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ade2958763a3c621` | `src/rules/behaviour-exercises-use-case.ts:59`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `af5384b113387773` | `src/rules/prop-fixture-schema-origin.ts:104`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `afe97a5d412dc6ad` | `src/rules/prop-arbitrary-schema-origin.ts:275`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b120bcc299351e20` | `src/rules/prop-arbitrary-schema-origin.ts:181`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b2d2f330642a6709` | `src/rules/no-io-module-in-source-test.ts:39`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b3160ed1c5f2d8b8` | `src/rules/prop-fixture-schema-origin.ts:219`         | EqualityOperator -> `parent.type !== 'BlockStatement'`                             | debt: pre-existing on main@ba6664c185 |
| `b490f49697d11aa7` | `src/rules/prop-arbitrary-schema-origin.ts:295`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b5132fa1262d265b` | `src/rules/prop-arbitrary-schema-origin.ts:154`       | EqualityOperator -> `resolved.init.type !== 'FunctionExpression'`                  | debt: pre-existing on main@ba6664c185 |
| `b5c496ead901c795` | `src/rules/behaviour-exercises-use-case.ts:58`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b6007cc5d43d0e7b` | `src/rules/behaviour-exercises-use-case.ts:79`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `b64a893118470cbf` | `src/rules/prop-arbitrary-schema-origin.ts:318`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `b6586542666a1057` | `src/rules/prop-arbitrary-schema-origin.ts:260`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `b6a5dca6c5ce9cdb` | `src/rules/prop-arbitrary-schema-origin.ts:185`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b6b94d718fd0e21c` | `src/rules/prop-generated-law-duplicate.ts:134`       | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `b7a674722e7ed63c` | `src/rules/prop-generated-law-duplicate.ts:146`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b8973f862427da76` | `src/rules/prop-arbitrary-schema-origin.ts:318`       | EqualityOperator -> `callee.property.name !== 'toArbitrary'`                       | debt: pre-existing on main@ba6664c185 |
| `ba9ead274a19aa19` | `src/rules/tests-import-public-api.ts:12`             | EqualityOperator -> `segment !== 'internal'`                                       | debt: pre-existing on main@ba6664c185 |
| `bb966fc275ab5243` | `src/rules/prop-fixture-schema-origin.ts:111`         | EqualityOperator -> `depth != MAX_WALK_DEPTH`                                      | debt: pre-existing on main@ba6664c185 |
| `bda5efe1bcb57713` | `src/rules/prop-arbitrary-schema-origin.ts:309`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `bdeace41c8d525bd` | `src/rules/prop-fixture-schema-origin.ts:99`          | EqualityOperator -> `depth >= MAX_WALK_DEPTH`                                      | debt: pre-existing on main@ba6664c185 |
| `be6cd9cfe1b53bfa` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | LogicalOperator -> `(arg === undefined \|\| arg === null) && !isNode(arg)`         | debt: pre-existing on main@ba6664c185 |
| `bf82d1ca2a5f34d2` | `src/rules/vitest-from-systemfsoftware-vitest.ts:24`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `c04c1a273089ec2e` | `src/rules/prop-arbitrary-schema-origin.ts:135`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `c0bb4ef602d9e8a3` | `src/rules/vitest-from-systemfsoftware-vitest.ts:126` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c11fbfb9d85bc1f8` | `src/rules/conformance-test-requires-harness.ts:28`   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `c15a8dfee29828b8` | `src/rules/prop-fixture-schema-origin.ts:67`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c2e1458a0ccc3c5d` | `src/rules/prop-fixture-schema-origin.ts:82`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c3b16cd90692780c` | `src/rules/no-silent-return.ts:156`                   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c446d73cf9bd82b3` | `src/rules/prop-fixture-schema-origin.ts:201`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c61f5b942d3a40f1` | `src/rules/vitest-from-systemfsoftware-vitest.ts:31`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c7396f53dc30deae` | `src/rules/in-source-test-prop-only.ts:38`            | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `c78ce447eec30986` | `src/rules/trace-test-requires-taxonomy.ts:246`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `c8f76f5f61b6256f` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `cc825cf3a87e5cdb` | `src/rules/prop-fixture-schema-origin.ts:163`         | ArrayDeclaration -> `["Stryker was here"]`                                         | debt: pre-existing on main@ba6664c185 |
| `ce3ca1d4f5d816ff` | `src/rules/differential-test-requires-harness.ts:47`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ce780ddcf2f9d195` | `src/rules/prop-arbitrary-schema-origin.ts:160`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `d142b0fdbc9d9b7b` | `src/rules/prop-fixture-schema-origin.ts:81`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d1d82a8a2502f565` | `src/rules/no-io-module-in-source-test.ts:41`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `d253bb5285e66970` | `src/rules/prop-fixture-schema-origin.ts:144`         | ArrayDeclaration -> `["Stryker was here"]`                                         | debt: pre-existing on main@ba6664c185 |
| `d2ba28cbe160e9ba` | `src/rules/prop-arbitrary-schema-origin.ts:162`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d436f7624585ce95` | `src/rules/prop-fixture-schema-origin.ts:30`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d47d46f07da8f272` | `src/rules/trace-test-requires-taxonomy.ts:145`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d4c68c71eedfd502` | `src/rules/trace-test-requires-taxonomy.ts:182`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `d6ae173825ebe12c` | `src/rules/expect-call.ts:17`                         | EqualityOperator -> `acceptsMember(target) !== false`                              | debt: pre-existing on main@ba6664c185 |
| `d7826b93a4013b52` | `src/rules/prop-generated-law-duplicate.ts:110`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d9b64a4c29a2bfd1` | `src/rules/prop-fixture-schema-origin.ts:215`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `da5a252d3d1f9322` | `src/rules/prop-generated-law-duplicate.ts:102`       | MethodExpression -> `value.every(item => mentionsImportMetaVitest(item))`          | debt: pre-existing on main@ba6664c185 |
| `daad5c538fa20ec6` | `src/rules/no-io-module-in-source-test.ts:44`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `dae790824bacaf9e` | `src/rules/no-behaviourless-assertion.ts:77`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `daf9599e2fef81d4` | `src/rules/behaviour-exercises-use-case.ts:65`        | EqualityOperator -> `stack.length != 0`                                            | debt: pre-existing on main@ba6664c185 |
| `dd8c332ccd05d911` | `src/rules/behaviour-exercises-use-case.ts:58`        | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `de1ea7457eeea915` | `src/rules/property-file-purity.ts:82`                | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `deb896d624d816c7` | `src/rules/in-source-test-targets-private.ts:73`      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `dfa0cd9c6b11f210` | `src/rules/no-behaviourless-assertion.ts:27`          | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `dfe5a6b8b6c572b5` | `src/rules/differential-test-requires-harness.ts:39`  | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `e0125b8fd60f8fa1` | `src/rules/prop-arbitrary-schema-origin.ts:137`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e01cecca4926c8e4` | `src/rules/prop-fixture-schema-origin.ts:219`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e07cd51ad65c4508` | `src/rules/prop-fixture-schema-origin.ts:117`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `e1e75429d7b615c2` | `src/rules/prop-fixture-schema-origin.ts:66`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e1f01b912d1829ac` | `src/rules/prop-fixture-schema-origin.ts:178`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e215ff2474c3483f` | `src/rules/prop-arbitrary-schema-origin.ts:139`       | EqualityOperator -> `SCHEMA_NAMESPACE_NAMES[edge.imported] !== true`               | debt: pre-existing on main@ba6664c185 |
| `e340990d93544574` | `src/rules/prop-fixture-schema-origin.ts:161`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e34c52522e938d4b` | `src/rules/trace-test-requires-taxonomy.ts:167`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e3586b786a1d931d` | `src/rules/prop-arbitrary-schema-origin.ts:56`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e365774b2ac052da` | `src/rules/no-nested-quantification.ts:90`            | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e3749a95328faa01` | `src/rules/prop-fixture-schema-origin.ts:111`         | EqualityOperator -> `depth >= MAX_WALK_DEPTH`                                      | debt: pre-existing on main@ba6664c185 |
| `e39841a9b8a5e961` | `src/rules/prop-generated-law-duplicate.ts:133`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e3fe623493cf56b8` | `src/rules/prop-generated-law-duplicate.ts:218`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `e4efe05fcdf0ebd0` | `src/rules/prop-arbitrary-schema-origin.ts:162`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e5acdfede57a8db5` | `src/rules/prop-generated-law-duplicate.ts:103`       | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `e6f32c1560dfdf9e` | `src/rules/prop-arbitrary-schema-origin.ts:321`       | BooleanLiteral -> `isToArbitrary`                                                  | debt: pre-existing on main@ba6664c185 |
| `e73af724486ed530` | `src/rules/prop-arbitrary-schema-origin.ts:131`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e757b0462c6389c4` | `src/rules/no-pseudo-gherkin-unit-tests.ts:63`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e7caa2a4f4971288` | `src/rules/prop-arbitrary-schema-origin.ts:245`       | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `e954d5449b7d2823` | `src/rules/vitest-from-systemfsoftware-vitest.ts:120` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `eacb1d80415c54d5` | `src/rules/prop-generated-law-duplicate.ts:145`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `eb4a210181442a16` | `src/rules/prop-generated-law-duplicate.ts:133`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `eb627d660ab1576d` | `src/rules/prop-arbitrary-schema-origin.ts:309`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ebf0f41b11a44986` | `src/rules/prop-fixture-schema-origin.ts:209`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ebfee8faec69864d` | `src/rules/prop-arbitrary-schema-origin.ts:290`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ecb07d9a9b18e5c1` | `src/rules/behaviour-exercises-use-case.ts:41`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ed11a7306050d0bc` | `src/rules/no-pseudo-gherkin-unit-tests.ts:39`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ed17de51935543d8` | `src/rules/expect-call.ts:17`                         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `ed59afa3f4b22cc9` | `src/rules/tests-dir-helpers-in-fixtures.ts:12`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ee50a06ca1067518` | `src/rules/conformance-test-requires-harness.ts:35`   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ee5738a465308198` | `src/rules/prop-arbitrary-schema-origin.ts:247`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ee6aa435d910e9ca` | `src/rules/prop-fixture-schema-origin.ts:100`         | MethodExpression -> `value.every(item => mentionsIdentifier(item, name, depth ...` | debt: pre-existing on main@ba6664c185 |
| `f036f46d3f47dc0f` | `src/rules/behaviour-exercises-use-case.ts:87`        | Regex -> `/(?:\|\/)dist\//`                                                        | debt: pre-existing on main@ba6664c185 |
| `f16b51e6a5c507e7` | `src/rules/prop-fixture-schema-origin.ts:112`         | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `f1a0c9ae53fe2fc6` | `src/rules/prop-generated-law-duplicate.ts:133`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `f21e6e0965b25056` | `src/rules/no-behaviourless-assertion.ts:18`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `f34b7b68de4f12b3` | `src/rules/prop-fixture-schema-origin.ts:105`         | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `f36cee4bde2670d1` | `src/rules/prop-arbitrary-schema-origin.ts:126`       | EqualityOperator -> `id.name !== name`                                             | debt: pre-existing on main@ba6664c185 |
| `f3b3f4c75e802717` | `src/rules/model-fixture-imports-subject.ts:95`       | LogicalOperator -> `fixtureInTestsTree \|\| isRelativeSpecifier(specifier)`        | debt: pre-existing on main@ba6664c185 |
| `f434574bf0f9f9af` | `src/rules/prop-arbitrary-schema-origin.ts:301`       | LogicalOperator -> `arg === undefined && arg === null`                             | debt: pre-existing on main@ba6664c185 |
| `f4d722c076b6decd` | `src/rules/prop-arbitrary-schema-origin.ts:303`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f5899f46da2ec6db` | `src/rules/prop-fixture-schema-origin.ts:104`         | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `f5ba422c1eb8b118` | `src/rules/prop-arbitrary-schema-origin.ts:323`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f61ee0ae577adc9a` | `src/rules/prop-arbitrary-schema-origin.ts:419`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `f7d1269ff78426ed` | `src/rules/prop-arbitrary-schema-origin.ts:167`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f7ef2d85536b6a53` | `src/rules/prop-fixture-schema-origin.ts:175`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f811ba53d1ede02c` | `src/rules/ban-raw-span-name-emit.ts:18`              | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f842e6022f548340` | `src/rules/behaviour-exercises-use-case.ts:64`        | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f8d7d4b235c174eb` | `src/rules/prop-fixture-schema-origin.ts:178`         | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `f908417ffdf60643` | `src/rules/prop-fixture-schema-origin.ts:79`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f9116eb172516021` | `src/rules/prop-generated-law-duplicate.ts:148`       | EqualityOperator -> `provenance.classifyCall(name, node) !== 'domain'`             | debt: pre-existing on main@ba6664c185 |
| `fa053c38c04e0fff` | `src/rules/differential-test-requires-harness.ts:50`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `fa4a0d3f8dec3bc0` | `src/rules/tests-import-public-api.ts:55`             | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `fb273011ac029733` | `src/rules/prop-fixture-schema-origin.ts:215`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `fb389c28c4023570` | `src/rules/prop-arbitrary-schema-origin.ts:318`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `fbc9be2cbaefce8e` | `src/rules/model-fixture-imports-subject.ts:28`       | EqualityOperator -> `index == 0`                                                   | debt: pre-existing on main@ba6664c185 |
| `fc69d7d0af5cbc6b` | `src/rules/prop-generated-law-duplicate.ts:116`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `fc6f6481e6e49612` | `src/rules/prop-arbitrary-schema-origin.ts:236`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `fd42a0cc7040e026` | `src/rules/prop-generated-law-duplicate.ts:145`       | LogicalOperator -> `CODEC_ACCESSORS[name] !== true \|\| NEUTRAL_METHODS[name]...`  | debt: pre-existing on main@ba6664c185 |
| `fddd4b323d2dde54` | `src/rules/prop-generated-law-duplicate.ts:145`       | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `fe060777d17fe2e5` | `src/rules/prop-fixture-schema-origin.ts:209`         | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `fed17edcb27e9ef5` | `src/rules/prop-fixture-schema-origin.ts:158`         | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ffdcce0329dbfa3d` | `src/rules/ban-raw-span-name-emit.ts:17`              | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
