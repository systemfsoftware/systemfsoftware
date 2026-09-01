---
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-engine": patch
---

A failed run now says what failed.

Every stage failure previously reported an empty message, so a run that could
not start your test runner, could not read your config, or found no tests exited
non-zero and told you nothing. The reported error now names the failure and the
one beneath it, down to the fault that actually happened — including a failure
raised inside a worker process, whose description used to be replaced with a
fixed string before it reached you.
