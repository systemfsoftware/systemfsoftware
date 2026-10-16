---
"@systemfsoftware/vitest": minor
---

A property whose generator discards too many draws now fails with the new exported PropertyExhausted error (property, discards, budget, replay) instead of a PropertyRefuted carrying no counterexample; exhaustion is not a refutation and records nothing to the seed store
