---
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-platform-node": patch
---

A mutation run that is killed mid-way keeps every completed mutant: the JSONL progress stream is flushed after each result, and incremental mode writes remembered verdicts as they finish so the next run continues instead of starting over.

Remembered killed mutants still name the tests that killed them, so a resumed run's report matches a complete run.
