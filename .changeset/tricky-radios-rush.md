---
"@systemfsoftware/oxlint-plugin-test-placement": minor
---

Adds no-hand-assertive-test-outside-src to the recommended preset - a test file under tests/ must call a snapshot matcher or be the generated surface.snapshot.test.ts - and permits that generated basename through the tests/ suffix rules.
