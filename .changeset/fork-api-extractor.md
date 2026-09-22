---
"@systemfsoftware/api-extractor": minor
---

Adds `@systemfsoftware/api-extractor`, an Effect-native replacement for `@microsoft/api-extractor`. Existing `api-extractor.json` configs run unchanged and regenerate byte-identical `*.api.md` reports. `.d.ts` rollups now support `export * as X` namespace barrels. `api-extractor run` accepts `--quiet`/`-q` and configs accept a root-level `"quiet": true`, printing nothing on clean success.
