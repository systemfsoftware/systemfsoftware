---
"@systemfsoftware/vitest": minor
---

Add a stricter Effect test runner, installed in place of upstream. Each test builds its layers fresh and runs twice when it passes; a different second result fails as `LeakedState`. `describe` and `layer` blocks run concurrently; `layer(L, { shared: true })` shares one build. Effect bodies run on virtual time. `expect` is soft within one step and stops the test at the next; `toEqual` uses Effect `Equal`. Boolean and presence assertions, `async` bodies, hooks and assertion-free tests fail with the rewrite as their message, exported from the `refusals` subpath. `it.prop` takes `{ of, subject, runs? }`; `runs` merges over the runner's configured draw count (30/1000/100 per tier), a non-positive one failing as `InvalidBudget`. A file whose properties never refute a constant stand-in fails `VacuousProperty`; `it.law.*` adds common laws. The `utils` equality helpers no longer take a message.
