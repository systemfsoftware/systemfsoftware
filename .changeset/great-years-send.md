---
"@systemfsoftware/omp-claude-compat": major
---

The hook verdict is now a branded tagged union: Block carries the exit code and stdout alongside its reason, Allow carries the updated input, Warning carries the message with its code and stdout; the admit and settings decisions are plain functions in their owning modules
