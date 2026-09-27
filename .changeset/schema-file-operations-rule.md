---
"@systemfsoftware/oxlint-plugin-effect-schema": minor
---

New `schema-file-imports-pure-modules-only` rule, enabled in the recommended config: a schema file may value-import only Effect's pure modules, its schema modules, `effect/Effect`, `effect/unstable/arbitrary`, other schema files and `@systemfsoftware/*` packages, and a dynamic `import()` or `require()` reaching outside that set is reported too, including one whose source is not a string literal and so cannot be proven pure. `schema-file-exports-schemas-only` now accepts what a schema file owns besides its schemas: an exported function or `dual` const whose declared parameter or return type names a type declared in the same file and that returns no `Effect`, `Stream` or `Layer`, read through unions, type predicates, type parameter constraints and readonly arrays; a type-only namespace; a `Symbol.for('<literal>')` type identity; and a constant annotated with a same-file type.
