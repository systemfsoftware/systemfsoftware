---
"@systemfsoftware/effect-cell-types": major
---

Workflow.make now requires the success channel to be a tagged union of at least two schema tagged classes sharing one family TypeId; single-variant, untagged, and unshared-brand decisions are compile errors naming the defect
