---
title: A port's fake lives in the test tree, is built through the port's constructor and runs in one contract suite beside the real adapter; the one src/ exception is a Storybook I/O stand-in and its fixture controls
applies_when:
  - writing a fake, stub or in-memory stand-in for a port or service, or adding an operation to a port that has one
  - a module in src/ is imported only by tests
  - a package wants to ship a test double to its consumers
  - writing a Storybook stand-in for an I/O module
tags: [testing, fake, contract-test, port, store, fixtures, test-double, storybook]
---

Build a port fake through the port's own service constructor (`Tag.of` inside `Layer.effect(Tag)` or `Layer.succeed(Tag)`), never `Layer.mock`, a partial object, a never-typed stub or a type assertion, and implement every operation of the port.

Every test double a package's tests use for its own ports or services lives under that package's `tests/__fixtures__`, never in src/. No package publishes a test double; a consumer builds its own.

The one exception is a Storybook stand-in for an I/O module and the fixture-controls module those stand-ins share: they live in a `__mocks__` folder beside that I/O module, where `sb.mock` resolves it (ui-testing pack: stories-get-io-from-stand-ins-beside-the-io-module.md). Tests never import them; stories never import `tests/__fixtures__`.

Every port fake runs in one contract suite whose pairwise scenarios (`pairwiseFor`) run against the fake and the real adapter and expect the same result, the same tagged failure for a refused operation included. Every operation of the port appears in at least one scenario, and no test or story uses a fake that suite does not run. A package that doubles another package's port writes its own contract suite through that package's published entry. The suite's Feature follows features-specify-our-systems-observable-behaviour.md.

A store port's suite asserts read-after-write and that a read changes nothing; it asserts a further law (independent keys, last-write-wins) only where the port's documentation promises it.

Prove a fake's fidelity by running the same suite on the real adapter, never by re-deriving a third party's documentation into the fake.

```typescript
// WRONG: src/messages.fake.ts, imported only by tests
const fakeMessages = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)
```
