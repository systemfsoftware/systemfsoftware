---
"@systemfsoftware/stryker-js-platform-node": major
---

Disposing a worker now terminates the whole process group and escalates. The
runner signals the group so a worker's own child processes go with it, waits for
the exit, and sends `SIGKILL` if the worker is still alive two seconds later.
Previously a single `SIGTERM` went to one process id and the runner moved on
after a fixed wait, so a worker that installed a `SIGTERM` handler — or that had
spawned children of its own — outlived the run.

The public export `ChildProcessSpawnerLive` is gone. It was a second, unused
copy of the spawner carrying the old single-signal kill, and nothing could reach
it.
