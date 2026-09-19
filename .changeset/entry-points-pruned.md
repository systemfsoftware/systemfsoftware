---
"@systemfsoftware/stryker-js": patch
---

The entry points below the package root that pointed at modules this package does not contain are gone from the manifest, and the surviving entry point now names its type declarations explicitly. No import that previously resolved has stopped resolving.
