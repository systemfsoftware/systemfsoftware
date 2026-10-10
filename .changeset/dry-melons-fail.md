---
"@systemfsoftware/vitest": minor
---

Library frames are matched by each spec library's resolved package root, so a failure inside a relocated copy (a Stryker sandbox) still leads with the author's line instead of the library's own call site.

`@systemfsoftware/vitest/failure` exports `workspaceRelativePathOf(moduleUrl)`, which prints a module's path the way failure records print it: relative to the provided workspace root, or absolute when none is provided.
