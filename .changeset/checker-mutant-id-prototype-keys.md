---
"@systemfsoftware/stryker-js-typescript-checker": patch
---

Mutant checks no longer misread ids that collide with built-in object property names. A mutant whose id matches an inherited object member (for example `toString`) previously crashed the check result with a type error instead of reporting a verdict; every mutant now reports its own status regardless of id.
