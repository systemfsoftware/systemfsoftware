---
title: Every test double lives under the test tree, never in src/ and never in a package's exports
applies_when:
  - writing a fake, stub or in-memory stand-in for a service or port
  - a module in src/ is imported only by tests
tags: [testing, test-double, fake, fixtures]
---

A stand-in a package's tests or stories use in place of one of its own services or ports (a fake, stub, in-memory or recording double) lives under that package's tests/**fixtures**, never in src/; the Storybook preview provides port fakes imported from there.

No package publishes a test double, as an entry, a subpath or a static such as layerTest or layerNoop on a service; a consumer builds its own double in its own tests/**fixtures**.

Whether a module or package is a test double or a production adapter is decided by the review judge from its importers and its production wiring; an uncertain case escalates.

```WRONG
src/ledger.fake.ts   // imported only by tests/*.integration.test.ts
```

```RIGHT
tests/__fixtures__/memory-ledger.fixture.ts   // Layer.effect(Ledger)(...) over a Ref
```

Gate: judge
