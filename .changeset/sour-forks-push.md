---
"@systemfsoftware/vitest": patch
---

A check whose matcher returns a promise — `toMatchScreenshot`, or an async matcher registered with `expect.extend` — now holds its step until the promise settles. A rejection fails the test that yielded the check, carrying the line that wrote it, instead of passing that test and surfacing later as an unhandled error. A written check that is never yielded is still refused.
