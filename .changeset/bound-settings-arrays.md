---
"@systemfsoftware/omp-claude-compat": major
---

Settings parsing now enforces size limits the domain always implied: at most eight settings sources per merge, at most three matcher blocks per hook group, and at most three hooks per matcher block. Files beyond those limits are rejected instead of accepted.
