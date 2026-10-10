---
"@systemfsoftware/upstream-manifest": patch
---

`GitLive` is removed; the real `git` adapter is now `Git.layer`, a static member of the `Git` service, built from `Git.make`. Provide `Git.layer` with a `ChildProcessSpawner` wherever you provided `GitLive`.
