---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
---

`workflow-file-export-topology` counts `Schema.TaggedStruct` and `Schema.TaggedUnion` declarations as schemas, so a workflow file may declare them beside its one decision export.
