---
  "@systemfsoftware/arethetypeswrong-cli": patch
---

Packing for analysis (attw --pack) no longer runs the target package's pack lifecycle scripts: packing acquires the artifact for analysis instead of rebuilding it, so analyzing a package never mutates its build output.
