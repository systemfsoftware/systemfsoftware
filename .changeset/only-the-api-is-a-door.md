---
"@systemfsoftware/stryker-js-html-reporter": major
"@systemfsoftware/stryker-js-engine": major
---

Five entry points that were never API are gone. Each existed because another
package in this project found the code convenient, not because it was a surface
anyone should depend on.

What is left is documented: an entry point is a name you may import and we may
not move without a major, and everything else is internal whatever file it sits
in.
