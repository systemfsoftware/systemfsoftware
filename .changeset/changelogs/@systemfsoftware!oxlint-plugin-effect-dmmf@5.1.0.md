## 5.1.0

### Minor Changes

- Recommended now reports extra non-schema value exports and re-exports from a workflow file.

  A single-segment workflow module may publish exactly one non-schema value. Schema declarations and type-only exports stay. Every re-export form is an error, including exporting an imported binding.

  If the new diagnostic fires, delete the extra export or import the name from the module that declares it.
