---
'@systemfsoftware/stryker-js-instrumenter': patch
---

Instrumenting a file that calls a method named after an `Object.prototype`
member - `toString`, `valueOf`, `constructor` and the rest - no longer fails
with `Property name expected type of string but got function`. The method
mutator's replacement table answered such a lookup with the inherited function
rather than reporting no replacement, and a single `.toString()` call was enough
to stop the run. Those methods are now left alone, as they always should have
been.
