---
title: A test's expected values come from the requirement in the consumer's terms, never copied from the implementation
applies_when:
  - writing the expected value of an assertion, a Then step or a scenario outline's rows
  - asserting defaults, URLs, ports, durations, thresholds, message text or exit codes
  - building an expected value with the code's own constructors, schemas or decoders
tags: [testing, assertions, change-detector, expected-values, literals]
---

An expected value states what the consumer is promised: the requirement, a contract our system publishes (API reference, operator docs, published types, a CLI's documented exit codes), or an example the consumer would recognise. Never take it from a third party's documentation or recorded response, from a default or message the implementation declares, or from a table that mirrors the source.

Never compute an expected value with the implementation (its decoders, normalisers, formatters, calculations). Write it as literals the requirement states, optionally inside a published type the consumer matches on.

Assert command-line output and errors by what the caller acts on (which items it is told to process; that it is refused, and what the refusal names), not by message text. Assert an exit code or message exactly only where it is published as a contract.

A number the requirement or the documented contract states (a page size, a cap, a limit) is asserted at that number with a case on each side. A threshold that exists only as a constant in the source is stated as what the consumer sees ("a short answer is shown large").

A test of the right value goes red only when the consumer's outcome changes, not when the source's constant changes.

```typescript
// WRONG: copied defaults
expect(s.settings).toMatchObject({ port: 8080, timeoutMillis: 30_000 })
// RIGHT
Then('a withdrawal one cent over the stated daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual(Result.fail(new OverDailyLimit()))),
```
