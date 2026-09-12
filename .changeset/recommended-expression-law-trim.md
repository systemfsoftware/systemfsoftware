---
'@systemfsoftware/oxlint-plugin-recommended': minor
---

`no-ternary` and `typescript/switch-exhaustiveness-check` are no longer part of the recommended tier. They are expression law, not law-independent defects: the strict canonical preset (`@systemfsoftware/oxlint-preset`) declares them directly. If you extend only this package and want them back, set them in your own config.
