---
"@systemfsoftware/stryker-js-platform-node": minor
---

Configured checkers now type-check mutants in the groups the checker returns, instead of checking the whole remaining set at once.

Compile-error mutants are still reported as compile errors.

The package now exports `checkGroupedPlans` and the `CheckerResourceService` type for that grouped check phase.
