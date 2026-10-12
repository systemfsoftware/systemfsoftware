---
"@systemfsoftware/effect-daemon-spec": patch
---

A child whose id is the empty string now restarts after its backoff timer elapses; its timer was previously taken for the supervisor's own and ignored.
