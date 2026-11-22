---
"@systemfsoftware/oxlint-plugin-test-discipline": patch
---

`no-inline-suppression` no longer scans the repository's vendored `repos/` tree: that code is read-only and owned by another project.
