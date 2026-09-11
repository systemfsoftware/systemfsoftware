---
'@systemfsoftware/all': major
---

The preset enforces a cyclomatic-complexity ceiling. Every function in a package's source directory is limited to a complexity of 2, and every function in a workflow file to 1; test files are not limited.

A project that already has branching beyond those values will see new errors on its next lint run. The measured ceiling uses the modified complexity variant, in which one `switch` costs a single point regardless of how many `case` clauses it has.
