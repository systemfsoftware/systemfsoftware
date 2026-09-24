---
"@systemfsoftware/effect-daemon-process": minor
---

First release. `ProcessMedium` supervises operating-system child processes as children of an `effect-daemon-spec` supervisor: bind it with `ProcessMedium.layer` and declare children with `Supervisor.ChildSpecs.on(ProcessMedium.port)`. A child is ready when its declared readiness line appears, its exit code and terminating signal are reported as observed, and a graceful stop sends `SIGTERM` before forcing `SIGKILL`.
