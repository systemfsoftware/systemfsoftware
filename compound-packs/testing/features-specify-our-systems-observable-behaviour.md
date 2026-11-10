---
title: A Feature specifies the observable behaviour of our system under test in its consumer's language, never a third party, a library or a unit of the implementation
applies_when:
  - adding, renaming or reviewing a behaviour test (a test that builds an effect-gherkin-spec Feature)
  - writing a Feature or scenario title, or step text
  - testing how the system talks to a third-party service, library, protocol or platform
  - testing a configuration layer, decoder, schema or other single unit through Gherkin
tags: [testing, behaviour-test, bdd, gherkin, feature, capability, third-party]
---

A Feature specifies one capability of the system under test as its consumer observes it. The consumer is the person using the app, the code or operator that calls the package, or, for a port's contract suite, the code that calls the port. The test file name and Feature title name that capability (`placing-an-order.integration.test.ts`, "Placing an order").

Never make the subject a third party (service, library, protocol, wire format, request shape, status code, platform API). How our adapter talks to a third party is proven by the port's contract suite in the port's terms (adapters-run-against-real-local-resources.md).

Never make the subject an internal unit (function, module, class, component, store, decoder, schema, configuration layer, service the consumer does not call). A Feature over an internal unit is deleted, not reshaped into another Feature or kept under a BDD name. A property of a decision is a separate test, judged only by the property-testing pack. In a library package the published operation is the consumer's entry and may be named.

A behaviour that needs real IO (a database, a bucket, a queue, a served page, several services together) is preferably an end-to-end test in the project's E2E package, driven through effect-e2e (e2e-testing pack). A Feature that stubs that IO, or does none, is not a substitute for it.

Titles and step text name no third party and no unit, type, file or setting the consumer never meets. They may name our own published interface (the route a client calls and the status it gets, the command and flag an operator types, the environment variable the operator docs name). A matrix of visual states is a visual or accessibility check, not a Feature.

Test: swap the third party for a competitor and the implementation for another that serves the consumer equally well; if any title, step or expected value must change, the Feature is wrong. Judge by the step bodies, not the titles (scenarios-drive-the-consumer-entry-and-read-what-it-observes.md); a retitled Feature with unchanged bodies is the same test.

## Rubric

Answer each question from the step bodies and the layers the Feature provides. A single "no" means the Feature, or that scenario, is deleted.

1. Does every When drive an entry the consumer uses (the published operation, the route, the command, the page), the same entry production runs?
2. Does every Given body produce each fact its text claims? A Given whose body is `Effect.void`, or returns a constant and binds nothing, is a no. So is a Given whose state is actually injected later in the When.
3. Does every Then read only what the consumer observes?
4. Does every service the scenario reaches run its real layer, or a port fake that runs in that port's contract suite (port-fakes-share-a-contract-suite.md)? A first-party service supplied with `Layer.succeed(Service, Service.of({ ... }))`, an object literal or a partial shape is a no.
5. Does the scenario layer provide the world the Givens claim? `.withScenarioLayer(Layer.empty)` under Givens that claim stored state is a no.

Edge cases:

- A Given that claims "nothing exists yet" passes question 2 when the real world it runs against starts empty. It needs no body.
- A port fake that runs in its contract suite beside the real adapter passes question 4.
- In a library package the published operation is the consumer's entry, so calling it directly passes question 1.
- Retitling steps changes nothing: the verdict comes from the bodies.

```typescript
// WRONG: the subject is a vendor and its HTTP contract
Feature('The payment provider receives a signed charge request')
// RIGHT
Feature('Paying for an order')

// WRONG (delete): a Given that builds nothing, and a When that injects a hand-built first-party service
Given('the catalog holds two products')(() => Effect.void),
When('the shopper searches for lamps')('found', () =>
  search('lamps').pipe(Effect.provide(Layer.succeed(Catalog, Catalog.of({ products })))))

// WRONG (delete): a Feature over a pure function, with no world
Feature('the price index is built from product files')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => scenario('...', Gherkin.Do.pipe(
    Given('a lamp priced at 40')(() => Effect.void),
    When('the index is built')('index', () => Effect.sync(() => priceIndexOf(literalFiles))),
    Then('the lamp is indexed')(({ index }, expect) => expect(index.lamp).toBeDefined()),
  )))
```
