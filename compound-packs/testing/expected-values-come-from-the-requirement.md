---
title: Expected values come from the requirement in consumer terms, never copied from the implementation
applies_when:
  - writing expected values in assertions, Then steps or scenario outline examples
  - asserting defaults, URLs, ports, durations, thresholds, message text or exit codes
  - computing expected values using the code under test's constructors, decoders, formatters or helpers
tags: [testing, assertions, change-detector, expected-values, literals]
---

Derive expected values from the requirement, published system contract (API reference, operator docs, published types, documented CLI exit codes), or consumer-recognisable examples—never from implementation defaults, internal constants, third-party docs/recordings, or tables mirroring source code.

Write expected values as requirement literals (optionally wrapped in a published consumer type), never computed via the implementation's decoders, normalisers, formatters, or calculations. Assert CLI output and errors by actionable outcomes (processed items, refusal tag/reason) rather than prose message text, asserting exact messages or exit codes only where published as a contract. Test documented numeric bounds at the boundary and one step on each side; state unexposed internal thresholds qualitatively ("a short answer is shown large").

```typescript
// WRONG: copied implementation defaults
expect(s.settings).toMatchObject({ port: 8080, timeoutMillis: 30_000 })
// RIGHT: requirement boundary in consumer terms
Then('a withdrawal one cent over the stated daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual(Result.fail(new OverDailyLimit()))),
```
