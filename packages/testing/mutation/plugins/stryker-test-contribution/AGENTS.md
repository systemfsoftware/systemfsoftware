# @systemfsoftware/stryker-test-contribution

Evaluator plugin. The pure decision is `src/test-contribution.ts`. Listing the plugin module activates it. It returns `ExitClass.VerdictFail` from `@systemfsoftware/stryker-js-plugin-api/evaluate` on the success channel when the gate fails and `null` when it passes; `EvaluatorFailed` is only for the evaluator itself breaking. Do not import this package from `mutation-run`.
