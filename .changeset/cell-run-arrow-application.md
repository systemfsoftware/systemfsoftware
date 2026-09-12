---
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-engine": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/effect-daemon-spec": none
---

Cells are applied with arrow application (`cell.run(input)`) now that the alias is gone from `@systemfsoftware/effect-cell-types`, and the CLI contract setup builds its runtime lazily on first use. Nothing a consumer can observe moved: the exported names, the declarations, and the behaviour are identical.
