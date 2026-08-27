---
'@systemfsoftware/stryker-js-platform-node': patch
---

A failed initial test run now names the tests that failed.

The dry run used to stop at a count: "There were failed tests in the initial test
run." A run that fails now lists up to five of the failing tests with their
names, ids, and first error line, so the cause of the failure is in the message
you already read instead of a report that was never written.
