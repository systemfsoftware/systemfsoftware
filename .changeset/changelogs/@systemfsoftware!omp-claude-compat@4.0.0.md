## 4.0.0

### Major Changes

- `interpretHookResult` now returns the verdict together with the hook exit's code and stdout on both result channels. `SubmitVerdictCommand` is removed: call the decision directly with an `InterpretHookCommand`.

### Patch Changes

- Refreshed builds on the platform-services dependency graph; the packages no longer reach for host builtins directly. No CLI flags or option names change.
