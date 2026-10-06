---
"@systemfsoftware/vitest": patch
---

The file-end property judgement and the raw-`it` guard no longer run under Vitest's hook deadline. Both are synchronous, so the deadline could never stop them hanging; it only failed a file or a test with "Hook timed out in 10000ms" when a busy host stalled the worker, while every test passed.
