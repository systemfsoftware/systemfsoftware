---
'@systemfsoftware/stryker-js-cli': patch
---

Asking for a run addressed to a person now gets prose. Every stage, the plan and the closing verdict were written as machine lines whatever the mode, so a reader got a stream of JSON and the count of files being mutated was reported to nobody at all.

A run addressed to a person reports how many of its files it is about to mutate and writes no machine lines; a run addressed to a program is unchanged.
