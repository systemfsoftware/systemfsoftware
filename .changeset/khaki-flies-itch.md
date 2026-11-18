---
"@systemfsoftware/oxlint-plugin-test-discipline": major
---

Adds `tracing-test-requires-trace-suite`, on by default as an error. It reports tracing machinery in a test that is not a trace suite: an import of an OpenTelemetry SDK or exporter or of `@effect/opentelemetry`; an import of `@systemfsoftware/trace-spec` outside a `*.trace.test.ts` file; a test that builds or provides its own `Tracer`; and a read of the exported trace payload (`resourceSpans`, `scopeSpans`, `getFinishedSpans`). It also reports an in-source `import.meta.vitest` block that uses one of these. Production source and trace suites are never reported. Move each existing finding into a `*.trace.test.ts` suite built on `@systemfsoftware/trace-spec`, or test a module-private combinator with an in-source `it.effect.prop` that builds no tracer.
