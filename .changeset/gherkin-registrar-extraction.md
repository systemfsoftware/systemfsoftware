---
'@systemfsoftware/effect-gherkin-spec': patch
---

`VitestTaskRef` is now the task reference owned by `@systemfsoftware/effect-spec-runtime`, so its context key changed from `@systemfsoftware/effect-gherkin-spec/VitestTask` to `@systemfsoftware/effect-spec-runtime/VitestTask`. Code that imports `VitestTaskRef` from this package is unaffected; code that re-declared a reference under the old key no longer receives the running test's task. Every exported type, the stage vocabulary, and every other runtime behaviour are unchanged.
