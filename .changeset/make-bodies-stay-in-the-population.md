---
'@systemfsoftware/stryker-js-instrumenter': patch
'@systemfsoftware/stryker-plugins': patch
---

Selecting `workflow-make-boundary` keeps mutants inside `Workflow.make` decision bodies.

Ignore plugins are asked about each mutant, not about the file root with a subtree latch. An inverted selector that answers "ignore" for everything outside a make body therefore no longer ignores the make body itself. Inner mutants of declaration-style ignore plugins (`effect-schema-declarations`, Angular signal option objects) are still ignored.
