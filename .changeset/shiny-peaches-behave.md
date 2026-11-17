---
"@systemfsoftware/effect-schema-discovery": minor
---

`findExportedSchemas` also finds an exported const or class whose type is assignable to `Schema.Top`, as resolved from its own module, even when nothing in its source names `Schema` the way a declaration does: an unannotated curried `Schema.declareConstructor<T>()(...)`, or a schema built by a local helper. Exports found before are still found. Not added: a schema whose decoded values are errors (such as a `Schema.TaggedError` class), an export typed `any` or `never`, and any export of a module from which `effect/Schema` does not resolve. The package now depends on `typescript` 7, whose bundled server performs the check.
