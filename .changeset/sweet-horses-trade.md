---
"@systemfsoftware/effect-gherkin-spec": minor
---

`Then`, `And` and `But` bodies take `(state, expect)` and return exactly one check (or an Effect of one); `expect` is no longer imported from `@effect/vitest`. Only `Given` and `When` open a new observed state, so a `Then` followed by an `And` or `But` on the same state is refused: merge the facts into one `Then` over a record. `Then.soft`, `Then.poll` and `When.poll`, with their `And`/`But` forms, are removed, as are `checkSoftFailures`, `owned` and `recordAssertion`. A background pipeline may carry the check service.
