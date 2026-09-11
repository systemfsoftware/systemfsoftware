---
"@systemfsoftware/stryker-plugins": major
---

Each ignorer is contributed as a plain factory, and the package no longer requires `effect` — it is not a dependency. The `typescript` peer dependency is gone: this package never needed it.

The ignorer names you select in `ignorers` are unchanged, so your configuration keeps working as written.
