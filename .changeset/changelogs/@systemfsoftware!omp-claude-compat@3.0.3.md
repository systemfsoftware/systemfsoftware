## 3.0.3

### Patch Changes

- AtomRuntime.fn now infers precise success and error types from the function you pass, in both direct and curried forms. Values that are not functions are rejected at compile time; previously they failed when the resulting atom was first read.

  withScope now requires scope bindings to be effects with no service requirements. Bindings that require services no longer compile — provide those services with withLayer and read them inside steps instead.

  onToolResult now fails with PlatformError instead of an untyped error.

- Re-published against the oxc-based instrumenter: workspace dependency ranges move to the new instrumenter major; no package's own behavior changes in this release.
