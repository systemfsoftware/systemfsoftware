---
"@systemfsoftware/omp-agent-discipline": major
---

Removed the "./api" subpath export. The plugin still loads from its main entry; update imports that used the removed subpath to import from the main entry instead.
