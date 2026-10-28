---
"@systemfsoftware/omp-typescript-discipline": minor
---

`tsconfigs` now interrupts the write that breaks the tsconfig boundary instead of reminding after it lands. Both it and the `solution-problem-type-enum` project rule pin `interruptMode: tool-only`, so the abort holds even when the consumer sets `ttsr.interruptMode: never`. The `no-hand-rolled-std` rule is removed: its conditions matched most TypeScript.
