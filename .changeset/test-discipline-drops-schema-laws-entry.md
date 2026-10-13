---
"@systemfsoftware/oxlint-plugin-test-discipline": major
---

`no-test-file-in-src` no longer sanctions the test file that the `@systemfsoftware/effect-schema-vite` plugin generated: a package that still has one gets the same report as for any other unsanctioned test file in its source directory. Its message for schema test files, and the messages of `prop-generated-law-duplicate`, no longer cite generated schema laws.
