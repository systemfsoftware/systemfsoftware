---
"@systemfsoftware/effect-daemon-cluster": patch
---

A started child's `ready` ends when the child exits before it signals, instead of waiting forever.
