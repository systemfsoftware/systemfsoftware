---
title: A scenario's Given sets state, its one When drives the entry the consumer uses, and its Then reads only what the consumer observes
applies_when:
  - writing or reviewing the steps of an effect-gherkin-spec scenario or scenario outline
  - a Then asserts what a fake, spy or stand-in for a third party received
  - a When calls a layer, decoder, schema, constructor or helper directly
  - a Given step does nothing, or runs the system under test
tags: [testing, behaviour-test, gherkin, given-when-then, scenario-outline, stand-in]
---

Given brings the system to the scenario's starting state through fixtures, the fake's parameters, or the system's own public operations. It never performs the operation the When specifies, and nothing it returns is asserted. Its body produces every fact its text claims. A body that produces nothing (`() => Effect.void`) passes only when its text states the untouched starting state and each scenario starts from a fresh one.

A scenario has exactly one When. It performs the consumer's action through the entry the consumer uses: the package's public operation, the port's operation for a port's contract suite, the CLI, the route. The When's call reaches the same entry production runs: the program's main effect, the published operation, the handler. A fixture or helper that rebuilds part of that entry, or returns a value the entry itself does not return (a decoded settings object, an internal record), is not that entry. The step text is checked against the step body, never trusted in place of it. A When that calls a layer, decoder, schema, constructor or helper directly is a unit test and builds no Feature.

Then reads only what the consumer observes: the result the entry returns, the failure it reports, state read back through an operation the system offers, or, when the Feature specifies an outbound effect, what our system sent through one of its own outbound ports, read in that port's terms through the port fake's read operation (the notice queued, the event published). Then never reads a stand-in's wire-level record of a third party (method, URL, header, body field, request count). It never asserts a third party's or library's names (attribute, metric, label, field) or a protocol status code the consumer is not shown.

A scenario outline's rows vary the input and the expected outcome of one When. Rows that change which unit the When calls are separate tests.

Decision: the judge marks each step Given, When or Then and fails the scenario if a Given performs the When's operation or sets nothing its text claims, there is not exactly one When, the When skips the consumer's entry (a fixture that rebuilds part of the entry, or whose step text says more than its body does, is not the entry), a Then reads a third-party stand-in's received requests, or a third party's names, or outline rows switch the unit under test. Story journeys follow the ui-testing pack's journey rule instead. An uncertain case escalates.

Defect it prevents: a scenario that proves the code made a call, not that the consumer got an outcome. It stays green when the consumer's result is wrong, breaks on every refactor, and its Given text describes a world the test never builds.

```typescript
// WRONG
Given('a shopper with a saved card')(() => Effect.void),
When('the checkout layer is built')(() => Effect.provide(CheckoutConfig, CheckoutConfig.layer)),
Then('the provider receives the charge')((s, expect) =>
  expect(provider.received).toEqual([{ method: 'POST', url: 'https://pay.example/v1/charges' }])),
```

```typescript
// RIGHT
Given('a shopper with a card the provider declines')('cart', () => Shop.cartWith({ card: declinedCard })),
When('the shopper pays for the order')('outcome', (s) => Shop.pay(s.cart).pipe(Effect.result)),
Then('the shopper is told the card was declined and the order stays unpaid')((s, expect) =>
  Effect.map(Shop.order(s.cart.orderId), (order) =>
    expect({ outcome: s.outcome, status: order.status }).toEqual({ outcome: Result.fail(new CardDeclined()), status: 'unpaid' }))),
```

The single When is this pack's ruling: one scenario specifies one behaviour. Source: Martin Fowler, GivenWhenThen (https://martinfowler.com/bliki/GivenWhenThen.html): given is "the state of the world before you begin the behavior", when "is that behavior that you're specifying", then "describes the changes you expect due to the specified behavior". Cucumber Gherkin reference (https://cucumber.io/docs/gherkin/reference/): an outcome "should be on an observable output"; a Scenario Outline runs "the same Scenario multiple times, with different combinations of values". Martin Fowler, Mocks Aren't Stubs (https://martinfowler.com/articles/mocksArentStubs.html): state verification against behaviour verification.

Gate: judge
