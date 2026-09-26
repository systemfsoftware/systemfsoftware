---
"@systemfsoftware/effect-daemon-process": patch
---

A started process's `ready` ends when the process exits before it writes its ready line, or when the ready watcher is stopped, instead of waiting forever.
