---
'@systemfsoftware/arethetypeswrong-cli': patch
---

An `.attw.json` in the working directory is read again. Rules listed under `ignoreRules`
were being discarded, so a package that had waived a resolution condition still failed on
it, and the only way to get a passing run was to repeat every rule on the command line
