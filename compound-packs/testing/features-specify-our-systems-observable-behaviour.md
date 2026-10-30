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

Never make the subject an internal unit (function, module, class, component, store, decoder, schema, configuration layer, service the consumer does not call). That is a unit or property test in src/, in-source or under src/**tests**, never under tests/, and builds no Feature. In a library package the published operation is the consumer's entry and may be named.

Titles and step text name no third party and no unit, type, file or setting the consumer never meets. They may name our own published interface (the route a client calls and the status it gets, the command and flag an operator types, the environment variable the operator docs name). A matrix of visual states is a visual or accessibility check, not a Feature.

Test: swap the third party for a competitor and the implementation for another that serves the consumer equally well; if any title, step or expected value must change, the Feature is wrong. Judge by the step bodies, not the titles (scenarios-drive-the-consumer-entry-and-read-what-it-observes.md); a retitled Feature with unchanged bodies is the same test.

```typescript
// WRONG: the subject is a vendor and its HTTP contract
Feature('The payment provider receives a signed charge request')
// RIGHT
Feature('Paying for an order')
```
