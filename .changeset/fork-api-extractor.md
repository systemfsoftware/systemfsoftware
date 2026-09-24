---
"@systemfsoftware/api-extractor": minor
---

Adds `@systemfsoftware/api-extractor`, an Effect-native replacement for `@microsoft/api-extractor`. Existing API Extractor configs run unchanged and regenerate byte-identical API reports. Declaration rollups support `export * as X` namespace barrels. `api-extractor run` accepts `--quiet`/`-q` and configs accept a root-level `"quiet": true`, printing nothing on clean success.
