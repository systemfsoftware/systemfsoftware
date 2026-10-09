---
"@systemfsoftware/oxlint-plugin-recommended": major
---

The shared oxlint presets now ship here as plugin configs. The default export is a plugin object whose `configs` hold `recommended`, `cell-architecture`, `dmmf` and `rule-authoring`; wire one with `extends: [presets.configs.recommended]` in your own oxlint configuration, beside `oxlint` and `oxlint-tsgolint`. The 1.x default export, a bare config of stock settings, is gone.

Each retired `@systemfsoftware/oxlint-config-<name>` package maps to `configs['<name>']` with the same rules, overrides and plugins.

The presets carry no `ignorePatterns`: oxlint does not merge them through `extends`, so the ones the retired packages listed never applied. Declare the paths your repository skips in your own configuration.
