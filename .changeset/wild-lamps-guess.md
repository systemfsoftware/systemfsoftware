---
"@systemfsoftware/effect-spec-runtime": minor
---

Adds `SpanRecorder`, a tracer that keeps every span a program opens, in the order they began. It is the span harness for a package below `@systemfsoftware/trace-spec` in the dependency graph whose published behaviour is the spans it emits. Use `SpanRecorder.make()` and run the program under `Effect.withTracer(program, recorder.tracer)`.
