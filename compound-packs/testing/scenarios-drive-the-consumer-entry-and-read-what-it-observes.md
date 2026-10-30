---
title: A scenario's Given sets state, its one When drives the entry the consumer uses, and its Then reads only what the consumer observes
applies_when:
  - writing or reviewing the steps of an effect-gherkin-spec scenario or scenario outline
  - a Then asserts what a fake, spy or stand-in for a third party received
  - a When calls a layer, decoder, schema, constructor or helper directly
  - a Given step does nothing, or runs the system under test
tags: [testing, behaviour-test, gherkin, given-when-then, scenario-outline, stand-in]
---

Given brings the system to the starting state through fixtures, the fake's parameters or the system's own public operations. It never performs the operation the When specifies, nothing it returns is asserted, and its body produces every fact its text claims.

A scenario has exactly one When. It performs the consumer's action through the entry the consumer uses (the package's public operation, the port's operation for a contract suite, the CLI, the route), reaching the same entry production runs. A fixture that rebuilds part of that entry, or returns a value the entry does not return (a decoded settings object, an internal record), is not that entry. A When that calls a layer, decoder, schema, constructor or helper directly is a unit test and builds no Feature.

Then reads only what the consumer observes: the entry's result, its reported failure, state read back through an operation the system offers, or, for an outbound effect, what our system sent through one of its own outbound ports, read in that port's terms through the fake's read operation. Never read a stand-in's wire-level record of a third party, and never assert a third party's or library's names or a protocol status code the consumer is not shown.

A scenario outline's rows vary the input and expected outcome of one When; rows that change which unit the When calls are separate tests. Story journeys follow the ui-testing pack instead.

```typescript
// WRONG
When('the checkout layer is built')(() => Effect.provide(CheckoutConfig, CheckoutConfig.layer)),
Then('the provider receives the charge')((s, expect) => expect(provider.received).toEqual([{ method: 'POST' }])),
// RIGHT
When('the shopper pays for the order')('outcome', (s) => Shop.pay(s.cart).pipe(Effect.result)),
```
