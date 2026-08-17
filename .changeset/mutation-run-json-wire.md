---
'@systemfsoftware/stryker-js-mutation-run': patch
---

Mutation runs no longer fail during the initial test run when a call argument
carries an optional member set to `undefined`, a class instance, or a date. The
worker protocol now carries the value a caller passes and sends across the wire
whatever the wire can represent, rather than refusing the call. A method that
returns nothing still reports no value, and a reply a process cannot read is still
reported as a failure of that child rather than raised as an unhandled error.
