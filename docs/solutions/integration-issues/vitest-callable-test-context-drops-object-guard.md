---
title: Vitest 5 Passes a Callable Test Context, So an Object-Shape Guard Silently Drops It
date: "2026-09-22"
track: knowledge
problem_type: integration_issue
category: integration-issues
module: effect-spec-runtime
component: vitest task context
tags: [vitest, test-context, annotate, type-guard, silent-failure]
severity: high
captured: 2026-09-22
last_updated: 2026-09-22
---

# Vitest 5 passes a callable test context, so an object-shape guard silently drops it

## Problem

A harness that hands Vitest's test context to an Effect body through a `Context.Reference` guarded the value with an object-shape check. Under Vitest 5 the guard rejects every real context, the reference falls back to its `null` default, and every feature built on the context (annotations, reading `task`) becomes a silent no-op. No test fails. The code looks correct and unit tests that pass a plain object stay green.

## Root cause

`@vitest/runner`'s `createTestContext` builds the context as a function and attaches properties to it:

```js
function createTestContext(test, runner) {
  const context = function() {
    throw new Error('done() callback is deprecated, use promise instead')
  }
  context.signal = abortController.signal
  context.task = test
  // ... annotate, skip, onTestFailed attached the same way
}
```

The guard that shipped in `effect-gherkin-spec` before `effect-spec-runtime` was extracted, and still gates `TaskRef.VitestTaskRef`:

```ts
const isTaskContext = (ctx: unknown): ctx is VitestTaskContext => typeof ctx === 'object' && ctx !== null
```

`typeof` of the real context is `'function'`, so the guard is false for every test Vitest runs.

## Solution

`@systemfsoftware/effect-spec-runtime` exports `RawVitestTaskRef`, provided by `provideTaskRef` with the context whenever it is an object or a function. `trace-spec` reads that reference to annotate a failed case with its dump path. The filtered `VitestTaskRef` is kept as it was, because widening its guard switched on gherkin's annotation paths in real runs and turned its TestClock and polling suites red. Gherkin's annotations remain dormant until someone decides to repair them.

## Prevention

- Accept `typeof ctx === 'function'` wherever a Vitest test context is narrowed; a context is a callable with properties, not a plain object.

## Applicability

Any code that stores, forwards, or narrows the second argument of a Vitest test function. A hand-rolled `isObject` guard, `Predicate.isObject`, or a schema that decodes a struct all reject the real context.
