---
"@systemfsoftware/stryker-js": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
---

Mutant ids that collide with JavaScript prototype keys (`__proto__`, `constructor`, `prototype`) are rejected at decode, and mutant lists whose ids are not unique are rejected at decode.
