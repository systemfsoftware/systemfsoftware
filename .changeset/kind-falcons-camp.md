---
"@systemfsoftware/effect-daemon-process": minor
---

A started process's `ready` fails with `Supervisor.Medium.ChildEndedBeforeReady` when the process exits before it writes its ready line, instead of waiting forever.
