---
title: A behaviour test file proves one capability a consumer uses and is named for that capability
applies_when:
  - adding or renaming a behaviour test (a test that builds an effect-gherkin-spec Feature, or a story file that holds a storybook-gherkin journey)
  - reviewing a test named for a function, module, class or component
tags: [testing, behaviour-test, gherkin, naming, capability]
---

A behaviour test file (a test that builds an effect-gherkin-spec Feature) proves one capability: something a consumer of the package, or a person using the app, does or observes.

Its file name and its Feature title name that capability (placing-an-order.integration.test.ts, 'Placing an order'), never a function, module, class, component, store, decoder, port or connection; a port's contract suite is named for the capability the port serves (keeping-a-message-history.integration.test.ts), never for the port.

A storybook-gherkin journey's scenario title names the one capability it walks; the story file's name follows the ui-testing pack.

Whether a test proves a consumer capability is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG
// tests/config-decoder.integration.test.ts
Feature('ConfigDecoder')
```

```typescript
// RIGHT
// tests/rejecting-an-invalid-suite-config.integration.test.ts
Feature('Rejecting an invalid suite config')
```

Gate: judge
