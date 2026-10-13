---
"@systemfsoftware/effect-daemon-spec": patch
---

A timer elapsed event now reaches the owner its target names, whatever a child is called:

- A child whose id is the empty string now restarts after its backoff timer elapses; its timer was previously taken for the supervisor's own and ignored.
- A supervisor timer that elapses while the supervisor is running is now stale; it was previously handed to the running child whose id is the empty string.
