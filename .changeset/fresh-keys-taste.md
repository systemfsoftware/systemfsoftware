---
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-cell-architecture": major
---

The exported `ignorePatterns` list drops the entries that match nothing this toolchain produces (`lib`, `esm`, `cjs`, `build`, `out`, `.tshy`, `.tshy-build`, `__pycache__`, `.opencode`, `.sisyphus`, `.repo`, `.issues`, `.papi`, `submodules`) and the two blanket globs for ES module scripts and type declaration files. A config that spreads `ignorePatterns` into its own `ignorePatterns` now lints hand-written ES module scripts and type declaration files, which can report new errors. A config that only lists the preset under `extends` sees no change, because oxlint does not carry `ignorePatterns` through `extends`. To keep a file out of linting, add its path to your own config's `ignorePatterns`.
