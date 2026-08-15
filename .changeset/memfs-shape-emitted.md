---
"@systemfsoftware/effect-memfs": patch
---

`memory-file-system.shape.ts` is now emitted from `memory-file-system.shape.decl.json`, and its `memfs` import moves from the bottom of the file to the top. The declared types are unchanged; edit the declaration rather than the cell, which `check:cell-authorship` enforces.
