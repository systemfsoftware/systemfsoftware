---
"@systemfsoftware/effect-schema-vite": patch
---

The declaration docs for `LAW_FILE_BASENAME` and `inlineSchemaTests` no longer say that `@systemfsoftware/oxlint-plugin-test-discipline` sanctions the generated law file by name. Since that plugin's next major, `no-test-file-in-src` reports the file like any other test file in a package's source directory. The README no longer says the injected derivation hook honors a declared `recursionBudget`: the plugin checks the budget when the module loads, and the generation laws bound depth by the `size` they pass. No runtime or API change.
