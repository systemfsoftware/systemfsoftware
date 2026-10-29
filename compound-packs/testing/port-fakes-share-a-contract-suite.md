---
title: A port's fake lives in the test tree, is built through the port's constructor and runs in one contract suite beside the real adapter
applies_when:
  - writing a fake, stub or in-memory stand-in for a port or service, or adding an operation to a port that has one
  - a module in src/ is imported only by tests
  - a package wants to ship a test double to its consumers
tags: [testing, fake, contract-test, port, store, fixtures, test-double]
---

A port fake is built through the port's own service constructor (Tag.of inside Layer.effect(Tag) or Layer.succeed(Tag)), never through Layer.mock, a partial object, a never-typed stub or a type assertion, and it implements every operation of the port.

Every test double a package's tests or stories use in place of its own ports or services lives under that package's `tests/__fixtures__`, never in src/. No package publishes a test double; a consumer builds its own in its own `tests/__fixtures__`. The Storybook preview imports port fakes from there.

Every port fake runs in one contract suite whose pairwise scenarios run against the fake and the real adapter through pairwiseFor and expect the same result, the same tagged failure for a refused operation included, and every operation of the port appears in at least one scenario. No test or story uses a fake that suite does not run. A package that doubles another package's port writes its own contract suite in its own tests, running its double and the real adapter pairwise through that package's published entry. The suite's Feature follows features-specify-our-systems-observable-behaviour.md: its consumer is the code that calls the port, so it names no third party.

A store port's suite (state that outlives one interaction) asserts read-after-write and that a read changes nothing. It asserts a further law (independent keys, last-write-wins, refusal of a conflicting write) only where the port's own documentation promises it.

A fake's fidelity is proven by running the same suite against the real adapter, never by re-deriving a third party's documentation into the fake or the suite.

Decision: the judge fails the change if a fake is built outside the port's constructor, lives in src/ or a published entry, misses an operation, or is used by a test the pairwise suite does not run over it. Whether a module is a test double or a production adapter is decided from its importers and its production wiring. An uncertain case escalates.

Defect it prevents: a fake that drifts from the real adapter makes every test that uses it pass against behaviour production does not have.

```typescript
// WRONG
// src/messages.fake.ts, imported only by tests
const fakeMessages = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)
```

```typescript
// RIGHT
// tests/__fixtures__/memory-messages.fixture.ts
const fakeMessages = Layer.effect(Messages)(Effect.gen(function*() {
  const sent = yield* Ref.make<ReadonlyArray<string>>([])
  return Messages.of({ post: (text) => Ref.update(sent, (all) => [...all, text]), history: Ref.get(sent) })
}))
// tests/keeping-a-message-history.integration.test.ts
const OnBothAdapters = pairwiseFor({
  a: { name: 'fake', layer: fakeMessages },
  b: { name: 'real', layer: realMessages },
}, Messages)
```

Source: Martin Fowler, ContractTest (https://martinfowler.com/bliki/ContractTest.html): a contract test checks that calls against a test double return the same results as the real service would.

Gate: judge
