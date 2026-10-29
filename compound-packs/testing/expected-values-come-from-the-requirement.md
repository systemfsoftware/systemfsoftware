---
title: A test's expected values come from the requirement in the consumer's terms, never copied from the implementation
applies_when:
  - writing the expected value of an assertion, a Then step or a scenario outline's rows
  - asserting defaults, URLs, ports, durations, thresholds, message text or exit codes
  - building an expected value with the code's own constructors, schemas or decoders
tags: [testing, assertions, change-detector, expected-values, literals]
---

An expected value states what the consumer is promised: the requirement, a contract our system publishes to its consumer (its API reference, its operator docs, its published types, a CLI's documented exit codes), or an example the consumer would recognise. A third party's documentation or recorded response is never the source of an expected value, and neither is a default, description or message the implementation itself declares. It is never a value that exists only because the implementation chose it, copied from the source (a table of defaults, URLs, ports, durations, thresholds, error strings or exit codes that mirrors the code).

An expected value is never computed by the implementation: never passed through its decoders, normalisers, formatters or calculations. It may be written with a published type the consumer itself matches on (a public tagged error, a public value type), filled with literals the requirement states.

Command-line output and errors are asserted by what the caller acts on (which items it is told to process; that it is refused, and the setting or input the refusal names), never by the implementation's message text. An exit code or message is asserted exactly only where it is published to the caller as a contract.

A threshold or size that the requirement does not state appears as what the consumer sees ('a short answer is shown large'), never as the implementation's number. A number the requirement states, or the operation's documented contract promises the consumer (a page size, a cap, a limit), is asserted at that number, with a case on each side of it. A number that exists only as a constant in the source is stated as what the consumer sees.

Decision: for each expected value, the judge asks whether changing that value in the source to another the consumer would accept equally well turns the test red. If it does, the value was copied from the implementation and the assertion is rejected. An uncertain case escalates.

Defect it prevents: a change detector. It fails whenever the code changes and passes whenever the code is consistently wrong, because the test and the code share one source of truth.

```typescript
// WRONG: copied defaults
Then('the service has its settings')((s, expect) =>
  expect(s.settings).toMatchObject({ port: 8080, timeoutMillis: 30_000, upstream: 'wss://feed.example/v2' })),
// WRONG: copied id and price, passed through the code's constructors
Then('the delivery options are listed')((s, expect) =>
  expect(s.options).toEqual([DeliveryOption.make({ id: 'std', price: Money.make(499) })])),
```

```typescript
// RIGHT
Then('a withdrawal one cent over the stated daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual(Result.fail(new OverDailyLimit()))),
Then('the shopper can choose standard or express delivery, cheapest first')((s, expect) =>
  expect(s.options.map((o) => o.name)).toEqual(['Standard delivery', 'Express delivery'])),
```

Source: Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details): implementation details are "things which users of your code will not typically use, see, or even know about", and testing them yields false negatives and false positives. Google Testing Blog, Test Behavior, Not Implementation (https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html). Cucumber, Writing better Gherkin (https://cucumber.io/docs/bdd/better-gherkin/): "Will this wording need to change if the implementation does?"

Gate: judge
