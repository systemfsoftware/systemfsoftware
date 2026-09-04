---
'@systemfsoftware/effect-schema-law': patch
---

Generated schema law suites now draw 25 inputs per property instead of fast-check's default 100. Suites finish faster on constrained runners; both laws still assert round-trip identity and encode stability over their drawn samples.
