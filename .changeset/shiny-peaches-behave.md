---
"@systemfsoftware/effect-schema-discovery": minor
---

`findExportedSchemas` also finds an exported const or class whose type is assignable to `Schema.Top`, as resolved from its own module, even when nothing in its source names `Schema` the way a declaration does: an unannotated curried `Schema.declareConstructor<T>()(...)`, or a schema built by a local helper. Exports found before are still found. An export typed `any` or `never`, or one in a module from which `effect/Schema` does not resolve, is not added. The package now depends on `typescript` 7, whose bundled server performs the check.
