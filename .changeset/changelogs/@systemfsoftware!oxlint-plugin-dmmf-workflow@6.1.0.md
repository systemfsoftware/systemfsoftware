## 6.1.0

### Minor Changes

- `make-body-purity` now lets a `Workflow.make` decision call bindings imported from a sibling schema file, and accepts `effect/Pipeable` and `effect/PlatformError` as pure. Its fix text, and `workflow-file-export-topology`'s, send code to the schema file of the type it operates on.
