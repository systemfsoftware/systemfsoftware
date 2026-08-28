## 3.0.0

### Major Changes

- Scenario titles are now enforced as prose at the type level: `scenario` and `scenarioOutline` reject any title that either starts with "Should" (the `Should_[Behavior]_When_[Condition]` unit-test naming convention) or lacks an ASCII space between words (every concatenated-token shape — PascalCase, snake_case, CamelCase — that reads as a unit-test name rather than prose). A rejected title fails to type-check with the rule in the diagnostic. Titles that are not string literals are unaffected.
