---
"@systemfsoftware/stryker-js": minor
"@systemfsoftware/stryker-js-engine": major
"@systemfsoftware/stryker-js-instrumenter": major
"@systemfsoftware/stryker-js-typescript-checker": major
"@systemfsoftware/stryker-js-cli": major
"@systemfsoftware/stryker-js-vitest-runner": major
---

Directory paths, file names, mutant ids, and shell commands on the published schemas are now branded non-empty strings. Passing a bare string into those fields no longer type-checks; decode through the brand (empty values refuse).

A new DirectoryPath brand is exported next to FileName and MutantId.

BREAKING CHANGE: schema fields that were string are now branded. Construct them via the brand, not a literal.
