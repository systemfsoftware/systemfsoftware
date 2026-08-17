---
'@systemfsoftware/oxlint-plugin-effect-workflow': minor
'@systemfsoftware/oxlint-plugin-effect-schema': minor
'@systemfsoftware/oxlint-plugin-test-placement': minor
'@systemfsoftware/oxlint-plugin-effect-dmmf': minor
---

Three new rules and a retargeted test-placement taxonomy.

`effect-workflow` adds `make-file-location`: `Workflow.make` may be constructed only in a single-segment `<stem>.workflow.ts` file, and at most once per file.

`effect-schema` adds `schema-declaration-location`: a schema declaration — a class extending a Schema factory, or a module-scope const initialized to a `Schema.<member>(...)` call — must live in a `*.schema.ts` file or the `<stem>.workflow.ts` that owns it.

`test-placement` retargets the src test taxonomy. The only test file sanctioned under `src/` is a single-segment `<stem>.workflow.property.test.ts` beside the workflow it covers, plus the generated `schema-laws.test.ts` entry point; every other test file under `src/` is now reported. Outside `src/`, test files live under `tests/` as `*.integration.test.ts`, and non-test helpers and fixtures live under `tests/__fixtures__/` (new `tests-dir-helpers-in-fixtures` rule). `in-source-test-targets-private` is unchanged: an in-source `import.meta.vitest` block must still exercise a non-exported binding.
