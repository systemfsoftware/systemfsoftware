---
'@systemfsoftware/all': patch
---

Drops the dependency on `@systemfsoftware/effect-purity-law`, a member that was never published, from the umbrella's dependency set. Installing the umbrella no longer tries to resolve a package that does not exist on the registry.
