---
"@systemfsoftware/vitest": patch
---

Library frames are matched by each spec library's resolved package root, so a failure inside a relocated copy (a Stryker sandbox) still leads with the author's line instead of the library's own call site.
