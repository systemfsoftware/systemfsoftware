## 0.1.0

### Minor Changes

- Finds the exported Effect `Schema` declarations in a TypeScript source tree.

  `findExportedSchemas(dir)` returns each exported schema with the file that declares it, identifying a schema by its type annotation, by an initialiser that builds one, or by a class extending `Schema.Class`. It ignores a declaration whose initialiser only _uses_ a schema, such as `Schema.encodeSync(Other)`.

  You install this only if you generate something from a project's schemas yourself. It arrives on its own as a dependency of `@systemfsoftware/effect-schema-vite` and `@systemfsoftware/effect-schema-refutation-vite`, which both need the same walk.
