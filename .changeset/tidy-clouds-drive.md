---
"@systemfsoftware/effect-daemon-socket": minor
---

A started socket child's `ready` fails with `Supervisor.Medium.ChildEndedBeforeReady` when its connection ends before the child answers as ready, instead of waiting forever.
