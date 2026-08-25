---
"@systemfsoftware/stryker-js-mutation-run": major
---

A run hands back its verdict alongside the results instead of the results alone.
If you only read the results, take the `results` field; a caller supplying its
own mutation-test stage returns both.

The failure identities a caller can catch — the three config-read failures, a
stage failure, a crashed or out-of-memory worker, and the generic run error — now
have an entry point of their own rather than arriving through the one that
resolves configuration.
