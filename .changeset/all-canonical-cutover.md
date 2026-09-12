---
'@systemfsoftware/all': major
'@systemfsoftware/oxlint-config': major
---

`@systemfsoftware/all` now resolves to the strict canonical preset composed from the plugin fragments, and its `plugins`, `rules`, `overrides`, `options`, `jsPlugins`, and `ignorePatterns` named exports are gone. Extend the default export and spread the new `defaultIgnores` named export instead of reaching into the preset's shape.

Every oxlint rule id in this family is now `<owning package>/<rule>`. The two re-key aggregates (`@systemfsoftware/oxlint-plugin`, `@systemfsoftware/oxlint-plugin-effect-dmmf`) no longer exist; each rule is registered by the package that owns it (for example `@systemfsoftware/oxlint-plugin/ban-error-string` is now `@systemfsoftware/oxlint-plugin-structure/ban-error-string`).

Migrate, in order:

1. Replace every `...(all.ignorePatterns ?? [])` spread with `...defaultIgnores` (import it from `@systemfsoftware/all`).
2. Replace any `{ ...all }` spread with `extends: [all]`.
3. Re-key every `@systemfsoftware/oxlint-plugin/<rule>` and `@systemfsoftware/oxlint-plugin-effect-dmmf/<rule>` key in configs and disable comments to the owning package's id. Unmigrated disable comments stop suppressing silently — after migrating, delete one suppression and confirm lint turns red to prove yours still match.
4. Disable comments must name the short display namespace (`@systemfsoftware/structure/ban-classes`), not the package namespace (`@systemfsoftware/oxlint-plugin-structure/ban-classes`) — the long form does not suppress.

`base` now delivers four entrypoint rules that the old composition never loaded, so newly covered files may report real findings. `@systemfsoftware/oxlint-plugin-cell-vocabulary`'s rule no longer ships through `base` at all: register it in your own config via its `./preset` fragment if you use it.
