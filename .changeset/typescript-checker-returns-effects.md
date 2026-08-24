---
"@systemfsoftware/stryker-js-typescript-checker": major
---

The TypeScript compiler's methods return Effects instead of Promises, and the
compiler is acquired for the length of the check. An interrupted check now
releases the compiler instead of leaving it alive with the run's state still in
it.

Compiler failures are now a single tagged `CompilerFailed` error carrying a
`reason` — the compiler used before initialization, no projects found for the
tsconfig, an unknown file in the graph, or a project file missing from disk.
They were untagged `Error`s before, so anything catching them saw one
indistinguishable type.

Diagnostics and `tsconfig` resolution are unchanged.
