---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

New rule `no-effect-in-sync-prop`, enabled at `error` in the recommended config: it flags `it.prop` / `test.prop` whose predicate returns an Effect. The synchronous `prop` never runs that Effect and treats it as true, so the property passes without checking anything. Use `it.effect.prop` instead.
