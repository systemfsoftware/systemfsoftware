# @systemfsoftware/stryker-test-contribution

Evaluator plugin (root Surface Classes: Evaluator). The pure decision is `src/test-contribution.ts`.

The contribution is `declarePlugin('Evaluator', 'contribution-gate', makeContributionGateEvaluator)`: the factory takes the one option the gate reads (`disableBail`) and returns the evaluator `(report) => EvaluatorVerdict`. Every verdict is a returned value — `null` for a clean report, `{ exitClass, message }` otherwise — and the evaluator emits no output of its own; the host renders `message`, whose failure text comes from the ABI's `causeText`/`errorToString` rather than a stringification written here. `@systemfsoftware/stryker-js` is a regular dependency; `effect` is a devDependency compiled into `dist`, never a published peer.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                                                                                                                     | Gate                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **TC1** | A failing gate returns `{ exitClass: 'VerdictFail', message: <the pure verdict's message> }`, a clean report returns `null`, and a report the evaluator cannot judge returns `{ exitClass: 'RuntimeError', message: <the failure's own text, or 'the report could not be read' when the failure carried none> }` — every one a returned value, never a throw across the factory boundary, never a print. | `pnpm --filter @systemfsoftware/stryker-test-contribution test` |
| **TC2** | Listing the plugin module activates it; never import it from the engine or CLI packages.                                                                                                                                                                                                                                                                                                                 | `review`                                                        |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-test-contribution typecheck
pnpm --filter @systemfsoftware/stryker-test-contribution test
pnpm --filter @systemfsoftware/stryker-test-contribution lint
```
