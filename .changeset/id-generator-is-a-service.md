---
"@systemfsoftware/stryker-js-mutation-run": major
---

`IdGeneratorService` is removed. The identifier generator is now the
`IdGenerator` service with its own layer, so a caller asks for the service
rather than importing a tag from the module that composes the run.

Dry-run results are no longer edited in place: a test's reported file name is
rewritten into a new value, so the object you passed in comes back unchanged.
