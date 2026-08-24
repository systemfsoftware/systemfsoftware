---
"@systemfsoftware/stryker-js-mutation-run": patch
---

A run no longer hangs before testing any mutant.

Two defects in the worker protocol between the engine and its child processes
each stalled a run indefinitely, with no error and no progress:

- A reply carrying no value — the answer from any operation that returns
  nothing — was rejected and discarded, so the call it answered waited forever.
- Two replies arriving close together could erase one another's pending call, so
  the second answer had nowhere to go and that operation never finished.

Either one stopped a run after the dry run, reporting no total and no progress
until it was interrupted. Runs now proceed to a score, and no worker process is
left behind afterwards.
