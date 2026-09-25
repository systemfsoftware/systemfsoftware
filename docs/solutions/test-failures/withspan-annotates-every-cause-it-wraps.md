---
title: Effect.withSpan annotates every cause raised inside it, breaking strict Exit equality
date: 2026-09-25
category: test-failures
module: effect-gherkin-spec
problem_type: test_failure
component: testing_framework
symptoms:
  - "A consumer comparing an Exit captured inside a gherkin step with toStrictEqual(Exit.fail(...)) fails once steps open spans"
  - "The diff shows an extra effect/Cause/StackTrace entry, a gherkin.step stack frame, in the Fail reason's annotations"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags:
  - effect-v4
  - tracing
  - withspan
  - usespan
  - cause-annotations
  - failure-record
---

# Effect.withSpan annotates every cause raised inside it, breaking strict Exit equality

## Problem

Opening a span around each gherkin step, so the failure record could list the steps, changed the value of every failure raised inside a step. A consumer that captured an `Exit` inside a step and compared it with `toStrictEqual(Exit.fail(...))` went red with no change of its own: the `Fail` reason now carried an annotations map holding `Cause.StackTrace` for the `gherkin.step` span.

## Failure mechanism

1. In Effect v4, `Effect.withSpan` = `Effect.useSpan` + `Effect.withParentSpan`.
2. `withParentSpan` also provides the span's `CurrentStackFrame` (`provideSpanStackFrame` in Effect's internal effect module).
3. The fiber annotates every cause it constructs with the current stack frame. Every `Fail` or `Die` raised under the span therefore carries `Cause.StackTrace`, and any structural equality on an `Exit` or `Cause` sees the extra field.
4. `captureStackTrace: false` only blanks the stack string. The annotation is still attached.

## Why This Works

`Effect.useSpan` creates the span through the current tracer and ends it with the wrapped effect's exit, so a recorder still sees the step and its outcome. Providing `Tracer.ParentSpan` explicitly keeps child spans (cell spans) nested beneath it. The only thing dropped is the stack-frame provision, which is what leaked into causes.

```ts
// record-only span: recorded, parents its children, leaves causes untouched
Effect.useSpan(name, { attributes }, (span) => Effect.provideService(self, Tracer.ParentSpan, span))

// smell: a span added only for a recorder or renderer
Effect.withSpan(name, { attributes })(self)
```

## Architectural Invariant

A span that exists only so a recorder can read it must not change any value the wrapped program produces. Instrumentation is observation, so an `Exit` or `Cause` inside it must equal the one outside it. `Effect.withSpan` violates that by design; `Effect.useSpan` with `Tracer.ParentSpan` does not.

## Prevention

- Grep for `Effect.withSpan` in any code that opens spans for the failure record (`stepSpan` in `effect-gherkin-spec`'s `DoNotation`); use `withSpan` only where the stack-frame annotation is wanted.
- `effect-gherkin-spec`'s step-span feature has the scenario "A failure raised inside a step carries no stack annotation from the step span", which fails if the step span installs a stack frame again.

## Related

- Issue #546, the failure-record work that introduced step spans.
- `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`
