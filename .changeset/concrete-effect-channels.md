---
"@systemfsoftware/effect-atom": minor
"@systemfsoftware/effect-gherkin-spec": major
"@systemfsoftware/omp-claude-compat": patch
---

AtomRuntime.fn now infers precise success and error types from the function you pass, in both direct and curried forms. Values that are not functions are rejected at compile time; previously they failed when the resulting atom was first read.

withScope now requires scope bindings to be effects with no service requirements. Bindings that require services no longer compile — provide those services with withLayer and read them inside steps instead.

onToolResult now fails with PlatformError instead of an untyped error.
