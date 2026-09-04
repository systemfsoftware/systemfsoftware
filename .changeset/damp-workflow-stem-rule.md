---
"@systemfsoftware/oxlint-plugin-effect-workflow": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
---

Two new recommended rules run against every workflow file. `damp-workflow-stem` requires the file's name to be a hyphenated phrase of two to five lowercase words whose camelCase form equals the file's single export, so a file named for its capability bucket or a bare noun now fails. `workflow-file-make-presence` refuses a workflow file that never constructs its decision with `Workflow.make`. Rename failing workflow files to the decision they make and align each export name, or move a file that owns no decision next to its caller without the workflow suffix.
