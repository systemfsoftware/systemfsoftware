---
'@systemfsoftware/stryker-js-mutation-run': patch
---

Config inheritance no longer depends on which module resolver serves the process.

A config that extends a package specifier is resolved relative to the directory of the config file that declared it, and the same chain now produces the same merged options whichever resolver is in play. Previously the outcome could differ between environments for the same files.

Error reporting is unchanged: an inheritance cycle, an `extends` that is not a string, and a parent that cannot be resolved or read each surface the same configuration error as before, naming the same file.
