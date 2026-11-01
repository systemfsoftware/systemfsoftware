# @systemfsoftware/omp-typescript-discipline@1.1.0

No change a consumer can observe. `tsconfigs` now interrupts the write that breaks the tsconfig boundary instead of reminding after it lands. Both it and the `solution-problem-type-enum` project rule pin `interruptMode: tool-only`, so the abort holds even when the consumer sets `ttsr.interruptMode: never`. The `no-hand-rolled-std` rule is removed: its conditions matched most TypeScript. turbo moved 2.11.8 -> 2.11.10
