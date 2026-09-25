---
"@systemfsoftware/api-extractor": minor
---

Add `@systemfsoftware/api-extractor`, an Effect-native replacement for `@microsoft/api-extractor`. Its `api-extractor` bin reads your existing API Extractor configuration unchanged and writes API reports byte-identical to upstream 7.59.1. Declaration rollups support `export * as X` namespace barrels that compile. `api-extractor run` accepts `--quiet`/`-q` and configs accept a root-level `"quiet": true`, so a clean run prints nothing. TSDoc metadata is written by default, and enabling `docModel` is refused with a typed error because the doc model output is not produced.
