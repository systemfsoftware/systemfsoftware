---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Enable `no-pseudo-gherkin-unit-tests` in the recommended rule set: every `*.integration.test.ts` Feature builder must declare its collaborator environment with `.withLayer(...)` or `.withScenarioLayer(...)`. The diagnostic now names `Layer.empty` as the remedy for features whose collaborators are in memory.
