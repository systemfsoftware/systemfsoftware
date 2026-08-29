---
"@systemfsoftware/arethetypeswrong": patch
---

Remove risky third-party dependencies from analysis: replace @loaderkit/resolve with first-party resolver, cjs-module-lexer with first-party detector, validate-npm-package-name with first-party validator, and replace npm semver with @jsr/std__semver
