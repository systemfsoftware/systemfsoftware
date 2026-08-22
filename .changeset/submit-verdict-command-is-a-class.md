---
'@systemfsoftware/omp-claude-compat': major
---

`SubmitVerdictDecoded` is removed. Build the submit command with the new `SubmitVerdictCommand` class instead — same three fields, constructed rather than declared.

Hook verdict routing is unchanged: a blocking exit, a decision object on standard output, a malformed decision object and a non-standard exit all resolve exactly as before.
