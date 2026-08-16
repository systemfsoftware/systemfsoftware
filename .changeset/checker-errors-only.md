---
"@systemfsoftware/stryker-js-typescript-checker": patch
---

Fail a compile on errors only, not on the tree's standing suggestions

The dry run and the per-mutant check counted every diagnostic the program produced, so the Effect language service's suggestions — which the pristine tree carries by design and which surface in `lint:tsgo` and the editor — refused mutation runs outright with a dry-run compile error. Only error-category diagnostics fail a compile now; warnings and suggestions were never compile failures
