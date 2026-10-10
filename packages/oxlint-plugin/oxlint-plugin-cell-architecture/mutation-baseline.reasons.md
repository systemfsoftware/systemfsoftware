# Mutation baseline reasons - oxlint-plugin-cell-architecture

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded from Mutation run 38028129586, not yet judged.

## Justified

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |

## Debt

| id                 | file:line                                          | mutator -> replacement                                                             | reason                                |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| `00c7889ac66c8741` | `src/rules/module-origin.ts:127`                   | ArrayDeclaration -> `[]`                                                           | debt: pre-existing on main@ba6664c185 |
| `00e420c22316df8d` | `src/rules/kernel-boundary.ts:24`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `02a599735dce8bfa` | `src/rules/cell-file-exports-cell-only.ts:122`     | EqualityOperator -> `declaration.declare !== false`                                | debt: pre-existing on main@ba6664c185 |
| `02b4569337e60073` | `src/rules/kind-file-holds-no-module-state.ts:73`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `02bfd3194dc81318` | `src/rules/kernel-boundary.ts:211`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `0317451c1ac08291` | `src/rules/kind-file-holds-no-module-state.ts:92`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `038acc475430b2c6` | `src/rules/cell-file-exports-cell-only.ts:170`     | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `056263fb7f07e023` | `src/rules/kind-file-declares-no-service.ts:29`    | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `084fe2c1c1a3278e` | `src/rules/kind-file-holds-no-module-state.ts:72`  | LogicalOperator -> `origin.source === EFFECT_SOURCE \|\| (path === 'Ref.make'...`  | debt: pre-existing on main@ba6664c185 |
| `0bb0c225e64eabd9` | `src/rules/ban-classes.ts:63`                      | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `0d684f97fdfb2ddf` | `src/rules/module-origin.ts:121`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `0e410f1cdda85fe5` | `src/rules/kernel-boundary.ts:20`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `0eef91aaaee26dd5` | `src/rules/kind-file-holds-no-module-state.ts:94`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1073454981bdd208` | `src/rules/kind-file-holds-no-module-state.ts:153` | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `1339e545ffc798f5` | `src/rules/kernel-boundary.ts:192`                 | EqualityOperator -> `def.type !== 'FunctionName'`                                  | debt: pre-existing on main@ba6664c185 |
| `143771a5be8abc4f` | `src/rules/kind-file-declares-no-service.ts:28`    | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `14547c9b1392ae7c` | `src/rules/handle-exports-guard.ts:40`             | EqualityOperator -> `defaultName !== declaration.name`                             | debt: pre-existing on main@ba6664c185 |
| `14597772cbf981fb` | `src/rules/sandwich-shell-is-straight-line.ts:132` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `14eb40113d6c49e2` | `src/rules/sandwich-shell-is-straight-line.ts:73`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `15281c4669788057` | `src/rules/module-scope.ts:6`                      | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `15bdb0fdefb93d4e` | `src/rules/kind-file-construction.ts:59`           | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `176d9f1a25aefa7e` | `src/rules/kind-typeid-by-symbol-for.ts:61`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `17cee0b21edcad10` | `src/rules/cell-file-exports-cell-only.ts:113`     | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `17d27a7dda1f193a` | `src/rules/kind-file-declares-no-service.ts:39`    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `18a30426c0a968a6` | `src/rules/module-origin.ts:110`                   | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `18bdd134353bbc17` | `src/rules/cell-file-exports-cell-only.ts:77`      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `190b4e7005543f64` | `src/rules/kernel-boundary.ts:166`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `192ff3fbc94a78b7` | `src/rules/kind-file-holds-no-module-state.ts:73`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `19fbc8a31d6cb764` | `src/rules/kernel-boundary.ts:221`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1ba0c23efd0739a7` | `src/rules/module-origin.ts:24`                    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `1bfc81b3f563fe47` | `src/rules/kernel-boundary.ts:274`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `1c899fa666a6bf10` | `src/rules/sandwich-shell-is-straight-line.ts:69`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `1d42411199082598` | `src/rules/kernel-boundary.ts:381`                 | Regex -> `/(\|\/)(__tests__\|__fixtures__\|tests\|testResources)\/\...`            | debt: pre-existing on main@ba6664c185 |
| `1eabb253b7ec50d8` | `src/rules/cell-file-exports-cell-only.ts:29`      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `1f07c440dd9b40b1` | `src/rules/kind-file-construction.ts:35`           | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `22489bd2004dc3af` | `src/rules/kernel-boundary.ts:165`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `22f754787453616a` | `src/rules/cell-file-exports-cell-only.ts:161`     | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `24885a0bc6d769e1` | `src/rules/module-origin.ts:179`                   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `25478377b2d83736` | `src/rules/module-origin.ts:107`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `25491419ecc40ea5` | `src/rules/cell-file-exports-cell-only.ts:155`     | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `257f6814dd182b97` | `src/rules/ban-classes.ts:63`                      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `25a0c98f4149af01` | `src/rules/sandwich-shell-is-straight-line.ts:69`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `26acc6d9c94df27a` | `src/rules/ban-unknown.ts:68`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `28363092b56b896d` | `src/rules/kind-record-minted-by-kind.ts:23`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `29001ecc504a1a08` | `src/rules/sandwich-shell-is-straight-line.ts:148` | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `2c4e69646b3b43c0` | `src/rules/kernel-boundary.ts:23`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `2d320dda97823432` | `src/rules/module-origin.ts:109`                   | EqualityOperator -> `hop != 8`                                                     | debt: pre-existing on main@ba6664c185 |
| `2da8851c0a365443` | `src/rules/sandwich-shell-is-straight-line.ts:75`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `2fc5c0db3d08b5ac` | `src/rules/module-origin.ts:100`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `30500b9587145038` | `src/rules/kernel-boundary.ts:211`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `31c52a23d0622766` | `src/rules/kind-file-holds-no-module-state.ts:69`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `32dedc133dda46da` | `src/rules/kernel-boundary.ts:192`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `34451ac493fa4f76` | `src/rules/internal-jsdoc.ts:4`                    | Regex -> `/^\s*\*?\s@internal\b/m`                                                 | debt: pre-existing on main@ba6664c185 |
| `34f2636e5886ef59` | `src/rules/kind-file-holds-no-module-state.ts:133` | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `3614efbddf9c15dd` | `src/rules/internal-jsdoc.ts:4`                    | Regex -> `/^\s*\*\s*@internal\b/m`                                                 | debt: pre-existing on main@ba6664c185 |
| `371009b8042a5f60` | `src/rules/ban-unknown.ts:44`                      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `3784254a8c5871ab` | `src/rules/module-origin.ts:81`                    | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `37cf0a79218ffab6` | `src/rules/module-origin.ts:97`                    | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `37fdb938352b2f61` | `src/rules/module-origin.ts:132`                   | BooleanLiteral -> `grew`                                                           | debt: pre-existing on main@ba6664c185 |
| `38ae6679442c4fa6` | `src/rules/kernel-boundary.ts:186`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3a486a76fd15ab75` | `src/rules/ban-unknown.ts:71`                      | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `3b4f27d719da0eaa` | `src/rules/kernel-boundary.ts:308`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `3b768dc2d7d8a612` | `src/rules/module-origin.ts:127`                   | ArrayDeclaration -> `[]`                                                           | debt: pre-existing on main@ba6664c185 |
| `3b86e618720ae1d2` | `src/rules/cell-file-exports-cell-only.ts:121`     | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `3c39d3905cf202d7` | `src/rules/cell-file-exports-cell-only.ts:170`     | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `3ce8756f75535bf8` | `src/rules/cell-file-exports-cell-only.ts:126`     | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `3f358aa0af0c04ce` | `src/rules/cell-file-exports-cell-only.ts:69`      | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `3f66e18cb8ba9fc4` | `src/rules/sandwich-shell-is-straight-line.ts:98`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `4125f019a7361b44` | `src/rules/kind-file-holds-no-module-state.ts:103` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `432e13de66d9e17b` | `src/rules/medium-owns-no-recovery.ts:50`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `44043bfa2486fe4c` | `src/rules/module-origin.ts:85`                    | ArrayDeclaration -> `[]`                                                           | debt: pre-existing on main@ba6664c185 |
| `44593c2bb3c01a5f` | `src/rules/kind-record-minted-by-kind.ts:24`       | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `445a57feea08b70d` | `src/rules/kernel-boundary.ts:186`                 | EqualityOperator -> `depth >= 8`                                                   | debt: pre-existing on main@ba6664c185 |
| `45976ef5b11735b9` | `src/rules/kernel-boundary.ts:193`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `45986c1b73d84bdb` | `src/rules/cell-file-exports-cell-only.ts:177`     | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `4880d2252e545914` | `src/rules/kind-file-holds-no-module-state.ts:69`  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `48c10db85f5026a0` | `src/rules/kernel-boundary.ts:96`                  | EqualityOperator -> `span[1] < end`                                                | debt: pre-existing on main@ba6664c185 |
| `4a2451ce9b93a09d` | `src/rules/kernel-boundary.ts:381`                 | Regex -> `/(^\|\/)(__tests__\|__fixtures__\|tests\|testResources)\/...`            | debt: pre-existing on main@ba6664c185 |
| `4b4e7cf6252b52c6` | `src/rules/sandwich-shell-is-straight-line.ts:160` | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `4c65e43993a7bf11` | `src/rules/cell-file-exports-cell-only.ts:75`      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `4cb866f41a19d3ce` | `src/rules/kind-record-minted-by-kind.ts:24`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `4d826109a2ed5e6d` | `src/rules/kind-file-holds-no-module-state.ts:87`  | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `4dea9dad227ef4a4` | `src/rules/kind-file-holds-no-module-state.ts:88`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4e88ff4a121dd5d7` | `src/rules/sandwich-shell-is-straight-line.ts:81`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `4e89b3d858f24a01` | `src/rules/kind-file-holds-no-module-state.ts:61`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4f9717b902a99934` | `src/rules/cell-file-exports-cell-only.ts:78`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `4faf87b0a95b91f7` | `src/rules/cell-file-exports-cell-only.ts:77`      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `50578dd042112b7b` | `src/rules/kind-file-holds-no-module-state.ts:69`  | EqualityOperator -> `path !== 'makeUnsafe'`                                        | debt: pre-existing on main@ba6664c185 |
| `505aec2438d70c0f` | `src/rules/cell-file-exports-cell-only.ts:83`      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `506e35caf047fb1e` | `src/rules/kind-file-declares-no-service.ts:64`    | BooleanLiteral -> `isContextConstructor(superClass, origins)`                      | debt: pre-existing on main@ba6664c185 |
| `507a101c2b0ecd0f` | `src/rules/ban-unknown.ts:46`                      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `53cda34b1594979d` | `src/rules/cell-file-exports-cell-only.ts:169`     | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `549bfe4515759a2d` | `src/rules/kind-file-holds-no-module-state.ts:110` | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `5693db8711692f5e` | `src/rules/kind-file-holds-no-module-state.ts:73`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `57acb28815acfeb1` | `src/rules/ban-classes.ts:67`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `57c6690ddb19233c` | `src/rules/sandwich-shell-is-straight-line.ts:142` | EqualityOperator -> `node.type !== 'Identifier'`                                   | debt: pre-existing on main@ba6664c185 |
| `585ca942fad5c8ac` | `src/rules/module-origin.ts:109`                   | AssignmentOperator -> `hop -= 1`                                                   | debt: pre-existing on main@ba6664c185 |
| `5983ac229201409c` | `src/rules/ban-unknown.ts:46`                      | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `5a1a64cf7401f23a` | `src/rules/kernel-boundary.ts:76`                  | EqualityOperator -> `type !== 'TSAsExpression'`                                    | debt: pre-existing on main@ba6664c185 |
| `5acc5191622cf0fa` | `src/rules/kernel-boundary.ts:275`                 | EqualityOperator -> `sequence.length !== 1`                                        | debt: pre-existing on main@ba6664c185 |
| `5bdd9142fdb7b4be` | `src/rules/kernel-boundary.ts:274`                 | LogicalOperator -> `sequence[sequence.length - 1] === member \|\| (sequence.l...`  | debt: pre-existing on main@ba6664c185 |
| `5c9af6c50326950c` | `src/rules/module-origin.ts:132`                   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5d6c00247cfc63c3` | `src/rules/module-origin.ts:115`                   | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `5dc80be4fdb33b88` | `src/rules/kernel-boundary.ts:211`                 | EqualityOperator -> `depth >= 8`                                                   | debt: pre-existing on main@ba6664c185 |
| `5efbad1db9ab10fd` | `src/rules/kind-file-holds-no-module-state.ts:85`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `5f7dab17ac1be13b` | `src/rules/sandwich-shell-is-straight-line.ts:75`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `602ec0196a397e42` | `src/rules/sandwich-shell-is-straight-line.ts:142` | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `60ffc6c531b32222` | `src/rules/module-origin.ts:114`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `611b18b63a7b9694` | `src/rules/ban-classes.ts:83`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `613fc30975e750b8` | `src/rules/kind-file-declares-no-service.ts:32`    | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `61622b288ee9139c` | `src/rules/kind-typeid-by-symbol-for.ts:64`        | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `620115cefcd9cee2` | `src/rules/sandwich-shell-is-straight-line.ts:76`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `640c85bfa964c13b` | `src/rules/cell-file-exports-cell-only.ts:122`     | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `6441de02e0ec915d` | `src/rules/ban-classes.ts:65`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `66cc0999b25db3ec` | `src/rules/kind-file-declares-no-service.ts:32`    | LogicalOperator -> `path.startsWith('Context.') \|\| SERVICE_MEMBERS[path.sli...`  | debt: pre-existing on main@ba6664c185 |
| `66d7c1038d3d154c` | `src/rules/kernel-boundary.ts:238`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `67bd715cb2e5f685` | `src/rules/module-origin.ts:21`                    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `69553ec9f60bd588` | `src/rules/cell-file-exports-cell-only.ts:108`     | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `6a695e1d18cb7da4` | `src/rules/sandwich-shell-is-straight-line.ts:76`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `6a967b956bfef518` | `src/rules/kind-record-minted-by-kind.ts:23`       | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `6b2148606b03c28d` | `src/rules/kind-file-holds-no-module-state.ts:139` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `6bfe9d613223c099` | `src/rules/kernel-boundary.ts:238`                 | EqualityOperator -> `depth >= 8`                                                   | debt: pre-existing on main@ba6664c185 |
| `6da0fe9fa6abfced` | `src/rules/kind-file-declares-no-service.ts:32`    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `6f1ab64aac7aa168` | `src/rules/medium-owns-no-recovery.ts:80`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `706dafbd1a7fa97c` | `src/rules/medium-owns-no-recovery.ts:55`          | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `707172e6425e0c4d` | `src/rules/kernel-boundary.ts:211`                 | LogicalOperator -> `depth > 8 && identifier.type !== 'Identifier'`                 | debt: pre-existing on main@ba6664c185 |
| `70d28dd36a1022f5` | `src/rules/module-origin.ts:132`                   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `71198aa7409b88a8` | `src/rules/handle-exports-guard.ts:21`             | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `7370d832d63683fa` | `src/rules/module-scope.ts:9`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `761c494a04a1730b` | `src/rules/kernel-boundary.ts:167`                 | EqualityOperator -> `found === undefined`                                          | debt: pre-existing on main@ba6664c185 |
| `76ed90e5cbb9a9e4` | `src/rules/kernel-boundary.ts:188`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `78ce21284ce0f583` | `src/rules/cell-file-exports-cell-only.ts:29`      | MethodExpression -> `statement.specifiers.some(specifier => specifier.exportKi...` | debt: pre-existing on main@ba6664c185 |
| `79087b28bfa37cfe` | `src/rules/kind-file-declares-no-service.ts:36`    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `7ae7b10a732b63c5` | `src/rules/kernel-boundary.ts:77`                  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `7bd8daee42eb06bf` | `src/rules/cell-file-exports-cell-only.ts:77`      | EqualityOperator -> `statement.importKind !== 'type'`                              | debt: pre-existing on main@ba6664c185 |
| `7c5613ceaf2da2ab` | `src/rules/kind-file-holds-no-module-state.ts:69`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `7d4e2571bafb3ee4` | `src/rules/kind-typeid-by-symbol-for.ts:61`        | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `80d589ffde8a5162` | `src/rules/kind-file-holds-no-module-state.ts:73`  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `821aca80e596bd67` | `src/rules/kind-file-declares-no-service.ts:28`    | EqualityOperator -> `SERVICE_MEMBERS[path] !== true`                               | debt: pre-existing on main@ba6664c185 |
| `838d126438f20414` | `src/rules/kernel-boundary.ts:314`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `83c7d513a68ec40b` | `src/rules/kind-file-declares-no-service.ts:62`    | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `864b4d2dd9970c61` | `src/rules/kind-file-holds-no-module-state.ts:153` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `87f5e5ff961a34e4` | `src/rules/kind-file-declares-no-service.ts:28`    | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `88e57a88344592ad` | `src/rules/sandwich-shell-is-straight-line.ts:171` | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `8add97fdd3792833` | `src/rules/kernel-boundary.ts:318`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `8aeee94fec969858` | `src/rules/kind-file-holds-no-module-state.ts:70`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `8b18aacbac860167` | `src/rules/medium-owns-no-recovery.ts:74`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `8d100381a5865128` | `src/rules/ban-unknown.ts:82`                      | MethodExpression -> `parent.params.every(param => contains(param, node))`          | debt: pre-existing on main@ba6664c185 |
| `8d90f06207ae5429` | `src/rules/cell-file-exports-cell-only.ts:116`     | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `8fdf3e1a89639dcf` | `src/rules/kernel-boundary.ts:192`                 | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `926c109ed1833c3d` | `src/rules/kernel-boundary.ts:314`                 | EqualityOperator -> `sequence.length == 2`                                         | debt: pre-existing on main@ba6664c185 |
| `9417b224d481ce3a` | `src/rules/cell-file-exports-cell-only.ts:29`      | ArrowFunction -> `() => undefined`                                                 | debt: pre-existing on main@ba6664c185 |
| `943b08072d0d15b8` | `src/rules/kernel-boundary.ts:249`                 | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `94f0c1186dc77200` | `src/rules/module-origin.ts:109`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `95ac32c5d0e08b19` | `src/rules/module-origin.ts:111`                   | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `95ea939922c6e4c3` | `src/rules/kernel-boundary.ts:30`                  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `96659151f2ebd531` | `src/rules/medium-owns-no-recovery.ts:79`          | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `9839691f4a5c0dd7` | `src/rules/cell-file-exports-cell-only.ts:77`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `99397aea1077f7b7` | `src/rules/cell-file-exports-cell-only.ts:115`     | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `995281e907e49126` | `src/rules/kernel-boundary.ts:196`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `99e8a82931ea0c11` | `src/rules/kind-file-declares-no-service.ts:64`    | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9a1c4ed418cf8d7f` | `src/rules/kernel-boundary.ts:286`                 | EqualityOperator -> `origin.source !== 'effect'`                                   | debt: pre-existing on main@ba6664c185 |
| `9b31aacf6319f663` | `src/rules/kernel-boundary.ts:366`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `9c2e21b959489c18` | `src/rules/module-origin.ts:179`                   | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `9da1f77eaa187a8b` | `src/rules/cell-file-exports-cell-only.ts:78`      | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `9ded957fa698485a` | `src/rules/kernel-boundary.ts:255`                 | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `a0d0eb977209b737` | `src/rules/kernel-boundary.ts:76`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `a11587b922d9c369` | `src/rules/cell-file-exports-cell-only.ts:171`     | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `a2d8a4215d490375` | `src/rules/kernel-boundary.ts:96`                  | EqualityOperator -> `span[0] > start`                                              | debt: pre-existing on main@ba6664c185 |
| `a32e28f00f8bde24` | `src/rules/medium-owns-no-recovery.ts:49`          | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `a361405a151c6f7f` | `src/rules/sandwich-shell-is-straight-line.ts:71`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `a49ae7bb43338414` | `src/rules/kernel-boundary.ts:152`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ab0b335766547794` | `src/rules/kernel-boundary.ts:286`                 | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `ac14a61a963b6395` | `src/rules/medium-owns-no-recovery.ts:74`          | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `acd76eb65cdb463e` | `src/rules/kind-file-holds-no-module-state.ts:70`  | EqualityOperator -> `path !== 'make'`                                              | debt: pre-existing on main@ba6664c185 |
| `ae3ef4722c4ffcc1` | `src/rules/handle-exports-guard.ts:16`             | Regex -> `/is[A-Z]/`                                                               | debt: pre-existing on main@ba6664c185 |
| `af2b33969ed0a9da` | `src/rules/kernel-boundary.ts:119`                 | ArrayDeclaration -> `["Stryker was here"]`                                         | debt: pre-existing on main@ba6664c185 |
| `b0a96ec32bac3fe0` | `src/rules/kernel-boundary.ts:30`                  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b0f23611ce197f72` | `src/rules/kernel-boundary.ts:98`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `b138d84ded1ae44c` | `src/rules/kind-file-declares-no-service.ts:31`    | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b3061f51956dfa0c` | `src/rules/kind-file-declares-no-service.ts:66`    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `b40978134e063bfd` | `src/rules/kernel-boundary.ts:286`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `b5e1a343482c9eea` | `src/rules/handle-exports-guard.ts:40`             | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `b68a28b2d563e479` | `src/rules/cell-file-exports-cell-only.ts:53`      | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `b6c42dd3fcfd4a48` | `src/rules/cell-file-exports-cell-only.ts:63`      | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `b8bbffe0d4b1636c` | `src/rules/sandwich-shell-is-straight-line.ts:132` | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `ba2559b8a0beba8c` | `src/rules/ban-unknown.ts:86`                      | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `ba7ede2d0b87ca5a` | `src/rules/module-origin.ts:129`                   | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `bb3ed956879d2b5a` | `src/rules/kernel-boundary.ts:23`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `bb45597a8aa30b52` | `src/rules/kernel-boundary.ts:218`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `bbbd81616469e2af` | `src/rules/kernel-boundary.ts:275`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `bbe5417e532cd2b2` | `src/rules/kind-file-holds-no-module-state.ts:70`  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `bc4445075f1c3338` | `src/rules/handle-exports-guard.ts:39`             | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `bc71ee9d5758cfb2` | `src/rules/ban-classes.ts:65`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `bc9bd530df9c2740` | `src/rules/kernel-boundary.ts:201`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `be2464e5365d5118` | `src/rules/medium-owns-no-recovery.ts:47`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `be24fc1d966461f9` | `src/rules/sandwich-shell-is-straight-line.ts:142` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `bf7bc1ff189b83a9` | `src/rules/kind-file-holds-no-module-state.ts:70`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `bfed6cf9e33da1c0` | `src/rules/kernel-boundary.ts:30`                  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c0d4a30e9d2ffb9f` | `src/rules/kind-file-holds-no-module-state.ts:88`  | EqualityOperator -> `rootIdentifierOf(node.argument) !== candidate`                | debt: pre-existing on main@ba6664c185 |
| `c309d91a3dba1760` | `src/rules/kind-file-holds-no-module-state.ts:70`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c441cf90aa294dd7` | `src/rules/kernel-boundary.ts:211`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `c6eb819cf92fd1d9` | `src/rules/kind-record-minted-by-kind.ts:24`       | EqualityOperator -> `staticNameOf(key.property) !== 'TypeId'`                      | debt: pre-existing on main@ba6664c185 |
| `c7eb6a1437ff771c` | `src/rules/module-origin.ts:85`                    | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `c820aa6d579a21b4` | `src/rules/cell-file-exports-cell-only.ts:78`      | EqualityOperator -> `specifier.importKind !== 'type'`                              | debt: pre-existing on main@ba6664c185 |
| `c91fc5e72ce67ec0` | `src/rules/kernel-boundary.ts:215`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ca93adccb9bb6356` | `src/rules/cell-file-exports-cell-only.ts:76`      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `cb4892c576b58748` | `src/rules/cell-file-exports-cell-only.ts:170`     | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `cc17337c20a7bf0d` | `src/rules/kernel-boundary.ts:200`                 | ArithmeticOperator -> `depth - 1`                                                  | debt: pre-existing on main@ba6664c185 |
| `cc95a9c67f6df7f2` | `src/rules/kernel-boundary.ts:199`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ce46f81b8c427dbe` | `src/rules/cell-file-exports-cell-only.ts:122`     | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `cfb2e9e85c2dea68` | `src/rules/cell-file-exports-cell-only.ts:78`      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d1a040125de0ca35` | `src/rules/kernel-boundary.ts:364`                 | EqualityOperator -> `sequence.length == 2`                                         | debt: pre-existing on main@ba6664c185 |
| `d32b9794a1089bdc` | `src/rules/cell-file-exports-cell-only.ts:77`      | LogicalOperator -> `statement.importKind === 'type' && (specifier.type === 'I...`  | debt: pre-existing on main@ba6664c185 |
| `d5011a637cdd69c4` | `src/rules/kernel-boundary.ts:167`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `d60c322c889c02e4` | `src/rules/handle-definition-stays-private.ts:25`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `d66330aebf485ea3` | `src/rules/kind-file-holds-no-module-state.ts:88`  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `d675cb3cf5497241` | `src/rules/kind-record-minted-by-kind.ts:24`       | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `d6970733f44101aa` | `src/rules/kind-file-holds-no-module-state.ts:72`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d6fdbca84a0e3821` | `src/rules/kernel-boundary.ts:286`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `d7971171a3e6103c` | `src/rules/module-origin.ts:109`                   | EqualityOperator -> `hop <= 8`                                                     | debt: pre-existing on main@ba6664c185 |
| `d7b8fac3e22beb60` | `src/rules/medium-owns-no-recovery.ts:50`          | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `dacc198bbf963f75` | `src/rules/cell-file-exports-cell-only.ts:87`      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `dad3479073cfb61d` | `src/rules/internal-jsdoc.ts:5`                    | Regex -> `/^\s*\*?\s@Internal\b/im`                                                | debt: pre-existing on main@ba6664c185 |
| `db9bf4d4e9429252` | `src/rules/sandwich-shell-is-straight-line.ts:97`  | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `dbfa90eaccbbd95d` | `src/rules/kind-file-holds-no-module-state.ts:88`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `dc18dd14b152b9b9` | `src/rules/sandwich-shell-is-straight-line.ts:127` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `dcfcc2e3ac2a890d` | `src/rules/kernel-boundary.ts:98`                  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `de792439092b145c` | `src/rules/kind-file-declares-no-service.ts:28`    | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e03c6b274429d797` | `src/rules/module-origin.ts:127`                   | EqualityOperator -> `base.members.length !== 0`                                    | debt: pre-existing on main@ba6664c185 |
| `e0f10fe84f3ae096` | `src/rules/kind-file-holds-no-module-state.ts:143` | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e0fa50da745b559b` | `src/rules/kernel-boundary.ts:80`                  | ArrayDeclaration -> `["Stryker was here"]`                                         | debt: pre-existing on main@ba6664c185 |
| `e16b58d1b0dcdfae` | `src/rules/kernel-boundary.ts:274`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e2b6540e8d69602a` | `src/rules/ban-unknown.ts:32`                      | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e4063aaa18e68291` | `src/rules/medium-owns-no-recovery.ts:74`          | EqualityOperator -> `node.type !== 'Identifier'`                                   | debt: pre-existing on main@ba6664c185 |
| `e41264f70b3108bd` | `src/rules/kernel-boundary.ts:249`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e4196782f23dfdf1` | `src/rules/sandwich-shell-is-straight-line.ts:139` | BooleanLiteral -> `true`                                                           | debt: pre-existing on main@ba6664c185 |
| `e431f672d2d2d6e0` | `src/rules/cell-file-exports-cell-only.ts:118`     | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `e45e75ff3874dded` | `src/rules/kernel-boundary.ts:275`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e58d6f98d720e867` | `src/rules/handle-exports-guard.ts:47`             | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e5cbf73bdbe00f3e` | `src/rules/kind-file-holds-no-module-state.ts:92`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `e636a895db242d33` | `src/rules/cell-file-exports-cell-only.ts:56`      | ConditionalExpression -> `(span removed)`                                          | debt: pre-existing on main@ba6664c185 |
| `e84bb7531e0d71f0` | `src/rules/kind-file.ts:29`                        | MethodExpression -> `filename.startsWith(TYPE_TEST_SUFFIX)`                        | debt: pre-existing on main@ba6664c185 |
| `e9d90003975d7f59` | `src/rules/kernel-boundary.ts:364`                 | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `e9fc36690167bac8` | `src/rules/kind-file-holds-no-module-state.ts:94`  | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `eb909483535a4e1c` | `src/rules/handle-exports-guard.ts:40`             | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ecc329ab20da0805` | `src/rules/kernel-boundary.ts:381`                 | Regex -> `/(^\|\/)(__tests__\|__fixtures__\|tests\|testResources)\/...`            | debt: pre-existing on main@ba6664c185 |
| `ed18c35aa4b9e93f` | `src/rules/kernel-boundary.ts:358`                 | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ed4cd3ea1c4c8a2e` | `src/rules/internal-jsdoc.ts:4`                    | Regex -> `/^\S*\*?\s*@internal\b/m`                                                | debt: pre-existing on main@ba6664c185 |
| `ed945fb066445563` | `src/rules/kind-file-holds-no-module-state.ts:154` | StringLiteral -> `''`                                                              | debt: pre-existing on main@ba6664c185 |
| `edeb6545c338f0fc` | `src/rules/kind-file-holds-no-module-state.ts:73`  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `f083acf25ebf5869` | `src/rules/kind-file-declares-no-service.ts:64`    | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `f243954c4e287042` | `src/rules/internal-jsdoc.ts:5`                    | Regex -> `/^\s*\*\s*@Internal\b/im`                                                | debt: pre-existing on main@ba6664c185 |
| `f4625d0a7bacf065` | `src/rules/sandwich-shell-is-straight-line.ts:68`  | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `f46fb521c20d2b56` | `src/rules/cell-file-exports-cell-only.ts:122`     | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `f4ded5f18ee17b17` | `src/rules/module-scope.ts:10`                     | ConditionalExpression -> `true`                                                    | debt: pre-existing on main@ba6664c185 |
| `f5b45b87a215631e` | `src/rules/kind-file-holds-no-module-state.ts:73`  | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `f706a739544f3033` | `src/rules/kernel-boundary.ts:76`                  | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `f829b8df427d6bb8` | `src/rules/internal-jsdoc.ts:5`                    | Regex -> `/^\S*\*?\s*@Internal\b/im`                                               | debt: pre-existing on main@ba6664c185 |
| `f9202ae5b89fa096` | `src/rules/module-origin.ts:117`                   | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `faf0d18a20ab6079` | `src/rules/medium-owns-no-recovery.ts:47`          | BooleanLiteral -> `false`                                                          | debt: pre-existing on main@ba6664c185 |
| `fc561a652276dd5d` | `src/rules/kernel-boundary.ts:76`                  | StringLiteral -> `""`                                                              | debt: pre-existing on main@ba6664c185 |
| `fdcd5b1d7ebcec9c` | `src/rules/ban-unknown.ts:45`                      | BlockStatement -> `{}`                                                             | debt: pre-existing on main@ba6664c185 |
| `ff5625e36c244128` | `src/rules/medium-owns-no-recovery.ts:70`          | ConditionalExpression -> `false`                                                   | debt: pre-existing on main@ba6664c185 |
| `ffdcff0bfe6ae1b9` | `src/rules/sandwich-shell-is-straight-line.ts:132` | EqualityOperator -> `node.operator !== '\|\|'`                                     | debt: pre-existing on main@ba6664c185 |
