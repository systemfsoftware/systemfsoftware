---
title: A Feature specifies the observable behaviour of our system under test in its consumer's language, never a third party, a library or a unit of the implementation
applies_when:
  - adding, renaming or reviewing a behaviour test (a test that builds an effect-gherkin-spec Feature)
  - writing a Feature or scenario title, or step text
  - testing how the system talks to a third-party service, library, protocol or platform
  - testing a configuration layer, decoder, schema or other single unit through Gherkin
tags: [testing, behaviour-test, bdd, gherkin, feature, capability, third-party]
---

A Feature specifies one capability of the system under test, frontend or backend, as its consumer observes it. The consumer is the person using the app, or the code or operator that calls the package; for a port's contract suite it is the code that calls the port. The test file name and the Feature title name that capability (placing-an-order.integration.test.ts, 'Placing an order'; a port's contract suite: keeping-a-message-history.integration.test.ts).

The subject is never a third party: no Feature specifies a third-party service, library, protocol, wire format, request shape, status code or platform API. How our adapter talks to a third party is proven by the port's contract suite in the port's terms (adapters-run-against-real-local-resources.md), never by a Feature about the third party.

The subject is never an internal unit: a function, module, class, component, store, decoder, schema, configuration layer or service that the consumer does not call. A test of one internal unit is a unit or property test in src/, inside the module (in-source) or under src/**tests**, never under tests/, and it builds no Feature. A port's contract suite is a Feature whose consumer is the code that calls the port; its subject is the capability the port serves, never the port's or the adapter's name. In a library package, the published operation is the consumer's entry and may be named.

Feature titles, scenario titles and step text name no third party (its service, library, protocol, endpoints, headers, status codes or fields). They name no unit, type, file or setting of ours that the consumer never meets. They may name our own published interface where the consumer uses it: the route an API client calls and the status it gets back, the command and flag an operator types, the environment variable the operator docs tell an operator to set. A matrix of visual states or primitives (every button state, every size) is a visual or accessibility check, never a Feature.

Decision: the judge decides from the step bodies, not the titles. For each step, list every symbol its body calls or reads. If the When calls anything but the consumer's entry, or a Then reads anything but that entry's result, its reported failure, a published read operation or our own outbound port (scenarios-drive-the-consumer-entry-and-read-what-it-observes.md), the Feature fails whatever its titles say. A renamed file or retitled Feature whose step bodies are unchanged is the same test and fails the same way. Then the judge rewrites the Feature in their head with the third party swapped for a competitor and the implementation swapped for another that serves the consumer equally well. A third party named only as what the consumer itself sees, picks or connects in the product (a venue the app lists, a provider a person connects, a page a person is sent to) is replaced everywhere it appears, step text and expected value alike; the Feature is rejected only if anything else would have to change. If any other title, step text or expected value would have to change, the Feature is rejected. An uncertain case escalates.

Defect it prevents: an adapter contract test or a unit test dressed in Given/When/Then. It reads as behaviour, so review passes it, yet it pins a vendor's wire format or the code's current shape: it breaks when the vendor or the code changes and stays green when the consumer's outcome breaks.

```typescript
// WRONG: the subject is a vendor and its HTTP contract
// tests/payment-provider-charges.integration.test.ts
Feature('The payment provider receives a signed charge request')
// WRONG: a capability title over a settings-decoder test; the rename fixed nothing
// tests/starting-the-inventory-service.integration.test.ts
Feature('Starting the inventory service')
//   When('the service starts')(() => Effect.provide(InventoryConfig, InventoryConfig.layer))
//   Then('it listens on its port')((s, expect) => expect(s.config.port).toBe(8080))
```

```typescript
// RIGHT
// tests/paying-for-an-order.integration.test.ts
Feature('Paying for an order')
//   scenario('A declined card leaves the order unpaid and tells the shopper why', ...)
// tests/reserving-stock.integration.test.ts
Feature('Reserving stock for an order')
//   scenario('A reservation for more than is on hand is refused and leaves the stock unchanged', ...)
```

Source: Dan North, Introducing BDD (https://dannorth.net/blog/introducing-bdd/): BDD carries the consumer's vocabulary "right into the codebase". Cucumber, Writing better Gherkin (https://cucumber.io/docs/bdd/better-gherkin/): "Your scenarios should describe the intended behaviour of the system, not the implementation", tested by "Will this wording need to change if the implementation does?". Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details).

Gate: judge
