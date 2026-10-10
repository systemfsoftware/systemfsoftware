# Mutation baseline reasons - oxlint-plugin-effect-platform

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                         | mutator -> replacement                                                            | reason                                |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `00b1a925320fe2e3` | `src/rules/runtime-construction-placement.ts:136` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `00b4bb4f9aa0a6e9` | `src/rules/runtime-construction-placement.ts:99`  | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `00d12ea3222633cb` | `src/rules/runtime-construction-placement.ts:166` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `0220e6885128ed92` | `src/rules/runtime-construction-placement.ts:203` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `02d3db3e8855c971` | `src/rules/runtime-construction-placement.ts:231` | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `03009714097fe30b` | `src/rules/runtime-construction-placement.ts:90`  | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `05bbf181c59ea1ba` | `src/rules/runtime-construction-placement.ts:179` | EqualityOperator -> `depth >= MAX_WALK_DEPTH`                                     | debt: pre-existing on main@ba6664c185 |
| `08044de433b4a2fe` | `src/rules/runtime-construction-placement.ts:197` | ArithmeticOperator -> `depth - 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `0835a4baae9c0ba4` | `src/rules/runtime-construction-placement.ts:209` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `09dd53848bf43efe` | `src/rules/runtime-construction-placement.ts:138` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `0a72b3b1e6fb74ff` | `src/rules/runtime-construction-placement.ts:229` | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `0e3b9076f9b583d2` | `src/rules/runtime-construction-placement.ts:192` | ArrowFunction -> `() => undefined`                                                | debt: pre-existing on main@ba6664c185 |
| `0efb37bc4fb40e2d` | `src/rules/runtime-construction-placement.ts:197` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `10f4f985ea27a6a6` | `src/rules/runtime-construction-placement.ts:99`  | EqualityOperator -> `bindings.size !== before`                                    | debt: pre-existing on main@ba6664c185 |
| `130dcd953be46090` | `src/rules/runtime-construction-placement.ts:185` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `15aefbe8ecd0176e` | `src/rules/runtime-construction-placement.ts:140` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `15b3e104d481a8c6` | `src/rules/runtime-construction-placement.ts:191` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `15d28f2ff6314c3d` | `src/rules/runtime-construction-placement.ts:140` | LogicalOperator -> `holder.type === 'ExportNamedDeclaration' \|\| holder.pare...` | debt: pre-existing on main@ba6664c185 |
| `1705981bf4ae19f7` | `src/rules/runtime-construction-placement.ts:179` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `1858d73037cd72f6` | `src/rules/no-unported-time-source.ts:151`        | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `1bc6ae1e378204af` | `src/rules/runtime-construction-placement.ts:168` | LogicalOperator -> `current.init !== null \|\| isModuleScopeBinding(current)`     | debt: pre-existing on main@ba6664c185 |
| `1ee050d64931d383` | `src/rules/no-unported-time-source.ts:152`        | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `1f69d84dffe0eaf1` | `src/rules/runtime-construction-placement.ts:116` | EqualityOperator -> `origin.path.length != 0`                                     | debt: pre-existing on main@ba6664c185 |
| `1fe63882b3ac7962` | `src/rules/no-logging-in-catch.ts:91`             | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `2274745700703e96` | `src/rules/runtime-construction-placement.ts:211` | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `258f99e338947bf7` | `src/rules/no-unported-time-source.ts:68`         | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `263b674d9b67800c` | `src/rules/no-logging-in-catch.ts:98`             | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `26d053a5fc05dc44` | `src/rules/no-logging-in-catch.ts:90`             | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `2a0f67cd78a8234d` | `src/rules/runtime-construction-placement.ts:196` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `2d3dcf35f216764c` | `src/rules/runtime-construction-placement.ts:144` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `2d46af24449deb42` | `src/rules/no-logging-in-catch.ts:91`             | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `2e1d0ed62a097c75` | `src/rules/runtime-construction-placement.ts:166` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `2e4c6e57583918f7` | `src/rules/runtime-construction-placement.ts:112` | ArrayDeclaration -> `[]`                                                          | debt: pre-existing on main@ba6664c185 |
| `2e804ee772ad3587` | `src/rules/runtime-construction-placement.ts:99`  | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `2fa1f5bd9410b0e0` | `src/rules/runtime-construction-placement.ts:180` | ArithmeticOperator -> `depth - 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `311d529d6be19b66` | `src/rules/no-logging-in-catch.ts:91`             | EqualityOperator -> `spec.type !== 'ImportDefaultSpecifier'`                      | debt: pre-existing on main@ba6664c185 |
| `340196281e1e0bfc` | `src/rules/runtime-construction-placement.ts:136` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `3442856edcc2d367` | `src/rules/runtime-construction-placement.ts:197` | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `35c59a00587fa686` | `src/rules/runtime-construction-placement.ts:72`  | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `366debdd1e848407` | `src/rules/runtime-construction-placement.ts:185` | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `36d6e04a98bbbd13` | `src/rules/runtime-construction-placement.ts:85`  | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `39f39a97dd115f0a` | `src/rules/runtime-construction-placement.ts:215` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `3d3d6b8f618e20a7` | `src/rules/runtime-construction-placement.ts:147` | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `4338ecb61665f5a0` | `src/rules/runtime-construction-placement.ts:179` | EqualityOperator -> `depth != MAX_WALK_DEPTH`                                     | debt: pre-existing on main@ba6664c185 |
| `444352e24b622878` | `src/rules/runtime-construction-placement.ts:191` | EqualityOperator -> `depth >= MAX_WALK_DEPTH`                                     | debt: pre-existing on main@ba6664c185 |
| `45cb6d87d873cb80` | `src/rules/runtime-construction-placement.ts:166` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `48a925ccc2b1f0ce` | `src/rules/runtime-construction-placement.ts:148` | LogicalOperator -> `current.type === 'FunctionDeclaration' && current.generat...` | debt: pre-existing on main@ba6664c185 |
| `49e0fedc32fe5157` | `src/rules/no-logging-in-catch.ts:84`             | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `4aec3c7c780f15dd` | `src/rules/runtime-construction-placement.ts:184` | EqualityOperator -> `key !== 'parent'`                                            | debt: pre-existing on main@ba6664c185 |
| `4be6e8d219571558` | `src/rules/runtime-construction-placement.ts:86`  | EqualityOperator -> `hop <= MAX_ALIAS_HOPS`                                       | debt: pre-existing on main@ba6664c185 |
| `4d4f357ceeb9487f` | `src/rules/no-logging-in-catch.ts:91`             | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `4e2597a8f28ff62c` | `src/rules/runtime-construction-placement.ts:86`  | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `51ea206eefc224a3` | `src/rules/no-unported-time-source.ts:83`         | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `54922a3eb93eae60` | `src/rules/runtime-construction-placement.ts:196` | EqualityOperator -> `key !== 'parent'`                                            | debt: pre-existing on main@ba6664c185 |
| `54ee08c80fbfdb77` | `src/rules/no-logging-in-catch.ts:95`             | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `560cbaf48ad5d72d` | `src/rules/runtime-construction-placement.ts:167` | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `569610eac8caff12` | `src/rules/runtime-construction-placement.ts:184` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `57db248fed18bddf` | `src/rules/runtime-construction-placement.ts:179` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `598b481a3194bfd3` | `src/rules/runtime-construction-placement.ts:88`  | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `5b9525c85b0c3395` | `src/rules/runtime-construction-placement.ts:211` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `636707a52735fa51` | `src/rules/runtime-construction-placement.ts:168` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `650d2deda515a94f` | `src/rules/runtime-construction-placement.ts:140` | LogicalOperator -> `holder.type === 'ExportNamedDeclaration' && holder.parent...` | debt: pre-existing on main@ba6664c185 |
| `657e1a39fa5eed93` | `src/rules/no-logging-in-catch.ts:57`             | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `6962ead591f763ee` | `src/rules/runtime-construction-placement.ts:185` | ArithmeticOperator -> `depth - 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `6b8ea30f61278bc0` | `src/rules/runtime-construction-placement.ts:154` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `6df4f2005aab2378` | `src/rules/runtime-construction-placement.ts:144` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `6e7f92cbeba5b2a9` | `src/rules/runtime-construction-placement.ts:144` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `6ef2ee3c3343ee62` | `src/rules/runtime-construction-placement.ts:157` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `729ffe81eda21a16` | `src/rules/no-logging-in-catch.ts:97`             | EqualityOperator -> `spec.imported.name !== 'Effect'`                             | debt: pre-existing on main@ba6664c185 |
| `739ede1e4dc04690` | `src/rules/runtime-construction-placement.ts:140` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `76c60d1dce20c157` | `src/rules/runtime-construction-placement.ts:171` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `78cf9a074ab8be0a` | `src/rules/runtime-construction-placement.ts:138` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `7be67c3133ee2e09` | `src/rules/runtime-construction-placement.ts:176` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `7d9b842be9a4ab73` | `src/rules/runtime-construction-placement.ts:168` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `7dd589d7e5a77573` | `src/rules/runtime-construction-placement.ts:185` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `7f8392a72ab2ba05` | `src/rules/runtime-construction-placement.ts:148` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `83c8c8b53c98f5cc` | `src/rules/runtime-construction-placement.ts:81`  | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `84745550f988721a` | `src/rules/runtime-construction-placement.ts:140` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `88c0778e7e29d2a5` | `src/rules/runtime-construction-placement.ts:182` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `8a946a0a8afc3fbe` | `src/rules/no-unported-time-source.ts:38`         | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `8b650be248e63151` | `src/rules/runtime-construction-placement.ts:194` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `8d1326df694e1eb8` | `src/rules/no-unported-time-source.ts:78`         | BooleanLiteral -> `false`                                                         | debt: pre-existing on main@ba6664c185 |
| `8e530e8f6d5e434b` | `src/rules/no-logging-in-catch.ts:91`             | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `90b63e5847af5150` | `src/rules/runtime-construction-placement.ts:122` | EqualityOperator -> `origin.importedName !== null`                                | debt: pre-existing on main@ba6664c185 |
| `9262494d4301ec67` | `src/rules/runtime-construction-placement.ts:148` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `95c3d5f682973380` | `src/rules/runtime-construction-placement.ts:154` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `96ae852ab9a48d89` | `src/rules/runtime-construction-placement.ts:191` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `9c299d4bc47c37d0` | `src/rules/runtime-construction-placement.ts:62`  | ArrayDeclaration -> `[]`                                                          | debt: pre-existing on main@ba6664c185 |
| `9c493a03c422bb5e` | `src/rules/runtime-construction-placement.ts:148` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `9ccac6cc78765c90` | `src/rules/runtime-construction-placement.ts:195` | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `a10b494018cba0e4` | `src/rules/runtime-construction-placement.ts:184` | StringLiteral -> `""`                                                             | debt: pre-existing on main@ba6664c185 |
| `a166d481957ab1e3` | `src/rules/no-logging-in-catch.ts:91`             | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `a1f3dd16e771e2c8` | `src/rules/runtime-construction-placement.ts:176` | StringLiteral -> `""`                                                             | debt: pre-existing on main@ba6664c185 |
| `a4c9af8a4567217b` | `src/rules/runtime-construction-placement.ts:116` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `a53e22381c57bb95` | `src/rules/no-logging-in-catch.ts:95`             | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `a78495041de07d99` | `src/rules/no-unported-time-source.ts:149`        | EqualityOperator -> `node.arguments.length != 0`                                  | debt: pre-existing on main@ba6664c185 |
| `a95343aabd08875e` | `src/rules/runtime-construction-placement.ts:222` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `aa2c94fabdef4a52` | `src/rules/runtime-construction-placement.ts:181` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `ab0f0d05dab60368` | `src/rules/runtime-construction-placement.ts:86`  | EqualityOperator -> `hop != MAX_ALIAS_HOPS`                                       | debt: pre-existing on main@ba6664c185 |
| `ac1c83a1d8cae359` | `src/rules/runtime-construction-placement.ts:140` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `ac8a81c90fecfaaa` | `src/rules/runtime-construction-placement.ts:182` | EqualityOperator -> `value.name !== name`                                         | debt: pre-existing on main@ba6664c185 |
| `ada0c524386cb9b5` | `src/rules/runtime-construction-placement.ts:122` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `add1ab104637b7fd` | `src/rules/runtime-construction-placement.ts:167` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `aef60d22b1144e57` | `src/rules/runtime-construction-placement.ts:192` | ArithmeticOperator -> `depth - 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `b1098752db1e6da3` | `src/rules/no-unported-time-source.ts:128`        | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `b4cbee5ac2b25db1` | `src/rules/runtime-construction-placement.ts:194` | ArithmeticOperator -> `depth - 1`                                                 | debt: pre-existing on main@ba6664c185 |
| `b4cf8bea072d3322` | `src/rules/runtime-construction-placement.ts:191` | EqualityOperator -> `depth != MAX_WALK_DEPTH`                                     | debt: pre-existing on main@ba6664c185 |
| `b5c16359a8455c06` | `src/rules/runtime-construction-placement.ts:144` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `b6f90ddc78b257ff` | `src/rules/runtime-construction-placement.ts:110` | EqualityOperator -> `receiver.importedName !== null`                              | debt: pre-existing on main@ba6664c185 |
| `bb279d73fffb65f5` | `src/rules/no-unported-time-source.ts:59`         | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `c0842b7870a343a6` | `src/rules/no-logging-in-catch.ts:97`             | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `c4898e0cde3b9e61` | `src/rules/runtime-construction-placement.ts:140` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `c58a69ab9839d7b0` | `src/rules/runtime-construction-placement.ts:86`  | AssignmentOperator -> `hop -= 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `c78f8a433e046876` | `src/rules/runtime-construction-placement.ts:136` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `ca99fcf58598c5a2` | `src/rules/runtime-construction-placement.ts:222` | MethodExpression -> `context.filename.startsWith('.tst.ts')`                      | debt: pre-existing on main@ba6664c185 |
| `d670d2ef406a1bc5` | `src/rules/no-logging-in-catch.ts:90`             | StringLiteral -> `""`                                                             | debt: pre-existing on main@ba6664c185 |
| `d818110e69c25425` | `src/rules/runtime-construction-placement.ts:182` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `e2a0b0f5d97dd96b` | `src/rules/no-unported-time-source.ts:60`         | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `e2f166e4e5dd2bab` | `src/rules/runtime-construction-placement.ts:148` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `e544f18b16fe6d15` | `src/rules/runtime-construction-placement.ts:184` | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `e6dc4caab4611b37` | `src/rules/runtime-construction-placement.ts:180` | ArrowFunction -> `() => undefined`                                                | debt: pre-existing on main@ba6664c185 |
| `e8663a14ccc3f6fa` | `src/rules/runtime-construction-placement.ts:122` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `ec68eb3797c81ca0` | `src/rules/runtime-construction-placement.ts:62`  | ArrayDeclaration -> `["Stryker was here"]`                                        | debt: pre-existing on main@ba6664c185 |
| `eca73bee316b9e17` | `src/rules/runtime-construction-placement.ts:38`  | ConditionalExpression -> `true`                                                   | debt: pre-existing on main@ba6664c185 |
| `f0c56de9002cd490` | `src/rules/no-logging-in-catch.ts:97`             | StringLiteral -> `""`                                                             | debt: pre-existing on main@ba6664c185 |
| `f26379a4a8937cfc` | `src/rules/runtime-construction-placement.ts:136` | ConditionalExpression -> `false`                                                  | debt: pre-existing on main@ba6664c185 |
| `f32caad6bc33e92f` | `src/rules/runtime-construction-placement.ts:183` | BlockStatement -> `{}`                                                            | debt: pre-existing on main@ba6664c185 |
| `f497c12b93465ed5` | `src/rules/runtime-construction-placement.ts:187` | BooleanLiteral -> `true`                                                          | debt: pre-existing on main@ba6664c185 |
| `fa2206192fd69fdb` | `src/rules/runtime-construction-placement.ts:180` | MethodExpression -> `value.every(item => mentionsName(item, name, depth + 1))`    | debt: pre-existing on main@ba6664c185 |
| `fbd59b8fc29e3e66` | `src/rules/runtime-construction-placement.ts:144` | LogicalOperator -> `fn.type === 'FunctionDeclaration' && fn.generator === true`   | debt: pre-existing on main@ba6664c185 |
