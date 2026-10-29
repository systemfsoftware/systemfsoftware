---
"@systemfsoftware/storybook-gherkin": major
"@systemfsoftware/vitest": major
---

`DuplicateCapture` and `OutlineDuplicateRowName` (storybook-gherkin) and `SelfModelLaw` (vitest) no longer carry a payload field called `name`, which shadowed the error's own `name`. Read `capture` on `DuplicateCapture`, `row` on `OutlineDuplicateRowName` and `law` on `SelfModelLaw`. Their classes also carry a nominal brand in their type, so an object literal with the same fields no longer satisfies the instance type.
