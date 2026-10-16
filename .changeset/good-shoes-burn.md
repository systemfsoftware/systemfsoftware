---
"@systemfsoftware/oxlint-config-rule-authoring": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

The `ignorePatterns` on each preset's default config is now one shared list of nine entries: `node_modules`, `dist`, `.turbo`, `coverage`, `.stryker-tmp`, `*.tsbuildinfo`, `.claude`, `.worktrees` and `repos`. It no longer ignores `lib`, `esm`, `cjs`, `build`, `out`, `.tshy`, `.tshy-build`, `__pycache__`, `.opencode`, `.sisyphus`, `.repo`, `.issues`, `.papi`, `submodules`, or every ES module script and type declaration file.

A config that spreads `recommended.ignorePatterns` (or another preset's) into its own `ignorePatterns` now lints hand-written ES module scripts and type declaration files, which can report new errors. Add those paths to your own `ignorePatterns` to keep them out. A config that only lists a preset under `extends` sees no change, because oxlint does not carry `ignorePatterns` through `extends`.
