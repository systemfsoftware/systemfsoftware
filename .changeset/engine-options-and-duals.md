---
"@systemfsoftware/stryker-js-engine": major
---

Six exported functions now take a single options object instead of four
or more positional arguments, and the two runner adapters are dual —
callable data-first or threaded through pipe.

BREAKING CHANGE: calls to these exports must pass the new options
object; the curried-only adapter calls must switch to the dual form.
