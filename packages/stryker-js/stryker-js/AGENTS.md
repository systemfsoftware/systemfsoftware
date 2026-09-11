# AGENTS.md — `@systemfsoftware/stryker-js`

The plugin ABI: one effect-free module per abstraction, no platform, zero dependencies. Parent: `packages/stryker-js/AGENTS.md`.

## Modules

| Module            | Abstraction                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `./Plugin`        | `declarePlugin`, the six-kind contribution union, the pure fold, `PluginModule`             |
| `./Plugin.schema` | `StandardSchemaV1`, the kind alphabet, declaration / shadow / module schemas                |
| `./Mutant`        | Mutant, test-plan, coverage and instrumenter-constant vocabulary                            |
| `./Checker`       | Checker factory: `init?`, `check?`, `group?`                                                |
| `./TestRunner`    | TestRunner factory: `init?`, `dispose?`, `capabilities?`, `dryRun?`, `mutantRun?`           |
| `./Reporter`      | Reporter factory over a `ReporterEvent` async iterable (absorbs `ReporterEvent`)            |
| `./Ignorer`       | Ignorer factory: `(node, context) => string \| null`                                        |
| `./Evaluator`     | Evaluator factory: `(report, options) => ExitClass \| null`, async allowed                  |
| `./Parser`        | Parser factory returning `{ extensions, parse(input, fileName) }` — plain data, synchronous |
| `./Report`        | Mutation report and metrics vocabulary (absorbs `Metrics`)                                  |
| `./Options`       | The option set and `PluginInit` (absorbs `output-file`, `provided-options`)                 |
| `./ExitClass`     | Exit classes, the verdict fold and the classified decision                                  |

## Rules

| ID        | Rule                                                                                                                                                                                                  | Gate                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **ABI-1** | Every kind is declared through `declarePlugin` as plain data plus a plain factory; no kind contributes an Effect `Layer` or `Context.Service` (CONST-B1).                                             | `review`                                                              |
| **ABI-2** | No exported type or value names `Effect`, `Layer`, `Context`, `Option` or `HashMap`; `effect` is a devDependency compiled into `dist`, and every exported codec is a plain `StandardSchemaV1` object. | `pnpm --filter @systemfsoftware/stryker-js typecheck`                 |
| **ABI-3** | `package.json` declares no `dependencies`, no `peerDependencies` and no `optionalDependencies`; a plugin author installs this package alone.                                                          | `pnpm --filter @systemfsoftware/stryker-js attw`                      |
| **ABI-4** | Public specifiers are enumerated in `tsdown.config.ts` (REPO-S4): the eleven abstraction modules plus `index` and `Plugin.schema`.                                                                    | `pnpm --filter @systemfsoftware/stryker-js build` regenerates cleanly |
| **ABI-5** | A schema declaration lives in the `*.schema.ts` beside the abstraction it serves and is re-exported by that abstraction module.                                                                       | `pnpm --filter @systemfsoftware/stryker-js lint`                      |
| **ABI-6** | The fold is pure: a later contribution of the same kind and name wins, and every displacement is recorded as a `Shadowing`.                                                                           | `pnpm --filter @systemfsoftware/stryker-js test`                      |
| **ABI-7** | Factory shape changes bump the package major; the published lexicon (`Ignore` → `Ignorer`, one module per abstraction) is the ABI, not a suggestion.                                                  | `review`                                                              |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js build
pnpm --filter @systemfsoftware/stryker-js typecheck
pnpm --filter @systemfsoftware/stryker-js test
pnpm --filter @systemfsoftware/stryker-js lint
pnpm --filter @systemfsoftware/stryker-js attw
```
