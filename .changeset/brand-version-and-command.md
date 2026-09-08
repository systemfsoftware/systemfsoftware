---
"@systemfsoftware/npm-package": major
"@systemfsoftware/omp-claude-compat": major
---

Tarball version and hook command strings are branded non-empty. A bare or empty string in those positions no longer type-checks; decode through the brand.

BREAKING CHANGE: version and command fields that were string are now branded.
