---
"@systemfsoftware/effect-e2e": minor
---

Add the `./agent` entry: `act` drives an agent toward a natural-language goal. It replays a recorded flow first and hands off to the model when a recorded control changed, then asks the model for one action at a time within `maxSteps`, `maxModelCalls` and `timeout` (`STEP_BUDGET_EXHAUSTED`, `STEP_TIMEOUT`). It returns an `ActResult` with the summary, cache decision, model-call count and committed actions, and reports each action to `onAction` with source `model` or `replay`. `SecretLedger` fills a `Secret` param by name, keeps its value out of every model request, log, trace and recording, and refuses a screenshot after a secret fill with `POLICY_DENIED`.
