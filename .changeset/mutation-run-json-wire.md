---
'@systemfsoftware/stryker-js-mutation-run': patch
---

The worker protocol now describes its payloads as JSON values rather than as
unknown ones, so the sending side and the receiving side agree about what can
cross between the runner and its child processes. A method that returns nothing
reports that as `null`, and a value that cannot be serialised is now rejected
where it was produced, naming the value, instead of arriving on the other side as
something quietly different. A reply a process cannot read is reported as a
failure of that child rather than raised as an unhandled error.
