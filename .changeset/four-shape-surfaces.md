---
"@systemfsoftware/stryker-js": major
"@systemfsoftware/stryker-js-engine": major
---

The published surfaces now carry only the four vocabulary shapes — cells,
schemas, tagged data, and ports — plus the binding layers a composition root
merges. Every free helper function and free constant is gone; configuration
reading is a provided port, the verdict document is built through its own
affordance, and the run identity carries the framework version.

BREAKING CHANGE: code that imported the removed names must inline its own
copy or read the value from the configuration port, the run identity, or the
envelope affordance instead. The engine's provided layer must now be seeded
with the framework version.
