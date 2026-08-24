---
"@systemfsoftware/stryker-js-mutation-report": major
---

Reporters are constructed by a factory and provided as a layer.

The exported reporter classes are gone. Replace each `new` with the matching
factory — `makeClearTextReporter`, `makeHtmlReporter`, `makeJsonReporter`,
`makeProgressBarReporter`, `makeProgressStreamReporter`.

Each factory takes the reporter's own options rather than an injected container,
and each operation returns an `Effect`. If you registered a reporter as a plugin,
declare it with `declarePlugin` and hand over a layer that provides `Reporter`.

`drawClearTextScoreTable` is now exported for anyone rendering the score table
outside a reporter.
