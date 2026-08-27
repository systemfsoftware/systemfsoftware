---
"@systemfsoftware/omp-claude-compat": major
---

Removed the "./api" and "./inject" subpath exports. The plugin still loads from its main entry; update imports that used the removed subpaths to import from the main entry instead.
