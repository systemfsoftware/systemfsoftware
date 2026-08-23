---
'@systemfsoftware/omp-agent-discipline': minor
'@systemfsoftware/omp-claude-compat': minor
---

The packages now publish an `/api` entry with the named handlers and constants that tests and other in-process callers import. The host entry stays the default export only, so startup still pays only for registration.
