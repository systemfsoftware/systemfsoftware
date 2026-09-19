---
"@systemfsoftware/stryker-js": patch
---

The sixteen entry points below the package root that advertised modules this package never shipped are gone from the manifest, and the surviving entry point now names its type declarations explicitly. The 4.0.0 release notes already announced this removal; the published manifest had still listed the subpaths. Nothing that previously resolved has stopped resolving, because none of the sixteen entries ever pointed at a file the package contained.
