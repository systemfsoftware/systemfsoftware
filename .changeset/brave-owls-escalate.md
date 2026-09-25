---
"@systemfsoftware/effect-daemon-spec": major
---

A supervisor that exhausts its restart intensity now stops every child and then fails `Supervisor.awaitTerminated` and `Supervisor.shutdown` with `Supervisor.SupervisorTerminated`. The error's `cause` is the failure of the child that exhausted it. A supervisor running as another supervisor's child ends abnormally when it gives up, so its parent counts it against its own intensity and escalation reaches the top-level owner. A requested shutdown, and a supervisor with `coolDown` declared, still succeed.
