---
"@systemfsoftware/stryker-js": major
---

Mutant, test-result, and checker schemas now brand identifiers and file names and refuse empty values at decode. Decoded mutants carry branded `MutantId`, `FileName`, `MutatorName`, and `TestId` values; constructing these classes from unvalidated strings no longer type-checks — decode instead. The classify-exit command rejects NaN and infinities everywhere and confines score and break threshold to 0–100. Writing report files is now an `OutputFile` service obtained from the `./output-file` entry with a default layer, replacing the previous free-function export; provide the layer or bind your own implementation.
