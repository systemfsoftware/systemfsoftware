---
"@systemfsoftware/oxlint-plugin-recommended": major
---

The shared oxlint presets now ship here as plugin configs. The default export is a plugin object whose `configs` hold `recommended`, `cell-architecture`, `dmmf` and `rule-authoring`; wire one with `extends: [presets.configs.recommended]` in your own oxlint configuration, beside `oxlint` and `oxlint-tsgolint`. The 1.x default export, a bare config of stock settings, is gone.

Each retired `@systemfsoftware/oxlint-config-<name>` package maps to `configs['<name>']` with the same rules, overrides and plugins, except that `effecttsgo/unstable-api-usage` is off rather than `warn` in `recommended`.

The presets carry no `ignorePatterns` and export none. A config that only extended a retired package sees no change, since oxlint does not merge `ignorePatterns` through `extends`; a config that spread a retired package's list into its own must now write those paths itself.
