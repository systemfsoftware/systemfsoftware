---
"@systemfsoftware/effect-daemon-spec": minor
---

`Supervisor.classifyChildExit` is now exported. It takes a `Supervisor.ClassifyChildExit` command (a `stopping` flag and the child's `Exit`) and returns `Normal`, `Shutdown` or `Abnormal`. A stop requested by the supervisor, or an exit caused only by interruption, classifies as `Shutdown`. The fiber, cluster and socket media all use this rule to classify their children's exits.
