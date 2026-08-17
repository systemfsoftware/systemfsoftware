---
'@systemfsoftware/effect-schema-vite': patch
---

Generated schema laws no longer break when a package exports a value read off a
codec or JSON-Schema document, such as `Schema.toJsonSchemaDocument(x).schema`.
Those exports are uses of a schema rather than schemas, and generating
round-trip laws for one made the whole generated suite fail to load, reporting
no tests at all. They are now skipped, so the suite runs the laws for the real
schemas beside them.

The set of members recognised as uses is also complete now: the encode side was
missing its `Exit`, `Option`, `Result` and `Promise` variants, so a schema whose
declaration used one of those was skipped when it should have been law-tested.
