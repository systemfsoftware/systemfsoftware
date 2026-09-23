---
"@systemfsoftware/api-extractor": minor
---

The programmatic API is a single `Extractor` namespace. `Extractor.run({ configFilePath, options })` returns an `Effect` that resolves to `ExtractionPassed` or `ExtractionFailed`, carrying `errorCount`, `warningCount`, and one outcome per report variant; in verification mode warnings fail the run too. Config and compiler problems fail with typed `ExtractorError` variants, such as `UnresolvedTokenError` for an unknown path placeholder and `TsCompilerLoadError` for an unusable `typescriptCompilerFolder`.

Provide `Extractor.layer()` with the Node platform services; pass `Extractor.layer({ stdout, stderr })` to capture console lines. `Extractor.cli` is the `api-extractor` command itself, which a host can run with `Command.runWith` from `effect/unstable/cli` or mount in a larger command tree.
