# @systemfsoftware/stryker-test-contribution

Evaluator plugin (root Surface Classes: Evaluator). The pure decision is `src/test-contribution.ts`.

## Rules

| ID      | Rule                                                                                                                                                               | Gate                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **TC1** | A failing gate returns `ExitClass.VerdictFail` on the SUCCESS channel; a passing gate returns `null`; `EvaluatorFailed` is only for the evaluator itself breaking. | `pnpm --filter @systemfsoftware/stryker-test-contribution test` |
| **TC2** | Listing the plugin module activates it; never import it from the engine or CLI packages.                                                                           | `review`                                                        |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-test-contribution typecheck
pnpm --filter @systemfsoftware/stryker-test-contribution test
pnpm --filter @systemfsoftware/stryker-test-contribution lint
```
