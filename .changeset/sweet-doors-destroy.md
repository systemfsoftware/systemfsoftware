---
"@systemfsoftware/vitest": minor
---

A failing test now reports one failure record instead of a raw cause: the error with its message, the first source line outside the spec libraries, the steps that ran and the cell decisions each caused, and a rerun command for that one scenario. A replay value is printed only for a run a seed or a property chose. Each failure prints once; other errors in the same cause are logged. A failed `expect` points at the line that called it and a property failure at the line that declared it. A new `@systemfsoftware/vitest/failure` entry exports the renderer and recorder for libraries that raise their own failures.
