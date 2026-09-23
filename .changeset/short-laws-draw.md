---
"@systemfsoftware/storybook-gherkin": major
---

`feature` now requires its options argument, and it can be called data-last as `feature(options)(meta)`. `capture`, and the step helpers that took their subject first, gain the same data-last form. Write `feature(meta)` as `feature(meta, {})`.
