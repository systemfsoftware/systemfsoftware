---
'@systemfsoftware/stryker-js': patch
'@systemfsoftware/stryker-js-typescript-checker': patch
"@systemfsoftware/stryker-js-engine": patch
---

An oversized message between the runner and a worker now fails the run with a
reason instead of exhausting memory. Each side of the connection reads frames
up to 16 MiB, which leaves headroom over the largest legitimate payload — a dry
run carrying per-test coverage — and a frame past the limit fails the calls
waiting on it rather than growing until the process dies.
