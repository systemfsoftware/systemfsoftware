---
"@systemfsoftware/effect-memfs": patch
---

Path-level writes, moves and deletes on the in-memory filesystem now apply before the calling effect continues, and folder watchers hear the change in that same step instead of on a later host microtask. Reads and open-file handles behave as before.
