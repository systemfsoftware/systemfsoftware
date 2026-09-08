---
"@systemfsoftware/arethetypeswrong": major
"@systemfsoftware/arethetypeswrong-cli": major
---

A tarball is no longer identified by a URL string whose scheme switched meaning. PackageStoreTarballRef now carries a tagged tarball source: registry with a url, or local with a FilePath. fetchTarball takes that source; a local source on the live registry store fails. FilePath is exported as a non-empty branded string.

The CLI writes analysis through the platform terminal. A failed write fails the command. Pass-through filesystem, terminal, and stdin wrappers are gone; the process uses the platform services.

BREAKING CHANGE: tarballUrl is removed. Construct tarball as { kind: 'registry', url } or { kind: 'local', path }.
