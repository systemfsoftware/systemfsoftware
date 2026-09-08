---
"@systemfsoftware/arethetypeswrong": major
"@systemfsoftware/arethetypeswrong-cli": major
---

Entry-point discovery and the typed renderer now take a single options
object instead of long positional argument lists.

BREAKING CHANGE: pass the options object at every call site of the
reshaped functions; positional calls no longer typecheck.
