---
"@systemfsoftware/api-extractor": minor
---

The programmatic API is a single `Extractor` namespace: `import { Extractor } from '@systemfsoftware/api-extractor'`. `Extractor.run({ configFilePath, options })` returns an `Effect` that resolves to `ExtractionPassed` or `ExtractionFailed`, a tagged outcome carrying `errorCount`, `warningCount`, and one outcome per report variant; in verification mode warnings fail the run too. Config and compiler problems fail the effect with typed `ExtractorError` variants, including `UnresolvedTokenError` for an unrecognized path placeholder and `TsCompilerLoadError` for a `typescriptCompilerFolder` without a usable TypeScript compiler.

Provide `Extractor.layer()` together with the Node platform services: it supplies the console driver and the TypeScript compiler. Pass `Extractor.layer({ stdout, stderr })` to capture a run's console lines in your own writables.
